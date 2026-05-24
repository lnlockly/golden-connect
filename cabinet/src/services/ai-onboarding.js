// AI plan generator for /my_plan onboarding survey.
// Uses the same Groq client style as ai-task-checker but with a GENERATION prompt
// (the existing checkTextReport is for evaluation, not generation).

const https = require('https');

const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const TEXT_MODEL = 'llama-3.3-70b-versatile';

function groqRequest(body) {
  return new Promise((resolve, reject) => {
    if (!GROQ_KEYS.length) return reject(new Error('no_groq_keys'));
    let attempt = 0;
    function tryNext() {
      const key = GROQ_KEYS[attempt % GROQ_KEYS.length];
      attempt++;
      const data = JSON.stringify(body);
      const req = https.request({
        method: 'POST', hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        }, timeout: 30000,
      }, (res) => {
        let buf = ''; res.on('data', c => buf += c);
        res.on('end', () => {
          if ((res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) && attempt < GROQ_KEYS.length * 2) {
            return tryNext();
          }
          if (res.statusCode >= 400) return reject(new Error('groq_' + res.statusCode + ': ' + buf.slice(0, 200)));
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        });
      });
      req.on('error', e => attempt < GROQ_KEYS.length * 2 ? tryNext() : reject(e));
      req.on('timeout', () => req.destroy(new Error('groq_timeout')));
      req.write(data); req.end();
    }
    tryNext();
  });
}

const SYSTEM_PROMPT = `Ты — наставник новых партнёров Golden Connect (рекламная экосистема с распределённой прибылью).
Твоя задача — на основе ответов анкеты составить ПЕРСОНАЛЬНЫЙ план на 30 дней с конкретными шагами.

ПРО ПЛАТФОРМУ GOLDEN_CONNECT:
- Биржа заданий: пользователь смотрит/кликает рекламу, получает $0.05+ за действие, до $20-50/день.
- Партнёрка: 10 уровней рефералов (L1=10%, L2=7%, ... L10=0.5%) от дохода приглашённых.
- Тарифы: FREE (старт), LAUNCH \$45 (12 уровней матрицы × \$0.5), BOOST \$90 (14 × \$0.6, 2 места), ROCKET \$135 (17 × \$0.7, 3 места + Matching Bonus).
- Маркетплейс: можно продавать инфопродукты, 70% продавцу + 30% распределяется по сети.
- Статус PARTNER: 10 платных рефералов → +10% к ставке заданий пожизненно.
- Чат проекта: @GOLDEN_CONNECT_AD (туда новички приходят за ответами).
- Бот: @GoldenConnect_bizbot (команды /jobs, /ref, /tariffs, /campaigns, /bio, /aipost).
- Личный кабинет: goldenConnect.to/cabinet

КАК ПИСАТЬ ПЛАН:
1. Обращайся по имени из ответа №1.
2. Учитывай цель (#2), желаемый доход (#3), время в день (#4), опыт (#5), бюджет (#6), окружение (#7), каналы (#8), страх/блок (#9).
3. Структура (используй эмодзи для секций):
   🎯 ТВОЙ ПЛАН на 30 дней — 1-строчное персональное приветствие
   📅 ДЕНЬ 1-3 (старт) — 4-5 конкретных шагов с командами /jobs /ref /tariffs
   📅 НЕДЕЛЯ 1 (первый доход) — 4-5 шагов + прогноз дохода под их время/опыт
   📅 МЕСЯЦ 1 (выход на доход) — 4-5 шагов + финальный прогноз с цифрами под их желаемый доход
   💡 ГЛАВНОЕ — 2-3 совета именно про их СТРАХ/блок (#9)
   🤝 ТВОЙ СПОНСОР — здесь будет шаблон, его подставит сервер; просто напиши: "Если что-то непонятно — пиши спонсору, он провёл этот путь сам и готов помочь."
   💬 ЧАТ ПРОЕКТА — упомяни @GOLDEN_CONNECT_AD как место где партнёры обмениваются опытом
   🎁 БОНУС — \$1 на gift-баланс уже зачислен

ТРЕБОВАНИЯ:
- 350-500 слов на русском.
- Конкретные команды/ссылки внутри goldenConnect.to/cabinet и t.me/GoldenConnect_bizbot.
- Никаких БАДов, лекарств, медицинской тематики (это рекламная платформа, не оздоровление).
- Никаких выдуманных URL.
- Тон: дружелюбный наставник, без воды.
- НЕ оценивай ответы пользователя ("отчёт соответствует критериям" и т.п. — запрещено).
- Просто выдай план как текст, без JSON-обёртки.`;

function buildUserMessage(answers, sponsorBlock) {
  return [
    'Имя пользователя: ' + (answers['1'] || 'партнёр'),
    'Цель прихода: ' + (answers['2'] || 'не указана'),
    'Желаемый доход в месяц: ' + (answers['3'] || 'не указан'),
    'Свободное время в день: ' + (answers['4'] || 'не указано'),
    'Опыт в онлайн-заработке: ' + (answers['5'] || 'не указан'),
    'Бюджет на старт: ' + (answers['6'] || 'не указан'),
    'Окружение (потенциальные рефералы): ' + (answers['7'] || 'не указано'),
    'Каналы продвижения: ' + (answers['8'] || 'не указаны'),
    'Главный страх/блок: ' + (answers['9'] || 'не указан'),
    '',
    'Сейчас сгенерируй персональный план на 30 дней по формату из system prompt.',
  ].join('\n');
}

/**
 * Generate a personal Golden Connect onboarding plan.
 *
 * @param {Object} answers — keys '1'..'9' from survey
 * @param {Object} sponsor — { displayName, telegramUsername } or null
 * @returns {Promise<string>} plain-text plan ready to render
 */
async function generatePersonalPlan(answers, sponsor) {
  if (!GROQ_KEYS.length) {
    return null; // caller falls back to static
  }
  let plan;
  try {
    const data = await groqRequest({
      model: TEXT_MODEL,
      max_tokens: 900,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(answers) },
      ],
    });
    plan = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
    plan = String(plan).trim();
  } catch (e) {
    console.warn('[ai-onboarding] groq failed:', e.message);
    return null;
  }
  if (!plan || plan.length < 100) return null;

  // Inject sponsor contacts (replace placeholder section)
  const sponsorLine = sponsor && sponsor.telegramUsername
    ? '🤝 ТВОЙ СПОНСОР: @' + sponsor.telegramUsername + (sponsor.displayName ? ' (' + sponsor.displayName + ')' : '') + ' — пиши ему любые вопросы по старту, он провёл этот путь сам.'
    : '🤝 ТВОЙ СПОНСОР: пока не назначен. Напиши в чат @GOLDEN_CONNECT_AD — найдём кого закрепить.';

  const chatLine = '💬 ЧАТ ПРОЕКТА: @GOLDEN_CONNECT_AD — здесь партнёры обмениваются опытом, делятся связками, отвечают на вопросы.';

  // Append (or replace) sponsor + chat sections at the end of plan
  if (!plan.includes('@GOLDEN_CONNECT_AD') && !plan.match(/ЧАТ ПРОЕКТА/i)) {
    plan += '\n\n' + sponsorLine + '\n\n' + chatLine;
  } else {
    // AI mentioned chat already — just inject sponsor line if missing
    if (!plan.match(/СПОНСОР|спонсор/) && sponsor) {
      plan += '\n\n' + sponsorLine;
    }
  }
  return plan;
}

module.exports = { generatePersonalPlan };
