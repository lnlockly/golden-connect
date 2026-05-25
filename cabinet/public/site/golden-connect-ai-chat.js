/* ═══ AI Chat — Golden Connect Cabinet ═══
   Ported from navinauto ai-chat.js with Golden Connect content + 2 mount modes:
     1) Floating FAB (bottom-right) — appears on every cabinet page
     2) Inline panel inside #page-ai — bigger chat on the dedicated page
   Both share the same message stream + endpoint.

   Backend: POST /cabinet/api/public/ai-chat
     body: { messages: [{role, content}, ...] }
     returns: { content: "..." }  (single-shot completion via Groq)
*/
(function () {
  'use strict';

  const SYSTEM_PROMPT = `Ты — AI-помощник Golden Connect, дружелюбный и точный консультант рекламной экосистемы. Общайся живо, по-русски, с эмодзи для акцентов. Отвечай кратко (3-7 предложений), по делу. Знаешь ВСЁ про платформу, инструменты, тарифы, партнёрку, выплаты, бот.

═══ ЧТО ТАКОЕ GOLDEN_CONNECT ═══
Golden Connect — рекламная экосистема с распределённой прибылью. Внимание аудитории напрямую оплачивается: пользователи зарабатывают за просмотры, клики, видео-промо, задания. Доля от оборота — без потолка.
Сайт-лендинг: goldenConnect.to | Кабинет: goldenConnect.to/cabinet | API: api.goldenConnect.to | Бот: @GoldenConnect_bizbot

═══ 3 РОЛИ ═══
• Рекламодатели — пополняют рекламный счёт, размещают кампании (баннеры, контекст, видео, CPA-задания, подписки на каналы), получают аналитику.
• Пользователи — смотрят рекламу, кликают, выполняют задания, делятся видео-промо. До $20/день за активность на FREE.
• Партнёры — приглашают участников, получают % с 10 линий + Matching Bonus + бонусы Лидерского пула.

═══ ЛОТЫ MONAR ═══
• Кредитный $10 — выдаётся при регистрации, разблокируется первым реальным лотом от $50.
• $50 — 2 бизнес-места, удвоение за ~90 дней, 17 кругов.
• $100 — 4 места, ~85 дней, 15 кругов.
• $300 — 9 мест, ~75 дней, 14 кругов, вход в Мировой Пул.
• $500 — 15 мест, ~65 дней, 12 кругов, VIP-чат, визитка «Золотой Актив».
• $1000 — 32 места, ~40 дней, 7 кругов, доступ ко всем 8 пулам.
На одном аккаунте можно держать сколько угодно лотов параллельно. Места в очереди закрепляются хронологически.

═══ КАК ИДЁТ КРУГ ═══
Каждое бизнес-место получает $10 первым заходом: 60% тебе ($6), 40% в системные пулы (рефы, мировой, нетворкинг, инфра). Второй $10 на месте — реинвест, место уходит в конец очереди и набирает новый круг.

═══ РЕФЕРАЛЬНАЯ ПРОГРАММА — 5 УРОВНЕЙ ═══
Постоянный доход с КАЖДОГО круга реферала, не разовый.
$50 → 34 раза рефералки за цикл (17 кругов × 2 места).
$1000 → 224 раза рефералки.

═══ МИРОВОЙ ПУЛ ═══
8 пулов по числу старших лотов. Лот $300 = 1 пул, $500 = 3 пула, $700 = 5 пулов, $1000 = все 8. Раздача в конце месяца. Если суммы хватает на новый лот — авто-активация, остаток на «Доход».

═══ ФОНД НЕТВОРКИНГА ═══
Балл = коэффициент_лота × количество_выступлений. Доля = твой_балл / сумма_баллов всех × фонд месяца. VIP-лоты ($500+) получают коэффициент 1.5–2.0.

═══ АВТО-РЕКЛАМА ═══
Рекламный пакет привязан к лоту: $50 — 1 пост разово, $100 — 1/нед × 4 нед, $300 — 3/нед × 12, $500 — 5/нед × 20, $1000 — 10/нед × 50. Каждый пост: до 1000 символов, до 5 картинок, любые ссылки, авто-перевод на 46 языков, размещение в 9 мессенджерах.

═══ 3 БАЛАНСА ═══
• Пополнение — заводишь сюда деньги извне.
• Доход — единственный с которого открывается вывод.
• Реферальный — переводишь на «Доход» → выводишь.
Карма — отдельная репутация (стартовая 100). +1 за принятый отчёт, -5 за отклонённый. От кармы зависит доступ к premium-заданиям.

═══ АБОНЕНТКА ═══
0.5% от лота в неделю пока лот активен (на доп. технические места).
$50 → $0.25 · $100 → $0.50 · $300 → $1.50 · $500 → $2.50 · $1000 → $5.00. Закрылся лот — плата прекращается.

═══ УСЛОВИЕ ВЫВОДА ═══
После закрытия лота активируй новый лот ≥50% от полученного дохода → вывод открыт. Пример: лот $500 → доход $500 → активируй $300 → можно вывести $200+.

═══ ИНСТРУМЕНТЫ КАБИНЕТА (полный список) ═══

🎯 МОЙ ПЛАН — AI-составленный личный план задач на день. Бот помогает добавлять задачи в планировщик, отслеживает прогресс. После заполнения анкеты обновляется ежедневно с учётом стадии (новичок / расширение / масштабирование).

🎬 ВИДЕО-ПРОМО — автоматизированная система: ИИ собирает трендовые видео из TikTok/YT Shorts/IG Reels по AI и бизнес-хэштегам, накладывает на них твой персональный QR-баннер (двигается по диагонали), бот присылает 1 видео в день. Ты публикуешь его в свои соцсети, отправляешь ссылку отчёта в боте → +5 кармы. Открой /vp в боте или раздел "Видео-промо" в кабинете.

📺 ЭФИРЫ И ТРАНСЛЯЦИИ — лайв-стримы с экспертами Golden Connect.
🎓 ОБУЧЕНИЕ — обучающий контент по работе с платформой.
📚 МЕДИАТЕКА — архив видео, разборы, кейсы.
📑 МАТЕРИАЛЫ — официальные документы, презентации, рекламные пакеты.
👥 ЧАТЫ — групповые комнаты, общение с командой.
📞 ВИДЕОЗВОНКИ (MEET) — встроенные конференции с записью (Jitsi).
🛒 МАРКЕТПЛЕЙС — продажа цифровых товаров.
🛍 МОЙ МАГАЗИН — собственный шоурум для продажи.

📢 БИРЖА ПОДПИСОК (ADX) — биржевой механизм покупки/продажи рекламных подписок.
💰 ЗАРАБОТАТЬ — каталог платных заданий: подписки на каналы, custom-tasks с фото-отчётом, видео-задания.
🎯 ЗАКАЗАТЬ РЕКЛАМУ — создать свою кампанию: подписка на канал, custom-task, видео-задание.
🤖 РЕКЛАМНЫЙ ЦЕНТР — единая панель для управления всеми кампаниями.

🔗 СОКРАТИТЕЛЬ ССЫЛОК — премиум, со сменным редиректом, UTM, аналитикой.
📱 BIO-СТРАНИЦЫ — одна ссылка для всех соцсетей.
🌐 ЛЕНДИНГИ — конструктор без кода + готовые шаблоны.
🤖 AI-АССИСТЕНТЫ — автоматизация продаж и поддержки.
📲 TG-КАНАЛЫ — управление своими каналами.
🎬 ВИДЕО-БАННЕРЫ — генератор анимированных креативов.
📊 ЛИДЕРБОРД — рейтинг партнёров.
⭐ КАРМА — публичная репутация.
👤 ПРОФИЛЬ — настройки, уведомления, реф-ссылки.

═══ БОТ В TG-ГРУППАХ ═══
Партнёр может добавить @GoldenConnect_bizbot в свою Telegram-группу для трекинга участников (кто пришёл/ушёл, кто молчит, кто активный). По умолчанию бот в тихом режиме — только трекер, без автопромо.
Команды в группе:
/members — список участников | /quiet — кто молчит >7д | /active7d — топ активных | /today_active — кто писал сегодня | /who @user — карточка | /sync — синхронизировать (админ)
/goldenConnect_active — админ группы включает анонсы Golden Connect (эфиры, digest, бонусы)
/goldenConnect_silent — админ возвращает в тихий режим
/goldenConnect_status — текущий режим

═══ КОМАНДЫ БОТА @GoldenConnect_bizbot ═══
/start — регистрация / авторизация / реф-ссылка
/banner или /mybanner — твой персональный QR-баннер (PNG, 2160×2160)
/vp /video_promo /promo_video — видео-промо: список pending + кнопки отправки отчёта
/cancel — отменить текущий диалог
+ Inline-кнопки для всех заданий и кампаний

═══ РЕФЕРАЛЬНАЯ ССЫЛКА (ВАЖНО!) ═══
Реф-ссылка на сайт: https://goldenConnect.to/?ref=ТВОЙКОД (ведёт на главный лендинг → CTA → регистрация с автоподстановкой реф-кода).
Реф-ссылка на бот: https://t.me/GoldenConnect_bizbot?start=ref_ТВОЙКОД
Реф-код в кабинете: раздел "Профиль" → "Реф-ссылка" или "Промо-материалы".

═══ ВЫПЛАТЫ ═══
Минимум на вывод: $5 USDT.
Способы: CryptoBot USDT (быстро, 0% комиссия), Platega — карты РФ (3-5% комиссия эквайринга).
Заявки обрабатываются админом, обычно в течение 24 часов.

═══ ПРАВИЛА ОТВЕТОВ ═══
- Если спрашивают «сколько можно заработать» — объясняй математику: лот × количество кругов × $6 за место + 5 потоков (основной +100%, рефералка ×5 уровней, Мировой Пул от $300, Нетворкинг, Авто-реклама). Не обещай точных сумм.
- Для регистрации направляй: https://goldenConnect.to/cabinet/register или @GoldenConnect_bizbot.
- Для оплаты тарифа: раздел "Финансы" → "Оплата" в кабинете.
- Для вывода: раздел "Финансы" → "Вывод".
- Для технических багов: раздел "Поддержка" в кабинете.
- Если не знаешь точный ответ — честно скажи и предложи написать в поддержку.
- Никогда не придумывай функции, тарифы или цифры, которых нет здесь.
- Когда уместно, упоминай /vp (видео-промо) и /banner — это новые фичи 2026 года.
`;

  const QUICK_ACTIONS = [
    { text: '💰 Сколько зарабатывают?',     q: 'Сколько можно реально заработать в Golden Connect и на чём?' },
    { text: '🚀 Как стартовать?',           q: 'Как начать — с чего начинается регистрация и активация?' },
    { text: '📊 Лоты $50–$1000',             q: 'Расскажи подробно про лоты Monar — разница и что выбрать' },
    { text: '🔗 5-уровневая партнёрка',      q: 'Как устроена реферальная программа на 5 уровней?' },
    { text: '⚡ Что такое Мировой Пул?',     q: 'Объясни Мировой Пул и как в него попасть' },
    { text: '🏆 Фонд Нетворкинга',           q: 'Как работает фонд нетворкинга и как набрать баллы?' },
    { text: '🎁 Кредитный лот $10',          q: 'Что такое кредитный лот $10 и как его разблокировать?' },
    { text: '🛠 Какие инструменты внутри?',  q: 'Какие встроенные инструменты есть в кабинете Golden Connect?' },
  ];

  let chatOpen = false;
  /* [ai-chat-history-v1] */
  let messages = (function(){ try { var raw = localStorage.getItem("goldenConnect_ai_chat_history"); if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length < 50) return arr; } } catch(_){} return []; })();
  function _saveHistory(){ try { localStorage.setItem("goldenConnect_ai_chat_history", JSON.stringify(messages.slice(-30))); } catch(_){} }
  let isTyping = false;
  let inlineMountId = 'tai-inline-mount';

  function formatBot(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*\n]+?)\*/g, '<i>$1</i>')
      .replace(/\n/g, '<br>')
      .replace(/@(\w+)/g, '<a href="https://t.me/$1" target="_blank" rel="noopener">@$1</a>')
      .replace(/goldenConnect\.biz/g, '<a href="https://goldenConnect.to" target="_blank">goldenConnect.to</a>');
  }

  function buildChrome(isPanel) {
    return '' +
      '<div class="tai-head">' +
      '  <div class="tai-avatar">🤖</div>' +
      '  <div class="tai-head-info">' +
      '    <div class="tai-head-title">AI-помощник Golden Connect</div>' +
      '    <div class="tai-head-sub">Рекламная платформа · онлайн</div>' +
      '  </div>' +
      (isPanel ? '  <button class="tai-close" aria-label="Close" onclick="window._taiToggle()">✕</button>' : '') +
      '</div>' +
      '<div class="tai-msgs" data-role="msgs"></div>' +
      '<div class="tai-quick" data-role="quick"></div>' +
      '<div class="tai-input-wrap">' +
      '  <input class="tai-input" data-role="input" placeholder="Задайте вопрос про Golden Connect..." maxlength="500">' +
      '  <button class="tai-send" data-role="send" aria-label="Send">➤</button>' +
      '</div>';
  }

  function renderQuickInto(container) {
    if (!container) return;
    container.innerHTML = QUICK_ACTIONS.map(function (a) {
      return '<button type="button" data-q="' + a.q.replace(/"/g, '&quot;') + '">' + a.text + '</button>';
    }).join('');
    container.querySelectorAll('button[data-q]').forEach(function (b) {
      b.addEventListener('click', function () { ask(b.getAttribute('data-q')); });
    });
  }

  function eachMount(fn) {
    var fab = document.getElementById('taiPanel');
    if (fab) fn(fab);
    var inline = document.getElementById(inlineMountId);
    if (inline) fn(inline);
  }

  function appendMsg(role, text) {
    eachMount(function (mount) {
      var msgs = mount.querySelector('[data-role="msgs"]');
      if (!msgs) return;
      var div = document.createElement('div');
      div.className = 'tai-msg ' + (role === 'user' ? 'user' : 'bot');
      if (role === 'user') div.textContent = text;
      else div.innerHTML = formatBot(text);
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    });
  }

  function hideQuickAfterN(n) {
    var userCount = messages.filter(function (m) { return m.role === 'user'; }).length;
    if (userCount >= n) {
      eachMount(function (mount) {
        var q = mount.querySelector('[data-role="quick"]');
        if (q) q.style.display = 'none';
      });
    }
  }

  function showTyping() {
    isTyping = true;
    eachMount(function (mount) {
      var msgs = mount.querySelector('[data-role="msgs"]');
      if (!msgs || msgs.querySelector('.tai-typing')) return;
      var div = document.createElement('div');
      div.className = 'tai-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      var btn = mount.querySelector('[data-role="send"]');
      if (btn) btn.disabled = true;
    });
  }
  function hideTyping() {
    isTyping = false;
    eachMount(function (mount) {
      var t = mount.querySelector('.tai-typing');
      if (t) t.remove();
      var btn = mount.querySelector('[data-role="send"]');
      if (btn) btn.disabled = false;
    });
  }

  function ask(q) {
    if (!chatOpen && document.getElementById('taiPanel') && !document.getElementById(inlineMountId)) toggleChat();
    eachMount(function (mount) {
      var inp = mount.querySelector('[data-role="input"]');
      if (inp) inp.value = q;
    });
    setTimeout(send, 50);
  }
  window._taiAsk = ask;

  async function send() {
    if (isTyping) return;
    var value = '';
    eachMount(function (mount) {
      var inp = mount.querySelector('[data-role="input"]');
      if (inp && inp.value) value = inp.value.trim();
    });
    if (!value) return;

    eachMount(function (mount) {
      var inp = mount.querySelector('[data-role="input"]');
      if (inp) inp.value = '';
    });

    messages.push({ role: 'user', content: value });
    appendMsg('user', value);
    hideQuickAfterN(2);
    showTyping();

    try {
      var apiMessages = [{ role: 'system', content: SYSTEM_PROMPT }].concat(messages.slice(-10));
      var resp = await fetch('/cabinet/api/public/ai-chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages })
      });
      var data = await resp.json();
      hideTyping();
      var answer = data && data.content ? data.content : 'Что-то пошло не так. Попробуй ещё раз или напиши в поддержку.';
      messages.push({ role: 'assistant', content: answer });
      appendMsg('bot', answer);
    } catch (e) {
      hideTyping();
      appendMsg('bot', 'Ошибка связи. Проверь интернет и попробуй снова.');
    }
  }
  window._taiSend = send;

  function toggleChat() {
    chatOpen = !chatOpen;
    var panel = document.getElementById('taiPanel');
    var fab = document.getElementById('taiFab');
    if (panel) panel.classList.toggle('open', chatOpen);
    if (fab) {
      fab.innerHTML = chatOpen ? '✕' : '🤖';
      var badge = fab.querySelector('.tai-badge');
      if (badge) badge.remove();
    }
    if (chatOpen) {
      setTimeout(function () {
        var inp = panel && panel.querySelector('[data-role="input"]');
        if (inp) inp.focus();
      }, 220);
    }
  }
  window._taiToggle = toggleChat;

  function wireCommonInteractions(container) {
    if (!container) return;
    var input = container.querySelector('[data-role="input"]');
    var send_ = container.querySelector('[data-role="send"]');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
    }
    if (send_) send_.addEventListener('click', send);
    renderQuickInto(container.querySelector('[data-role="quick"]'));
  }

  function createFAB() {
    // Skip on landing pages (only show inside /cabinet/*)
    // allow FAB on landing too — was: only /cabinet

    // Avoid collision with old #ai-fab already in cabinet.html — hide it
    var oldFab = document.getElementById('ai-fab');
    if (oldFab) oldFab.style.display = 'none';

    var fab = document.getElementById('taiFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.className = 'tai-fab';
      fab.id = 'taiFab';
      fab.innerHTML = '🤖<span class="tai-badge">1</span>';
      fab.type = 'button';
      fab.addEventListener('click', toggleChat);
      // Close button — dismiss FAB; user can re-open from #/ai page
      var closeBtn = document.createElement('span');
      closeBtn.className = 'tai-fab-close';
      closeBtn.textContent = '\u00d7';
      closeBtn.title = 'Скрыть AI-помощника';
      closeBtn.onclick = function (ev) {
        ev.stopPropagation();
        fab.classList.add('tai-fab-hidden');
        try { localStorage.setItem('tai_fab_dismissed', '1'); } catch (_) {}
      };
      fab.appendChild(closeBtn);
      if (localStorage.getItem('tai_fab_dismissed') === '1') {
        fab.classList.add('tai-fab-hidden');
      }
      document.body.appendChild(fab);
    }

    var panel = document.getElementById('taiPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'tai-panel';
      panel.id = 'taiPanel';
      panel.innerHTML = buildChrome(true);
      document.body.appendChild(panel);
      wireCommonInteractions(panel);
    }

    // Greeting
    if (!messages.length) {
      var hello = 'Привет! 👋 Я AI-помощник **Golden Connect**.\n\nРасскажу про платформу, тарифы **LAUNCH / BOOST / ROCKET**, партнёрскую программу на 10 линий, Matching Bonus и Лидерский пул. Задавай вопрос — или выбери готовый ниже 👇';
      messages.push({ role: 'assistant', content: hello });
      appendMsg('bot', hello);
    }
  }

  function mountInline() {
    // Inline AI panel inside #page-ai (cabinet page)
    var host = document.getElementById('page-ai');
    if (!host) return;

    // Clear old form/placeholder content and inject new wrap
    host.innerHTML = '<div class="tai-wrap" id="' + inlineMountId + '">' + buildChrome(false) + '</div>';
    var inline = document.getElementById(inlineMountId);
    wireCommonInteractions(inline);

    // Sync messages already sent into FAB panel
    messages.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'tai-msg ' + (m.role === 'user' ? 'user' : 'bot');
      if (m.role === 'user') div.textContent = m.content;
      else div.innerHTML = formatBot(m.content);
      var msgs = inline.querySelector('[data-role="msgs"]');
      if (msgs) msgs.appendChild(div);
    });
    // If empty greet
    if (!messages.length) {
      var hello = 'Привет! 👋 Я AI-помощник **Golden Connect**. Спрашивай про тарифы, партнёрку, Matching Bonus, Лидерский пул или инструменты кабинета.';
      messages.push({ role: 'assistant', content: hello });
      appendMsg('bot', hello);
    }
  }

  // Expose helper for goPage('ai') handler to call
  window.renderGoldenConnectAiPage = mountInline;

  function init() {
    createFAB();
    // If page-ai is the currently visible page on load, mount inline too.
    var pageAi = document.getElementById('page-ai');
    if (pageAi && pageAi.classList.contains('active')) mountInline();

    // Observe page-ai for becoming active → mount inline once
    var observed = false;
    var obs = new MutationObserver(function () {
      if (observed) return;
      var pg = document.getElementById('page-ai');
      if (pg && pg.classList.contains('active')) {
        observed = true;
        mountInline();
      }
    });
    var root = document.getElementById('page-ai');
    if (root) obs.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


// auto-save history after every message append
(function () {
  if (typeof messages === "undefined") return;
  // Patch via setInterval — periodically save
  setInterval(_saveHistory, 5000);
})();
