  gaming:'🎮', lifestyle:'🌿', sports:'⚽', fashion:'👗', food:'🍕',
  travel:'✈️', education:'📚', business:'💼', humor:'😂', music:'🎵',
  art:'🎨', health:'💊', politics:'🏛', auto:'🚗', other:'📢'
};
var ADX_CAT_NAMES_RU = {
  tech:'Технологии', crypto:'Крипто', finance:'Финансы', news:'Новости',
  entertainment:'Развлечения', gaming:'Гейминг', lifestyle:'Лайфстайл',
  sports:'Спорт', fashion:'Мода', food:'Еда', travel:'Путешествия',
  education:'Образование', business:'Бизнес', humor:'Юмор', music:'Музыка',
  art:'Искусство', health:'Здоровье', politics:'Политика', auto:'Авто', other:'Другое'
};
var ADX_CAT_NAMES_EN = {
  tech:'Tech', crypto:'Crypto', finance:'Finance', news:'News',
  entertainment:'Entertainment', gaming:'Gaming', lifestyle:'Lifestyle',
  sports:'Sports', fashion:'Fashion', food:'Food', travel:'Travel',
  education:'Education', business:'Business', humor:'Humor', music:'Music',
  art:'Art', health:'Health', politics:'Politics', auto:'Auto', other:'Other'
};

function _adxIsRu() { return (window.currentLang || 'en') === 'ru'; }
function _adxt(ru, en) { return _adxIsRu() ? ru : en; }
function _adxCatIcon(cat) { return ADX_CAT_ICONS[cat] || '📢'; }
function _adxCatName(cat) {
  var names = _adxIsRu() ? ADX_CAT_NAMES_RU : ADX_CAT_NAMES_EN;
  return names[cat] || cat || 'Other';
}
function _adxFormatNum(n) {
  if (!n) return '0';
  n = Number(n);
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return String(n);
}
function _adxIsInCart(id) { return !!window._adxCart[id]; }
function _adxEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _adxStatusHtml(status) {
  var isRu = _adxIsRu();
  var map = {
    pending:          ['⏳', isRu ? 'Ожидание' : 'Pending'],
    pending_approval: ['⌛', isRu ? 'На проверке' : 'Review'],
    approved:         ['✅', isRu ? 'Одобрено' : 'Approved'],
    active:           ['🟢', isRu ? 'Активно' : 'Active'],
    completed:        ['✓',  isRu ? 'Завершено' : 'Done'],
    rejected:         ['✗',  isRu ? 'Отклонено' : 'Rejected'],
    expired:          ['⌛', isRu ? 'Истекло' : 'Expired'],
    penalty:          ['⚠️', isRu ? 'Штраф' : 'Penalty']
  };
  var s = map[status] || ['?', status];
  return '<span class="adx-status adx-status-' + status + '">' + s[0] + ' ' + s[1] + '</span>';
}

// ── Mock data ──
function _adxMockChannels(filters) {
  var pool = [
    { id:1,  title:'TechInsider RU',  username:'techinsider_ru',  member_count:128500, engagement_rate:4.2, avg_views_per_post:22000, categories:['tech','crypto'],           price_24h:45,  price_48h:75,  price_72h:100, rating:4.8, total_orders:143, lang:'ru'    },
    { id:2,  title:'CryptoDaily',     username:'cryptodaily',     member_count:87300,  engagement_rate:5.1, avg_views_per_post:18500, categories:['crypto','finance'],         price_24h:35,  price_48h:60,  price_72h:85,  rating:4.6, total_orders:98,  lang:'en'    },
    { id:3,  title:'GamersHub',       username:'gamershub_tg',    member_count:214000, engagement_rate:3.8, avg_views_per_post:41000, categories:['gaming','entertainment'],   price_24h:80,  price_48h:135, price_72h:180, rating:4.9, total_orders:267, lang:'ru'    },
    { id:4,  title:'FinanceGuru',     username:'financeguru',     member_count:55200,  engagement_rate:6.3, avg_views_per_post:12000, categories:['finance','business'],       price_24h:28,  price_48h:48,  price_72h:65,  rating:4.4, total_orders:52,  lang:'ru'    },
    { id:5,  title:'TravelVibes',     username:'travelvibes',     member_count:43800,  engagement_rate:7.1, avg_views_per_post:9500,  categories:['travel','lifestyle'],      price_24h:22,  price_48h:38,  price_72h:52,  rating:4.7, total_orders:71,  lang:'mixed' },
    { id:6,  title:'NewsFlash EN',    username:'newsflash_en',    member_count:312000, engagement_rate:2.9, avg_views_per_post:58000, categories:['news','politics'],          price_24h:120, price_48h:200, price_72h:270, rating:4.5, total_orders:189, lang:'en'    },
    { id:7,  title:'FoodLovers',      username:'foodlovers_tg',   member_count:76400,  engagement_rate:8.2, avg_views_per_post:16000, categories:['food','lifestyle'],         price_24h:32,  price_48h:55,  price_72h:75,  rating:4.9, total_orders:88,  lang:'ru'    },
    { id:8,  title:'AutoWorld',       username:'autoworld_ch',    member_count:98700,  engagement_rate:4.5, avg_views_per_post:21000, categories:['auto','tech'],              price_24h:42,  price_48h:70,  price_72h:95,  rating:4.6, total_orders:115, lang:'ru'    },
    { id:9,  title:'HealthTips',      username:'healthtips_pro',  member_count:62100,  engagement_rate:5.8, avg_views_per_post:13500, categories:['health','lifestyle'],       price_24h:26,  price_48h:44,  price_72h:60,  rating:4.3, total_orders:44,  lang:'mixed' },
    { id:10, title:'MusicWorld',      username:'musicworld_tg',   member_count:145000, engagement_rate:4.0, avg_views_per_post:28000, categories:['music','entertainment'],    price_24h:55,  price_48h:92,  price_72h:125, rating:4.7, total_orders:132, lang:'en'    },
    { id:11, title:'EduTech Pro',     username:'edutech_pro',     member_count:38500,  engagement_rate:9.1, avg_views_per_post:8200,  categories:['education','tech'],         price_24h:18,  price_48h:30,  price_72h:42,  rating:4.8, total_orders:36,  lang:'ru'    },
    { id:12, title:'SportsBuzz',      username:'sportsbuzz',      member_count:189000, engagement_rate:3.5, avg_views_per_post:37000, categories:['sports','news'],            price_24h:70,  price_48h:118, price_72h:160, rating:4.4, total_orders:208, lang:'mixed' }
  ];
  var q = (filters.q || '').toLowerCase();
  var cat = filters.cat || '';
  var lang = filters.lang || '';
  var minSubs = parseInt(filters.minSubs) || 0;
  var maxPrice = parseFloat(filters.maxPrice) || 999999;
  var sort = filters.sort || 'rating';
  var filtered = pool.filter(function(ch) {
    if (q && !ch.title.toLowerCase().includes(q) && !(ch.username||'').toLowerCase().includes(q)) return false;
    if (cat && !ch.categories.includes(cat)) return false;
    if (lang && ch.lang !== lang) return false;
    if (ch.member_count < minSubs) return false;
    if (ch.price_24h > maxPrice) return false;
    return true;
  });
  filtered.sort(function(a,b) {
    if (sort === 'rating') return b.rating - a.rating;
    if (sort === 'subscribers') return b.member_count - a.member_count;
    if (sort === 'price_asc') return a.price_24h - b.price_24h;
    if (sort === 'price_desc') return b.price_24h - a.price_24h;
    if (sort === 'er') return b.engagement_rate - a.engagement_rate;
    if (sort === 'popular') return b.total_orders - a.total_orders;
    return 0;
  });
  return { channels: filtered, total: filtered.length };
}

function _adxMockMyChannels() {
  return [
    { id:101, title:'My Tech Channel', username:'my_tech_ch', member_count:12400, engagement_rate:5.2, categories:['tech'], price_24h:15, status:'active', pending_orders:2, total_earnings:340 },
    { id:102, title:'My News Blog',    username:'mynews_blog', member_count:8700,  engagement_rate:4.1, categories:['news','business'], price_24h:10, status:'pending', pending_orders:0, total_earnings:120 }
  ];
}

function _adxMockOrders(role) {
  var advertisers = [
    { id:1001, channel_title:'TechInsider RU', status:'active',           text:'Продвижение нашего нового продукта', duration_hours:24, price:45,  created_at:'2026-03-12', start_time:'2026-03-13 10:00' },
    { id:1002, channel_title:'CryptoDaily',    status:'completed',        text:'Реклама крипто-курса',              duration_hours:48, price:60,  created_at:'2026-03-08', start_time:'2026-03-09 12:00' },
    { id:1003, channel_title:'GamersHub',      status:'pending_approval', text:'Анонс игрового турнира',            duration_hours:24, price:80,  created_at:'2026-03-13', start_time:null }
  ];
  var publisher = [
    { id:2001, channel_title:'My Tech Channel', advertiser:'@brand_ads',  status:'pending_approval', text:'Реклама SaaS-сервиса', duration_hours:24, price:15, created_at:'2026-03-13', start_time:null },
    { id:2002, channel_title:'My Tech Channel', advertiser:'@shopify_ru', status:'completed',        text:'Магазин одежды',       duration_hours:48, price:28, created_at:'2026-03-05', start_time:'2026-03-06 09:00' }
  ];
  return role === 'publisher' ? publisher : advertisers;
}

// ── Main render ──────────────────────────────────────────────────
function loadAdxPage() {
  const el = document.getElementById('adxPageContent');
  if (!el) return;
  if (!window._adxSubTabState) window._adxSubTabState = '';
  window._adxRender(el);
}

window._adxRender = function(body) {
  try {
    var isRu = _adxIsRu();
    var st = window._adxSubTabState || '';

    // Hero landing if no tab selected yet
    if (!st) {
      _adxRenderHero(body, isRu);
      return;
    }

    _adxRenderTabs(body, isRu, st);
  } catch(renderErr) {
    console.error('[_adxRender CRASH]', renderErr, renderErr.stack);
    body.innerHTML = '<div style="padding:40px;color:#f87171;text-align:center;font-family:monospace">' +
      '<h3>ADX Render Error</h3><pre style="text-align:left;max-width:600px;margin:16px auto;overflow:auto;background:#1a1a2e;padding:16px;border-radius:8px;font-size:12px;color:#fca5a5">' +
      renderErr.name + ': ' + renderErr.message + '\n\n' + (renderErr.stack || '') + '</pre></div>';
  }
};

// DEBUG: catch unhandled async errors
if (!window._adxDebugSetup) {
  window._adxDebugSetup = true;
  window.addEventListener('unhandledrejection', function(event) {
    var msg = event.reason ? (event.reason.message || String(event.reason)) : 'unknown';
    var stack = event.reason && event.reason.stack ? event.reason.stack.split('\n').slice(0,3).join(' | ') : '';
    console.error('[UnhandledRejection]', msg, stack);
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b91c1c;color:#fff;padding:12px 16px;font-size:13px;font-family:monospace;cursor:pointer;max-height:120px;overflow:auto';
    d.textContent = '[Async Error] ' + msg + ' | ' + stack;
    d.onclick = function() { d.remove(); };
    document.body.appendChild(d);
  });
}
window._adxRenderHero = async function(body, isRu) {
  try {
  body.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:24px 16px">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:36px;margin-bottom:8px">🏪</div>
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:700;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${isRu ? 'Рекламная биржа Arsenal Profi' : 'Arsenal Profi Ad Exchange'} <button class="guide-btn" onclick="toggleGuide(this)" data-tool="pageGuide.adx" title="?" style="-webkit-text-fill-color:#667eea">?</button></h2>
        <p style="color:#9ca3af;margin:0;font-size:15px">${isRu ? 'Покупайте и продавайте рекламу в Telegram каналах' : 'Buy and sell advertising in Telegram channels'}</p>
      </div>

      <!-- Stats bar -->
      <div id="adxHeroStats" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:36px">
        <div style="background:rgba(102,126,234,0.1);border:1px solid rgba(102,126,234,0.2);border-radius:12px;padding:12px 20px;text-align:center;min-width:120px">
          <div style="font-size:22px;font-weight:700;color:#667eea" id="adxStatChannels">...</div>
          <div style="font-size:12px;color:#9ca3af">${isRu ? 'каналов в сети' : 'channels'}</div>
        </div>
        <div style="background:rgba(72,187,120,0.1);border:1px solid rgba(72,187,120,0.2);border-radius:12px;padding:12px 20px;text-align:center;min-width:120px">
          <div style="font-size:22px;font-weight:700;color:#48bb78" id="adxStatMinPrice">...</div>
          <div style="font-size:12px;color:#9ca3af">${isRu ? 'минимум за 24ч' : 'min per 24h'}</div>
        </div>
        <div style="background:rgba(237,137,54,0.1);border:1px solid rgba(237,137,54,0.2);border-radius:12px;padding:12px 20px;text-align:center;min-width:120px">
          <div style="font-size:22px;font-weight:700;color:#ed8936" id="adxStatBalance">...</div>
          <div style="font-size:12px;color:#9ca3af">${isRu ? 'ваш баланс' : 'your balance'}</div>
        </div>
        <div style="background:rgba(236,72,153,0.1);border:1px solid rgba(236,72,153,0.2);border-radius:12px;padding:12px 20px;text-align:center;min-width:120px">
          <div style="font-size:22px;font-weight:700;color:#ec4899" id="adxStatEarned">...</div>
          <div style="font-size:12px;color:#9ca3af">${isRu ? 'заработано' : 'earned'}</div>
        </div>
      </div>

      <!-- Two CTA cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:40px">

        <!-- Card 1: Order Ad -->
        <div style="background:linear-gradient(135deg,rgba(102,126,234,0.15),rgba(118,75,162,0.15));border:1.5px solid rgba(102,126,234,0.35);border-radius:20px;padding:28px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden"
             onmouseover="this.style.borderColor='#667eea';this.style.transform='translateY(-3px)'"
             onmouseout="this.style.borderColor='rgba(102,126,234,0.35)';this.style.transform='translateY(0)'"
             onclick="window._adxGoToMarketplace()">
          <div style="font-size:40px;margin-bottom:14px">🎯</div>
          <h3 style="margin:0 0 10px;font-size:18px;font-weight:700;color:#fff">${isRu ? 'Заказать рекламу' : 'Order Advertising'}</h3>
          <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 20px">${isRu ? 'Выберите Telegram каналы из нашей сети, разместите пост с вашей рекламой и получите целевую аудиторию.' : 'Choose Telegram channels from our network, place your post and reach your target audience.'}</p>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#a5b4fc"><span>✓</span>${isRu ? 'Таргетинг по тематике и языку' : 'Targeting by topic and language'}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#a5b4fc"><span>✓</span>${isRu ? 'Публикация в течение 24 часов' : 'Publishing within 24 hours'}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#a5b4fc"><span>✓</span>${isRu ? 'Оплата из баланса, гарантия возврата' : 'Pay from balance, money-back guarantee'}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#a5b4fc"><span>✓</span>${isRu ? 'AI-подбор подходящих каналов' : 'AI-powered channel recommendations'}</div>
          </div>
          <button style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:15px;font-weight:700;cursor:pointer;width:100%" onclick="window._adxGoToMarketplace()">${isRu ? '🛒 Выбрать каналы' : '🛒 Browse Channels'}</button>
        </div>

        <!-- Card 2: Add Channel -->
        <div style="background:linear-gradient(135deg,rgba(72,187,120,0.15),rgba(56,161,105,0.15));border:1.5px solid rgba(72,187,120,0.35);border-radius:20px;padding:28px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden"
             onmouseover="this.style.borderColor='#48bb78';this.style.transform='translateY(-3px)'"
             onmouseout="this.style.borderColor='rgba(72,187,120,0.35)';this.style.transform='translateY(0)'"
             onclick="window._adxDirectAddChannel()">
          <div style="font-size:40px;margin-bottom:14px">📢</div>
          <h3 style="margin:0 0 10px;font-size:18px;font-weight:700;color:#fff">${isRu ? 'Добавить канал' : 'Add Your Channel'}</h3>
          <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 20px">${isRu ? 'Монетизируйте ваш Telegram канал — получайте деньги за размещение рекламы от проверенных рекламодателей.' : 'Monetize your Telegram channel — earn money by hosting ads from verified advertisers.'}</p>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#9ae6b4"><span>✓</span>${isRu ? 'Вы сами устанавливаете цены' : 'You set your own prices'}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#9ae6b4"><span>✓</span>${isRu ? 'Принимаете или отклоняете заказы' : 'Accept or reject each order'}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#9ae6b4"><span>✓</span>${isRu ? '90% от стоимости заказа — ваши' : '90% of order price goes to you'}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#9ae6b4"><span>✓</span>${isRu ? 'Выплата на баланс мгновенно' : 'Instant payout to your balance'}</div>
          </div>
          <button style="background:linear-gradient(135deg,#48bb78,#38a169);color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:15px;font-weight:700;cursor:pointer;width:100%" onclick="event.stopPropagation();window._adxDirectAddChannel()">${isRu ? '➕ Добавить канал' : '➕ Add Channel'}</button>
        </div>
      </div>

      <!-- How it works -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;margin-bottom:28px">
        <h4 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#e2e8f0;text-align:center">${isRu ? 'Как это работает' : 'How it works'}</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div>
            <div style="font-size:13px;font-weight:700;color:#a5b4fc;margin-bottom:12px">🎯 ${isRu ? 'Для рекламодателей' : 'For Advertisers'}</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Пополните баланс' : 'Top up balance'}</div></div>
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Выберите каналы по теме' : 'Choose channels by topic'}</div></div>
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Создайте рекламный пост' : 'Create your ad post'}</div></div>
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Получите аудиторию!' : 'Get your audience!'}</div></div>
            </div>
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#9ae6b4;margin-bottom:12px">📢 ${isRu ? 'Для владельцев каналов' : 'For Channel Owners'}</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#48bb78,#38a169);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Добавьте бота @ARSENALPROFIbot как администратора' : 'Add @ARSENALPROFIbot as admin'}</div></div>
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#48bb78,#38a169);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Зарегистрируйте канал здесь' : 'Register your channel here'}</div></div>
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#48bb78,#38a169);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Пройдите модерацию (до 24ч)' : 'Pass moderation (up to 24h)'}</div></div>
              <div style="display:flex;gap:10px;align-items:flex-start"><div style="background:linear-gradient(135deg,#48bb78,#38a169);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</div><div style="font-size:13px;color:#9ca3af">${isRu ? 'Принимайте заказы и зарабатывайте!' : 'Accept orders and earn!'}</div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick navigation -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button onclick="window._adxGoToMarketplace()" style="background:rgba(102,126,234,0.12);border:1px solid rgba(102,126,234,0.3);color:#a5b4fc;border-radius:10px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:500">🛒 ${isRu ? 'Маркетплейс' : 'Marketplace'}</button>
        <button onclick="window._adxSubTabGo('my-channels')" style="background:rgba(72,187,120,0.12);border:1px solid rgba(72,187,120,0.3);color:#9ae6b4;border-radius:10px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:500">📢 ${isRu ? 'Мои каналы' : 'My Channels'}</button>
        <button onclick="window._adxSubTabGo('my-orders')" style="background:rgba(237,137,54,0.12);border:1px solid rgba(237,137,54,0.3);color:#fbd38d;border-radius:10px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:500">📋 ${isRu ? 'Мои заказы' : 'My Orders'}</button>
        <button onclick="window._adxSubTabGo('earnings')" style="background:rgba(236,72,153,0.12);border:1px solid rgba(236,72,153,0.3);color:#f9a8d4;border-radius:10px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:500">💰 ${isRu ? 'Доходы' : 'Earnings'}</button>
      </div>

    </div>
  `;

  // Load stats
  try {
    const [mktRes, meRes, earnRes, ordersRes] = await Promise.all([
      API.get('/api/adx/marketplace?limit=1&page=1'),
      API.get('/api/auth/me'),
      API.get('/api/adx/earnings'),
      API.get('/api/adx/orders?role=publisher')
    ]);
    if (mktRes.total !== undefined) document.getElementById('adxStatChannels').textContent = mktRes.total;
    if (mktRes.channels && mktRes.channels.length) {
      var prices = mktRes.channels.map(c => c.price_24h).filter(p => p > 0);
      if (prices.length) document.getElementById('adxStatMinPrice').textContent = '$' + Math.min(...prices);
    }
    if (meRes.user) document.getElementById('adxStatBalance').textContent = '$' + (meRes.user.balance_usd || 0).toFixed(2);
    if (earnRes.stats) document.getElementById('adxStatEarned').textContent = '$' + (earnRes.stats.total_earned || 0).toFixed(2);

    // Show pending orders alert banner
    if (ordersRes.orders) {
      var pending = ordersRes.orders.filter(o => o.status === 'pending_approval');
      if (pending.length > 0) {
        var alertBar = document.createElement('div');
        alertBar.style.cssText = 'background:linear-gradient(135deg,rgba(237,137,54,0.2),rgba(236,72,153,0.2));border:1.5px solid rgba(237,137,54,0.4);border-radius:14px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer';
        alertBar.innerHTML = '<div style="display:flex;align-items:center;gap:12px"><div style="font-size:28px">🔔</div><div><div style="font-weight:700;font-size:15px;color:#fbd38d">' +
          (isRu ? 'У вас ' + pending.length + ' новых заказа на рекламу!' : 'You have ' + pending.length + ' new ad orders!') +
          '</div><div style="font-size:13px;color:#9ca3af;margin-top:2px">' +
          (isRu ? 'Одобрите или отклоните заказы от рекламодателей' : 'Accept or reject orders from advertisers') + '</div></div></div>' +
          '<button style="background:linear-gradient(135deg,#ed8936,#dd6b20);color:#fff;border:none;border-radius:10px;padding:10px 20px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap">' +
          (isRu ? 'Просмотреть →' : 'Review →') + '</button>';
        alertBar.onclick = function() { window._adxSubTabGo('my-orders'); };
        var heroContent = body.querySelector('div');
        if (heroContent) heroContent.insertBefore(alertBar, heroContent.children[1]);
      }
    }
  } catch(e) { console.error('[Hero stats]', e); }
  setTimeout(window._adxAddHelp, 300);
  } catch(heroErr) {
    console.error('[_adxRenderHero CRASH]', heroErr, heroErr.stack);
    body.innerHTML = '<div style="padding:40px;color:#f87171;text-align:center;font-family:monospace">' +
      '<h3>ADX Hero Error</h3><pre style="text-align:left;max-width:600px;margin:16px auto;overflow:auto;background:#1a1a2e;padding:16px;border-radius:8px;font-size:12px;color:#fca5a5">' +
      heroErr.name + ': ' + heroErr.message + '\n\n' + (heroErr.stack || '') + '</pre></div>';
  }
};

window._adxGoToMarketplace = function() {
  window._adxSubTabState = 'marketplace';
  var el = document.getElementById('adxPageContent') || document.getElementById('adcBody');
  if (el) window._adxRenderTabs(el, _adxIsRu(), 'marketplace');
};

window._adxSubTabGo = function(tab) {
  window._adxSubTabState = tab;
  var el = document.getElementById('adxPageContent') || document.getElementById('adcBody');
  if (el) window._adxRenderTabs(el, _adxIsRu(), tab);
};

window._adxRenderTabs = function(body, isRu, st) {
  var nav = document.createElement('div');
  nav.className = 'adx-subnav';
  nav.style.cssText = 'position:sticky;top:0;z-index:10;background:var(--bg-primary,#0f0c29)';

  // Back to home button
  var homeBtn = document.createElement('button');
  homeBtn.className = 'adx-subnav-btn';
  homeBtn.style.cssText = 'opacity:0.7;font-size:12px;padding:6px 12px';
  homeBtn.textContent = '← ' + (isRu ? 'Главная' : 'Home');
  homeBtn.onclick = function() {
    window._adxSubTabState = '';
    var el = document.getElementById('adxPageContent') || document.getElementById('adcBody');
    if (el) window._adxRender(el);
  };
  nav.appendChild(homeBtn);

  var sep = document.createElement('span');
  sep.style.cssText = 'color:#4a5568;margin:0 4px';
  sep.textContent = '|';
  nav.appendChild(sep);

  var tabs = [
    { id:'marketplace', label: isRu ? '🛒 Маркетплейс' : '🛒 Marketplace'  },
    { id:'my-channels', label: isRu ? '📢 Мои каналы'  : '📢 My Channels'   },
    { id:'my-orders',   label: isRu ? '📋 Заказы'       : '📋 My Orders'     },
    { id:'earnings',    label: isRu ? '💰 Доходы'       : '💰 Earnings'      }
  ];
  tabs.forEach(function(tb) {
    var btn = document.createElement('button');
    btn.className = 'adx-subnav-btn' + (tb.id === st ? ' active' : '');
    btn.textContent = tb.label;
    btn.onclick = function() { window._adxSubTabGo(tb.id); };
    nav.appendChild(btn);
  });

  var subContent = document.createElement('div');
  subContent.id = 'adxSubContent';

  var wrap = document.createElement('div');
  wrap.id = 'adxContent';
  wrap.style.padding = '0';
  wrap.appendChild(nav);
  wrap.appendChild(subContent);
  body.innerHTML = '';
  body.appendChild(wrap);

  _adxRenderSubTab(st);
};

window._adxRender_orig = function(body) {
  var isRu = _adxIsRu();
  var st = window._adxSubTabState || 'marketplace';

  var nav = document.createElement('div');
  nav.className = 'adx-subnav';

  var tabs = [
    { id:'marketplace', label: isRu ? '🛒 Купить рекламу' : '🛒 Marketplace'  },
    { id:'my-channels', label: isRu ? '📢 Мои каналы'    : '📢 My Channels'   },
    { id:'my-orders',   label: isRu ? '📋 Мои заказы'    : '📋 My Orders'     },
    { id:'earnings',    label: isRu ? '💰 Доходы'         : '💰 Earnings'      }
  ];
  tabs.forEach(function(tb) {
    var btn = document.createElement('button');
    btn.className = 'adx-subnav-btn' + (tb.id === st ? ' active' : '');
    btn.textContent = tb.label;
    btn.onclick = function() { _adxSubTab(tb.id); };
    nav.appendChild(btn);
  });

  var subContent = document.createElement('div');
  subContent.id = 'adxSubContent';

  var wrap = document.createElement('div');
  wrap.id = 'adxContent';
  wrap.style.padding = '0';
  wrap.appendChild(nav);
  wrap.appendChild(subContent);
  body.innerHTML = '';
  body.appendChild(wrap);

  _adxRenderSubTab(st);
};

window._adxSubTab = function(tab) {
  window._adxSubTabGo(tab);
};

function _adxRenderSubTab(tab) {
  var el = document.getElementById('adxSubContent');
  if (!el) return;
  if (tab === 'marketplace') _adxRenderMarketplace(el);
  else if (tab === 'my-channels') _adxRenderMyChannels(el);
  else if (tab === 'my-orders') _adxRenderMyOrders(el);
  else if (tab === 'earnings') _adxRenderEarnings(el);
}

// ── Marketplace ──────────────────────────────────────────────────
function _adxRenderMarketplace(el) {
  var isRu = _adxIsRu();
  var cats = Object.keys(ADX_CAT_ICONS);

  // Load and show balance
  API.get('/api/auth/me').then(function(me) {
    var bal = me && me.user ? (me.user.balance_usd || 0) : 0;
    var balDiv = document.getElementById('adxBalanceBar');
    if (balDiv) balDiv.innerHTML = '💳 ' + (isRu ? 'Ваш баланс: ' : 'Balance: ') + '<b style="color:#48bb78">$' + parseFloat(bal).toFixed(2) + '</b>';
  }).catch(function(){});

  // Build filters section via DOM to avoid quote issues
  var filterDiv = document.createElement('div');
  filterDiv.className = 'adx-filters';

  var searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'adxSearch';
  searchInput.placeholder = isRu ? 'Поиск каналов...' : 'Search channels...';
  searchInput.style.minWidth = '200px';
  searchInput.style.flex = '1';
  searchInput.oninput = _adxSearch;
  filterDiv.appendChild(searchInput);

  var catSel = document.createElement('select');
  catSel.id = 'adxFilterCat';
  catSel.onchange = _adxLoadMarketplace;
  var allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = isRu ? 'Все категории' : 'All categories';
  catSel.appendChild(allOpt);
  cats.forEach(function(c) {
    var o = document.createElement('option');
    o.value = c;
    o.textContent = _adxCatIcon(c) + ' ' + _adxCatName(c);
    catSel.appendChild(o);
  });
  filterDiv.appendChild(catSel);

  var langSel = document.createElement('select');
  langSel.id = 'adxFilterLang';
  langSel.onchange = _adxLoadMarketplace;
  [['', isRu?'Любой язык':'Any language'],['ru','🇷🇺 ' + (isRu?'Русский':'Russian')],['en','🇬🇧 English'],['mixed','🌍 Mixed']].forEach(function(pair) {
    var o = document.createElement('option');
    o.value = pair[0]; o.textContent = pair[1];
    langSel.appendChild(o);
  });
  filterDiv.appendChild(langSel);

  var sortSel = document.createElement('select');
  sortSel.id = 'adxFilterSort';
  sortSel.onchange = _adxLoadMarketplace;
  [['rating', isRu?'По рейтингу':'By rating'],['subscribers', isRu?'По подписчикам':'By subscribers'],
   ['price_asc', isRu?'Дешевле':'Cheapest'],['price_desc', isRu?'Дороже':'Priciest'],
   ['er','ER%'],['popular', isRu?'Популярные':'Popular']].forEach(function(pair) {
    var o = document.createElement('option');
    o.value = pair[0]; o.textContent = pair[1];
    sortSel.appendChild(o);
  });
  filterDiv.appendChild(sortSel);

  var rangeDiv = document.createElement('div');
  rangeDiv.className = 'adx-filter-range';
  var minSubsInput = document.createElement('input');
  minSubsInput.type = 'number';
  minSubsInput.id = 'adxMinSubs';
  minSubsInput.placeholder = isRu ? 'Мин. подписч.' : 'Min subs';
  minSubsInput.style.width = '130px';
  minSubsInput.oninput = _adxLoadMarketplace;
  var maxPriceInput = document.createElement('input');
  maxPriceInput.type = 'number';
  maxPriceInput.id = 'adxMaxPrice';
  maxPriceInput.placeholder = isRu ? 'Макс. цена $' : 'Max price $';
  maxPriceInput.style.width = '120px';
  maxPriceInput.oninput = _adxLoadMarketplace;
  rangeDiv.appendChild(minSubsInput);
  rangeDiv.appendChild(maxPriceInput);
  filterDiv.appendChild(rangeDiv);

  // AI Suggest button
  var aiBtn = document.createElement('button');
  aiBtn.className = 'adx-ai-btn';
  aiBtn.innerHTML = '🤖 ' + (isRu ? 'AI-подбор' : 'AI Pick');
  aiBtn.title = isRu ? 'Расскажите что рекламируете и бюджет — AI подберёт лучшие каналы' : 'Describe your ad and budget — AI picks the best channels';
  aiBtn.onclick = _adxOpenAISuggest;

  // Budget suggest input
  var filtersRow = document.createElement('div');
  filtersRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px';
  var budgetWrap = document.createElement('div');
  budgetWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:nowrap';
  var budgetInp = document.createElement('input');
  budgetInp.type = 'number';
  budgetInp.id = 'adxBudgetInp';
  budgetInp.placeholder = isRu ? 'Бюджет $' : 'Budget $';
  budgetInp.min = '1';
  budgetInp.style.cssText = 'width:90px;padding:7px 10px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;outline:none';
  budgetInp.onfocus = function() { budgetInp.style.borderColor = '#f59e0b'; };
  budgetInp.onblur = function() { budgetInp.style.borderColor = 'rgba(255,255,255,0.15)'; };
  var budgetPickBtn = document.createElement('button');
  budgetPickBtn.style.cssText = 'padding:7px 13px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;border-radius:8px;color:#000;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;transition:opacity .2s';
  budgetPickBtn.innerHTML = '🎯 ' + (isRu ? 'Подобрать' : 'Pick');
  budgetPickBtn.title = isRu ? 'Подобрать лучшие каналы по бюджету' : 'Find best channels for your budget';
  budgetInp.onkeydown = function(e) { if (e.key === 'Enter') budgetPickBtn.click(); };
  budgetPickBtn.onclick = async function() {
    var budget = parseFloat(budgetInp.value);
    if (!budget || budget < 1) { alert(isRu ? 'Введите бюджет' : 'Enter budget'); return; }
    var hours = 24;
    var cat = (document.getElementById('adxFilterCat') || {}).value || '';
    var lang = (document.getElementById('adxFilterLang') || {}).value || '';
    budgetPickBtn.style.opacity = '0.5';
    budgetPickBtn.disabled = true;
    budgetPickBtn.innerHTML = '⏳';
    try {
      var url = '/api/adx/budget-suggest?budget=' + budget + '&hours=' + hours;
      if (cat) url += '&category=' + encodeURIComponent(cat);
      if (lang) url += '&lang=' + encodeURIComponent(lang);
      var res = await API.get(url);
      if (res.success && res.selected && res.selected.length > 0) {
        window._adxCart = {};
        if (!window._adxChannelCache) window._adxChannelCache = {};
        res.selected.forEach(function(ch) {
          window._adxChannelCache[ch.id] = ch;
          window._adxCart[ch.id] = { channel: ch, hours: hours };
        });
        _adxUpdateCart();
        _adxLoadMarketplace();
        var reach = res.total_reach ? _adxFormatNum(res.total_reach) : '—';
        alert('🎯 ' + (isRu ? 'Подобрано каналов: ' : 'Channels selected: ') + res.selected.length + '\n' +
          '💰 ' + (isRu ? 'Итого: $' : 'Total: $') + res.total_spend + '\n' +
          '👁 ' + (isRu ? 'Охват: ~' : 'Reach: ~') + reach + (isRu ? ' просм.' : ' views'));
      } else {
        alert(isRu ? 'Нет подходящих каналов для бюджета $' + budget : 'No channels found for budget $' + budget);
      }
    } catch(e) {
      alert('Error: ' + e.message);
    }
    budgetPickBtn.style.opacity = '1';
    budgetPickBtn.disabled = false;
    budgetPickBtn.innerHTML = '🎯 ' + (isRu ? 'Подобрать' : 'Pick');
  };
  budgetWrap.appendChild(budgetInp);
  budgetWrap.appendChild(budgetPickBtn);
  filtersRow.appendChild(budgetWrap);

  // Favorites toggle
  var favFilterBtn = document.createElement('button');
  favFilterBtn.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#9ca3af;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;transition:all .2s;white-space:nowrap';
  favFilterBtn.innerHTML = '❤️ ' + (isRu ? 'Избранные' : 'Favorites') + ' <span id="adxFavCount" style="background:rgba(255,100,100,0.2);border-radius:10px;padding:1px 6px;font-size:11px">' + (window._adxFavs ? window._adxFavs.length : 0) + '</span>';
  window._adxShowFavsOnly = false;
  favFilterBtn.onclick = function() {
    window._adxShowFavsOnly = !window._adxShowFavsOnly;
    favFilterBtn.style.background = window._adxShowFavsOnly ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)';
    favFilterBtn.style.borderColor = window._adxShowFavsOnly ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.15)';
    favFilterBtn.style.color = window._adxShowFavsOnly ? '#fc8181' : '#9ca3af';
    _adxLoadMarketplace();
  };
  filtersRow.appendChild(favFilterBtn);
  filterDiv.appendChild(filtersRow);
  filterDiv.appendChild(aiBtn);

  var grid = document.createElement('div');
  grid.className = 'adx-channel-grid';
  grid.id = 'adxChannelGrid';

  var pagination = document.createElement('div');
  pagination.className = 'adx-pagination';
  pagination.id = 'adxPagination';

  // Cart bar
  var cartBar = document.createElement('div');
  cartBar.id = 'adxCart';
  cartBar.className = 'adx-cart';
  cartBar.style.display = 'none';

  var cartItems = document.createElement('div');
  cartItems.id = 'adxCartItems';
  cartItems.className = 'adx-cart-items';

  var cartTotal = document.createElement('div');
  cartTotal.className = 'adx-cart-total';
  cartTotal.innerHTML = (isRu ? 'Итого:' : 'Total:') + ' <strong id="adxCartTotal">$0</strong>';
  var checkoutBtn = document.createElement('button');
  checkoutBtn.className = 'adc-btn adc-btn-primary';
  checkoutBtn.style.whiteSpace = 'nowrap';
  checkoutBtn.textContent = isRu ? 'Создать кампанию →' : 'Create campaign →';
  checkoutBtn.onclick = _adxOpenOrderModal;
  cartTotal.appendChild(checkoutBtn);

  cartBar.appendChild(cartItems);
  cartBar.appendChild(cartTotal);

  el.innerHTML = '';
  var balBar = document.createElement('div');
  balBar.id = 'adxBalanceBar';
  balBar.style.cssText = 'padding:8px 12px;margin-bottom:8px;background:rgba(72,187,120,0.08);border:1px solid rgba(72,187,120,0.2);border-radius:8px;font-size:13px;color:#e2e8f0';
  balBar.innerHTML = '💳 ' + (isRu ? 'Загрузка баланса...' : 'Loading balance...');
  el.appendChild(balBar);
  el.appendChild(filterDiv);
  el.appendChild(grid);
  el.appendChild(pagination);
  el.appendChild(cartBar);

  _adxLoadMarketplace();
  _adxUpdateCart();
}

window._adxLoadMarketplace = function() {
  var grid = document.getElementById('adxChannelGrid');
  if (!grid) return;

  var filters = {
    q:        (document.getElementById('adxSearch')     || {}).value || '',
    cat:      (document.getElementById('adxFilterCat')  || {}).value || '',
    lang:     (document.getElementById('adxFilterLang') || {}).value || '',
    sort:     (document.getElementById('adxFilterSort') || {}).value || 'rating',
    minSubs:  (document.getElementById('adxMinSubs')    || {}).value || '',
    maxPrice: (document.getElementById('adxMaxPrice')   || {}).value || ''
  };

  // Skeleton
  var skelHtml = '';
  for (var i = 0; i < 6; i++) {
    skelHtml += '<div class="adx-channel-card">' +
      '<div class="adx-card-header" style="height:72px">' +
        '<div class="adx-skeleton" style="width:44px;height:44px;border-radius:50%"></div>' +
        '<div style="flex:1;margin-left:12px">' +
          '<div class="adx-skeleton" style="height:14px;width:70%;margin-bottom:8px"></div>' +
          '<div class="adx-skeleton" style="height:11px;width:40%"></div>' +
        '</div>' +
      '</div>' +
      '<div style="padding:12px 16px"><div class="adx-skeleton" style="height:40px"></div></div>' +
      '<div style="padding:8px 16px"><div class="adx-skeleton" style="height:20px;width:60%"></div></div>' +
    '</div>';
  }
  grid.innerHTML = skelHtml;

  var qs = 'q=' + encodeURIComponent(filters.q) +
    '&category=' + encodeURIComponent(filters.cat) +
    '&lang=' + encodeURIComponent(filters.lang) +
    '&sort=' + encodeURIComponent(filters.sort) +
    '&min_subs=' + encodeURIComponent(filters.minSubs) +
    '&max_price=' + encodeURIComponent(filters.maxPrice);
  API.get('/api/adx/marketplace?' + qs).then(function(result) {
    if (!document.getElementById('adxChannelGrid')) return;
    window._adxTotal = result.total || 0;
    window._adxChannelCache = {};
    (result.channels || []).forEach(function(c) { window._adxChannelCache[c.id] = c; });
    _adxRenderChannelGrid(result.channels || []);
  }).catch(function(e) {
    var grid = document.getElementById('adxChannelGrid');
    if (grid) grid.innerHTML = '<div style="color:#f56565;padding:30px;text-align:center">' + (e.message || 'Error loading') + '</div>';
  });
};

window._adxSearch = function() {
  clearTimeout(window._adxSearchTimer);
  window._adxSearchTimer = setTimeout(_adxLoadMarketplace, 350);
};

try { window._adxFavs = JSON.parse(localStorage.getItem('adx_favs') || '[]'); } catch(e) { window._adxFavs = []; localStorage.removeItem('adx_favs'); }
window._adxToggleFav = function(id) {
  id = parseInt(id);
  var idx = window._adxFavs.indexOf(id);
  if (idx >= 0) window._adxFavs.splice(idx, 1);
  else window._adxFavs.push(id);
  localStorage.setItem('adx_favs', JSON.stringify(window._adxFavs));
  var cnt = document.getElementById('adxFavCount');
  if (cnt) cnt.textContent = window._adxFavs.length;
};
window._adxIsFav = function(id) { return window._adxFavs.indexOf(parseInt(id)) >= 0; };

function _adxRenderChannelGrid(channels) {
  var grid = document.getElementById('adxChannelGrid');
  if (!grid) return;
  var isRu = _adxIsRu();
  grid.innerHTML = '';

  if (!channels.length) {
    var empty = document.createElement('div');
    empty.className = 'adx-empty';
    empty.style.gridColumn = '1 / -1';
    empty.innerHTML = '<div class="adx-empty-icon">🔍</div>' +
      '<div class="adx-empty-title">' + (isRu ? 'Каналы не найдены' : 'No channels found') + '</div>' +
      '<div class="adx-empty-sub">' + (isRu ? 'Попробуйте изменить фильтры' : 'Try adjusting the filters') + '</div>';
    grid.appendChild(empty);
    return;
  }

  channels.forEach(function(ch) {
    var card = _adxBuildChannelCard(ch);
    grid.appendChild(card);
  });
}

function _adxBuildChannelCard(ch) {
  var isRu = _adxIsRu();
  var inCart = _adxIsInCart(ch.id);
  var r = Math.round(ch.rating || 5);
  var stars = '★'.repeat(r) + '☆'.repeat(5 - r);

  var card = document.createElement('div');
  card.className = 'adx-channel-card';
  card.dataset.id = ch.id;
  card.style.position = 'relative';

  // Trending badge
  if ((ch.total_orders || 0) >= 5) {
    var trendBadge = document.createElement('div');
    trendBadge.style.cssText = 'position:absolute;top:8px;left:8px;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;z-index:3;pointer-events:none';
    trendBadge.textContent = '🔥 ' + (isRu ? 'Хит' : 'Hot');
    card.appendChild(trendBadge);
  }

  // New badge
  var createdAt = ch.created_at ? new Date(ch.created_at) : null;
  if (createdAt && (Date.now() - createdAt.getTime()) < 7 * 24 * 3600 * 1000) {
    var newBadge = document.createElement('div');
    newBadge.style.cssText = 'position:absolute;top:8px;left:8px;background:linear-gradient(135deg,#48bb78,#38a169);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;z-index:3;pointer-events:none';
    newBadge.textContent = '✨ NEW';
    card.appendChild(newBadge);
  }

  // Fav button
  var favBtn = document.createElement('button');
  favBtn.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;z-index:3;display:flex;align-items:center;justify-content:center;transition:transform .2s;backdrop-filter:blur(4px)';
  favBtn.title = isRu ? 'В избранное' : 'Add to favorites';
  favBtn.textContent = window._adxIsFav(ch.id) ? '❤️' : '🤍';
  favBtn.onmouseover = function() { favBtn.style.transform = 'scale(1.2)'; };
  favBtn.onmouseout = function() { favBtn.style.transform = 'scale(1)'; };
  (function(chId) {
    favBtn.onclick = function(e) {
      e.stopPropagation();
      window._adxToggleFav(chId);
      favBtn.textContent = window._adxIsFav(chId) ? '❤️' : '🤍';
    };
  })(ch.id);
  card.appendChild(favBtn);

  // Header
  var header = document.createElement('div');
  header.className = 'adx-card-header';
  var avatar = document.createElement('div');
  avatar.className = 'adx-channel-avatar';
  avatar.style.overflow = 'hidden';
  if (ch.avatar_url) {
    var avImg = document.createElement('img');
    avImg.src = ch.avatar_url;
    avImg.style.cssText = 'width:100%;height:100%;object-fit:cover';
    avImg.onerror = function() { avatar.textContent = (ch.title || '?')[0].toUpperCase(); avImg.remove(); };
    avatar.appendChild(avImg);
  } else {
    avatar.textContent = (ch.title || '?')[0].toUpperCase();
  }
  var info = document.createElement('div');
  info.className = 'adx-channel-info';
  info.innerHTML = '<div class="adx-channel-name">' + _adxEsc(ch.title) + '</div>' +
    '<div class="adx-channel-handle">' + (ch.username ? '@' + ch.username : '') + '</div>';
  var badge = document.createElement('div');
  badge.className = 'adx-channel-badge';
  badge.textContent = _adxCatIcon(ch.categories[0]);
  header.appendChild(avatar);
  header.appendChild(info);
  header.appendChild(badge);

  // Stats
  var statsDiv = document.createElement('div');
  statsDiv.className = 'adx-channel-stats';
  [
    [_adxFormatNum(ch.member_count), '👥 ' + (isRu ? 'Подписч.' : 'Subs')],
    [(ch.engagement_rate ? ch.engagement_rate.toFixed(1) + '%' : 'N/A'), '📊 ER'],
    [(ch.avg_views_per_post ? _adxFormatNum(ch.avg_views_per_post) : 'N/A'), '👁 ' + (isRu ? 'Просм.' : 'Views')]
  ].forEach(function(pair) {
    var s = document.createElement('div');
    s.className = 'adx-stat';
    s.innerHTML = '<span class="adx-stat-val">' + pair[0] + '</span><span class="adx-stat-label">' + pair[1] + '</span>';
    statsDiv.appendChild(s);
  });

  // Categories
  var catsDiv = document.createElement('div');
  catsDiv.className = 'adx-categories';
  (ch.categories || []).forEach(function(c) {
    var tag = document.createElement('span');
    tag.className = 'adx-cat-tag';
    tag.textContent = _adxCatName(c);
    catsDiv.appendChild(tag);
  });

  // Rating
  var ratingDiv = document.createElement('div');
  ratingDiv.className = 'adx-channel-rating';
  ratingDiv.innerHTML = '<span style="color:#f6c90e">' + stars + '</span>' +
    '<span style="color:#e2e8f0;margin-left:4px">' + (ch.rating || 5).toFixed(1) + '</span>' +
    '<span class="adx-orders-count">' + (ch.total_orders || 0) + (isRu ? ' заказов' : ' orders') + '</span>';

  // Pricing
  var pricingDiv = document.createElement('div');
  pricingDiv.className = 'adx-channel-pricing';
  pricingDiv.innerHTML = '<div class="adx-price-main">' + (isRu ? 'от ' : 'from ') +
    '<strong>$' + ch.price_24h + '</strong>/24ч</div>' +
    (ch.price_48h ? '<div class="adx-price-alt">$' + ch.price_48h + '/48ч</div>' : '') +
    (ch.price_72h ? '<div class="adx-price-alt">$' + ch.price_72h + '/72ч</div>' : '');

  // Actions
  var actionsDiv = document.createElement('div');
  actionsDiv.className = 'adx-card-actions';
  var cartBtn = document.createElement('button');
  cartBtn.className = 'adx-cart-btn' + (inCart ? ' in-cart' : '');
  cartBtn.textContent = inCart ? (isRu ? '✓ В корзине' : '✓ In cart') : (isRu ? '+ В корзину' : '+ Add to cart');
  (function(chId) {
    cartBtn.onclick = function() { _adxCartToggle(chId); };
  })(ch.id);
  var detailBtn = document.createElement('button');
  detailBtn.className = 'adx-detail-btn';
  detailBtn.textContent = isRu ? 'Подробнее' : 'Details';
  (function(chId) {
    detailBtn.onclick = function() { _adxChannelDetail(chId); };
  })(ch.id);
  actionsDiv.appendChild(cartBtn);
  actionsDiv.appendChild(detailBtn);

  card.appendChild(header);
  card.appendChild(statsDiv);
  card.appendChild(catsDiv);
  card.appendChild(ratingDiv);
  card.appendChild(pricingDiv);
  card.appendChild(actionsDiv);
  return card;
}

// ── Cart ─────────────────────────────────────────────────────────
window._adxCartToggle = function(channelId) {
  var ch = window._adxChannelCache && window._adxChannelCache[channelId];
  if (!ch) return;
  if (window._adxCart[channelId]) {
    delete window._adxCart[channelId];
  } else {
    window._adxCart[channelId] = { channel: ch, hours: 24 };
  }
  _adxUpdateCart();
  // Refresh button on card
  var card = document.querySelector('.adx-channel-card[data-id="' + channelId + '"]');
  if (card) {
    var isRu = _adxIsRu();
    var inCart = _adxIsInCart(channelId);
    var btn = card.querySelector('.adx-cart-btn');
    if (btn) {
      btn.className = 'adx-cart-btn' + (inCart ? ' in-cart' : '');
      btn.textContent = inCart ? (isRu ? '✓ В корзине' : '✓ In cart') : (isRu ? '+ В корзину' : '+ Add to cart');
    }
  }
};

window._adxUpdateCart = function() {
  var cartEl = document.getElementById('adxCart');
  var itemsEl = document.getElementById('adxCartItems');
  var totalEl = document.getElementById('adxCartTotal');
  if (!cartEl) return;
  var keys = Object.keys(window._adxCart);
  var isRu = _adxIsRu();
  if (!keys.length) { cartEl.style.display = 'none'; return; }
  cartEl.style.display = 'flex';

  if (itemsEl) {
    itemsEl.innerHTML = '';
    keys.forEach(function(id) {
      var item = window._adxCart[id];
      var ch = item.channel;
      var price = ch['price_' + item.hours + 'h'] || ch.price_24h;
      var chip = document.createElement('div');
      chip.className = 'adx-cart-chip';
      chip.innerHTML = _adxEsc(ch.title) + ' · <strong>$' + price + '</strong>';
      var rm = document.createElement('span');
      rm.className = 'adx-cart-chip-remove';
      rm.title = isRu ? 'Убрать' : 'Remove';
      rm.textContent = '×';
      (function(chId) { rm.onclick = function() { _adxCartToggle(chId); }; })(ch.id);
      chip.appendChild(rm);
      itemsEl.appendChild(chip);
    });
  }

  var total = 0, totalReach = 0;
  keys.forEach(function(id) {
    var item = window._adxCart[id];
    var ch = item.channel;
    total += ch['price_' + item.hours + 'h'] || ch.price_24h || 0;
    totalReach += ch.avg_views_per_post || Math.round((ch.member_count || 0) * 0.1);
  });
  if (totalEl) totalEl.textContent = '$' + total.toFixed(2) + ' · ' + keys.length + (isRu ? ' кан.' : ' ch.') + ' · 👁~' + _adxFormatNum(totalReach);
};

// ── Order modal ──────────────────────────────────────────────────
window._adxOpenOrderModal = function() {
  var isRu = _adxIsRu();
  var keys = Object.keys(window._adxCart);
  if (!keys.length) return;

  var total24 = 0, total48 = 0, total72 = 0;
  keys.forEach(function(id) {
    var ch = window._adxCart[id].channel;
    total24 += ch.price_24h || 0;
    total48 += ch.price_48h || ch.price_24h || 0;
    total72 += ch.price_72h || ch.price_24h || 0;
  });

  var overlay = document.createElement('div');
  overlay.className = 'adx-modal-overlay';
  overlay.id = 'adxOrderOverlay';
  overlay.onclick = function(e) { if (e.target === overlay) _adxCloseOrderModal(); };

  var modal = document.createElement('div');
  modal.className = 'adx-modal';
  modal.id = 'adxOrderModal';

  var closeBtn = document.createElement('button');
  closeBtn.className = 'adx-modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = _adxCloseOrderModal;

  var title = document.createElement('div');
  title.className = 'adx-modal-title';
  title.textContent = '📣 ' + (isRu ? 'Создать рекламную кампанию' : 'Create Ad Campaign');

  // Text section
  var textSection = _adxModalSection(isRu ? 'Текст поста' : 'Post text');
  var textArea = document.createElement('textarea');
  textArea.id = 'adxOrderText';
  textArea.maxLength = 4096;
  textArea.placeholder = isRu ? 'Текст вашего рекламного поста...' : 'Your ad post text...';
  textArea.oninput = _adxUpdateOrderPreview;
  var charCounter = document.createElement('div');
  charCounter.className = 'adx-char-counter';
  charCounter.innerHTML = '<span id="adxCharCount">0</span>/4096';
  textSection.appendChild(textArea);
  textSection.appendChild(charCounter);

  // Media section
  var mediaSection = _adxModalSection(isRu ? 'Медиафайл (URL картинки/видео)' : 'Media URL (image/video)');
  var mediaInput = document.createElement('input');
  mediaInput.type = 'url';
  mediaInput.id = 'adxOrderMedia';
  mediaInput.placeholder = 'https://...';
  mediaInput.oninput = _adxUpdateOrderPreview;
  mediaSection.appendChild(mediaInput);

  // Buttons section
  var btnSection = _adxModalSection(isRu ? 'Кнопки (inline)' : 'Inline buttons');
  var btnRows = document.createElement('div');
  btnRows.id = 'adxBtnRows';
  var addBtnLink = document.createElement('button');
  addBtnLink.className = 'adx-add-btn-link';
  addBtnLink.textContent = '+ ' + (isRu ? 'Добавить кнопку' : 'Add button');
  addBtnLink.onclick = _adxAddBtnRow;
  btnSection.appendChild(btnRows);
  btnSection.appendChild(addBtnLink);

  // Preview section
  var previewSection = _adxModalSection(isRu ? 'Предпросмотр' : 'Preview');
  var previewDiv = document.createElement('div');
  previewDiv.id = 'adxPostPreview';
  previewDiv.className = 'adx-tg-preview';
  previewDiv.style.color = '#aaa';
  previewDiv.textContent = isRu ? 'Введите текст поста...' : 'Enter post text...';
  previewSection.appendChild(previewDiv);

  // Date section
  var dateSection = _adxModalSection(isRu ? 'Дата и время публикации' : 'Publish date & time');
  var dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.id = 'adxOrderDate';
  dateSection.appendChild(dateInput);

  // Duration section
  var durSection = _adxModalSection(isRu ? 'Длительность размещения' : 'Placement duration');
  var durBtns = document.createElement('div');
  durBtns.className = 'adx-duration-btns';
  [[24, total24], [48, total48], [72, total72]].forEach(function(pair) {
    var h = pair[0], tot = pair[1];
    var btn = document.createElement('button');
    btn.className = 'adx-dur-btn' + (h === 24 ? ' selected' : '');
    btn.id = 'adxDur' + h;
    btn.innerHTML = '<span class="adx-dur-price" id="adxDurTotal' + h + '">$' + tot + '</span>' + h + ' ' + (isRu ? (h === 24 ? 'часа' : 'часов') : 'hours');
    (function(hours) { btn.onclick = function() { _adxSelectDur(hours); }; })(h);
    durBtns.appendChild(btn);
  });
  durSection.appendChild(durBtns);

  // Price inputs per channel (advertiser sets own price)
  var priceSection = _adxModalSection(isRu ? 'Ваша ставка за каждый канал' : 'Your bid per channel');
  var priceNote = document.createElement('div');
  priceNote.style.cssText = 'color:#9ca3af;font-size:12px;margin-bottom:12px';
  priceNote.textContent = isRu ? '💡 Вы предлагаете цену — паблишер принимает или отклоняет. Платформа берёт 10%.' : '💡 You propose a price — publisher accepts or rejects. Platform fee: 10%.';
  priceSection.appendChild(priceNote);
  keys.forEach(function(id) {
    var ch = window._adxCart[id].channel;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px';
    var lbl = document.createElement('label');
    lbl.style.cssText = 'flex:1;color:#e2e8f0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    lbl.textContent = ch.title;
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.id = 'adxPrice_' + id;
    inp.min = '1';
    inp.step = '0.5';
    inp.placeholder = '$';
    inp.style.cssText = 'width:90px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:#1a1a2e;color:#e2e8f0;font-size:14px;text-align:center';
    inp.oninput = function() {
      var total2 = 0;
      Object.keys(window._adxCart).forEach(function(k) {
        var pi = document.getElementById('adxPrice_' + k);
        total2 += pi ? parseFloat(pi.value)||0 : 0;
      });
      var sb = document.getElementById('adxSubmitBtn');
      if (sb && total2 > 0) sb.textContent = '\U0001F4B3 $' + total2.toFixed(2);
    };
    row.appendChild(lbl);
    row.appendChild(inp);
    priceSection.appendChild(row);
  });
  var table = document.createElement('table');
  var budgetSection = _adxModalSection(isRu ? 'Сводка бюджета' : 'Budget Summary');
  table.className = 'adx-budget-table';
  var thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>' + (isRu?'Канал':'Channel') + '</th><th>24ч</th><th>48ч</th><th>72ч</th></tr>';
  var tbody = document.createElement('tbody');
  keys.forEach(function(id) {
    var ch = window._adxCart[id].channel;
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + _adxEsc(ch.title) + '</td>' +
      '<td>$' + (ch.price_24h||0) + '</td>' +
      '<td>$' + (ch.price_48h||ch.price_24h||0) + '</td>' +
      '<td>$' + (ch.price_72h||ch.price_24h||0) + '</td>';
    tbody.appendChild(tr);
  });
  var tfoot = document.createElement('tfoot');
  tfoot.className = 'adx-budget-total-row';
  tfoot.innerHTML = '<tr><td>' + (isRu?'Итого:':'Total:') + '</td>' +
    '<td id="adxBudgTotal24">$' + total24 + '</td>' +
    '<td id="adxBudgTotal48">$' + total48 + '</td>' +
    '<td id="adxBudgTotal72">$' + total72 + '</td></tr>';
  table.appendChild(thead);
  table.appendChild(tbody);
  table.appendChild(tfoot);
  budgetSection.appendChild(table);

  // Footer buttons
  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;margin-top:8px';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'adc-btn';
  cancelBtn.style.minWidth = '100px';
  cancelBtn.textContent = isRu ? 'Отмена' : 'Cancel';
  cancelBtn.onclick = _adxCloseOrderModal;
  var submitBtn = document.createElement('button');
  submitBtn.className = 'adc-btn adc-btn-primary';
  submitBtn.style.minWidth = '180px';
  submitBtn.id = 'adxSubmitBtn';
  submitBtn.textContent = '💳 ' + (isRu ? 'Оплатить и разместить' : 'Pay & Publish');
  submitBtn.onclick = _adxSubmitOrder;
  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);

  modal.appendChild(closeBtn);
  modal.appendChild(title);
  modal.appendChild(textSection);
  modal.appendChild(mediaSection);
  modal.appendChild(btnSection);
  modal.appendChild(previewSection);
  modal.appendChild(dateSection);
  modal.appendChild(durSection);
  modal.appendChild(priceSection);
  modal.appendChild(budgetSection);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Set default date +1h
  var now = new Date(Date.now() + 3600000);
  var dtLocal = now.toISOString().slice(0, 16);
  dateInput.value = dtLocal;

  window._adxSelectedDur = 24;
  _adxAddBtnRow();
};

function _adxModalSection(labelText) {
  var div = document.createElement('div');
  div.className = 'adx-modal-section';
  var label = document.createElement('div');
  label.className = 'adx-modal-label';
  label.textContent = labelText;
  div.appendChild(label);
  return div;
}

window._adxCloseOrderModal = function() {
  var el = document.getElementById('adxOrderOverlay');
  if (el) el.remove();
};

window._adxSelectDur = function(hours) {
  window._adxSelectedDur = hours;
  [24, 48, 72].forEach(function(h) {
    var btn = document.getElementById('adxDur' + h);
    if (btn) btn.className = 'adx-dur-btn' + (h === hours ? ' selected' : '');
  });
  Object.keys(window._adxCart).forEach(function(id) {
    window._adxCart[id].hours = hours;
  });
};

window._adxAddBtnRow = function() {
  var container = document.getElementById('adxBtnRows');
  if (!container) return;
  var isRu = _adxIsRu();
  var row = document.createElement('div');
  row.className = 'adx-btn-row';
  var t1 = document.createElement('input');
  t1.type = 'text';
  t1.className = 'adx-btn-text';
  t1.placeholder = isRu ? 'Текст кнопки' : 'Button text';
  t1.style.flex = '1';
  var t2 = document.createElement('input');
  t2.type = 'url';
  t2.className = 'adx-btn-url';
  t2.placeholder = 'URL';
  t2.style.flex = '1.5';
  var rm = document.createElement('button');
  rm.className = 'adx-btn-remove';
  rm.textContent = '×';
  rm.onclick = function() { row.remove(); };
  row.appendChild(t1);
  row.appendChild(t2);
  row.appendChild(rm);
  container.appendChild(row);
};

window._adxUpdateOrderPreview = function() {
  var textEl = document.getElementById('adxOrderText');
  var mediaEl = document.getElementById('adxOrderMedia');
  var previewEl = document.getElementById('adxPostPreview');
  var countEl = document.getElementById('adxCharCount');
  if (!textEl || !previewEl) return;
  var text = textEl.value;
  if (countEl) countEl.textContent = text.length;
  var mediaUrl = mediaEl ? mediaEl.value : '';
  var imgHtml = '';
  if (mediaUrl && /\.(jpg|jpeg|png|gif|webp)/i.test(mediaUrl)) {
    imgHtml = '<img src="' + _adxEsc(mediaUrl) + '" class="adx-tg-preview-media" onerror="this.style.display=\'none\'">';
  }
  var btnHtml = '';
  document.querySelectorAll('#adxBtnRows .adx-btn-row').forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var label = inputs[0] ? inputs[0].value : '';
    if (label) btnHtml += '<span class="adx-tg-preview-btn">' + _adxEsc(label) + '</span>';
  });
  if (!text && !imgHtml) {
    previewEl.style.color = '#718096';
    previewEl.textContent = _adxIsRu() ? 'Введите текст поста...' : 'Enter post text...';
    return;
  }
  previewEl.style.color = '';
  previewEl.innerHTML = imgHtml +
    '<div>' + _adxEsc(text).replace(/\n/g, '<br>') + '</div>' +
    (btnHtml ? '<div class="adx-tg-preview-btns">' + btnHtml + '</div>' : '');
};

window._adxSubmitOrder = async function() {
  var isRu = _adxIsRu();
  var textEl = document.getElementById('adxOrderText');
  var submitBtn = document.getElementById('adxSubmitBtn');
  var text = textEl ? textEl.value.trim() : '';
  if (!text) { alert(isRu ? 'Введите текст поста' : 'Please enter post text'); return; }
  var keys = Object.keys(window._adxCart);
  var hours = window._adxSelectedDur || 24;
  var dateEl = document.getElementById('adxOrderDate');
  var mediaEl = document.getElementById('adxOrderMedia');

  // Collect per-channel prices (advertiser sets own price)
  var priceErrors = [];
  var channelPrices = {};
  keys.forEach(function(id) {
    var priceInput = document.getElementById('adxPrice_' + id);
    var price = priceInput ? parseFloat(priceInput.value) : 0;
    if (!price || price <= 0) priceErrors.push(window._adxCart[id].channel.title);
    channelPrices[id] = price;
  });
  if (priceErrors.length) { alert((isRu ? 'Укажите цену для каналов:\n' : 'Set price for channels:\n') + priceErrors.join(', ')); return; }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = isRu ? 'Отправляем...' : 'Sending...'; }

  // Collect buttons
  var btns = [];
  document.querySelectorAll('.adx-btn-row').forEach(function(row) {
    var t = row.querySelector('.adx-btn-text');
    var u = row.querySelector('.adx-btn-url');
    if (t && u && t.value && u.value) btns.push({ text: t.value, url: u.value });
  });

  var errors = [], created = 0, totalCharged = 0;
  for (var i = 0; i < keys.length; i++) {
    var chId = keys[i];
    var ch = window._adxCart[chId].channel;
    var price = channelPrices[chId];
    try {
      var resp = await API.post('/api/adx/orders', {
        channel_id: parseInt(chId),
        post_text: text,
        post_media_url: mediaEl ? mediaEl.value : '',
        post_media_type: mediaEl && mediaEl.value ? (mediaEl.value.match(/\.mp4|\.mov/i) ? 'video' : 'photo') : 'none',
        post_buttons: btns,
        placement_hours: hours,
        start_at: dateEl ? new Date(dateEl.value).toISOString() : null,
        price_usd: price
      });
      if (resp.success) { created++; totalCharged += price; }
      else errors.push(ch.title + ': ' + (resp.error || 'error'));
    } catch(e) { errors.push(ch.title + ': ' + e.message); }
  }

  if (created === 0 && errors.length) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '💳 ' + (isRu ? 'Оплатить и разместить' : 'Pay & Publish'); }
    alert((isRu ? 'Ошибки:\n' : 'Errors:\n') + errors.join('\n'));
    return;
  }

  var total = totalCharged;
  _adxCloseOrderModal();
  window._adxCart = {};
  _adxUpdateCart();
  _adxLoadMarketplace();


    var isRu2 = _adxIsRu();
    var succOverlay = document.createElement('div');
    succOverlay.className = 'adx-modal-overlay';
    succOverlay.onclick = function() { succOverlay.remove(); };
    var succModal = document.createElement('div');
    succModal.className = 'adx-modal';
    succModal.style.cssText = 'max-width:420px;text-align:center;padding:40px';
    succModal.innerHTML = '<div style="font-size:52px;margin-bottom:16px">\U0001F389</div>' +
      '<div style="font-size:20px;font-weight:700;color:#48bb78;margin-bottom:12px">' + (isRu2 ? '\u041A\u0430\u043C\u043F\u0430\u043D\u0438\u044F \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u0430!' : 'Campaign launched!') + '</div>' +
      '<div style="color:#9ca3af;font-size:14px;margin-bottom:8px">' + (isRu2 ? '\u0421\u043e\u0437\u0434\u0430\u043d\u043e \u0437\u0430\u043a\u0430\u0437\u043e\u0432: ' : 'Orders created: ') + '<strong style="color:#e2e8f0">' + created + '</strong></div>' +
      '<div style="color:#9ca3af;font-size:14px;margin-bottom:24px">' + (isRu2 ? '\u0418\u0442\u043e\u0433\u043e: ' : 'Total: ') + '<strong style="color:#48bb78;font-size:18px">$' + total + '</strong></div>' +
      (errors.length ? '<div style="color:#f56565;font-size:12px;margin-bottom:16px">\u26A0\uFE0F ' + errors.join('; ') + '</div>' : '') +
      '<div style="color:#718096;font-size:12px;margin-bottom:20px">' + (isRu2 ? '\u041e\u0436\u0438\u0434\u0430\u0439\u0442\u0435 \u043e\u0442\u0432\u0435\u0442\u0430 \u043f\u0430\u0431\u043b\u0438\u0448\u0435\u0440\u043e\u0432.' : 'Waiting for publisher responses.') + '</div>';
    var goBtn = document.createElement('button');
    goBtn.className = 'adc-btn adc-btn-primary';
    goBtn.textContent = isRu2 ? '\u0421\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u0437\u0430\u043a\u0430\u0437\u044b \u2192' : 'View orders \u2192';
    goBtn.onclick = function() { succOverlay.remove(); _adxSubTab('my-orders'); };
    succModal.appendChild(goBtn);
    succOverlay.appendChild(succModal);
    document.body.appendChild(succOverlay);

// ── Channel detail modal ───────────────────────────────────────── 
};
window._adxChannelDetail = function(channelId) {
  var ch = window._adxChannelCache && window._adxChannelCache[channelId];
  if (!ch) {
    API.get('/api/adx/marketplace/' + channelId).then(function(result) {
      if (!window._adxChannelCache) window._adxChannelCache = {};
      if (result.channel) {
        window._adxChannelCache[result.channel.id] = result.channel;
        window._adxChannelDetail(result.channel.id);
      } else {
        alert('Channel not found');
      }
    }).catch(function(e) { alert(e.message || 'Channel not found'); });
    return;
  }
  var isRu = _adxIsRu();
  var inCart = _adxIsInCart(ch.id);
  var r = Math.round(ch.rating || 5);
  var stars = '★'.repeat(r) + '☆'.repeat(5 - r);

  var overlay = document.createElement('div');
  overlay.className = 'adx-modal-overlay adx-detail-modal';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var modal = document.createElement('div');
  modal.className = 'adx-modal';
  modal.style.maxWidth = '540px';

  var closeBtn = document.createElement('button');
  closeBtn.className = 'adx-modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = function() { overlay.remove(); };

  var titleEl = document.createElement('div');
  titleEl.className = 'adx-modal-title';
  titleEl.textContent = _adxCatIcon(ch.categories[0]) + ' ' + ch.title;

  var profileRow = document.createElement('div');
  profileRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:20px';
  var ava = document.createElement('div');
  ava.className = 'adx-channel-avatar';
  ava.style.cssText = 'width:56px;height:56px;font-size:24px';
  ava.textContent = (ch.title || '?')[0].toUpperCase();
  var profInfo = document.createElement('div');
  profInfo.innerHTML = '<div style="color:#9ca3af;font-size:13px">' + (ch.username ? '@' + ch.username : '') + '</div>' +
    '<div style="color:#f6c90e;font-size:15px;margin-top:4px">' + stars +
    ' <span style="color:#e2e8f0">' + (ch.rating || 5).toFixed(1) + '</span>' +
    '<span class="adx-orders-count">' + ch.total_orders + (isRu ? ' заказов' : ' orders') + '</span></div>';
  profileRow.appendChild(ava);
  profileRow.appendChild(profInfo);

  // Description
  if (ch.ch_description || ch.description) {
    var descBlock = document.createElement('div');
    descBlock.style.cssText = 'background:rgba(255,255,255,0.04);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#cbd5e0;line-height:1.6';
    descBlock.textContent = ch.ch_description || ch.description || '';
    modal.appendChild(descBlock);
  }

  // Verified badge
  if (ch.ch_is_verified) {
    var verBadge = document.createElement('div');
    verBadge.style.cssText = 'display:inline-block;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.4);border-radius:20px;padding:3px 10px;font-size:12px;color:#93c5fd;margin-bottom:12px';
    verBadge.textContent = '✓ ' + (isRu ? 'Верифицированный канал' : 'Verified Channel');
    modal.appendChild(verBadge);
  }

  var statsGrid = document.createElement('div');
  statsGrid.className = 'adx-detail-stats-grid';
  statsGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  [
    [_adxFormatNum(ch.member_count), '👥 ' + (isRu?'Подписчики':'Subscribers')],
    [(ch.engagement_rate||0).toFixed(1) + '%', '📊 ' + (isRu?'Вовлечённость':'Engagement')],
    [(ch.avg_views_per_post ? _adxFormatNum(ch.avg_views_per_post) : 'N/A'), '👁 ' + (isRu?'Просм./пост':'Views/post')],
    [(ch.posts_per_day ? ch.posts_per_day.toFixed(1) + '/д' : 'N/A'), '📝 ' + (isRu?'Постов/день':'Posts/day')],
    [(ch.accept_rate || 100) + '%', '✅ ' + (isRu?'Принимает':'Accept rate')],
    [(ch.lang||'—').toUpperCase(), '🌐 ' + (isRu?'Язык':'Language')],
    [ch.total_orders || 0, '🛒 ' + (isRu?'Заказов':'Orders')],
    [(ch.rating||5).toFixed(1) + '★', '⭐ ' + (isRu?'Рейтинг':'Rating')],
    [ch.member_count_7d_ago ? (ch.member_count - ch.member_count_7d_ago > 0 ? '+' : '') + _adxFormatNum(ch.member_count - ch.member_count_7d_ago) : 'N/A', '📈 ' + (isRu?'Рост 7д':'Growth 7d')]
  ].forEach(function(pair) {
    var box = document.createElement('div');
    box.className = 'adx-detail-stat-box';
    box.innerHTML = '<div class="adx-detail-stat-val">' + pair[0] + '</div><div class="adx-detail-stat-label">' + pair[1] + '</div>';
    statsGrid.appendChild(box);
  });

  var catsSection = _adxModalSection(isRu ? 'Категории' : 'Categories');
  var catsWrap = document.createElement('div');
  catsWrap.className = 'adx-categories';
  catsWrap.style.padding = '0';
  (ch.categories || []).forEach(function(c) {
    var tag = document.createElement('span');
    tag.className = 'adx-cat-tag';
    tag.textContent = _adxCatIcon(c) + ' ' + _adxCatName(c);
    catsWrap.appendChild(tag);
  });
  catsSection.appendChild(catsWrap);

  var priceSection = _adxModalSection(isRu ? 'Прайс-лист' : 'Pricing');
  var priceRow = document.createElement('div');
  priceRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap';
  [[24, ch.price_24h],[48, ch.price_48h],[72, ch.price_72h]].forEach(function(pair) {
    if (!pair[1]) return;
    var box = document.createElement('div');
    box.style.cssText = 'background:rgba(72,187,120,0.1);border:1px solid rgba(72,187,120,0.2);border-radius:10px;padding:12px 20px;text-align:center';
    box.innerHTML = '<div style="font-size:20px;font-weight:700;color:#48bb78">$' + pair[1] + '</div>' +
      '<div style="font-size:12px;color:#9ca3af;margin-top:4px">' + pair[0] + ' ч</div>';
    priceRow.appendChild(box);
  });
  priceSection.appendChild(priceRow);

  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:8px';
  var closeBtnF = document.createElement('button');
  closeBtnF.className = 'adc-btn';
  closeBtnF.textContent = isRu ? 'Закрыть' : 'Close';
  closeBtnF.onclick = function() { overlay.remove(); };
  var cartBtnF = document.createElement('button');
  cartBtnF.className = 'adc-btn adc-btn-primary adx-cart-btn' + (inCart ? ' in-cart' : '');
  cartBtnF.textContent = inCart ? (isRu ? '✓ В корзине' : '✓ In cart') : (isRu ? '+ В корзину' : '+ Add to cart');
  (function(chId) {
    cartBtnF.onclick = function() { _adxCartToggle(chId); overlay.remove(); };
  })(ch.id);
  footer.appendChild(closeBtnF);
  footer.appendChild(cartBtnF);

  modal.appendChild(closeBtn);
  modal.appendChild(titleEl);
  modal.appendChild(profileRow);
  modal.appendChild(statsGrid);
  modal.appendChild(catsSection);
  modal.appendChild(priceSection);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
};

// ── My Channels ──────────────────────────────────────────────────
function _adxRenderMyChannels(el) {
  var isRu = _adxIsRu();
  el.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af">Loading...</div>';
  API.get('/api/adx/channels/my').then(function(data) {
    window._adxMyChannelCache = {};
    (data.channels || []).forEach(function(c) { window._adxMyChannelCache[c.id] = c; });
    _adxRenderMyChannelsList(el, data.channels || []);
  }).catch(function(e) {
    el.innerHTML = '<div style="color:#f56565;padding:20px;text-align:center">' + (e.message || 'Error') + '</div>';
  });
}
function _adxRenderMyChannelsList(el, channels) {
  var isRu = _adxIsRu();
  var statusMap = {
    active:  ['🟢', isRu ? 'В сети' : 'Online'],
    pending: ['🟡', isRu ? 'Ожидает' : 'Pending'],
    frozen:  ['🔴', isRu ? 'Заморожен' : 'Frozen']
  };

  el.innerHTML = '';
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px';
  var h3 = document.createElement('h3');
  h3.style.cssText = 'margin:0;color:#e2e8f0';
  h3.textContent = isRu ? '📢 Мои каналы в бирже' : '📢 My Channels in Exchange';
  var addBtn = document.createElement('button');
  addBtn.className = 'adc-btn adc-btn-primary';
  addBtn.textContent = '+ ' + (isRu ? 'Добавить канал' : 'Add Channel');
  addBtn.onclick = window._adxDirectAddChannel;
  header.appendChild(h3);
  header.appendChild(addBtn);
  el.appendChild(header);

  if (!channels.length) {
    var empty = document.createElement('div');
    empty.className = 'adx-empty';
    empty.innerHTML = '<div class="adx-empty-icon">📢</div>' +
      '<div class="adx-empty-title">' + (isRu ? 'Нет каналов в бирже' : 'No channels in the exchange') + '</div>' +
      '<div class="adx-empty-sub">' + (isRu ? 'Добавьте свой канал, чтобы получать заказы на рекламу' : 'Add your channel to start receiving ad orders') + '</div>';
    el.appendChild(empty);
    return;
  }

  channels.forEach(function(ch) {
    var st = statusMap[ch.status] || ['⚪', '—'];
    var card = document.createElement('div');
    card.className = 'adx-my-channel-card';

    var ava = document.createElement('div');
    ava.className = 'adx-my-ch-avatar';
    ava.textContent = (ch.title || '?')[0].toUpperCase();

    var info = document.createElement('div');
    info.className = 'adx-my-ch-info';
    info.innerHTML = '<div class="adx-my-ch-name">' + _adxEsc(ch.title) + '</div>' +
      '<div class="adx-my-ch-handle">' + (ch.username ? '@' + ch.username : '') + '</div>' +
      '<div style="margin-top:6px">' + st[0] + ' <span style="font-size:12px;color:#9ca3af">' + st[1] + '</span></div>';

    var stats = document.createElement('div');
    stats.className = 'adx-my-ch-stats';
    stats.innerHTML = '<div class="adx-my-ch-stat"><div class="adx-my-ch-stat-val">' + _adxFormatNum(ch.member_count) + '</div><div class="adx-my-ch-stat-label">👥</div></div>' +
      '<div class="adx-my-ch-stat"><div class="adx-my-ch-stat-val">$' + ch.price_24h + '</div><div class="adx-my-ch-stat-label">24ч</div></div>';

    card.appendChild(ava);
    card.appendChild(info);
    card.appendChild(stats);

    if (ch.pending_orders) {
      var pendingBadge = document.createElement('span');
      pendingBadge.className = 'adx-pending-badge';
      pendingBadge.textContent = '⏳ ' + ch.pending_orders + (isRu ? ' заказов' : ' orders');
      card.appendChild(pendingBadge);
    }

    var earnBadge = document.createElement('span');
    earnBadge.className = 'adx-earnings-badge';
    earnBadge.textContent = '$' + ch.total_earnings + (isRu ? ' заработано' : ' earned');
    card.appendChild(earnBadge);

    var actions = document.createElement('div');
    actions.className = 'adx-my-ch-actions';
    var editBtn = document.createElement('button');
    editBtn.className = 'adx-detail-btn';
    editBtn.textContent = isRu ? 'Изменить' : 'Edit';
    (function(chId) { editBtn.onclick = function() { _adxOpenEditChannelModal(chId); }; })(ch.id);
    actions.appendChild(editBtn);
    card.appendChild(actions);

    el.appendChild(card);
  });
}

window._adxOpenRegisterModal = async function() {
  try {
  var isRu = _adxIsRu();
  var overlay = document.createElement('div');
  overlay.className = 'adx-modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  var modal = document.createElement('div');
  modal.className = 'adx-modal';
  modal.style.cssText = 'max-width:560px;width:100%';

  var closeBtn = document.createElement('button');
  closeBtn.className = 'adx-modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = function() { overlay.remove(); };

  modal.appendChild(closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Step indicator
  function renderStep(step, sources) {
    modal.innerHTML = '';
    modal.appendChild(closeBtn);

    // Steps header
    var stepsBar = document.createElement('div');
    stepsBar.style.cssText = 'display:flex;gap:0;margin-bottom:24px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)';
    [{n:1,t:isRu?'Канал':'Channel'},{n:2,t:isRu?'Настройки':'Settings'},{n:3,t:isRu?'Цены':'Pricing'}].forEach(function(s) {
      var d = document.createElement('div');
      d.style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;transition:all .2s;' +
        (s.n === step ? 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff' :
         s.n < step ? 'background:rgba(72,187,120,0.2);color:#68d391' : 'background:rgba(255,255,255,0.04);color:#718096');
      d.innerHTML = (s.n < step ? '✓ ' : s.n + '. ') + s.t;
      stepsBar.appendChild(d);
    });
    modal.appendChild(stepsBar);

    if (step === 1) renderStep1(sources);
    else if (step === 2) renderStep2(sources);
    else if (step === 3) renderStep3(sources);
  }

  // Step 1: Choose channel
  function renderStep1(sources) {
    var title = document.createElement('div');
    title.className = 'adx-modal-title';
    title.innerHTML = '📢 ' + (isRu ? 'Выберите канал для монетизации' : 'Select a channel to monetize');
    modal.appendChild(title);

    if (!sources || !sources.length) {
      // Direct registration form — no Ad Center required
      var directInstr = document.createElement('div');
      directInstr.style.cssText = 'background:rgba(72,187,120,0.08);border:1px solid rgba(72,187,120,0.25);border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:13px;color:#9ae6b4';
      directInstr.innerHTML = '<b>📋 ' + (isRu ? 'Как добавить канал:' : 'How to add your channel:') + '</b>' +
        '<ol style="margin:8px 0 0 16px;padding:0;line-height:2;color:#d1d5db">' +
        '<li>' + (isRu ? 'Добавьте <b style="color:#a5b4fc">@ARSENALPROFIbot</b> администратором вашего канала' : 'Add <b style="color:#a5b4fc">@ARSENALPROFIbot</b> as admin to your channel') + '</li>' +
        '<li>' + (isRu ? 'Введите @username канала ниже' : 'Enter your channel @username below') + '</li>' +
        '<li>' + (isRu ? 'Установите цену и нажмите «Добавить»' : 'Set a price and click Add Channel') + '</li>' +
        '</ol>';

      var fChatId = document.createElement('div');
      fChatId.className = 'adc-form-group';
      fChatId.innerHTML = '<label>' + (isRu ? 'Username канала' : 'Channel username') + '</label>';
      var inpChatId = document.createElement('input');
      inpChatId.type = 'text';
      inpChatId.className = 'adc-input';
      inpChatId.placeholder = '@mychannel';
      inpChatId.id = 'adxDirectChatId';
      fChatId.appendChild(inpChatId);

      var fPrice = document.createElement('div');
      fPrice.className = 'adc-form-group';
      fPrice.innerHTML = '<label>' + (isRu ? 'Цена за 24 часа ($)' : 'Price per 24h ($)') + '</label>';
      var inpPrice = document.createElement('input');
      inpPrice.type = 'number';
      inpPrice.className = 'adc-input';
      inpPrice.placeholder = '5';
      inpPrice.min = '1';
      inpPrice.id = 'adxDirectPrice';
      fPrice.appendChild(inpPrice);

      var submitDirectBtn = document.createElement('button');
      submitDirectBtn.className = 'adc-btn adc-btn-primary';
      submitDirectBtn.style.cssText = 'width:100%;margin-top:8px';
      submitDirectBtn.textContent = isRu ? 'Добавить канал' : 'Add Channel';
      submitDirectBtn.onclick = async function() {
        var chatId = (document.getElementById('adxDirectChatId') || {}).value.trim();
        var price = parseFloat((document.getElementById('adxDirectPrice') || {}).value);
        if (!chatId) { alert(isRu ? 'Введите @username канала' : 'Enter channel @username'); return; }
        if (!chatId.startsWith('@')) chatId = '@' + chatId;
        if (!price || price < 1) { alert(isRu ? 'Укажите цену (мин $1)' : 'Enter price (min $1)'); return; }
        submitDirectBtn.disabled = true;
        submitDirectBtn.textContent = isRu ? 'Проверяем...' : 'Checking...';
        try {
          var r = await API.post('/api/adx/channels/register-direct', {
            chat_id: chatId,
            language: (window.currentLang || 'ru'),
            price_24h: price,
            price_48h: Math.round(price * 1.7 * 100) / 100,
            price_72h: Math.round(price * 2.2 * 100) / 100
          });
          if (r.success) {
            modal.innerHTML = '';
            modal.appendChild(closeBtn);
            var isActive = r.status === 'active';
            modal.innerHTML += '<div style="text-align:center;padding:40px 20px"><div style="font-size:56px;margin-bottom:16px">' + (isActive ? '✅' : '🎉') + '</div>' +
              '<h3 style="color:#48bb78;margin:0 0 12px;font-size:20px">' +
              (isActive ? (isRu ? 'Канал добавлен и активен!' : 'Channel added and active!') :
                          (isRu ? 'Заявка отправлена!' : 'Application Submitted!')) + '</h3>' +
              '<p style="color:#9ca3af;font-size:14px;margin:0 0 8px">' + chatId + '</p>' +
              '<p style="color:#9ca3af;font-size:13px;margin:0 0 24px">' +
              (isActive ? (isRu ? 'Ваш канал добавлен в биржу. Рекламодатели уже могут его видеть.' : 'Your channel is live in the exchange.') :
                          (isRu ? 'Канал будет проверен в течение 24 часов.' : 'Channel will be reviewed within 24 hours.')) + '</p></div>';
            var okBtn = document.createElement('button');
            okBtn.className = 'adc-btn adc-btn-primary';
            okBtn.style.cssText = 'width:90%;margin:0 5%';
            okBtn.textContent = isRu ? 'Отлично!' : 'Great!';
            okBtn.onclick = function() { overlay.remove(); if (isActive) window._adxSubTabGo && window._adxSubTabGo('my-channels'); };
            modal.appendChild(okBtn);
          } else {
            alert(r.error || 'Error');
            submitDirectBtn.disabled = false;
            submitDirectBtn.textContent = isRu ? 'Добавить канал' : 'Add Channel';
          }
        } catch(e) {
          alert(e.message);
          submitDirectBtn.disabled = false;
          submitDirectBtn.textContent = isRu ? 'Добавить канал' : 'Add Channel';
        }
      };

      modal.appendChild(directInstr);
      modal.appendChild(fChatId);
      modal.appendChild(fPrice);
      modal.appendChild(submitDirectBtn);
      return;
    }

    var grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-direction:column;gap:10px;max-height:320px;overflow-y:auto;padding-right:4px;margin-bottom:20px';

    sources.forEach(function(src) {
      var card = document.createElement('div');
      var isSelected = window._adxRegSelectedSource === src.id;
      card.style.cssText = 'display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;cursor:pointer;transition:all .2s;border:2px solid ' +
        (isSelected ? '#667eea' : 'rgba(255,255,255,0.08)') + ';background:' +
        (isSelected ? 'rgba(102,126,234,0.12)' : 'rgba(255,255,255,0.03)');
      card.onclick = function() {
        window._adxRegSelectedSource = src.id;
        renderStep(1, sources);
      };

      var avatar = document.createElement('div');
      avatar.style.cssText = 'width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden';
      if (src.avatar_url) {
        var img = document.createElement('img');
        img.src = src.avatar_url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        img.onerror = function() { avatar.textContent = (src.title||'?')[0].toUpperCase(); };
        avatar.appendChild(img);
      } else {
        avatar.textContent = (src.title||'?')[0].toUpperCase();
      }

      var info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';
      info.innerHTML = '<div style="font-weight:600;font-size:14px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (src.title||'—') + '</div>' +
        '<div style="font-size:12px;color:#718096;margin-top:2px">' + (src.username ? '@'+src.username : '') +
        (src.member_count ? ' · <b style="color:#48bb78">' + _adxFormatNum(src.member_count) + '</b> ' + (isRu?'подписчиков':'subscribers') : '') + '</div>';

      var check = document.createElement('div');
      check.style.cssText = 'width:22px;height:22px;border-radius:50%;border:2px solid ' +
        (isSelected ? '#667eea' : 'rgba(255,255,255,0.2)') + ';background:' +
        (isSelected ? '#667eea' : 'transparent') + ';display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;flex-shrink:0';
      if (isSelected) check.textContent = '✓';

      card.appendChild(avatar);
      card.appendChild(info);
      card.appendChild(check);
      grid.appendChild(card);
    });
    modal.appendChild(grid);

    var nextBtn = document.createElement('button');
    nextBtn.className = 'adc-btn adc-btn-primary';
    nextBtn.style.cssText = 'width:100%';
    nextBtn.disabled = !window._adxRegSelectedSource;
    nextBtn.textContent = isRu ? 'Далее →' : 'Next →';
    nextBtn.onclick = function() { if (window._adxRegSelectedSource) renderStep(2, sources); };
    modal.appendChild(nextBtn);
  }

  // Step 2: Categories, language, description
  function renderStep2(sources) {
    var title = document.createElement('div');
    title.className = 'adx-modal-title';
    title.innerHTML = '🗂 ' + (isRu ? 'Категории и описание' : 'Categories & Description');
    modal.appendChild(title);

    // Language
    var f0 = document.createElement('div');
    f0.className = 'adc-form-group';
    f0.innerHTML = '<label>' + (isRu ? 'Язык аудитории' : 'Audience Language') + '</label>';
    var langSel = document.createElement('select');
    langSel.id = 'adxRegLang';
    langSel.className = 'adc-select';
    [['ru','🇷🇺 Русский'],['en','🇬🇧 English'],['es','🇪🇸 Español'],['de','🇩🇪 Deutsch'],['fr','🇫🇷 Français'],['uk','🇺🇦 Українська'],['other','Other']].forEach(function(l) {
      var o = document.createElement('option');
      o.value = l[0]; o.textContent = l[1];
      if (l[0] === (isRu ? 'ru' : 'en')) o.selected = true;
      langSel.appendChild(o);
    });
    f0.appendChild(langSel);
    modal.appendChild(f0);

    // Description
    var f2 = document.createElement('div');
    f2.className = 'adc-form-group';
    f2.innerHTML = '<label>' + (isRu ? 'Описание для рекламодателей' : 'Description for advertisers') + '</label>';
    var desc = document.createElement('textarea');
    desc.id = 'adxRegDesc';
    desc.className = 'adc-textarea';
    desc.rows = 3;
    desc.placeholder = isRu ? 'Расскажите рекламодателям о вашем канале: тематика, аудитория, гео...' : 'Tell advertisers about your channel: topic, audience, geo...';
    if (window._adxRegDesc) desc.value = window._adxRegDesc;
    f2.appendChild(desc);
    modal.appendChild(f2);

    // Categories
    var f3 = document.createElement('div');
    f3.className = 'adc-form-group';
    f3.innerHTML = '<label style="margin-bottom:10px;display:block">' + (isRu ? 'Категории (выберите до 3)' : 'Categories (up to 3)') + '</label>';
    var catsGrid = document.createElement('div');
    catsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px';
    Object.keys(ADX_CAT_ICONS).forEach(function(c) {
      var label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:13px;color:#e0e0e0;cursor:pointer;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);transition:all .15s';
      label.onmouseover = function() { label.style.borderColor = '#667eea'; };
      label.onmouseout = function() { if (!cb.checked) label.style.borderColor = 'rgba(255,255,255,0.08)'; };
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'adx-cat-checkbox';
      cb.value = c;
      cb.style.accentColor = '#667eea';
      if (window._adxRegCats && window._adxRegCats.includes(c)) cb.checked = true;
      cb.onchange = function() {
        label.style.borderColor = cb.checked ? '#667eea' : 'rgba(255,255,255,0.08)';
        label.style.background = cb.checked ? 'rgba(102,126,234,0.1)' : '';
        // Max 3
        var checked = catsGrid.querySelectorAll('.adx-cat-checkbox:checked');
        if (checked.length > 3) cb.checked = false;
      };
      label.appendChild(cb);
      label.appendChild(document.createTextNode(_adxCatIcon(c) + ' ' + _adxCatName(c)));
      catsGrid.appendChild(label);
    });
    f3.appendChild(catsGrid);
    modal.appendChild(f3);

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;margin-top:20px';
    var backBtn = document.createElement('button');
    backBtn.className = 'adc-btn';
    backBtn.textContent = isRu ? '← Назад' : '← Back';
    backBtn.onclick = function() { renderStep(1, sources); };
    var nextBtn = document.createElement('button');
    nextBtn.className = 'adc-btn adc-btn-primary';
    nextBtn.style.flex = '1';
    nextBtn.textContent = isRu ? 'Далее →' : 'Next →';
    nextBtn.onclick = function() {
      window._adxRegDesc = document.getElementById('adxRegDesc').value;
      window._adxRegLang = document.getElementById('adxRegLang').value;
      window._adxRegCats = Array.from(catsGrid.querySelectorAll('.adx-cat-checkbox:checked')).map(function(cb) { return cb.value; });
      if (!window._adxRegCats.length) { alert(isRu ? 'Выберите хотя бы одну категорию' : 'Select at least one category'); return; }
      renderStep(3, sources);
    };
    btns.appendChild(backBtn);
    btns.appendChild(nextBtn);
    modal.appendChild(btns);
  }

  // Step 3: Pricing
  function renderStep3(sources) {
    var src = sources.find(function(s) { return s.id === window._adxRegSelectedSource; });
    var title = document.createElement('div');
    title.className = 'adx-modal-title';
    title.innerHTML = '💰 ' + (isRu ? 'Установите цены' : 'Set Your Prices');
    modal.appendChild(title);

    // Recommended price calculation based on channel member_count
    var memberCount = (src && src.member_count) || 0;
    var recPrices = (function(mc) {
      var b;
      if (mc < 500) b = 2;
      else if (mc < 1000) b = 4;
      else if (mc < 3000) b = 7;
      else if (mc < 5000) b = 10;
      else if (mc < 10000) b = 15;
      else if (mc < 30000) b = 25;
      else if (mc < 50000) b = 40;
      else if (mc < 100000) b = 60;
      else if (mc < 300000) b = 100;
      else if (mc < 1000000) b = 180;
      else b = 300;
      return { 24: b, 48: Math.round(b * 1.7), 72: Math.round(b * 2.2) };
    })(memberCount);

    // Price hint with channel-specific recommendation
    var hint = document.createElement('div');
    hint.style.cssText = 'background:rgba(72,187,120,0.08);border:1px solid rgba(72,187,120,0.2);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#9ae6b4';
    var mcStr = memberCount >= 1000000 ? (memberCount/1000000).toFixed(1)+'M' : (memberCount >= 1000 ? Math.round(memberCount/1000)+'K' : memberCount);
    hint.innerHTML = memberCount > 0
      ? (isRu
          ? '💡 <b>Рекомендуемая цена</b> для канала с <b>' + mcStr + '</b> подписчиков: <b style="color:#68d391">$' + recPrices[24] + '</b>/24ч · <b style="color:#68d391">$' + recPrices[48] + '</b>/48ч · <b style="color:#68d391">$' + recPrices[72] + '</b>/72ч. Вы получаете <b>90%</b> от каждого заказа.'
          : '💡 <b>Recommended price</b> for a channel with <b>' + mcStr + '</b> subscribers: <b style="color:#68d391">$' + recPrices[24] + '</b>/24h · <b style="color:#68d391">$' + recPrices[48] + '</b>/48h · <b style="color:#68d391">$' + recPrices[72] + '</b>/72h. You receive <b>90%</b> of each order.')
      : (isRu
          ? '💡 <b>Совет:</b> средняя цена в нашей сети — $15–30 за 24ч для каналов с 1K–10K подписчиков. 90% от стоимости заказа поступает вам мгновенно.'
          : '💡 <b>Tip:</b> average price in our network is $15–30 per 24h for 1K–10K subscriber channels. 90% of order price goes to you instantly.');
    modal.appendChild(hint);

    var priceWrap = document.createElement('div');
    priceWrap.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px';
    [[24,'adxRegP24',recPrices[24]],[48,'adxRegP48',recPrices[48]],[72,'adxRegP72',recPrices[72]]].forEach(function(pair) {
      var box = document.createElement('div');
      box.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;text-align:center';
      box.innerHTML = '<div style="font-size:12px;color:#9ca3af;margin-bottom:8px">' + pair[0] + (isRu ? ' часов' : ' hours') + '</div>';
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.id = pair[1];
      inp.min = '1';
      inp.placeholder = '$' + pair[2];
      inp.value = window['_adxRegP' + pair[0]] || pair[2] || '';
      inp.style.cssText = 'width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;padding:8px;color:#fff;text-align:center;font-size:16px;font-weight:700;box-sizing:border-box';
      inp.onfocus = function() { inp.style.borderColor = '#667eea'; };
      inp.onblur = function() { inp.style.borderColor = 'rgba(255,255,255,0.15)'; };
      inp.oninput = function() {
        var v = parseFloat(inp.value);
        window['_adxRegP' + pair[0]] = v || '';
        earn.textContent = v ? '$' + (v * 0.9).toFixed(2) : '—';
      };
      var earn = document.createElement('div');
      earn.style.cssText = 'font-size:11px;color:#48bb78;margin-top:6px';
      earn.textContent = inp.value ? '$' + (parseFloat(inp.value) * 0.9).toFixed(2) : (isRu ? 'ваш доход' : 'your earnings');
      box.appendChild(inp);
      box.appendChild(earn);
      priceWrap.appendChild(box);
    });
    modal.appendChild(priceWrap);

    // Terms note
    var terms = document.createElement('div');
    terms.style.cssText = 'font-size:12px;color:#718096;margin-bottom:20px;line-height:1.6';
    terms.innerHTML = isRu ?
      '📋 После подачи заявки наш администратор проверит канал в течение 24 часов. Вы получите уведомление в Telegram.' :
      '📋 After submitting, our admin will review your channel within 24 hours. You will receive a Telegram notification.';
    modal.appendChild(terms);

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px';
    var backBtn = document.createElement('button');
    backBtn.className = 'adc-btn';
    backBtn.textContent = isRu ? '← Назад' : '← Back';
    backBtn.onclick = function() { renderStep(2, sources); };
    var submitBtn = document.createElement('button');
    submitBtn.className = 'adc-btn adc-btn-primary';
    submitBtn.style.flex = '1';
    submitBtn.textContent = isRu ? '🚀 Подать заявку' : '🚀 Submit Application';
    submitBtn.onclick = async function() {
      var p24 = parseFloat(document.getElementById('adxRegP24').value);
      if (!p24 || p24 < 1) { alert(isRu ? 'Укажите цену за 24 часа' : 'Enter price for 24 hours'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = isRu ? 'Отправляем...' : 'Submitting...';
      try {
        var r = await API.post('/api/adx/channels/register', {
          source_id: window._adxRegSelectedSource,
          categories: window._adxRegCats || [],
          language: window._adxRegLang || 'ru',
          description: window._adxRegDesc || '',
          price_24h: p24,
          price_48h: parseFloat(document.getElementById('adxRegP48').value) || p24 * 1.7,
          price_72h: parseFloat(document.getElementById('adxRegP72').value) || p24 * 2.2
        });
        if (r.success) {
          modal.innerHTML = '';
          modal.appendChild(closeBtn);
          modal.innerHTML += '<div style="text-align:center;padding:40px 20px"><div style="font-size:56px;margin-bottom:16px">🎉</div>' +
            '<h3 style="color:#48bb78;margin:0 0 12px;font-size:20px">' + (isRu ? 'Заявка отправлена!' : 'Application Submitted!') + '</h3>' +
            '<p style="color:#9ca3af;font-size:14px;margin:0 0 24px">' +
            (isRu ? 'Ваш канал будет проверен в течение 24 часов. Статус можно отслеживать в разделе <b>Мои каналы</b>.' :
             'Your channel will be reviewed within 24 hours. Track status in <b>My Channels</b>.') + '</p></div>';
          var okBtn = document.createElement('button');
          okBtn.className = 'adc-btn adc-btn-primary';
          okBtn.style.cssText = 'width:90%;margin:0 5%';
          okBtn.textContent = isRu ? '✓ Отлично!' : '✓ Great!';
          okBtn.onclick = function() {
            overlay.remove();
            window._adxSubTabGo && window._adxSubTabGo('my-channels');
            window._adxRegSelectedSource = null; window._adxRegCats = null;
          };
          modal.appendChild(okBtn);
          // Reset state
          window._adxRegSelectedSource = null; window._adxRegCats = null;
          window._adxRegDesc = ''; window._adxRegLang = null;
        } else {
          alert(r.error || 'Error');
          submitBtn.disabled = false;
          submitBtn.textContent = isRu ? '🚀 Подать заявку' : '🚀 Submit Application';
        }
      } catch(e) {
        alert(e.message);
        submitBtn.disabled = false;
        submitBtn.textContent = isRu ? '🚀 Подать заявку' : '🚀 Submit Application';
      }
    };
    btns.appendChild(backBtn);
    btns.appendChild(submitBtn);
    modal.appendChild(btns);
  }

  // Load available sources
  modal.innerHTML = '<div style="text-align:center;padding:40px;color:#718096">' + (isRu ? 'Загрузка...' : 'Loading...') + '</div>';
  try {
    var r = await API.get('/api/adx/channels/my');
    var sources = r.available_sources || [];
    renderStep(1, sources);
  } catch(e) {
    modal.innerHTML = '<div style="padding:20px;color:#fc8181">Error: ' + e.message + '</div>';
  }
  } catch(outerErr) {
    // Visible error for debugging — shows red banner at top of page
    console.error('[ADX RegisterModal] Error:', outerErr);
    var errBanner = document.createElement('div');
    errBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;padding:16px 20px;font-size:14px;font-family:monospace;cursor:pointer';
    errBanner.textContent = '[ADX Debug] ' + outerErr.name + ': ' + outerErr.message + ' (line: ' + (outerErr.stack ? outerErr.stack.split('\n')[1] : '?') + ')';
    errBanner.onclick = function() { errBanner.remove(); };
    document.body.appendChild(errBanner);
  }
}
;

window._adxSubmitRegisterChannel = async function() {
  var isRu = _adxIsRu();
  var username = (document.getElementById('adxRegUsername') || {}).value.replace('@','').trim();
  var p24 = parseFloat((document.getElementById('adxRegP24') || {}).value) || 0;
  var p48 = parseFloat((document.getElementById('adxRegP48') || {}).value) || 0;
  var p72 = parseFloat((document.getElementById('adxRegP72') || {}).value) || 0;
  var desc = (document.getElementById('adxRegDesc') || {}).value || '';
  var lang = (document.getElementById('adxRegLang') || {}).value || 'ru';
  var cats = [];
  document.querySelectorAll('.adx-cat-checkbox:checked').forEach(function(cb) { cats.push(cb.value); });
  if (!username || !p24) {
    alert(isRu ? 'Заполните обязательные поля (канал и цена 24ч)' : 'Fill in required fields (channel and 24h price)');
    return;
  }
  var submitBtn = document.getElementById('adxRegSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '...'; }
  try {
    var result = await API.post('/api/adx/channels/register', {
      username: username,
      price_24h: p24,
      price_48h: p48 || null,
      price_72h: p72 || null,
      description: desc,
      lang: lang,
      categories: cats
    });
    var overlay = document.querySelector('.adx-modal-overlay');
    if (overlay) overlay.remove();
    alert(isRu ? 'Канал отправлен на модерацию. После проверки он появится в бирже.' : 'Channel submitted for moderation. After review it will appear in the exchange.');
    _adxSubTab('my-channels');
  } catch(e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isRu ? 'Отправить' : 'Submit'; }
    alert((isRu ? 'Ошибка: ' : 'Error: ') + e.message);
  }
};

window._adxOpenEditChannelModal = function(channelId) {
  var isRu = _adxIsRu();
  var ch = window._adxMyChannelCache && window._adxMyChannelCache[channelId];
  if (!ch) { alert(isRu ? 'Канал не найден' : 'Channel not found'); return; }

  var overlay = document.createElement('div');
  overlay.className = 'adx-modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var modal = document.createElement('div');
  modal.className = 'adx-modal';
  modal.style.maxWidth = '440px';

  var closeBtn = document.createElement('button');
  closeBtn.className = 'adx-modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = function() { overlay.remove(); };

  var title = document.createElement('div');
  title.className = 'adx-modal-title';
  title.textContent = '✏️ ' + ch.title;

  var form = document.createElement('div');
  form.className = 'adx-reg-form';
  [[24, ch.price_24h, 'adxEditP24'],[48, ch.price_48h||'', 'adxEditP48'],[72, ch.price_72h||'', 'adxEditP72']].forEach(function(pair) {
    var f = document.createElement('div');
    var l = document.createElement('label');
    l.textContent = (isRu ? 'Цена ' : 'Price ') + pair[0] + (isRu ? 'ч ($)' : 'h ($)');
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.id = pair[2];
    inp.value = pair[1];
    inp.min = '1';
    f.appendChild(l);
    f.appendChild(inp);
    form.appendChild(f);
  });

  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:20px';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'adc-btn';
  cancelBtn.textContent = isRu ? 'Отмена' : 'Cancel';
  cancelBtn.onclick = function() { overlay.remove(); };
  var saveBtn = document.createElement('button');
  saveBtn.className = 'adc-btn adc-btn-primary';
  saveBtn.textContent = isRu ? 'Сохранить' : 'Save';
  saveBtn.onclick = function() {
    var p24 = parseFloat((document.getElementById('adxEditP24')||{}).value) || 0;
    var p48 = parseFloat((document.getElementById('adxEditP48')||{}).value) || 0;
    var p72 = parseFloat((document.getElementById('adxEditP72')||{}).value) || 0;
    if (!p24) { alert(isRu ? 'Укажите цену за 24ч' : 'Set price for 24h'); return; }
    saveBtn.disabled = true;
    API.put('/api/adx/channels/' + channelId, { price_24h: p24, price_48h: p48 || null, price_72h: p72 || null }).then(function() {
      overlay.remove();
      alert(isRu ? 'Цены обновлены' : 'Prices updated');
      var subEl = document.getElementById('adxSubContent');
      if (subEl) _adxRenderMyChannels(subEl);
    }).catch(function(e) {
      saveBtn.disabled = false;
      alert(e.message || 'Error');
    });
  };
  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);

  modal.appendChild(closeBtn);
