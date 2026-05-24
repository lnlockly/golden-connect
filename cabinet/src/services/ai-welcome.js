// AI-powered welcome generator for new chat members.
// Each invocation: picks 3 random services from the catalog, picks an angle, asks Groq
// to write a short personalized welcome (Russian, ≤600 chars, NO commands, NO links).
// Returns a string. Falls back to a static template if Groq is unavailable.

const https = require('https');

const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile';

const SERVICES = [
  { id: 'jobs',      label: 'Биржа заданий',         desc: 'короткие задания (5-15 мин), за каждое — $0.05+ на баланс. Подписки, видеопросмотры, кастомные отчёты.' },
  { id: 'partners',  label: '10-уровневая партнёрская сеть', desc: 'каждый приглашённый строит твою матрицу до 10 уровней вглубь, плюс +10% Matching Bonus с активных рефералов.' },
  { id: 'shop',      label: 'Маркетплейс цифровых товаров', desc: 'продаёшь курсы, e-books, шаблоны или любые цифровые продукты. Авто-выплаты, реферальный сплит, QR-карточка.' },
  { id: 'bio',       label: 'Bio-страница',          desc: 'свой мини-сайт типа Linktree — все ссылки, кнопки, контакты в одной красивой странице с авто-аналитикой.' },
  { id: 'shortener', label: 'Шортер ссылок и QR',    desc: 'любая длинная ссылка → короткая t2gift.com/abc, статистика кликов, брендированные QR-карточки для офлайн-промо.' },
  { id: 'banner_ad', label: 'Баннерная реклама на сайте', desc: 'твой баннер показывается на партнёрских страницах Golden Connect, оплата за реальные показы во внутренней валюте TRDX.' },
  { id: 'video_ad',  label: 'Видео-реклама',         desc: 'короткий ролик до 5 минут показывается всем посетителям сайта, точная статистика просмотров и переходов.' },
  { id: 'trdx',      label: 'Genesis TRDX',          desc: 'пресейл-токен платформы — копится сейчас, после старта будет внутренняя биржа, ежеквартальные дивиденды и розыгрыши призов.' },
  { id: 'adx',       label: 'ADX биржа TG-каналов',  desc: 'размещаешь рекламу в чужих каналах или продаёшь рекламу в своём, всё через escrow + авто-публикацию ботом.' },
  { id: 'meet',      label: 'Golden Connect Meet',          desc: 'видеозвонки с командой и партнёрами в браузере — без установки Zoom или Skype.' },
  { id: 'ai_mentor', label: 'AI-Mentor',             desc: 'персональный AI-наставник советует следующий шаг, разбирает кейсы, подбирает тариф под цели.' },
  { id: 'autopost',  label: 'TG-автопостинг',        desc: 'подключаешь свои TG-каналы, Golden Connect автоматически публикует контент по расписанию для роста охвата.' },
  { id: 'karma',     label: 'Карма + квесты',        desc: 'за активность получаешь карма-баллы, открывающие еженедельные розыгрыши и приоритет в рекламном пуле.' },
  { id: 'tariffs',   label: 'Партнёрские тарифы',    desc: 'три уровня (LAUNCH / BOOST / ROCKET) — открывают бизнес-места в матрице с глубиной 12-17 уровней и Matching Bonus.' },
];

const ANGLES = [
  'заработок без вложений с первого дня',
  'инвестиция и долгосрочный пассивный доход',
  'продвижение собственных товаров или услуг',
  'построение команды и масштабирование сети',
  'технологии, AI и автоматизация задач',
  'личный бренд и присутствие в сети',
  'входной билет в новую web3-экосистему',
];

function _pickRandom(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function _staticFallback(name, picked) {
  const lines = [`Привет, ${name}! 👋`, ''];
  lines.push('Golden Connect — это экосистема возможностей. Вот что у нас есть:');
  picked.forEach(s => lines.push(`• <b>${s.label}</b> — ${s.desc}`));
  lines.push('');
  lines.push('Загляни в кабинет — там удобно всё посмотреть и попробовать.');
  return lines.join('\n');
}

async function _groq(systemPrompt, userPrompt) {
  if (!GROQ_KEYS.length) return '';
  const body = JSON.stringify({
    model: TEXT_MODEL, max_tokens: 380, temperature: 0.85,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return new Promise((resolve) => {
    const key = GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];
    const req = https.request({
      method: 'POST', hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, (res) => {
      let buf = ''; res.on('data', c => buf += c);
      res.on('end', () => {
        try { const j = JSON.parse(buf); resolve(j.choices?.[0]?.message?.content || ''); }
        catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { try { req.destroy(); } catch (_) {} resolve(''); });
    req.write(body); req.end();
  });
}

function _scrubCommands(text) {
  // Strip any /command tokens that may have slipped through Groq.
  return String(text || '').replace(/\/[a-z][a-z0-9_]{1,30}/gi, '').replace(/\s{2,}/g, ' ').trim();
}

async function generateWelcome({ name = 'друг', isMember = false, lang = 'ru' } = {}) {
  const picked = _pickRandom(SERVICES, 3);
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

  const sys = [
    'Ты — приветствующий ассистент Golden Connect. Пишешь короткое сочное приветствие новому участнику в Telegram (HTML).',
    '',
    'СТРОГИЕ ПРАВИЛА:',
    '- НЕ пиши команды-слеши вообще нигде — никаких /jobs /ref /tariffs /start /menu /help и т.д. Их вообще быть не должно.',
    '- НЕ давай прямые URL/ссылки в тексте.',
    '- НЕ используй слово "команда".',
    '- НЕ упоминай услуги, которых нет в списке ниже.',
    '- Длина: 3-5 коротких абзацев, до 600 символов суммарно.',
    '- Используй HTML-теги Telegram: <b>, <i>, эмоджи. БЕЗ <a> и без markdown.',
    '- Конкретный угол подачи в этом приветствии: "' + angle + '" — заходи именно с этой стороны.',
    isMember
      ? '- Это уже зарегистрированный партнёр. Освежи возможности, не объясняй с нуля.'
      : '- Это новый человек, мягко расскажи что есть и почему интересно.',
    '- В конце мягко пригласи зайти в кабинет (без слова "команда" и без слешей) — типа "загляни ко мне в личке" или "найдёшь меню в кабинете".',
    '',
    'Услуги в этом приветствии (используй ВСЕ ТРИ, не добавляй других):',
    picked.map(s => '• ' + s.label + ' — ' + s.desc).join('\n'),
    '',
    'Имя пользователя: ' + name + '.',
    'Язык: ' + (lang === 'en' ? 'English' : 'Русский') + '.',
  ].join('\n');

  const user = 'Напиши приветствие. Соблюдай ВСЕ правила.';
  let raw = '';
  try { raw = await _groq(sys, user); } catch (_) { raw = ''; }
  const cleaned = _scrubCommands(raw);
  if (cleaned && cleaned.length >= 80) return cleaned;
  return _staticFallback(name, picked);
}

module.exports = { generateWelcome, SERVICES, ANGLES };
