// cabinet/scripts/categorize-companies.js
// Goes through every company in data/mlm-companies.json and asks Groq
// to assign a direction-category and tags based on the company name.
// Writes back into the same file with new fields: category, tags, ai_note.
//
// Run: node cabinet/scripts/categorize-companies.js [--limit=N] [--rps=2]
//
// Resumes — skips companies that already have `category`.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '..', '..', 'data');
const COMPANIES = path.join(DATA_DIR, 'mlm-companies.json');

const ARG = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([\w-]+)=?(.*)$/);
  return m ? [m[1], m[2] || true] : [a, true];
}));
const LIMIT = +(ARG.limit || 0);
const RPS = +(ARG.rps || 2);
const REQ_INTERVAL_MS = Math.max(50, Math.floor(1000 / RPS));

const { getGroqKeys, requestGroqChatCompletion } = require('../src/utils/groq-rotator');

// Stable category list — keep in sync with UI.
const CATEGORIES = [
  'БАДы и здоровье',
  'Косметика и уход',
  'Парфюмерия',
  'Бытовая химия',
  'Продукты питания',
  'Напитки',
  'Кофе и чай',
  'Похудение и фитнес',
  'Спортивное питание',
  'Криптовалюта и трейдинг',
  'Инвестиции и финансы',
  'Образование и курсы',
  'Туризм и путешествия',
  'Технологии и IT',
  'Связь и телеком',
  'Энергетика и эко',
  'Авто и транспорт',
  'Недвижимость',
  'Одежда и текстиль',
  'Ювелирка и аксессуары',
  'Мебель и интерьер',
  'Зоотовары',
  'Психология и коучинг',
  'Криптообразование',
  'Скам / закрытая',
  'Другое',
];

const SYSTEM_PROMPT = `Ты эксперт по сетевому маркетингу. Получаешь название MLM-компании и определяешь её основное направление.

ОТВЕЧАЙ СТРОГО JSON в формате:
{"category":"<одна из категорий>","tags":["<тег1>","<тег2>","<тег3>"],"note":"<1 короткая фраза о компании>"}

Доступные категории (выбери ровно одну, наиболее точную):
${CATEGORIES.map(c => '- ' + c).join('\n')}

Теги (3-5 коротких слов): что компания продаёт/делает (БАДы, мыло, крипта, обучение и т.д.).
Если компания неизвестна — категория "Другое", note "не идентифицирована".
Никаких пояснений вне JSON.`;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJsonAtomic(p, obj) { const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj, null, 2)); fs.renameSync(t, p); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const companies = readJson(COMPANIES, []);
  const groqKeys = getGroqKeys({});
  if (!groqKeys.length) throw new Error('GROQ_API_KEYS not set');

  let todo = companies.filter(c => !c.category);
  if (LIMIT > 0) todo = todo.slice(0, LIMIT);
  console.log(`[categorize] ${todo.length}/${companies.length} companies pending`);

  let done = 0, fails = 0;
  const start = Date.now();
  for (const c of todo) {
    try {
      const t0 = Date.now();
      let r = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          r = await requestGroqChatCompletion([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Название MLM-компании: "${c.name}". JSON.` },
          ], { groqKeys, maxTokens: 200, temperature: 0.2, model: 'llama-3.3-70b-versatile' });
          break;
        } catch (err) {
          if (/Rate limit|rate.?limit|429/i.test(err.message) && attempt < 4) {
            await sleep(8000 + attempt * 4000);
            continue;
          }
          throw err;
        }
      }

      const text = String(r?.choices?.[0]?.message?.content || '').trim();
      // Strip code fences if any
      const json = text.replace(/^```json\s*|^```\s*|\s*```$/g, '');
      const obj = JSON.parse(json);

      const cat = CATEGORIES.includes(obj.category) ? obj.category : 'Другое';
      const tags = Array.isArray(obj.tags) ? obj.tags.slice(0, 5).map(String) : [];
      const note = String(obj.note || '').slice(0, 200);

      const idx = companies.findIndex(x => x.id === c.id);
      if (idx >= 0) {
        companies[idx].category = cat;
        companies[idx].tags = tags;
        companies[idx].ai_note = note;
      }
      done++;
      const ms = Date.now() - t0;
      const eta = Math.round((todo.length - done) * (Date.now() - start) / done / 60000);
      console.log(`[${done}/${todo.length}] ${c.name.padEnd(40)} → ${cat} (${ms}ms, ETA ${eta}m)`);
    } catch (e) {
      fails++;
      console.warn(`[fail] ${c.name}: ${e.message}`);
      // do not stamp fallback on rate-limit / network — leave .category undefined for retry
    }

    // Save every 25
    if (done % 25 === 0) {
      writeJsonAtomic(COMPANIES, companies);
    }

    const elapsed = Date.now() - start;
    const expected = done * REQ_INTERVAL_MS;
    const wait = Math.max(0, expected - elapsed);
    if (wait > 0) await sleep(wait);
  }

  writeJsonAtomic(COMPANIES, companies);
  console.log(`\n=== DONE === ok=${done} fails=${fails}`);
}

process.on('SIGINT', () => { console.log('SIGINT — saving'); process.exit(0); });
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
