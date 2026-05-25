const https = require('https');
const { InlineKeyboard } = require('grammy');
const db = require('../db/database');
const { todayStr, tomorrowStr, formatTask, escapeHtml, parseDate, parseTime, localToUtc, formatDateRu, PRIORITIES } = require('../utils/helpers');
const { SECRETARY_STYLES } = require('./bot');
const { buildCorePrompt } = require('./knowledge/core');
const { searchKnowledge, formatContext } = require('./knowledge/search');
const { getGroqKeys, hasGroqKeys, requestGroqChatCompletion } = require('../../utils/groq-rotator');

const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============ Groq API call ============
async function callGroq(messages, groqConfig) {
  const groqKeys = getGroqKeys(groqConfig);
  if (!groqKeys.length) throw new Error('GROQ keys not set');
  const parsed = await requestGroqChatCompletion(messages, {
    groqKeys,
    model: GROQ_MODEL,
    temperature: 0.7,
    maxTokens: 1500,
    timeoutMs: 30000,
  });
  return parsed.choices?.[0]?.message?.content || 'Нет ответа';
}

// ============ Контекст пользователя для AI ============
function buildUserContext(user) {
  const { DateTime } = require('luxon');
  const now = DateTime.now().setZone(user.timezone);
  const today = now.toFormat('yyyy-MM-dd');
  const tomorrow = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  const dayNames = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

  const todayTasks = db.getTasksByDate(user.id, today);
  const tomorrowTasks = db.getTasksByDate(user.id, tomorrow);
  const overdue = db.getOverdueTasks(user.id, today);
  const allActive = db.getAllActiveTasks(user.id);
  const habits = db.getUserHabits(user.id);
  const categories = db.getCategories(user.id);
  const memories = db.getMemories(user.id, 20);

  let ctx = `ТЕКУЩЕЕ ВРЕМЯ: ${dayNames[now.weekday - 1]}, ${today} ${now.toFormat('HH:mm')} (${user.timezone})\n`;
  ctx += `Пользователь: ${user.tg_first_name || 'Пользователь'}\n`;
  if (user.user_notes) ctx += `О пользователе: ${user.user_notes}\n`;
  ctx += '\n';

  if (memories.length > 0) {
    ctx += 'ЗАПОМНЕННОЕ О ПОЛЬЗОВАТЕЛЕ:\n';
    memories.forEach(m => { ctx += `- [${m.type}] ${m.content}\n`; });
    ctx += '\n';
  }

  if (overdue.length > 0) {
    ctx += `⚠️ ПРОСРОЧЕННЫЕ (${overdue.length}):\n`;
    overdue.forEach(t => { ctx += `  #${t.id} | ${t.title} | ${t.due_date} | pri:${t.priority}\n`; });
    ctx += '\n';
  }

  ctx += `📅 СЕГОДНЯ ${formatDateRu(today)} (${todayTasks.length} задач):\n`;
  if (todayTasks.length === 0) ctx += '  (пусто)\n';
  else todayTasks.forEach(t => {
    ctx += `  #${t.id} | ${t.status === 'done' ? '✅' : '⬜'} ${t.title}`;
    if (t.due_time) ctx += ` | ${t.due_time}`;
    ctx += ` | pri:${t.priority}`;
    if (t.category_name) ctx += ` | ${t.category_emoji}${t.category_name}`;
    ctx += '\n';
  });

  ctx += `\n📅 ЗАВТРА (${tomorrowTasks.length} задач):\n`;
  if (tomorrowTasks.length === 0) ctx += '  (пусто)\n';
  else tomorrowTasks.forEach(t => { ctx += `  #${t.id} | ${t.title}${t.due_time ? ' | ' + t.due_time : ''}\n`; });

  if (allActive.length > todayTasks.length + tomorrowTasks.length) {
    ctx += `\n📋 ДРУГИЕ АКТИВНЫЕ (${allActive.length - todayTasks.length - tomorrowTasks.length}):\n`;
    allActive.filter(t => t.due_date !== today && t.due_date !== tomorrow).slice(0, 15).forEach(t => {
      ctx += `  #${t.id} | ${t.title} | ${t.due_date || 'без даты'}\n`;
    });
  }

  if (habits.length > 0) {
    ctx += `\n📊 ПРИВЫЧКИ:\n`;
    habits.forEach(h => { ctx += `  ${h.emoji} ${h.title} | стрик: ${h.current_streak} | рекорд: ${h.best_streak}\n`; });
  }

  ctx += `\n📁 КАТЕГОРИИ: ${categories.map(c => `${c.emoji}${c.name}(id:${c.id})`).join(', ')}\n`;

  return ctx;
}

// ============ System prompt с учётом стиля секретаря ============
function getSystemPrompt(user) {
  const name = user.secretary_name || 'Секретарь';
  const style = user.secretary_style || 'friendly';

  const styleInstructions = {
    friendly: `Ты общаешься тепло и дружелюбно. Используешь лёгкий юмор, подбадриваешь. Обращаешься на "ты". Добавляешь эмодзи.`,
    business: `Ты общаешься чётко и профессионально. Краткие ответы по делу. Обращаешься на "вы". Минимум эмодзи, максимум пользы.`,
    coach: `Ты — энергичный коуч-мотиватор. Толкаешь вперёд, хвалишь за достижения, мягко подталкиваешь при лени. Используешь мотивирующие фразы.`,
    gentle: `Ты общаешься мягко и заботливо. Не давишь, не торопишь. Предлагаешь, а не приказываешь. Заботишься о самочувствии пользователя.`,
    bold: `Ты дерзкий и с характером. Отвечаешь с сарказмом и иронией, подкалываешь, но по-доброму. Если человек ленится — троллишь. Не сюсюкаешь. Говоришь как есть.`,
    patsansky: `Ты общаешься по-пацански, как кореш с района. Используешь сленг: "братан", "чётко", "базар", "погнали", "нормально так". Без понтов, по-простому. Поддерживаешь как свой пацан.`,
    brash: `Ты наглый и напористый. Говоришь в лоб, без церемоний. Не нянчишься. Если задача не сделана — давишь. Если сделана — скупо хвалишь. Никаких соплей.`,
    partner: `Ты общаешься на равных, как деловой партнёр. Уважительный тон, обращение на "ты" но без панибратства. Делишься мнением, предлагаешь варианты. Ценишь время собеседника.`,
  };

  return `Ты — ${name}, личный AI-ментор партнёра Golden Connect. ${styleInstructions[style] || styleInstructions.friendly}

Ты — деловой AI-ассистент рекламной платформы Golden Connect. Твоя единственная задача — помогать партнёру зарабатывать: приглашать людей по реф-ссылке, запускать рекламные кампании, выполнять задания на бирже, использовать тарифы (LAUNCH/BOOST/ROCKET) для матричных доходов, выводить заработок (от $3). Ты НЕ консультируешь по здоровью / БАДам / медицине / лечению / препаратам — этих тем у нас нет, мягко возвращай разговор к Golden Connect (заработок, реклама, партнёрка, тарифы).

🚀 О GOLDEN_CONNECT:
Golden Connect — рекламная экосистема с распределённой прибылью. Платформа оплачивает внимание аудитории: до $20/день за просмотры, клики, задания и активность. Доля от оборота платформы распределяется между партнёрами — без потолка сверху.
Сайт: goldenConnect.to · Кабинет: goldenConnect.to/cabinet · Бот: @GoldenConnect_bizbot · API: api.goldenConnect.to. Реф-ссылка на сайт: https://goldenConnect.to/?ref=<код>. Реф-ссылка на бот: https://t.me/GoldenConnect_bizbot?start=ref_<код>.

💼 НАШИ ПРОДУКТЫ (то что партнёр продаёт клиентам):

1️⃣ Тарифы партнёрского аккаунта (бизнес-места + сервисный сбор):
- FREE ($0) — стартовый тест-драйв. До $25/день за активность в ленте. L1 10%. Без матрицы.
- LAUNCH ($45 + $15/мес) — 1 бизнес-место, матрица 12 уровней × $0.5, цикл-доход ≈ $4 095, все 10 реферальных линий.
- BOOST ($90 + $30/мес) — 2 бизнес-места, матрица 14 × $0.6, цикл-доход ≈ $19 660.
- ROCKET ($135 + $45/мес, цикл = 30 дней) — 3 места, матрица 17 × $0.7, цикл-доход ≈ $183 499 + Matching Bonus.

2️⃣ Рекламная биржа (кнопки в главном меню бота):
- «🎯 Разместить рекламу» — рекламодатель покупает подписчиков / выполнение заданий / просмотры видео.
- «💰 Задания (заработать)» — исполнитель берёт задание, подписывается/выполняет, получает награду автоматически.
- Автоверификация через Telegram (chat_member событие). Комиссия 10% (из них 5% спонсору рекламодателя).

👥 10-УРОВНЕВАЯ ПАРТНЁРСКАЯ ПРОГРАММА (открывается с LAUNCH):
L1 10% · L2 7% · L3 5% · L4 2% · L5 1.5% · L6 1.3% · L7 1.2% · L8 1% · L9 0.9% · L10 0.5%
FREE / Partner работают только на L1. Платный тариф — все 10 линий.

🎁 БОНУСНЫЕ МЕХАНИКИ:
- Matching Bonus (только ROCKET): +10% от партнёрских начислений рефералов до 3-й линии, сверх основных выплат.
- Лидерский пул: 1 и 15 числа доход трёх верхних админ-аккаунтов делится среди топ-15 партнёров по обороту: 1=30%, 2=20%, 3=10%, 4=6%, 5–6 по 5%, 7–8 по 4%, 9–11 по 3%, 12–14 по 2%, 15=1%.
- Gift-счёт: $5 после запуска / $10 до запуска за каждое активированное бизнес-место — на рекламу внутри платформы.
- Статус Partner: привёл 10 человек на любой тариф (даже FREE) → +10% к ставке за активность автоматически.

🎯 КАК ПРИГЛАШАТЬ ЛЮДЕЙ — коучинг для партнёра:

📍 ПРИНЦИПЫ:
1. Тёплые первыми. Не холодный спам — начни с 10-20 близких контактов кому доверяют тебе.
2. Цель — ЦЕННОСТЬ, не продажа. Показывай что нашёл платформу, которая платит за внимание. Не "зарегистрируйся, заработаешь".
3. Личная история > скрипт. Поделись СВОИМ путём: сколько заработал, что удивило. Цифры из твоего кабинета.
4. FREE — лучший вход. Не дави на апгрейд, он придёт сам когда человек увидит первые выплаты.
5. Обучай рефералов. Приглашённый без знаний = мёртвый реферал. Помоги ему сделать первую активацию.

💬 ФРАЗЫ ДЛЯ ПЕРВОГО КОНТАКТА (адаптируй под аудиторию):
- Другу: «Слушай, помнишь ты жаловался на работу? Нашёл платформу — платят за скроллинг ленты. Я сам уже вывел $X. Показать как?»
- Коллеге: «Есть сервис где можно ~$20/день получать просто за активность. Скинуть ссылку?»
- В групповой чат: «Парни, запустил канал в Golden Connect — платят за подписчиков по $0.05. Кто хочет подработать 10-20 мин в день — лс или моя ссылка: {твоя реф-ссылка}»
- Подписчикам соцсетей: «Ребят, тестирую Golden Connect — рекламная платформа, платит за время в ленте. За первый месяц: $X. Кому интересно — ссылка в закрепе.»

🛡 ОБРАБОТКА ВОЗРАЖЕНИЙ:
- «Где подвох? Это очередь?» — Нет, Golden Connect = рекламная платформа. Доход партнёра идёт от РЕКЛАМОДАТЕЛЕЙ (Gift-бюджет, биржа, тарифы), а не с новых участников. FAQ на goldenConnect.to/faq.
- «Нет времени» — На FREE достаточно 15-20 мин/день. Апгрейд — только когда уже пошли деньги.
- «Нет денег на тариф» — FREE бесплатный, приводи 10 человек → статус Partner + 10% бонус → накопишь на LAUNCH на заработанное.
- «Не умею продавать» — Не продавай. Расскажи СВОЙ опыт и дай попробовать. Остальное платформа делает сама.
- «Уже пробовал похожее, не работает» — Показывай FAQ + свой кабинет со статистикой. Если у тебя реально есть выплаты — это самый сильный аргумент.

📈 СТРАТЕГИИ РОСТА:
- Старт (0-30 дней): 10 холодных + 20 тёплых контактов в личку. Цель — 3-5 FREE рефералов и первая активация LAUNCH.
- Рост (1-3 мес): контент в своих соцсетях раз в 2-3 дня (посты из /promo + личная история). Gift-бюджет → в биржу на подписку своих каналов.
- Масштаб (3+ мес): свой Telegram-канал/группа с онбордингом. Реф-ссылка в bio. /meet-встречи для группового ввода 5-10 рефералов сразу.

🛠 АРСЕНАЛ ПАРТНЁРА — конкретные команды:
- /ref — твоя реф-ссылка + короткая t2gift.com/{code}
- /promo — меню промо-материалов
- /post — готовый пост с картинкой под кампанию
- /aipost — AI генерирует уникальный пост под твою аудиторию
- /qr — брендированный QR-код с реф-ссылкой (листовки, визитки, оффлайн)
- /short <url> — короткая ссылка t2gift.com/CODE для трекинга кликов
- /hashtags — подборки хэштегов по темам
- /team — твоя команда, воронка рефералов, карточки с подсказками «кому написать»
- /meet — видеоконференция для группового онбординга
- «🎯 Разместить рекламу» в меню — рекламная биржа, запуск платной кампании
- «💰 Задания (заработать)» — заработок на выполнении заданий других
- /cabinet — вход в кабинет без пароля (там 17+ лендингов с автоподстановкой реф-кода)

📊 КАБИНЕТ (goldenConnect.to/cabinet) — где смотреть/делать:
- Баланс, Gift-счёт, матрица бизнес-мест, история выплат
- Партнёрка: реф-ссылка, QR, статистика по 10 линиям, Matching Bonus, Лидерский пул
- Лендинги (catalog / official / quiz / urgency / luxury / aurora / swiss / synthwave / couture / depth3d / family / one-product / skeptic / wellness / techdata / biopunk / brutalist)
- Медиатека, FAQ, отзывы, обучение от новичка до продвинутого
- AI-ассистент (это я) и встроенные видеовстречи

Если пользователь спрашивает:
- про тарифы/цены/подключение → объясни разницу и предложи /cabinet
- про реф-ссылку/партнёрку → /ref в боте + «Партнёрка» в кабинете
- про бонусы/выплаты → объясни 10 линий + Matching Bonus + Лидерский пул + Gift-счёт
- как пригласить → используй секцию «Как приглашать» выше, дай конкретные фразы и инструменты
- про возражения → переходи к «Обработка возражений», не оставляй без ответа
- про рекламу/продвижение → «🎯 Разместить рекламу» в меню + лендинги в кабинете
- про созвон/встречу → встроенный /meet (НЕ Google Meet / Zoom / Skype!)
- про техподдержку → @GoldenConnect_bizbot или email в кабинете
- про здоровье / БАДы / лечение / врачей → мягко верни к теме: «Я работаю по Golden Connect — рекламной платформе. По здоровью не подскажу.»

НЕ давай финансовых гарантий, не обещай фиксированный доход, не сравнивай с хайпами и проектами на чистом ажиотаже. Golden Connect — рекламная платформа с доходом от оборота, это объяснимая модель.

ТЫ — ПОЛНОЦЕННЫЙ AI-ПОМОЩНИК. Дополнительные возможности для продуктивности партнёра:

📋 ЗАДАЧИ:
- Создавать задачи с датой, временем, приоритетом
- Переносить, завершать, удалять задачи
- Показывать задачи на сегодня/завтра/неделю

📊 ПРИВЫЧКИ:
- Создавать привычки (зарядка, чтение, медитация...)
- Отмечать выполненные привычки
- Трекер стриков

📹 ВИДЕОКОНФЕРЕНЦИИ (ВСТРОЕННАЯ СИСТЕМА GOLDEN_CONNECT /meet):
- Создавать комнаты для видеозвонков через [CONF_CREATE]
- Планировать конференции на время
- Звонки работают в браузере (goldenConnect.to/cabinet/#/meet) и Telegram
- НИКОГДА не предлагай Google Meet, Zoom, Skype — у Golden Connect свой сервис!

🌟 МЕЧТЫ И ЦЕЛИ:
- Пользователь может ставить цели через /dreams
- AI разбивает цели на шаги
- Ежедневные советы по достижению
- Если просят "поставить цель" или "записать мечту" — скажи использовать /dreams

📆 ПЛАНИРОВЩИК:
- /daily — ежедневные дела (обнуляется каждый день)
- /planner — планы на день/неделю/месяц/3мес/6мес/год
- Если просят "составить план на неделю" — скажи использовать /planner

🤖 AI ИНСТРУМЕНТЫ:
- /aitools — 7 инструментов:
  - Генерация картинок из текста
  - Озвучка текста (текст в речь)
  - DeepSeek — альтернативный AI
  - Анализ фото (что на фото)
  - Апскейл фото (увеличить качество)
  - Удаление фона с фото
  - Генерация видео из текста
- Если просят "нарисуй", "сгенерируй картинку", "озвучь" — скажи использовать /aitools

⏰ НАПОМИНАНИЯ:
- Будильник за 1 час и за 15 минут до задачи
- Эскалация: повторяет пока не подтвердишь
- Push-уведомления в Telegram

👥 ГРУППЫ:
- Командные задачи (/task, /assign, /list, /board)
- Видеозвонки в группе (/call, /meet)

⚙️ НАСТРОЙКИ:
- Часовой пояс, стиль общения, имя секретаря
- Утренний/вечерний дайджест
- Режим "не беспокоить"

ВАЖНО: Ты специализированный ментор по Golden Connect. По вопросам о платформе, партнёрке, маркетинге, продвижении, продажах, продуктивности — отвечай подробно и полезно. По другим темам (общие вопросы, кулинария, путешествия и т.п.) отвечай кратко и мягко возвращай к Golden Connect. НЕ консультируй по здоровью, БАДам, лечению, медицине — это не наша сфера.

ФОРМАТ КОМАНД (вставляй в ответ когда нужно выполнить действие):
[TASK_CREATE] title | date(YYYY-MM-DD) | time(HH:MM или null) | priority(1-4) | category_id(число или null) [/TASK_CREATE]
[TASK_DONE] id [/TASK_DONE]
[TASK_MOVE] id | date(YYYY-MM-DD) [/TASK_MOVE]
[TASK_DELETE] id [/TASK_DELETE]
[HABIT_CREATE] title | emoji [/HABIT_CREATE]
[HABIT_DONE] название_привычки [/HABIT_DONE]
[SHOW_TASKS] today|tomorrow|week|all|overdue [/SHOW_TASKS]
[SHOW_HABITS] [/SHOW_HABITS]
[SHOW_STATS] [/SHOW_STATS]
[MEMORY] тип:содержание [/MEMORY]
[CONF_CREATE] название конференции [/CONF_CREATE]
[IMAGE_GEN] подробное описание картинки на английском [/IMAGE_GEN]

ПРАВИЛА:
- ВСЕГДА отвечай текстом пользователю + команды если нужны действия
- Если пользователь просит создать задачу — создай через [TASK_CREATE]
- Если нет даты — ставь сегодня
- Если говорит "завтра" — вычисли дату
- Если просит перенести — используй [TASK_MOVE]
- Если завершает задачу — [TASK_DONE]
- Если просит показать задачи ("что у меня сегодня", "покажи список") — [SHOW_TASKS] today [/SHOW_TASKS]
- Если просит показать привычки — [SHOW_HABITS] [/SHOW_HABITS]
- Если просит итог/статистику дня — [SHOW_STATS] [/SHOW_STATS]
- Если отмечает привычку ("зарядку сделал", "выполнил пробежку") — [HABIT_DONE] название [/HABIT_DONE]
- Если просит создать конференцию/созвон/звонок/встречу/видеозвонок — ОБЯЗАТЕЛЬНО используй [CONF_CREATE] название [/CONF_CREATE]. У нас СВОЯ встроенная система видеоконференций! НИКОГДА не предлагай Google Meet, Zoom, Skype или другие внешние сервисы. Всегда создавай через [CONF_CREATE].
- Запоминай важное через [MEMORY] (предпочтения:..., факт:..., привычка:...)
- Если просят нарисовать/сгенерировать картинку — используй [IMAGE_GEN] детальный промт на английском [/IMAGE_GEN]. Переведи описание на английский для лучшего результата.
- Если просят озвучить текст — скажи: "Используй /aitools → Озвучка текста"
- Если просят поставить цель/мечту — скажи: "Используй /dreams"
- Если просят составить план на период — скажи: "Используй /planner"
- Если просят показать ежедневные дела — скажи: "Используй /daily"
- Если просят удалить фон/увеличить фото — скажи: "Используй /aitools"
- Если пользователь задаёт вопрос (не задачу) — отвечай подробно и полезно
- Отвечай на языке пользователя (определяй по его сообщению)
- Будь кратким но полезным
- НЕ используй markdown разметку (**, ##), используй plain text с эмодзи
- НИКОГДА не давай ссылки на внешние сервисы (Google, Zoom, Skype) для конференций — у нас свой сервис
- Если не понимаешь что хочет пользователь — предложи список возможностей`;
}

// ============ Парсинг AI-команд ============
function parseAndExecuteCommands(response, user) {
  const results = [];

  // TASK_CREATE
  const creates = [...response.matchAll(/\[TASK_CREATE\]\s*(.+?)\s*\[\/TASK_CREATE\]/gs)];
  for (const m of creates) {
    const parts = m[1].split('|').map(s => s.trim());
    const title = parts[0];
    const date = parts[1] && parts[1] !== 'null' ? parts[1] : todayStr(user.timezone);
    const time = parts[2] && parts[2] !== 'null' ? parts[2] : null;
    const priority = parts[3] ? parseInt(parts[3]) || 3 : 3;
    const category_id = parts[4] && parts[4] !== 'null' ? parseInt(parts[4]) || null : null;

    if (title) {
      const task = db.createTask(user.id, { title, due_date: date, due_time: time, priority, category_id });
      // Авто-напоминание
      if (time && date) {
        const fireAt = localToUtc(date, time, user.timezone);
        if (fireAt) {
          const { DateTime } = require('luxon');
          const fireTime = DateTime.fromISO(fireAt).minus({ minutes: 15 });
          if (fireTime > DateTime.now()) db.createReminder(task.id, user.id, fireTime.toISO(), 15);
        }
      }
      results.push({ type: 'created', task });
    }
  }

  // TASK_DONE
  const dones = [...response.matchAll(/\[TASK_DONE\]\s*(\d+)\s*\[\/TASK_DONE\]/g)];
  for (const m of dones) {
    const id = parseInt(m[1]);
    const task = db.getTaskById(id);
    if (task && task.user_id === user.id) {
      db.updateTask(id, { status: 'done' });
      results.push({ type: 'done', task });
    }
  }

  // TASK_MOVE
  const moves = [...response.matchAll(/\[TASK_MOVE\]\s*(\d+)\s*\|\s*(.+?)\s*\[\/TASK_MOVE\]/g)];
  for (const m of moves) {
    const id = parseInt(m[1]);
    const date = m[2].trim();
    const task = db.getTaskById(id);
    if (task && task.user_id === user.id) {
      db.updateTask(id, { due_date: date });
      results.push({ type: 'moved', task, date });
    }
  }

  // TASK_DELETE
  const deletes = [...response.matchAll(/\[TASK_DELETE\]\s*(\d+)\s*\[\/TASK_DELETE\]/g)];
  for (const m of deletes) {
    const id = parseInt(m[1]);
    const task = db.getTaskById(id);
    if (task && task.user_id === user.id) {
      db.deleteTask(id);
      results.push({ type: 'deleted', task });
    }
  }

  // HABIT_CREATE
  const habitCreates = [...response.matchAll(/\[HABIT_CREATE\]\s*(.+?)\s*\[\/HABIT_CREATE\]/g)];
  for (const m of habitCreates) {
    const parts = m[1].split('|').map(s => s.trim());
    const title = parts[0];
    const emoji = parts[1] || '✅';
    if (title) {
      const habit = db.createHabit(user.id, title, emoji);
      results.push({ type: 'habit', habit });
    }
  }

  // HABIT_DONE — отметить привычку по названию
  const habitDones = [...response.matchAll(/\[HABIT_DONE\]\s*(.+?)\s*\[\/HABIT_DONE\]/g)];
  for (const m of habitDones) {
    const nameQuery = m[1].trim().toLowerCase();
    const allHabits = db.getUserHabits(user.id);
    const today = todayStr(user.timezone);
    const habit = allHabits.find(h => h.title.toLowerCase().includes(nameQuery) || nameQuery.includes(h.title.toLowerCase()));
    if (habit) {
      db.logHabit(habit.id, today);
      results.push({ type: 'habit_done', habit });
    }
  }

  // SHOW_TASKS — показать список задач
  const showTasksMatch = [...response.matchAll(/\[SHOW_TASKS\]\s*(\w+)\s*\[\/SHOW_TASKS\]/g)];
  for (const m of showTasksMatch) {
    results.push({ type: 'show_tasks', mode: m[1] || 'today' });
  }

  // SHOW_HABITS — показать привычки
  if (response.includes('[SHOW_HABITS]')) {
    results.push({ type: 'show_habits' });
  }

  // SHOW_STATS — показать статистику
  if (response.includes('[SHOW_STATS]')) {
    results.push({ type: 'show_stats' });
  }

  // MEMORY
  const memos = [...response.matchAll(/\[MEMORY\]\s*(.+?)\s*\[\/MEMORY\]/g)];
  for (const m of memos) {
    const content = m[1].trim();
    const [type, ...rest] = content.split(':');
    db.addMemory(user.id, type.trim(), rest.join(':').trim());
    results.push({ type: 'memory', content: rest.join(':').trim() });
  }

  // CONF_CREATE
  const confCreates = [...response.matchAll(/\[CONF_CREATE\]\s*(.+?)\s*\[\/CONF_CREATE\]/g)];
  for (const m of confCreates) {
    const title = m[1].trim() || 'Конференция';
    results.push({ type: 'conf_create', title });
  }

  // IMAGE_GEN
  const imageGens = [...response.matchAll(/\[IMAGE_GEN\]\s*(.+?)\s*\[\/IMAGE_GEN\]/g)];
  for (const m of imageGens) {
    results.push({ type: 'image_gen', prompt: m[1].trim() });
  }

  // Fallback: AI gave Google/Zoom link instead of [CONF_CREATE] — auto-create conf
  if (confCreates.length === 0 && /meet\.google\.com|zoom\.us|skype\.com/i.test(response)) {
    results.push({ type: 'conf_create', title: 'Конференция' });
    // Strip external links from response
    response = response.replace(/https?:\/\/(meet\.google\.com|zoom\.us|[^\s]*skype\.com)[^\s]*/gi, '');
  }

  // Чистим ответ от команд
  let clean = response
    .replace(/\[TASK_CREATE\][\s\S]*?\[\/TASK_CREATE\]/g, '')
    .replace(/\[TASK_DONE\][\s\S]*?\[\/TASK_DONE\]/g, '')
    .replace(/\[TASK_MOVE\][\s\S]*?\[\/TASK_MOVE\]/g, '')
    .replace(/\[TASK_DELETE\][\s\S]*?\[\/TASK_DELETE\]/g, '')
    .replace(/\[HABIT_CREATE\][\s\S]*?\[\/HABIT_CREATE\]/g, '')
    .replace(/\[HABIT_DONE\][\s\S]*?\[\/HABIT_DONE\]/g, '')
    .replace(/\[SHOW_TASKS\][\s\S]*?\[\/SHOW_TASKS\]/g, '')
    .replace(/\[SHOW_HABITS\][^\[]*/g, '')
    .replace(/\[SHOW_STATS\][^\[]*/g, '')
    .replace(/\[MEMORY\][\s\S]*?\[\/MEMORY\]/g, '')
    .replace(/\[CONF_CREATE\][\s\S]*?\[\/CONF_CREATE\]/g, '')
    .replace(/\[IMAGE_GEN\][\s\S]*?\[\/IMAGE_GEN\]/g, '')
    // Убираем символы которые Groq иногда генерирует вместо форматирования
    .replace(/[◆◇▲▼►◄●○■□▪▫◉◎◈◊✦✧⬥⬦⬧⬨◼◻◾◽▸▹▶▷]/g, '')
    // Убираем markdown разметку если AI всё равно её добавил
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: clean, actions: results };
}

// ============ Основной conversational handler ============
function setupConversationalAI(bot, groqConfig) {
  if (!hasGroqKeys(groqConfig)) {
    console.log('[AI] No GROQ keys — conversational AI disabled, fallback to simple task creation');

    // Fallback без AI — простое создание задач
    // [ai-passthrough-2026-05-15] accept next and pass through /commands
    // and unhandled cases so bot.command('/trdx' etc) can fire
    bot.on('message:text', async (ctx, next) => {
      if (ctx.chat?.type !== 'private') return next();
      const user = db.ensureUser(ctx.from);
      if (!user.onboarded || ctx.message.text.startsWith('/')) return next();
      // Создаём задачу из текста
      const text = ctx.message.text.trim();
      const date = parseDate(text, user.timezone) || todayStr(user.timezone);
      const time = parseTime(text);
      let title = text;
      ['сегодня', 'завтра', 'послезавтра'].forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
      title = title.replace(/\d{1,2}[:.]\d{2}/g, '').replace(/\d{1,2}\.\d{1,2}/g, '').replace(/\s+/g, ' ').trim();
      if (!title) return;

      const task = db.createTask(user.id, { title, due_date: date, due_time: time, priority: 3 });
      const kb = new InlineKeyboard()
        .text('✅', `done_${task.id}`).text('⏰', `task_remind_${task.id}`)
        .text('📅', `task_reschedule_${task.id}`).text('🗑', `task_delete_${task.id}`);
      await ctx.reply(`✅ ${formatTask(task, true)} [#${task.id}]`, { parse_mode: 'HTML', reply_markup: kb });
    });
    return;
  }

  // ====== С AI ======
  // [ai-passthrough-2026-05-15] accept next and pass through /commands
  // so bot.command('trdx' etc) gets a chance to handle them
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    const user = db.ensureUser(ctx.from);
    const text = ctx.message.text.trim();
    if (!user.onboarded || text.startsWith('/')) return next();

    // Сохраняем сообщение пользователя
    db.addChatMessage(user.id, 'user', text);

    const thinkingMsg = await ctx.reply('💭');

    try {
      const context = buildUserContext(user);
      const history = db.getChatHistory(user.id, 10);

      // RAG: fetch relevant knowledge chunks for this query
      let knowledgeBlock = '';
      try {
        const chunks = searchKnowledge(text, { maxResults: 4 });
        knowledgeBlock = formatContext(chunks, { maxChars: 2500 });
      } catch (e) {}

      const messages = [
        { role: 'system', content: getSystemPrompt(user) + '\n\n' + buildCorePrompt() + knowledgeBlock + '\n\n' + context },
      ];

      // Добавляем историю чата
      for (const msg of history.slice(0, -1)) { // -1 потому что текущее уже в контексте
        messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({ role: 'user', content: text });

      const aiResponse = await callGroq(messages, groqConfig);
      const { text: replyText, actions } = parseAndExecuteCommands(aiResponse, user);

      // Сохраняем ответ
      db.addChatMessage(user.id, 'assistant', replyText);

      // Формируем ответ
      let reply = replyText;

      // Добавляем инфо о действиях
      if (actions.length > 0) {
        const actionLines = [];
        for (const a of actions) {
          if (a.type === 'created') actionLines.push(`✅ <b>${escapeHtml(a.task.title)}</b> 📅${formatDateRu(a.task.due_date)}${a.task.due_time ? ' ⏰' + a.task.due_time : ''}`);
          if (a.type === 'done') actionLines.push(`✅ Готово: ${escapeHtml(a.task.title)}`);
          if (a.type === 'moved') actionLines.push(`📅 Перенесено: ${escapeHtml(a.task.title)} → ${formatDateRu(a.date)}`);
          if (a.type === 'deleted') actionLines.push(`🗑 Удалено: ${escapeHtml(a.task.title)}`);
          if (a.type === 'habit') actionLines.push(`📊 Привычка создана: ${a.habit.emoji} ${escapeHtml(a.habit.title)}`);
          if (a.type === 'habit_done') actionLines.push(`✅ ${a.habit.emoji} ${escapeHtml(a.habit.title)} — отмечено!`);
          if (a.type === 'image_gen') {
            try {
              const https = require('https');
              const encoded = encodeURIComponent(a.prompt);
              const imgUrl = 'https://image.pollinations.ai/prompt/' + encoded + '?width=1024&height=1024&nologo=true&seed=' + Date.now();
              const tmpPath = '/tmp/aigen_' + Date.now() + '.jpg';
              await new Promise((resolve, reject) => {
                const fetchUrl = (u) => {
                  https.get(u, { timeout: 60000 }, (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return fetchUrl(res.headers.location);
                    const file = require('fs').createWriteStream(tmpPath);
                    res.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                  }).on('error', reject);
                };
                fetchUrl(imgUrl);
              });
              actionLines.push('🎨 Картинка сгенерирована');
              // Will be sent separately after reply
              a.tmpPath = tmpPath;
            } catch(e) { actionLines.push('❌ Не удалось сгенерировать картинку'); }
          }
          if (a.type === 'conf_create') {
            try {
              const room = db.createConfRoom(a.title, user.id, null);
              a.room = room;
              actionLines.push(`📹 Конференция создана: <b>${escapeHtml(a.title)}</b>\n🔑 ID: <code>${room.id}</code>`);
            } catch (e) { actionLines.push('❌ Не удалось создать конференцию'); }
          }
        }
        if (actionLines.length > 0) reply += '\n\n' + actionLines.join('\n');
      }

      // Строим inline кнопки
      const kb = new InlineKeyboard();
      const createdTasks = actions.filter(a => a.type === 'created');
      const showAction = actions.find(a => a.type === 'show_tasks');
      const showHabits = actions.find(a => a.type === 'show_habits');
      const showStats = actions.find(a => a.type === 'show_stats');

      // Кнопки на каждую созданную задачу
      createdTasks.forEach(({ task: t }) => {
        const short = t.title.length > 20 ? t.title.slice(0, 20) + '…' : t.title;
        kb.text(`✅ ${short}`, `done_${t.id}`)
          .text('⏰', `task_remind_${t.id}`)
          .text('📅', `task_reschedule_${t.id}`)
          .text('🗑', `task_delete_${t.id}`).row();
      });

      // Кнопки "показать" из AI-команд
      if (showAction) {
        const modeLabels = { today: '📋 Сегодня', tomorrow: '📅 Завтра', week: '📆 Неделя', all: '📋 Все', overdue: '⚠️ Просроченные' };
        kb.text(modeLabels[showAction.mode] || '📋 Задачи', `show_${showAction.mode}`).row();
      }
      if (showHabits) kb.text('📊 Привычки', 'habits').row();
      if (showStats) kb.text('☀️ Итог дня', 'stats_today').row();

      // Кнопки для созданных конференций
      const confActions = actions.filter(a => a.type === 'conf_create' && a.room);
      for (const a of confActions) {
        const webappUrl = process.env.WEBAPP_URL || '';
        if (webappUrl) kb.webApp('📹 Войти в конференцию', `${webappUrl}?conf=${a.room.id}`).row();
        kb.text('🔗 Поделиться', `conf_share_${a.room.id}`).row();
      }

      // Навигационные кнопки после ответа (всегда)
      if (!showAction) kb.text('📋 Сегодня', 'today').text('📅 Завтра', 'show_tomorrow');

      // Send generated images
      const imgActions = actions.filter(a => a.type === 'image_gen' && a.tmpPath);
      for (const img of imgActions) {
        try {
          const { InputFile } = require('grammy');
          await ctx.replyWithPhoto(new InputFile(img.tmpPath), { caption: '🎨 ' + img.prompt.slice(0, 200) });
          try { require('fs').unlinkSync(img.tmpPath); } catch {}
        } catch(e) {}
      }

      await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, reply, {
        parse_mode: 'HTML',
        reply_markup: kb.inline_keyboard.flat().length ? kb : undefined,
      });

    } catch (e) {
      console.error('[AI] Error:', e.message);
      // Fallback — пытаемся создать задачу из текста
      try {
        await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
      } catch {}

      const date = parseDate(text, user.timezone) || todayStr(user.timezone);
      const time = parseTime(text);
      let title = text;
      ['сегодня', 'завтра', 'послезавтра'].forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
      title = title.replace(/\d{1,2}[:.]\d{2}/g, '').replace(/\d{1,2}\.\d{1,2}/g, '').replace(/\s+/g, ' ').trim();
      if (!title) return;

      const task = db.createTask(user.id, { title, due_date: date, due_time: time, priority: 3 });
      const kb = new InlineKeyboard()
        .text('✅', `done_${task.id}`).text('⏰', `task_remind_${task.id}`)
        .text('📅', `task_reschedule_${task.id}`).text('🗑', `task_delete_${task.id}`);
      await ctx.reply(`✅ ${formatTask(task, true)} [#${task.id}]`, { parse_mode: 'HTML', reply_markup: kb });
    }
  });

  // ====== Команды AI ======
  bot.command('plan', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    await processAiCommand(ctx, user, 'Составь мне оптимальный план на сегодня. Учти приоритеты, время и просроченные задачи.', groqConfig);
  });

  bot.command('breakdown', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.match?.trim();
    if (!text) return ctx.reply('Напиши: /breakdown описание большой задачи');
    await processAiCommand(ctx, user, `Разбей задачу на подзадачи и создай их: "${text}"`, groqConfig);
  });

  bot.command('advice', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    await processAiCommand(ctx, user, 'Дай совет по продуктивности на основе моих задач и привычек.', groqConfig);
  });

  bot.command('ai', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.match?.trim();
    if (!text) return ctx.reply('Просто напиши мне — я всегда на связи! 💬');
    await processAiCommand(ctx, user, text, groqConfig);
  });

  console.log('[AI] Conversational AI enabled');
}

async function processAiCommand(ctx, user, message, groqConfig) {
  const thinkingMsg = await ctx.reply('💭');
  try {
    const context = buildUserContext(user);
    const messages = [
      { role: 'system', content: getSystemPrompt(user) + '\n\n' + context },
      { role: 'user', content: message },
    ];

    const aiResponse = await callGroq(messages, groqConfig);
    const { text, actions } = parseAndExecuteCommands(aiResponse, user);

    let reply = text;
    if (actions.length > 0) {
      reply += '\n';
      for (const a of actions) {
        if (a.type === 'created') reply += `\n✅ <b>${escapeHtml(a.task.title)}</b> 📅${formatDateRu(a.task.due_date)}${a.task.due_time ? ' ⏰' + a.task.due_time : ''}`;
        if (a.type === 'done') reply += `\n✅ Завершено: ${escapeHtml(a.task.title)}`;
        if (a.type === 'moved') reply += `\n📅 Перенесено: ${escapeHtml(a.task.title)}`;
      }
    }

    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, reply, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[AI] Error:', e.message);
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, `❌ ${escapeHtml(e.message)}`, { parse_mode: 'HTML' });
  }
}

module.exports = { setupConversationalAI, callGroq, buildUserContext, getSystemPrompt, parseAndExecuteCommands };
