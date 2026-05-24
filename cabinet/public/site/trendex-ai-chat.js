/* ═══ AI Chat — Trendex Cabinet ═══
   Ported from navinauto ai-chat.js with Trendex content + 2 mount modes:
     1) Floating FAB (bottom-right) — appears on every cabinet page
     2) Inline panel inside #page-ai — bigger chat on the dedicated page
   Both share the same message stream + endpoint.

   Backend: POST /cabinet/api/public/ai-chat
     body: { messages: [{role, content}, ...] }
     returns: { content: "..." }  (single-shot completion via Groq)
*/
(function () {
  'use strict';

  const SYSTEM_PROMPT = `Ты — AI-помощник Trendex, дружелюбный и точный консультант рекламной экосистемы. Общайся живо, по-русски, с эмодзи для акцентов. Отвечай кратко (3-7 предложений), по делу. Знаешь ВСЁ про платформу, инструменты, тарифы, партнёрку, выплаты, бот.

═══ ЧТО ТАКОЕ TRENDEX ═══
Trendex — рекламная экосистема с распределённой прибылью. Внимание аудитории напрямую оплачивается: пользователи зарабатывают за просмотры, клики, видео-промо, задания. Доля от оборота — без потолка.
Сайт-лендинг: trendex.biz | Кабинет: trendex.biz/cabinet | API: api.trendex.biz | Бот: @Trendex_bizbot

═══ 3 РОЛИ ═══
• Рекламодатели — пополняют рекламный счёт, размещают кампании (баннеры, контекст, видео, CPA-задания, подписки на каналы), получают аналитику.
• Пользователи — смотрят рекламу, кликают, выполняют задания, делятся видео-промо. До $20/день за активность на FREE.
• Партнёры — приглашают участников, получают % с 10 линий + Matching Bonus + бонусы Лидерского пула.

═══ ТАРИФЫ ═══
• FREE — $0. До $20/день за активность. L1 рефералы 10%. Без бизнес-места.
• LAUNCH — $45 (активация $30 + обслуживание $15/мес). 1 бизнес-место, матрица 12×$0.5, 10 линий рефералов. Цикл ≈ $4 095.
• BOOST — $90 ($75 + $15/мес). 2 места, матрица 14×$0.6, 10 линий. ≈ $19 660 за цикл.
• ROCKET — $135 (далее $45/мес). 3 места, матрица 17×$0.7, 10 линий + Matching Bonus. ≈ $183 499 за цикл.
На одном аккаунте можно открыть неограниченное число бизнес-мест.

═══ ПАРТНЁРСКАЯ ПРОГРАММА (10 ЛИНИЙ) ═══
FREE: только L1 = 10%.
Платный (LAUNCH+): L1 10%, L2 7%, L3 5%, L4 2%, L5 1.5%, L6 1.3%, L7 1.2%, L8 1%, L9 0.9%, L10 0.5%.
Статус PARTNER: приведи 10 человек на любой тариф (включая FREE) → автоматически +10% к ставке.

═══ MATCHING BONUS (только ROCKET) ═══
10% от партнёрских начислений своих L1-L3 рефералов — сверх всех прочих выплат.

═══ ЛИДЕРСКИЙ ПУЛ ═══
Доход 3 верхних админ-аккаунтов идёт в пул. Распределяется 1-го и 15-го числа среди топ-15 активных партнёров: 1 место 30%, 2 — 20%, 3 — 10%, далее до 1% на 15-м.

═══ GIFT-СЧЁТ ═══
Бонус-бюджет на рекламу при активации:
• До запуска платформы: $10 за каждое активированное место (удвоен!)
• После запуска: $5 за место
Тратится только на баннерную+контекстную рекламу внутри Trendex.

═══ 3 ВНУТРЕННИХ СЧЁТА ═══
• gift_balance — рекламный бюджет, выводу не подлежит, тратится на свои кампании
• earned_balance — заработанные деньги, можно выводить (Cryptobot USDT, Platega карты RU)
• karma — репутация (стартовая 100). +1 за принятый отчёт, -5 за отклонённый. От кармы зависит доступ к premium-заданиям.

═══ ИНСТРУМЕНТЫ КАБИНЕТА (полный список) ═══

🎯 МОЙ ПЛАН — AI-составленный личный план задач на день. Бот помогает добавлять задачи в планировщик, отслеживает прогресс. После заполнения анкеты обновляется ежедневно с учётом стадии (новичок / расширение / масштабирование).

🎬 ВИДЕО-ПРОМО — автоматизированная система: ИИ собирает трендовые видео из TikTok/YT Shorts/IG Reels по AI и бизнес-хэштегам, накладывает на них твой персональный QR-баннер (двигается по диагонали), бот присылает 1 видео в день. Ты публикуешь его в свои соцсети, отправляешь ссылку отчёта в боте → +5 кармы. Открой /vp в боте или раздел "Видео-промо" в кабинете.

📺 ЭФИРЫ И ТРАНСЛЯЦИИ — лайв-стримы с экспертами Trendex.
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
Партнёр может добавить @Trendex_bizbot в свою Telegram-группу для трекинга участников (кто пришёл/ушёл, кто молчит, кто активный). По умолчанию бот в тихом режиме — только трекер, без автопромо.
Команды в группе:
/members — список участников | /quiet — кто молчит >7д | /active7d — топ активных | /today_active — кто писал сегодня | /who @user — карточка | /sync — синхронизировать (админ)
/trendex_active — админ группы включает анонсы Trendex (эфиры, digest, бонусы)
/trendex_silent — админ возвращает в тихий режим
/trendex_status — текущий режим

═══ КОМАНДЫ БОТА @Trendex_bizbot ═══
/start — регистрация / авторизация / реф-ссылка
/banner или /mybanner — твой персональный QR-баннер (PNG, 2160×2160)
/vp /video_promo /promo_video — видео-промо: список pending + кнопки отправки отчёта
/cancel — отменить текущий диалог
+ Inline-кнопки для всех заданий и кампаний

═══ РЕФЕРАЛЬНАЯ ССЫЛКА (ВАЖНО!) ═══
Реф-ссылка на сайт: https://trendex.biz/?ref=ТВОЙКОД (ведёт на главный лендинг → CTA → регистрация с автоподстановкой реф-кода).
Реф-ссылка на бот: https://t.me/Trendex_bizbot?start=ref_ТВОЙКОД
Реф-код в кабинете: раздел "Профиль" → "Реф-ссылка" или "Промо-материалы".

═══ ВЫПЛАТЫ ═══
Минимум на вывод: $5 USDT.
Способы: CryptoBot USDT (быстро, 0% комиссия), Platega — карты РФ (3-5% комиссия эквайринга).
Заявки обрабатываются админом, обычно в течение 24 часов.

═══ ПРАВИЛА ОТВЕТОВ ═══
- Если спрашивают «сколько можно заработать» — объясняй математику: цикл матрицы × ставка × 10 линий × Matching Bonus, но не обещай точных сумм.
- Для регистрации направляй: https://trendex.biz/cabinet/register или @Trendex_bizbot.
- Для оплаты тарифа: раздел "Финансы" → "Оплата" в кабинете.
- Для вывода: раздел "Финансы" → "Вывод".
- Для технических багов: раздел "Поддержка" в кабинете.
- Если не знаешь точный ответ — честно скажи и предложи написать в поддержку.
- Никогда не придумывай функции, тарифы или цифры, которых нет здесь.
- Когда уместно, упоминай /vp (видео-промо) и /banner — это новые фичи 2026 года.
`;

  const QUICK_ACTIONS = [
    { text: '💰 Сколько зарабатывают?',     q: 'Сколько можно реально заработать в Trendex и на чём?' },
    { text: '🚀 Как стартовать?',           q: 'Как начать — с чего начинается регистрация и активация?' },
    { text: '📊 Тарифы LAUNCH/BOOST/ROCKET', q: 'Расскажи подробно про тарифы: разница и что выбрать' },
    { text: '🔗 10-уровневая партнёрка',    q: 'Как устроена партнёрская программа на 10 линий?' },
    { text: '⚡ Что такое Matching Bonus?', q: 'Объясни Matching Bonus на тарифе ROCKET с примером' },
    { text: '🏆 Лидерский пул',              q: 'Как работает Лидерский пул и как попасть в топ-15?' },
    { text: '🎁 Gift-счёт',                  q: 'Что такое Gift-счёт и как его использовать?' },
    { text: '🛠 Какие инструменты внутри?',  q: 'Какие встроенные инструменты есть в кабинете Trendex?' },
  ];

  let chatOpen = false;
  /* [ai-chat-history-v1] */
  let messages = (function(){ try { var raw = localStorage.getItem("trendex_ai_chat_history"); if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length < 50) return arr; } } catch(_){} return []; })();
  function _saveHistory(){ try { localStorage.setItem("trendex_ai_chat_history", JSON.stringify(messages.slice(-30))); } catch(_){} }
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
      .replace(/trendex\.biz/g, '<a href="https://trendex.biz" target="_blank">trendex.biz</a>');
  }

  function buildChrome(isPanel) {
    return '' +
      '<div class="tai-head">' +
      '  <div class="tai-avatar">🤖</div>' +
      '  <div class="tai-head-info">' +
      '    <div class="tai-head-title">AI-помощник Trendex</div>' +
      '    <div class="tai-head-sub">Рекламная платформа · онлайн</div>' +
      '  </div>' +
      (isPanel ? '  <button class="tai-close" aria-label="Close" onclick="window._taiToggle()">✕</button>' : '') +
      '</div>' +
      '<div class="tai-msgs" data-role="msgs"></div>' +
      '<div class="tai-quick" data-role="quick"></div>' +
      '<div class="tai-input-wrap">' +
      '  <input class="tai-input" data-role="input" placeholder="Задайте вопрос про Trendex..." maxlength="500">' +
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
      var hello = 'Привет! 👋 Я AI-помощник **Trendex**.\n\nРасскажу про платформу, тарифы **LAUNCH / BOOST / ROCKET**, партнёрскую программу на 10 линий, Matching Bonus и Лидерский пул. Задавай вопрос — или выбери готовый ниже 👇';
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
      var hello = 'Привет! 👋 Я AI-помощник **Trendex**. Спрашивай про тарифы, партнёрку, Matching Bonus, Лидерский пул или инструменты кабинета.';
      messages.push({ role: 'assistant', content: hello });
      appendMsg('bot', hello);
    }
  }

  // Expose helper for goPage('ai') handler to call
  window.renderTrendexAiPage = mountInline;

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
