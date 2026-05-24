/**
 * Daily plan service — AI-generated 5 micro-tasks per user per day.
 * Stage-aware (newbie / compounding / scaling) + day-of-week + Telegram peak hours.
 * Cached in SQLite table daily_plans for re-fetch within the same day.
 */
const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
let _idx = 0;
function _key() {
  if (!GROQ_KEYS.length) return null;
  const k = GROQ_KEYS[_idx % GROQ_KEYS.length];
  _idx++;
  return k;
}

const SYSTEM = `Ты — профессиональный growth-coach для русскоязычных партнёров платформы Golden Connect (рекламная экосистема + 10-уровневая партнёрская сеть, основная аудитория в Telegram CIS).

ТВОЯ РАБОТА: составить пользователю 5 микро-задач на СЕГОДНЯ — конкретных, с цифрами, привязанных ко времени, основанных на его этапе и реальных best-practice.

═══ ОПРЕДЕЛИ ЭТАП ═══
Считай юзера НОВИЧКОМ если: experience=newbie ИЛИ no referrals + budget<$45.
Считай ОПЫТНЫМ (compounding) если: experience=mlm/ads/blogger И время>=1_2h.
Считай ПРО (scaling) если: experience=pro ИЛИ network>=200_500.

═══ ЭТАП → ПРИОРИТЕТЫ ═══

📍 НОВИЧОК (день 1-7): фокус ТОЛЬКО на 50 первых подписчиков + 3 первых реферала.
  Что давать: ручной outreach (10-15 DM/день, 5 комментариев в нишевых каналах), личный пост-знакомство, разбор инструментов бота, первое задание на бирже.
  Что НЕ давать: настройку рекламы, лендинги, оптимизацию воронок — это процрастинация на старте.

📍 ОПЫТНЫЙ (день 8-30): сдвиг 60/40 контент vs аутрич.
  Что давать: ежедневный пост в TG-канал, обмен папками (взаимопиар) с каналами своего размера ±30%, отслеживание 3 метрик (subs/clicks/signups), реактивация спящих рефералов.
  Tools: TGStat, Telemetr, Combot для верификации.

📍 ПРО (месяц 2+): делегирование + платный трафик.
  Что давать: лид-магнит (PDF/чек-лист), Telegram Ads (€2 CPM), посты в верифицированных каналах через Telega.in, найм/делегирование DM.

═══ ПРАВИЛА ЗАДАЧ ═══
1. ВРЕМЯ-БОКС: каждая задача 5-30 минут (не больше).
2. ЦИФРЫ: всегда конкретное число ("10 DM", "5 комментариев в @nichechannel", "3 поста").
3. ИНСТРУМЕНТЫ ПО ИМЕНИ: TGStat, Telemetr, Combot, Telega.in, Golden Connect /jobs /promo /ref /tariffs.
4. ВРЕМЯ ДНЯ: используй пики MSK — утро 9:00-10:30, обед 13:00-13:30, вечер 19:00-22:00.
5. ПОЧЕМУ: каждая задача должна иметь "description" с обоснованием (повышает compliance +40%).
6. ЭКОЛОГИЧНОСТЬ: НЕ давать спам-DM "регистрируйся", давай скрипты "тестирую X, нужно мнение".
7. 80/20: 4 из 5 задач на ценность/контент, 1 на прямой pitch — НЕ наоборот.
8. ВЫХОДНЫЕ vs БУДНИ: в субботу-воскресенье аудитория CIS свободнее — давай пост в 20:00 (peak), личные созвоны с топ-рефералами; будни — outreach + контент.

═══ ФОРМАТ ОТВЕТА ═══
СТРОГО валидный JSON массив без markdown без объяснений вокруг:
[
  {
    "title": "до 60 симв, конкретное действие с числом",
    "description": "1-2 предложения: что делать пошагово + ПОЧЕМУ это сработает (короткое основание).",
    "time_min": 15,
    "category": "growth|content|outreach|learning|tech",
    "priority": 1,
    "suggested_time": "09:30"
  }
]
Ровно 5 задач. priority: 1=обязательно, 2=желательно, 3=если время.
Распредели задачи по дню: утро (9:00-12:00), обед (13:00-16:00), вечер (19:00-22:00).`;

function _stage(answers, profile) {
  const exp = (answers && answers['5']) || (profile && profile.experienceLevel) || 'newbie';
  const network = (answers && answers['7']) || '';
  const budget = (answers && answers['6']) || (profile && String(profile.monthlyBudget || '0')) || '0';
  if (exp === 'pro' || network === '200_500' || network === '1000_plus') return 'scaling';
  if (['mlm', 'ads', 'blogger'].includes(exp)) return 'compounding';
  if (parseInt(budget, 10) >= 45 && exp !== 'newbie') return 'compounding';
  return 'newbie';
}

function _dayContext(date) {
  const d = new Date(date + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun,6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const names = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  return { day_name: names[dow], is_weekend: isWeekend };
}

async function generateDailyPlan({ profile, answers, day }) {
  const key = _key();
  if (!key) return _staticPlan(answers, profile);

  const today = day || new Date().toISOString().slice(0, 10);
  const stage = _stage(answers, profile);
  const ctx = _dayContext(today);

  const exp = (answers && answers['5']) || (profile && profile.experienceLevel) || 'newbie';
  const time = (answers && answers['4']) || '1_2h';
  const goal = (answers && answers['2']) || 'income_partner';
  const channels = (answers && answers['8']) || (profile && profile.trafficSource) || '';
  const fear = (answers && answers['9']) || '';
  const schedule = (profile && profile.workSchedule) || '';
  const network = (answers && answers['7']) || '';
  const budget = (answers && answers['6']) || (profile && String(profile.monthlyBudget || '0')) || '0';
  const niche = (profile && profile.niche) || '';

  const userPrompt = `Профиль партнёра:
- Этап: ${stage} (newbie | compounding | scaling)
- Опыт в маркетинге: ${exp}
- Время в день: ${time}
- Главная цель: ${goal}
- Каналы/трафик: ${channels || '—'}
- Сеть знакомых: ${network || '—'}
- Главный страх/блок: ${fear || '—'}
- Расписание: ${schedule || 'любое'}
- Бюджет в месяц: $${budget}
- Ниша: ${niche || '—'}

Сегодня: ${today} (${ctx.day_name}, ${ctx.is_weekend ? 'выходной' : 'будний день'}).

Контекст Golden Connect:
- Команды бота: /jobs (биржа подписок/задач/видео), /ref (реф-ссылка x2), /promo (готовые посты + AI), /tariffs, /balance, /coach
- Тарифы: FREE / LAUNCH $45 (1 место, 12 уровней) / BOOST $90 (2 места) / ROCKET $135 (3 места + Matching Bonus)
- Реф-ссылка на сайт: https://golden-connect.to/?ref=КОД, на бот: https://t.me/Golden Connect_bizbot?start=ref_КОД

Сгенерируй план на сегодня по правилам выше.`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 1800,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn('[daily-plan] Groq', r.status, txt.slice(0, 200));
      return _staticPlan(answers, profile);
    }
    const data = await r.json();
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) return _staticPlan(answers, profile);
    let parsed;
    try {
      const obj = JSON.parse(raw);
      parsed = Array.isArray(obj) ? obj : (obj.tasks || obj.plan || obj.items || []);
    } catch (e) {
      const m = raw.match(/\[[\s\S]+\]/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch (_) { parsed = []; } }
    }
    if (!Array.isArray(parsed) || !parsed.length) return _staticPlan(answers, profile);
    return _normalizeTasks(parsed);
  } catch (e) {
    console.warn('[daily-plan] generation failed', e && e.message);
    return _staticPlan(answers, profile);
  }
}

function _normalizeTasks(arr) {
  return arr.slice(0, 5).map((t, i) => ({
    title: String(t.title || ('Задача ' + (i + 1))).slice(0, 100),
    description: String(t.description || '').slice(0, 500),
    time_min: Math.max(5, Math.min(120, parseInt(t.time_min, 10) || 15)),
    category: ['growth', 'content', 'outreach', 'learning', 'tech'].includes(t.category) ? t.category : 'growth',
    priority: [1, 2, 3].includes(parseInt(t.priority, 10)) ? parseInt(t.priority, 10) : 2,
    suggested_time: /^\d{1,2}:\d{2}$/.test(String(t.suggested_time || '')) ? t.suggested_time : null,
  }));
}

function _staticPlan(answers, profile) {
  const stage = _stage(answers, profile);
  if (stage === 'newbie') {
    return [
      { title: 'Изучить главное меню бота за 10 мин', description: 'Открой @Golden Connect_bizbot → попробуй /tariffs, /jobs, /ref, /promo. Записывай что не понятно — спрошу AI-куратор. ПОЧЕМУ: ты должен знать инструменты прежде чем продавать.', time_min: 10, category: 'learning', priority: 1, suggested_time: '09:30' },
      { title: 'Сделать 1 задание на бирже', description: '/jobs → "Подписки на каналы" → возьми любое задание $0.05. Поймёшь как платят и как работает биржа. ПОЧЕМУ: первый дофамин = первая мотивация.', time_min: 10, category: 'growth', priority: 1, suggested_time: '11:00' },
      { title: 'Скопировать 2 реф-ссылки', description: '/ref → сохрани обе: на сайт (https://golden-connect.to/?ref=КОД) и на бота. На сайт лучше для тёплых, на бот — для холодных. ПОЧЕМУ: разные аудитории заходят разными путями.', time_min: 5, category: 'outreach', priority: 1, suggested_time: '13:00' },
      { title: 'DM 5 знакомым: "тестирую сервис, нужно мнение"', description: 'Личное сообщение 5 друзьям/коллегам. НЕ "регистрируйся", а "тестирую X, мне интересно твоё мнение, посмотришь?" ПОЧЕМУ: фрейм просьбы вместо продажи даёт x5 конверсию.', time_min: 25, category: 'outreach', priority: 2, suggested_time: '14:00' },
      { title: 'Проверить кабинет Команда', description: 'golden-connect.to/cabinet → Команда. Посмотри сколько подключилось из 5 DM. ПОЧЕМУ: метрики = понимание что работает.', time_min: 5, category: 'learning', priority: 3, suggested_time: '21:00' },
    ];
  }
  if (stage === 'compounding') {
    return [
      { title: 'Утренний пост в TG-канал (9:30)', description: 'Опубликуй контент-пост (НЕ pitch) — кейс, разбор, ошибка. /promo даст шаблон. ПОЧЕМУ: 80/20 — 4 контента на 1 продажу = доверие.', time_min: 20, category: 'content', priority: 1, suggested_time: '09:30' },
      { title: '10 комментариев в нишевых каналах', description: 'Найди 5 каналов твоей ниши через TGStat → оставь 2 содержательных комментария в каждом. ПОЧЕМУ: 20-50 просмотров профиля → 3-8 подписок без рекламы.', time_min: 25, category: 'growth', priority: 1, suggested_time: '13:00' },
      { title: '5 DM активным комментаторам в чужих каналах', description: 'Найди 5 человек кто оставил активный коммент в нишевом канале → DM с конкретным вопросом про их пост. НЕ начинай с pitch. ПОЧЕМУ: pattern-break vs spam = ban-safe + 4-7x reply rate.', time_min: 30, category: 'outreach', priority: 2, suggested_time: '15:00' },
      { title: 'Реактивация 3 спящих рефералов', description: 'Команда → отсортируй по "не активны 30+ дней" → 3 личных DM с НОВОСТЬЮ (новая фича/выплата), не "вернись пожалуйста". ПОЧЕМУ: даёшь причину, не давишь чувством вины — recovery rate ~30%.', time_min: 15, category: 'outreach', priority: 2, suggested_time: '17:00' },
      { title: 'Снять 3 цифры дня', description: 'Запиши: подписок +X, кликов по реф-ссылке +Y, регистраций +Z. Без замеров — нет улучшений. ПОЧЕМУ: без числа любая активность ощущается как "много работал но не понятно где".', time_min: 5, category: 'learning', priority: 3, suggested_time: '21:30' },
    ];
  }
  // scaling
  return [
    { title: 'Запустить 1 платную кампанию /реклама', description: 'cabinet#/ads-order → создай sub-кампанию ($10-20) на свой канал. ПОЧЕМУ: на этапе scaling органика добавляет 5%, платный трафик — 95% роста.', time_min: 15, category: 'growth', priority: 1, suggested_time: '10:00' },
    { title: 'Опубликовать пост с лид-магнитом', description: 'Пост: "PDF-чек-лист по [теме] бесплатно — оставь + в комментах". Соберёшь тёплых лидов. ПОЧЕМУ: лид-магнит конвертит в 15-25%, raw-подписка — 2%.', time_min: 30, category: 'content', priority: 1, suggested_time: '11:30' },
    { title: 'Фолдер-обмен с 3 каналами', description: 'Найди в TGStat 3 канала ±30% твоего размера → договорись о включении в общую папку. ПОЧЕМУ: 500-2000 субс/неделя без рекламы, ROI #1 в 2026.', time_min: 30, category: 'outreach', priority: 2, suggested_time: '14:00' },
    { title: 'Аудит 5 топ-рефералов', description: 'Топ-5 партнёров → проверь их активность за неделю → личное сообщение каждому с тактикой "что делать на следующей неделе". ПОЧЕМУ: твой доход = их активность; mentor-pair даёт 2-3x retention.', time_min: 30, category: 'outreach', priority: 2, suggested_time: '17:00' },
    { title: 'Делегировать DM-работу', description: 'Если ещё не нанял — пост в чате партнёров: "ищу ассистента $X/нед делать 30 DM по моему скрипту". ПОЧЕМУ: твоё время > $20/час должно идти на стратегию, не на копипаст.', time_min: 15, category: 'tech', priority: 3, suggested_time: '20:00' },
  ];
}

module.exports = { generateDailyPlan };
