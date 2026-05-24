/* Golden Connect Cabinet — Реклама (Ads management UI).
   Mirrors the bot's ads-module over REST. Tabs: Кампании / Маркет / Заявки / Транзакции.
*/
(function () {
  'use strict';
  const ROOT = '/cabinet/api/ads';
  const STATE = { tab: 'campaigns', balances: null, campaigns: [], market: [], claims: [], txs: [] };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const usd = (cents) => '$' + (Number(cents || 0) / 100).toFixed(2);
  const fmtN = (n) => Number(n || 0).toLocaleString('ru-RU');
  const fmtDate = (s) => { try { return new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); } catch (_) { return s; } };

  async function api(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(ROOT + path, opts);
    let d = {}; try { d = await r.json(); } catch (_) {}
    if (r.status === 401) { window.location.href = '/cabinet/login'; throw new Error('auth'); }
    if (!r.ok) throw new Error(d.reason || ('http_' + r.status));
    return d;
  }

  function statusBadge(s) {
    const map = {
      active:               { color: '#10b981', text: '🟢 Активна' },
      paused:               { color: '#f59e0b', text: '⏸ Пауза' },
      paused_missing_admin: { color: '#ef4444', text: '⚠️ Бот не админ' },
      done:                 { color: '#00D4FF', text: '✅ Завершена' },
      refunded:             { color: '#9ca3af', text: '💵 Возврат' },
      archived:             { color: '#6b7280', text: '🗄 Архив' },
      rejected:             { color: '#ef4444', text: '❌ Отклонена' },
      claimed:              { color: '#fbbf24', text: '🟡 Взято' },
      submitted:            { color: '#3b82f6', text: '🔵 На проверке' },
      approved:             { color: '#10b981', text: '🟢 Одобрено' },
      paid:                 { color: '#10b981', text: '💸 Оплачено' },
      expired:              { color: '#6b7280', text: '⏰ Истекло' },
    };
    const m = map[s] || { color: '#9ca3af', text: s };
    return '<span style="background:' + m.color + '22;color:' + m.color + ';padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em">' + esc(m.text) + '</span>';
  }

  // ── Top header (balances + tabs)
  async function loadBalances() {
    try { STATE.balances = await api('GET', '/balances'); }
    catch (e) { STATE.balances = { gift_cents: 0, earned_cents: 0, karma: 100, payout_target: 'earned' }; }
    renderHeader();
  }

  function renderHeader() {
    const el = $('adsHeader'); if (!el) return;
    const b = STATE.balances || { gift_cents: 0, earned_cents: 0, karma: 100, payout_target: 'earned' };
    const karmaBar = b.karma >= 80 ? '🟢' : b.karma >= 40 ? '🟡' : '🔴';
    el.innerHTML =
      '<div class="ads-bal-grid">' +
        '<div class="ads-bal-card ads-bal-card--gift">' +
          '<div class="ads-bal-label">🎁 Gift-баланс</div>' +
          '<div class="ads-bal-amount">' + usd(b.gift_cents) + '</div>' +
          '<div class="ads-bal-hint">для запуска рекламы</div>' +
        '</div>' +
        '<div class="ads-bal-card ads-bal-card--earned">' +
          '<div class="ads-bal-label">💵 Earned-баланс</div>' +
          '<div class="ads-bal-amount">' + usd(b.earned_cents) + '</div>' +
          '<div class="ads-bal-hint">вывод от $10 (скоро)</div>' +
        '</div>' +
        '<div class="ads-bal-card ads-bal-card--karma">' +
          '<div class="ads-bal-label">' + karmaBar + ' Карма</div>' +
          '<div class="ads-bal-amount">' + b.karma + '</div>' +
          '<div class="ads-bal-hint">' + (b.karma >= 80 ? 'отличная репутация' : b.karma >= 40 ? 'нормальная' : 'низкая — выполняй задания корректно') + '</div>' +
        '</div>' +
        '<div class="ads-bal-card ads-bal-card--cta">' +
          '<button class="ads-btn ads-btn-primary" onclick="window.AdsWeb.openCreate()">🚀 Запустить кампанию</button>' +
          '<button class="ads-btn ads-btn-ghost" style="margin-top:8px" onclick="window.AdsWeb.openTopUp()">💵 Пополнить</button>' +
          '<button class="ads-btn ads-btn-ghost" style="margin-top:8px" onclick="window.AdsWeb.togglePayout()">↻ Выплаты на: <b>' + b.payout_target + '</b></button>' +
        '</div>' +
      '</div>' +
      '<div class="ads-tabs">' +
        '<button class="ads-tab' + (STATE.tab === 'campaigns' ? ' ads-tab--active' : '') + '" data-tab="campaigns">📊 Мои кампании</button>' +
        '<button class="ads-tab' + (STATE.tab === 'reports' ? ' ads-tab--active' : '') + '" data-tab="reports">📥 На проверке</button>' +
        '<button class="ads-tab' + (STATE.tab === 'market' ? ' ads-tab--active' : '') + '" data-tab="market">💰 Заработать</button>' +
        '<button class="ads-tab' + (STATE.tab === 'claims' ? ' ads-tab--active' : '') + '" data-tab="claims">📜 Мои заявки</button>' +
        '<button class="ads-tab' + (STATE.tab === 'tx' ? ' ads-tab--active' : '') + '" data-tab="tx">💼 Транзакции</button>' +
      '</div>';
    el.querySelectorAll('.ads-tab').forEach((b) => b.addEventListener('click', () => {
      STATE.tab = b.dataset.tab;
      renderHeader();
      loadTab();
    }));
  }

  // ── Tabs
  async function loadTab() {
    const body = $('adsBody'); if (!body) return;
    body.innerHTML = '<div class="ads-loading">Загрузка…</div>';
    try {
      if (STATE.tab === 'campaigns') {
        const d = await api('GET', '/campaigns');
        STATE.campaigns = d.items || [];
        renderCampaigns();
      } else if (STATE.tab === 'market') {
        const d = await api('GET', '/marketplace');
        STATE.market = d.items || [];
        renderMarket();
      } else if (STATE.tab === 'claims') {
        const d = await api('GET', '/claims');
        STATE.claims = d.items || [];
        renderClaims();
      } else if (STATE.tab === 'tx') {
        const d = await api('GET', '/transactions');
        STATE.txs = d.items || [];
        renderTxs();
      } else if (STATE.tab === 'reports') {
        const d = await api('GET', '/pending-reports');
        STATE.reports = d.items || [];
        renderReports();
      }
    } catch (e) {
      body.innerHTML = '<div class="ads-empty"><h3>Ошибка</h3><p>' + esc(e.message) + '</p></div>';
    }
  }

  function renderCampaigns() {
    const body = $('adsBody');
    if (!STATE.campaigns.length) {
      body.innerHTML = '<div class="ads-empty">' +
        '<div style="font-size:48px">🚀</div>' +
        '<h3>У тебя пока нет кампаний</h3>' +
        '<p>Запусти первую — выбери канал, поставь цену за подписчика, дальше всё автоматически.</p>' +
        '<button class="ads-btn ads-btn-primary" onclick="window.AdsWeb.openCreate()">🚀 Запустить кампанию</button>' +
      '</div>';
      return;
    }
    body.innerHTML = STATE.campaigns.map((c) => {
      const spent = c.reward_cents * c.completed_count;
      const remaining = c.budget_cents - c.fee_cents - spent;
      const pct = Math.round((c.completed_count / c.target_count) * 100);
      const canPause = c.status === 'active';
      const canResume = c.status === 'paused' || c.status === 'paused_missing_admin';
      const canRefund = ['active', 'paused', 'paused_missing_admin'].includes(c.status) && remaining > 0;
      return (
        '<div class="ads-campaign">' +
          '<div class="ads-campaign-head">' +
            '<div>' +
              '<div class="ads-campaign-title">📢 ' + esc(c.channel_title || c.title || ('Кампания #' + c.id)) + '</div>' +
              (c.channel_username ? '<div class="ads-campaign-sub">' + esc(c.channel_username) + '</div>' : '') +
            '</div>' +
            '<div>' + statusBadge(c.status) + '</div>' +
          '</div>' +
          '<div class="ads-progress"><div class="ads-progress-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="ads-campaign-stats">' +
            '<div><b>' + c.completed_count + '/' + c.target_count + '</b><span>подписчиков</span></div>' +
            '<div><b>' + usd(c.reward_cents) + '</b><span>за одного</span></div>' +
            '<div><b>' + usd(spent) + '</b><span>выплачено</span></div>' +
            '<div><b>' + usd(remaining > 0 ? remaining : 0) + '</b><span>остаток</span></div>' +
          '</div>' +
          '<div class="ads-campaign-actions">' +
            (canPause  ? '<button class="ads-btn ads-btn-ghost" onclick="window.AdsWeb.pause(' + c.id + ')">⏸ Пауза</button>' : '') +
            (canResume ? '<button class="ads-btn ads-btn-primary" onclick="window.AdsWeb.resume(' + c.id + ')">▶️ Возобновить</button>' : '') +
            (canRefund ? '<button class="ads-btn ads-btn-warn" onclick="window.AdsWeb.refund(' + c.id + ')">💵 Вернуть ' + usd(remaining) + '</button>' : '') +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderMarket() {
    const body = $('adsBody');
    if (!STATE.market.length) {
      body.innerHTML = '<div class="ads-empty"><h3>Сейчас нет доступных заданий</h3><p>Партнёры пока не запустили активных кампаний. Загляни позже.</p></div>';
      return;
    }
    body.innerHTML = STATE.market.map((c) => {
      const kind = c._kind || c.kind || 'subscribe';
      if (kind === 'task') {
        const remaining = (c.target_count || 0) - (c.completed_count || 0);
        return (
          '<div class="ads-market-card" style="border-left:3px solid #B14AED">' +
            '<div class="ads-market-head">' +
              '<div>' +
                '<div class="ads-market-title">📝 ' + esc((c.description || '').slice(0, 80)) + '</div>' +
                '<div class="ads-market-sub">' + (c.photo_required ? '📸 фото нужно · ' : '') + 'отчёт по описанию</div>' +
              '</div>' +
              '<div class="ads-market-reward">' + usd(c.reward_cents) + '</div>' +
            '</div>' +
            '<div class="ads-market-meta">📊 ' + remaining + ' / ' + c.target_count + ' мест</div>' +
            '<a class="ads-btn ads-btn-primary ads-market-cta" href="https://t.me/Golden Connect_bizbot?start=task_' + c.id + '" target="_blank">📝 Взять в боте</a>' +
          '</div>'
        );
      }
      if (kind === 'video') {
        const remaining = (c.target_count || 0) - (c.completed_count || 0);
        const modeLabel = { text_report: '✏️ короткий отчёт', quiz: '🧪 квиз', voice_report: '🎤 голос-отчёт' }[c.validation_mode] || '';
        return (
          '<div class="ads-market-card" style="border-left:3px solid #00D4FF">' +
            '<div class="ads-market-head">' +
              '<div>' +
                '<div class="ads-market-title">🎬 ' + esc((c.title || 'Видео').slice(0, 80)) + '</div>' +
                '<div class="ads-market-sub">' + modeLabel + ' · ⏱ ' + (c.video_duration_sec || '?') + 'с</div>' +
              '</div>' +
              '<div class="ads-market-reward">' + usd(c.reward_cents) + '</div>' +
            '</div>' +
            '<div class="ads-market-meta">📊 ' + remaining + ' / ' + c.target_count + ' просмотров</div>' +
            '<a class="ads-btn ads-btn-primary ads-market-cta" href="https://t.me/Golden Connect_bizbot?start=video_' + c.id + '" target="_blank">🎬 Смотреть в боте</a>' +
          '</div>'
        );
      }
      // subscribe (default)
      const remaining = c.target_count - c.completed_count;
      return (
        '<div class="ads-market-card">' +
          '<div class="ads-market-head">' +
            '<div>' +
              '<div class="ads-market-title">📢 ' + esc(c.channel_title || ('Канал #' + c.id)) + '</div>' +
              (c.channel_username ? '<div class="ads-market-sub">' + esc(c.channel_username) + '</div>' : '') +
            '</div>' +
            '<div class="ads-market-reward">' + usd(c.reward_cents) + '</div>' +
          '</div>' +
          '<div class="ads-market-meta">📊 ' + remaining + ' / ' + c.target_count + ' мест осталось</div>' +
          '<a class="ads-btn ads-btn-primary ads-market-cta" target="_blank" rel="noopener" href="' + esc(c.invite_link || ('https://t.me/' + String(c.channel_username || '').replace(/^@/,''))) + '">🔗 Подписаться через бота</a>' +
          '<div class="ads-market-hint">Возьми задание в @Golden Connect_bizbot — там автозачисление награды через 1-2 сек после подписки.</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderClaims() {
    const body = $('adsBody');
    if (!STATE.claims.length) {
      body.innerHTML = '<div class="ads-empty"><h3>Заявок пока нет</h3><p>Возьми первое задание во вкладке «💰 Заработать» или в боте.</p></div>';
      return;
    }
    body.innerHTML = '<div class="ads-table-wrap"><table class="ads-table">' +
      '<thead><tr><th>#</th><th>Кампания</th><th>Награда</th><th>Кошелёк</th><th>Статус</th><th>Дата</th></tr></thead><tbody>' +
      STATE.claims.map((cl) => '<tr>' +
        '<td>#' + cl.id + '</td>' +
        '<td>' + esc(cl.title || cl.kind) + '</td>' +
        '<td><b>' + usd(cl.reward_cents) + '</b></td>' +
        '<td>' + esc(cl.payout_target || 'earned') + '</td>' +
        '<td>' + statusBadge(cl.status) + '</td>' +
        '<td>' + esc(fmtDate(cl.claimed_at)) + '</td>' +
      '</tr>').join('') +
      '</tbody></table></div>';
  }

  function renderTxs() {
    const body = $('adsBody');
    if (!STATE.txs.length) {
      body.innerHTML = '<div class="ads-empty"><h3>Транзакций нет</h3><p>Здесь появятся все движения по балансу: пополнение кампании, награды, возвраты.</p></div>';
      return;
    }
    body.innerHTML = '<div class="ads-table-wrap"><table class="ads-table">' +
      '<thead><tr><th>Дата</th><th>Тип</th><th>Кошелёк</th><th>Сумма</th><th>Связано</th></tr></thead><tbody>' +
      STATE.txs.map((t) => {
        const sign = t.amount_cents >= 0 ? '+' : '';
        const color = t.amount_cents >= 0 ? '#10b981' : '#ef4444';
        return '<tr>' +
          '<td>' + esc(fmtDate(t.created_at)) + '</td>' +
          '<td>' + esc(t.kind) + '</td>' +
          '<td>' + esc(t.wallet || '—') + '</td>' +
          '<td style="color:' + color + ';font-weight:700">' + sign + usd(t.amount_cents) + '</td>' +
          '<td>' + (t.campaign_id ? 'кампания #' + t.campaign_id : (t.claim_id ? 'заявка #' + t.claim_id : '—')) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  // ── Create campaign modal
  function openCreate() {
    if ($('adsCreateModal')) return;
    const m = document.createElement('div');
    m.id = 'adsCreateModal';
    m.className = 'ads-modal';
    m.innerHTML =
      '<div class="ads-modal-card">' +
        '<div class="ads-modal-head"><h2>🚀 Новая кампания: подписка на канал</h2>' +
        '<button class="ads-modal-close" onclick="window.AdsWeb.closeCreate()">✕</button></div>' +
        '<form id="adsCreateForm" class="ads-modal-body">' +
          '<div class="ads-field">' +
            '<label>1. Канал</label>' +
            '<input name="channel" placeholder="@my_channel или ID канала (-100…)" required autocomplete="off">' +
            '<div class="ads-hint">Перед запуском <b>добавь @<span id="adsBotUser">Golden Connect_bizbot</span> админом</b> в канал (право «Управление сообщениями»).</div>' +
            '<button type="button" class="ads-btn ads-btn-ghost" id="adsPreviewBtn" style="margin-top:8px">🔍 Проверить канал</button>' +
            '<div id="adsPreviewBox" style="margin-top:10px"></div>' +
          '</div>' +
          '<div class="ads-field">' +
            '<label>2. Сколько подписчиков нужно</label>' +
            '<input name="target_count" type="number" min="10" max="100000" placeholder="100" required>' +
            '<div class="ads-hint">От 10 до 100 000.</div>' +
          '</div>' +
          '<div class="ads-field">' +
            '<label>3. Цена за одного подписчика, $</label>' +
            '<input name="reward_usd" type="number" step="0.01" min="0.01" placeholder="0.05" required>' +
            '<div class="ads-hint">Минимум $0.01. Чем выше — тем быстрее набирается.</div>' +
          '</div>' +
          '<div class="ads-field">' +
            '<label>4. Откуда списать</label>' +
            '<select name="wallet"><option value="gift">🎁 Gift-баланс</option><option value="earned">💵 Earned-баланс</option></select>' +
          '</div>' +
          '<div id="adsSummary" class="ads-summary"></div>' +
          '<div class="ads-modal-actions">' +
            '<button type="button" class="ads-btn ads-btn-ghost" onclick="window.AdsWeb.closeCreate()">Отмена</button>' +
            '<button type="submit" class="ads-btn ads-btn-primary" id="adsSubmitBtn">🚀 Запустить</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(m);

    $('adsPreviewBtn').addEventListener('click', previewChannel);
    const form = $('adsCreateForm');
    ['target_count', 'reward_usd', 'wallet'].forEach((n) => {
      const el = form.querySelector('[name="' + n + '"]');
      if (el) el.addEventListener('input', updateSummary);
      if (el) el.addEventListener('change', updateSummary);
    });
    form.addEventListener('submit', submitCreate);
  }

  function closeCreate() { const m = $('adsCreateModal'); if (m) m.remove(); }

  function updateSummary() {
    const form = $('adsCreateForm'); if (!form) return;
    const target = parseInt(form.querySelector('[name="target_count"]').value, 10);
    const reward = parseFloat(form.querySelector('[name="reward_usd"]').value.replace(',', '.'));
    const summary = $('adsSummary');
    if (!Number.isFinite(target) || !Number.isFinite(reward) || target < 10 || reward <= 0) {
      summary.innerHTML = '<div class="ads-hint">Заполни цель и ставку для расчёта.</div>'; return;
    }
    const reward_cents = Math.round(reward * 100);
    const payout = reward_cents * target;
    const fee = Math.round((payout * 1000) / (10000 - 1000));
    const total = payout + fee;
    const sponsor = Math.round(total * 500 / 10000);
    summary.innerHTML =
      '<div class="ads-summary-row"><span>Выплаты исполнителям:</span><b>' + usd(payout) + '</b></div>' +
      '<div class="ads-summary-row"><span>Комиссия 10% (5% спонсору):</span><b>' + usd(fee) + '</b></div>' +
      '<div class="ads-summary-row ads-summary-total"><span>К списанию:</span><b>' + usd(total) + '</b></div>';
  }

  async function previewChannel() {
    const ch = $('adsCreateForm').querySelector('[name="channel"]').value.trim();
    const box = $('adsPreviewBox');
    if (!ch) { box.innerHTML = '<div class="ads-error">Укажи @username или ID канала.</div>'; return; }
    box.innerHTML = '<div class="ads-hint">Проверяю…</div>';
    try {
      const d = await api('POST', '/channel-preview', { channel: ch });
      const ok = d.is_admin;
      $('adsBotUser').textContent = d.bot_username || 'Golden Connect_bizbot';
      box.innerHTML =
        '<div class="ads-preview ' + (ok ? 'ads-preview--ok' : 'ads-preview--bad') + '">' +
          '<div><b>' + esc(d.title) + '</b>' + (d.username ? ' · @' + esc(d.username) : '') + '</div>' +
          '<div>📊 Подписчиков: ' + fmtN(d.member_count) + '</div>' +
          '<div>' + (ok ? '✅ Бот — администратор. Можно запускать.' : '⚠️ Бот НЕ админ — добавь @' + esc(d.bot_username) + ' в админы канала и попробуй снова.') + '</div>' +
        '</div>';
    } catch (e) {
      box.innerHTML = '<div class="ads-error">❌ Не нашёл канал: ' + esc(e.message) + '</div>';
    }
  }

  async function submitCreate(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      channel: form.channel.value.trim(),
      target_count: parseInt(form.target_count.value, 10),
      reward_usd: parseFloat(form.reward_usd.value.replace(',', '.')),
      wallet: form.wallet.value,
    };
    const btn = $('adsSubmitBtn'); btn.disabled = true; btn.textContent = '⏳ Создаём…';
    try {
      const d = await api('POST', '/campaigns', data);
      closeCreate();
      window.AdsWeb.toast('🚀 Кампания #' + d.campaign_id + ' запущена! ' + usd(d.budget_cents) + ' списано.');
      await loadBalances();
      STATE.tab = 'campaigns';
      renderHeader();
      await loadTab();
    } catch (err) {
      btn.disabled = false; btn.textContent = '🚀 Запустить';
      const reasons = {
        bot_not_admin: 'Бот не админ в канале — добавь его и нажми «Проверить канал».',
        insufficient_balance: 'Недостаточно средств на выбранном кошельке.',
        invalid_target: 'Количество подписчиков от 10 до 100 000.',
        invalid_reward: 'Цена за подписчика — положительное число.',
        reward_too_low: 'Минимум $0.01 за подписчика.',
      };
      $('adsSummary').insertAdjacentHTML('afterbegin',
        '<div class="ads-error">❌ ' + esc(reasons[err.message] || err.message) + '</div>');
    }
  }

  async function pause(id) { try { await api('POST', '/campaigns/' + id + '/pause'); window.AdsWeb.toast('⏸ Пауза'); await loadTab(); } catch (e) { alert(e.message); } }
  async function resume(id) { try { await api('POST', '/campaigns/' + id + '/resume'); window.AdsWeb.toast('▶️ Возобновлена'); await loadTab(); } catch (e) { alert(e.message); } }
  async function refund(id) {
    if (!confirm('Закрыть кампанию и вернуть остаток на баланс?')) return;
    try { const d = await api('DELETE', '/campaigns/' + id); window.AdsWeb.toast('💵 Возвращено ' + usd(d.refunded_cents)); await loadBalances(); await loadTab(); }
    catch (e) { alert(e.message); }
  }

  async function togglePayout() {
    const cur = (STATE.balances && STATE.balances.payout_target) || 'earned';
    const next = cur === 'earned' ? 'gift' : 'earned';
    try { await api('POST', '/payout-target', { target: next }); await loadBalances(); window.AdsWeb.toast('Выплаты теперь на ' + next + '-баланс'); }
    catch (e) { alert(e.message); }
  }

  function toast(msg) {
    let t = $('adsToast'); if (t) t.remove();
    t = document.createElement('div'); t.id = 'adsToast'; t.className = 'ads-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2800);
  }

  // ── Mount
  async function mount(host) {
    if (!host) host = $('adsPageContent'); if (!host) {
      console.error('[ads] adsPageContent element missing');
      return;
    }
    host.innerHTML = '<div id="adsHeader"></div><div id="adsBody"></div>';
    try { await loadBalances(); }
    catch (e) { console.error('[ads] loadBalances failed', e); renderHeader(); }
    try { await loadTab(); }
    catch (e) {
      const body = $('adsBody');
      if (body) body.innerHTML = '<div class="ads-empty"><h3>Ошибка загрузки</h3><p>' + esc(e.message || String(e)) + '</p></div>';
    }
  }


  // openTopUp — opens a modal so user can choose top-up amount and
  // payment method. Bridges to /cabinet/api/pay/create-invoice using
  // the special tariff_code 'topup_<amount>' which the backend then
  // turns into a CryptoBot/Platega invoice.
  function openTopUp() {
    const m = document.createElement('div');
    m.id = 'adsTopUpModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    m.innerHTML =
      '<div class="cab-card" style="max-width:440px;width:100%">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<h3 style="margin:0">💵 Пополнить Gift-баланс</h3>' +
          '<button onclick="document.getElementById(\'adsTopUpModal\').remove()" style="background:none;border:none;color:#9ca3af;font-size:22px;cursor:pointer">✕</button>' +
        '</div>' +
        '<div style="font-size:13px;color:#9ca3af;margin-bottom:14px">Выберите сумму пополнения. Gift-баланс используется для запуска рекламных кампаний.</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">' +
          ['10','25','50','100','250','500'].map(function(a){ return '<button class="ads-btn ads-btn-ghost" data-topup-amount="' + a + '">$' + a + '</button>'; }).join('') +
        '</div>' +
        '<div style="font-size:12px;color:#9ca3af;margin-bottom:8px">Свой вариант (USD):</div>' +
        '<input id="adsTopUpCustom" type="number" min="5" step="1" placeholder="Например: 75" class="cab-input" style="width:100%;padding:10px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#fff;margin-bottom:12px">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<button class="ads-btn ads-btn-primary" id="adsTopUpPlatega" style="padding:14px">💳 Карта/СБП</button>' +
          '<button class="ads-btn ads-btn-primary" id="adsTopUpCrypto" style="padding:14px;background:#f59e0b">🪙 Crypto</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    let chosen = 25;
    const setChosen = (v) => {
      chosen = Number(v) || 25;
      m.querySelectorAll('[data-topup-amount]').forEach(b => {
        b.classList.toggle('ads-tab--active', Number(b.dataset.topupAmount) === chosen);
      });
      const inp = document.getElementById('adsTopUpCustom');
      if (inp && Number(inp.value) !== chosen) inp.value = '';
    };
    setChosen(25);
    m.querySelectorAll('[data-topup-amount]').forEach(b => {
      b.addEventListener('click', () => setChosen(b.dataset.topupAmount));
    });
    document.getElementById('adsTopUpCustom').addEventListener('input', (e) => {
      const v = Number(e.target.value); if (v >= 5) chosen = v;
    });

    async function submit(method) {
      try {
        const r = await fetch('/cabinet/api/ads/gift-topup', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount_usd: chosen, method }),
        });
        const d = await r.json();
        if (!r.ok || d.ok === false) {
          toast('Ошибка: ' + (d.reason || d.detail || 'не удалось создать счёт'), 'error');
          return;
        }
        const url = d.pay_url || d.url;
        if (url) window.location.href = url;
        else toast('Не получили платёжную ссылку', 'error');
      } catch (e) {
        toast('Ошибка: ' + (e.message || 'сеть'), 'error');
      }
    }
    document.getElementById('adsTopUpPlatega').addEventListener('click', () => submit('platega'));
    document.getElementById('adsTopUpCrypto').addEventListener('click', () => submit('cryptobot'));
  }


  function renderReports() {
    const body = $('adsBody');
    if (!STATE.reports || !STATE.reports.length) {
      body.innerHTML = '<div class="ads-empty">' +
        '<div style="font-size:48px">📥</div>' +
        '<h3>Нет отчётов на проверке</h3>' +
        '<p>Когда исполнители выполнят твои кампании с отчётом — они появятся здесь.</p>' +
      '</div>';
      return;
    }
    body.innerHTML = STATE.reports.map((r) => {
      const aiBadge = r.ai_score
        ? '<span style="background:rgba(0,212,255,.1);color:#00D4FF;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">🤖 AI ' + r.ai_verdict + ' ' + r.ai_score + '/100</span>'
        : '';
      const photo = r.photo_file_id || r.photo_url
        ? '<div style="margin-top:10px"><img src="' + esc(r.photo_url || '') + '" alt="фото" style="max-width:200px;max-height:200px;border-radius:8px;border:1px solid rgba(255,255,255,.12)"></div>'
        : '';
      return (
        '<div class="ads-campaign" style="border-left:3px solid #00D4FF">' +
          '<div class="ads-campaign-head">' +
            '<div>' +
              '<div class="ads-campaign-title">📝 #' + r.claim_id + ' · ' + esc(r.camp_title || ('Кампания ' + r.camp_id)) + '</div>' +
              '<div class="ads-campaign-sub">от <b>' + esc(r.executor_name || 'User') + '</b>' + (r.executor_username ? ' @' + esc(r.executor_username) : '') + '</div>' +
            '</div>' +
            '<div>' + statusBadge('submitted') + ' ' + aiBadge + '</div>' +
          '</div>' +
          (r.report_text ? '<div style="background:rgba(0,0,0,.25);border-radius:8px;padding:12px;margin-top:8px;font-size:13px;color:#e8edf5">' + esc(r.report_text) + '</div>' : '') +
          photo +
          (r.ai_reasoning ? '<div style="font-size:12px;color:#00D4FF;margin-top:8px">🤖 ' + esc(r.ai_reasoning) + '</div>' : '') +
          '<div class="ads-campaign-actions" style="margin-top:12px">' +
            '<button class="ads-btn ads-btn-primary" onclick="window.AdsWeb.decideReport(' + r.claim_id + ', \'approve\')">✅ Принять (' + usd(r.reward_cents) + ')</button>' +
            '<button class="ads-btn ads-btn-warn" onclick="window.AdsWeb.decideReport(' + r.claim_id + ', \'rework\')">🔄 На доработку</button>' +
            '<button class="ads-btn ads-btn-ghost" onclick="window.AdsWeb.decideReport(' + r.claim_id + ', \'reject\')">❌ Отклонить</button>' +
            (r.ai_score ? '' : '<button class="ads-btn ads-btn-ghost" onclick="window.AdsWeb.aiCheckReport(' + r.claim_id + ')">🤖 AI-проверка</button>') +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  async function aiCheckReport(claimId) {
    toast('🤖 AI проверяет…');
    try {
      const r = await fetch(ROOT + '/reports/' + claimId + '/decide', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAi: true }),
      });
      const d = await r.json();
      if (d.ok && d.ai) {
        toast('🤖 ' + d.ai.verdict + ' (' + d.ai.score + '/100)');
        await loadTab();
      } else {
        toast('Ошибка AI: ' + (d.reason || 'unknown'), 'error');
      }
    } catch (e) { toast('AI ошибка', 'error'); }
  }

  // Phase J: pretty moderation modal (was prompt())
  function decideReport(claimId, decisionHint) {
    // Pull report data from current STATE so we can render it nicely
    const list = STATE.reports || [];
    const report = list.find((x) => x.claim_id === claimId);
    if (!report) {
      // Fallback: still allow decide via prompt() if state stale
      return _decideReportRaw(claimId, decisionHint);
    }
    _openModerationModal(report, decisionHint || null);
  }

  async function _decideReportRaw(claimId, decision) {
    let reason = '';
    if (decision === 'reject' || decision === 'rework') {
      reason = prompt(decision === 'reject' ? 'Причина отклонения:' : 'Что доработать:');
      if (!reason || reason.trim().length < 3) return;
    }
    return _submitDecision(claimId, decision, reason);
  }

  async function _submitDecision(claimId, decision, reason) {
    try {
      const r = await fetch(ROOT + '/reports/' + claimId + '/decide', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      const d = await r.json();
      if (d.ok) {
        toast(decision === 'approve' ? '✅ Принято' : decision === 'reject' ? '❌ Отклонено' : '🔄 На доработку');
        _closeModerationModal();
        // Refresh the appropriate page
        if (typeof loadOrderTab === 'function' && STATE.mode === 'order') await loadOrderTab();
        else if (typeof loadTab === 'function') await loadTab();
      } else {
        toast('Ошибка: ' + (d.reason || ''), 'error');
      }
    } catch (e) { toast('Сетевая ошибка', 'error'); }
  }

  function _closeModerationModal() {
    const m = $('adsModerationModal');
    if (m) m.remove();
    document.removeEventListener('keydown', _modModalKey);
  }
  function _modModalKey(e) { if (e.key === 'Escape') _closeModerationModal(); }

  function _openModerationModal(r, defaultDecision) {
    _closeModerationModal();
    const m = document.createElement('div');
    m.id = 'adsModerationModal';
    m.className = 'ads-mod-overlay';
    const photo = (r.photo_file_id || r.photo_url)
      ? `<div class="ads-mod-photo"><img src="${esc(r.photo_url || '')}" alt="отчёт"></div>`
      : '';
    const aiInfo = r.ai_score
      ? `<div class="ads-mod-ai ads-mod-ai-${esc(r.ai_verdict || 'review')}">
           <div class="ads-mod-ai-head">🤖 AI: <b>${esc(r.ai_verdict || '?')}</b> · ${r.ai_score}/100</div>
           ${r.ai_reasoning ? `<div class="ads-mod-ai-body">${esc(String(r.ai_reasoning).slice(0, 800))}</div>` : ''}
         </div>`
      : '';
    const submittedAt = r.submitted_at ? fmtDate(r.submitted_at) : '';
    const execName = (r.executor_name || 'User') + (r.executor_username ? ' @' + r.executor_username : '');

    m.innerHTML = `
      <div class="ads-mod-card" onclick="event.stopPropagation()">
        <div class="ads-mod-head">
          <div>
            <div class="ads-mod-title">📝 Отчёт #${r.claim_id}</div>
            <div class="ads-mod-sub">${esc(r.camp_title || ('Кампания #' + r.camp_id))} · от <b>${esc(execName)}</b>${submittedAt ? ' · ' + submittedAt : ''}</div>
          </div>
          <button class="ads-mod-close" onclick="window.AdsWeb._closeMod()" aria-label="Закрыть">✕</button>
        </div>

        ${r.report_text ? `<div class="ads-mod-section"><div class="ads-mod-label">Текст отчёта</div><div class="ads-mod-text">${esc(r.report_text)}</div></div>` : ''}
        ${photo ? `<div class="ads-mod-section"><div class="ads-mod-label">Фото</div>${photo}</div>` : ''}
        ${aiInfo ? `<div class="ads-mod-section">${aiInfo}</div>` : ''}

        <div class="ads-mod-section">
          <div class="ads-mod-label">Комментарий (для отклонения / доработки)</div>
          <textarea id="adsModReason" rows="3" placeholder="Будет показан исполнителю — что именно не так / что доработать"></textarea>
        </div>

        <div class="ads-mod-actions">
          <button class="ads-btn ads-btn-primary"  onclick="window.AdsWeb._modSubmit(${r.claim_id}, 'approve')">✅ Принять (${usd(r.reward_cents)})</button>
          <button class="ads-btn ads-btn-warn"     onclick="window.AdsWeb._modSubmit(${r.claim_id}, 'rework')">🔄 На доработку</button>
          <button class="ads-btn ads-btn-danger"   onclick="window.AdsWeb._modSubmit(${r.claim_id}, 'reject')">❌ Отклонить</button>
          ${r.ai_score ? '' : `<button class="ads-btn ads-btn-ghost" onclick="window.AdsWeb._modAiCheck(${r.claim_id})">🤖 AI-проверка</button>`}
        </div>
      </div>
    `;
    m.addEventListener('click', _closeModerationModal);
    document.body.appendChild(m);
    document.addEventListener('keydown', _modModalKey);

    if (defaultDecision === 'reject' || defaultDecision === 'rework') {
      const ta = $('adsModReason');
      if (ta) { ta.focus(); ta.placeholder = defaultDecision === 'reject' ? 'Причина отклонения (минимум 3 символа)' : 'Что именно нужно доработать (минимум 3 символа)'; }
    }
  }

  async function _modSubmit(claimId, decision) {
    let reason = '';
    if (decision === 'reject' || decision === 'rework') {
      const ta = $('adsModReason');
      reason = ta ? String(ta.value || '').trim() : '';
      if (reason.length < 3) {
        if (ta) { ta.style.borderColor = '#ef4444'; ta.focus(); }
        return toast('Напиши причину (минимум 3 символа)', 'error');
      }
    }
    return _submitDecision(claimId, decision, reason);
  }

  async function _modAiCheck(claimId) {
    const card = $('adsModerationModal');
    if (card) {
      const aiSlot = document.createElement('div');
      aiSlot.className = 'ads-mod-section';
      aiSlot.innerHTML = '<div style="opacity:.7">🤖 AI проверяет…</div>';
      card.querySelector('.ads-mod-card').insertBefore(aiSlot, card.querySelector('.ads-mod-actions'));
    }
    try {
      const r = await fetch(ROOT + '/reports/' + claimId + '/decide', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAi: true }),
      });
      const d = await r.json();
      if (d.ok && d.ai) {
        // L.21: also patch STATE.reports so re-render uses fresh AI data
        const list = STATE.reports || [];
        const idx = list.findIndex((x) => x.claim_id === claimId);
        if (idx >= 0) {
          list[idx] = Object.assign({}, list[idx], {
            ai_score: d.ai.score, ai_verdict: d.ai.verdict, ai_reasoning: d.ai.reasoning,
          });
        }
        const slot = card && card.querySelectorAll('.ads-mod-section');
        if (slot && slot.length) {
          const lastSection = slot[slot.length - 1];
          lastSection.innerHTML = `<div class="ads-mod-ai ads-mod-ai-${esc(d.ai.verdict || 'review')}">
            <div class="ads-mod-ai-head">🤖 AI: <b>${esc(d.ai.verdict || '?')}</b> · ${d.ai.score || 0}/100</div>
            ${d.ai.reasoning ? `<div class="ads-mod-ai-body">${esc(String(d.ai.reasoning).slice(0, 800))}</div>` : ''}
          </div>`;
        }
        toast('AI: ' + d.ai.verdict + ' ' + d.ai.score + '/100' + (d.cached ? ' (cached)' : ''));
      } else {
        toast('AI ошибка: ' + (d.reason || ''), 'error');
      }
    } catch (e) { toast('AI: сетевая ошибка', 'error'); }
  }

  window.AdsWeb = {
    async subscribeOnSite(campaignId, btn) {
      try {
        // Step 1: take (creates claim or returns existing)
        btn.disabled = true; btn.textContent = '⏳ Беру…';
        const r = await fetch(ROOT + '/sub/take', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ campaign_id: campaignId }),
        });
        const j = await r.json();
        if (!j || !j.ok) {
          btn.disabled = false;
          btn.textContent = '📢 Подписаться';
          alert('⚠️ ' + (j && (j.detail || j.reason) || 'Ошибка'));
          return;
        }
        if (j.already_paid) {
          btn.textContent = '✅ Уже выполнено';
          return;
        }
        // Open channel
        if (j.channel_link) window.open(j.channel_link, '_blank', 'noopener');
        // Replace button with "Проверить"
        btn.disabled = false;
        btn.textContent = '🔄 Я подписался — проверить';
        btn.dataset.claimId = j.claim_id;
        btn.onclick = function () { window.AdsWeb._subCheck(j.claim_id, btn, j.reward_cents); };
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '📢 Подписаться';
        alert('⚠️ Сеть упала');
      }
    },
    async _subCheck(claimId, btn, rewardCents) {
      try {
        btn.disabled = true; btn.textContent = '⏳ Проверяю…';
        const r = await fetch(ROOT + '/sub/check', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ claim_id: claimId }),
        });
        const j = await r.json();
        if (j && j.ok && (j.credited || j.already_paid)) {
          btn.textContent = '✅ +' + ('$' + (Number(rewardCents || j.reward_cents || 0) / 100).toFixed(2)) + ' зачислено';
          btn.classList.remove('ads-btn-primary');
          btn.classList.add('ads-btn-ghost');
          // Refresh balances
          try { await loadBalances(); renderEarnTabs(); } catch (_) {}
        } else if (j && j.reason === 'not_subscribed') {
          btn.disabled = false;
          btn.textContent = '⚠️ Не вижу подписку. Подпишись и нажми снова';
        } else {
          btn.disabled = false;
          btn.textContent = '🔄 Проверить ещё раз';
          alert('⚠️ ' + (j && (j.detail || j.reason) || 'Ошибка'));
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '🔄 Проверить';
      }
    },
 mount, openCreate, closeCreate, pause, resume, refund, togglePayout, toast, openTopUp, decideReport, aiCheckReport, _closeMod: _closeModerationModal, _modSubmit, _modAiCheck };
  window.loadAdsPage = function () { mount($('adsPageContent')); };


  /* PHASE_I_AddedFlows — split entry points + task/video forms + earn catalogs */

  // ─── Hero + tile selector pages ────────────────────────────────────────────
  function _heroOrder() {
    return (
      '<div class="ads-page-hero ads-page-hero--order">' +
        '<div class="ads-page-hero-icon">🎯</div>' +
        '<div class="ads-page-hero-text">' +
          '<h1>Заказать рекламу</h1>' +
          '<p>Запусти подписки, задания с отчётом или видео-просмотры — за 1 минуту. Авто-валидация, AI-проверка, реферальный сплит.</p>' +
        '</div>' +
      '</div>'
    );
  }
  function _heroEarn() {
    return (
      '<div class="ads-page-hero ads-page-hero--earn">' +
        '<div class="ads-page-hero-icon">💰</div>' +
        '<div class="ads-page-hero-text">' +
          '<h1>Заработать</h1>' +
          '<p>Подписывайся, выполняй задания и смотри видео — награда зачисляется автоматически на твой Earned-баланс.</p>' +
        '</div>' +
      '</div>'
    );
  }

  function _orderTiles() {
    return (
      '<div class="ads-page-tiles">' +
        '<div class="ads-page-tile" onclick="window.AdsWeb.openCreate(\'sub\')">' +
          '<div class="ads-page-tile-icon">📢</div>' +
          '<div class="ads-page-tile-title">Подписки на канал</div>' +
          '<div class="ads-page-tile-desc">Юзеры подписываются на твой Telegram-канал. Авто-зачёт через бот-админа. От $0.01 / подписчик.</div>' +
          '<div class="ads-page-tile-cta">Создать →</div>' +
        '</div>' +
        '<div class="ads-page-tile" onclick="window.AdsWeb.openCreate(\'task\')">' +
          '<div class="ads-page-tile-icon">📝</div>' +
          '<div class="ads-page-tile-title">Задание с отчётом</div>' +
          '<div class="ads-page-tile-desc">Любое действие с отчётом: текст, фото или оба. Опционально AI-проверка. Ты модерируешь.</div>' +
          '<div class="ads-page-tile-cta">Создать →</div>' +
        '</div>' +
        '<div class="ads-page-tile" onclick="window.AdsWeb.openCreate(\'video\')">' +
          '<div class="ads-page-tile-icon">🎬</div>' +
          '<div class="ads-page-tile-title">Просмотр видео</div>' +
          '<div class="ads-page-tile-desc">Юзеры смотрят твоё видео и пишут короткий отчёт / проходят квиз. AI-валидация.</div>' +
          '<div class="ads-page-tile-cta">Создать →</div>' +
        '</div>' +
      '</div>'
    );
  }

  function _earnTiles() {
    return (
      '<div class="ads-page-tiles">' +
        '<div class="ads-page-tile" onclick="window.AdsWeb.earnFilter(\'subscribe\')">' +
          '<div class="ads-page-tile-icon">📢</div>' +
          '<div class="ads-page-tile-title">Подписаться на канал</div>' +
          '<div class="ads-page-tile-desc">Подпишись на Telegram-канал — мгновенная награда после вступления.</div>' +
          '<div class="ads-page-tile-cta">Открыть каталог →</div>' +
        '</div>' +
        '<div class="ads-page-tile" onclick="window.AdsWeb.earnFilter(\'task\')">' +
          '<div class="ads-page-tile-icon">📝</div>' +
          '<div class="ads-page-tile-title">Выполнить задание</div>' +
          '<div class="ads-page-tile-desc">Выполни простое задание с отчётом. Заработок $0.05 — $1+ за задание.</div>' +
          '<div class="ads-page-tile-cta">Открыть каталог →</div>' +
        '</div>' +
        '<div class="ads-page-tile" onclick="window.AdsWeb.earnFilter(\'video\')">' +
          '<div class="ads-page-tile-icon">🎬</div>' +
          '<div class="ads-page-tile-title">Посмотреть видео</div>' +
          '<div class="ads-page-tile-desc">Посмотри короткое видео + короткий отчёт или квиз. Быстрая награда.</div>' +
          '<div class="ads-page-tile-cta">Открыть каталог →</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── ads-order page (Заказать рекламу) ────────────────────────────────────
  async function mountOrder(host) {
    if (!host) host = $('adsOrderContent'); if (!host) return;
    host.innerHTML = '<div id="adsOrderHero"></div><div id="adsOrderTiles"></div><div id="adsOrderHeader" style="margin-top:24px"></div><div id="adsOrderBody"></div>';
    $('adsOrderHero').innerHTML = _heroOrder();
    $('adsOrderTiles').innerHTML = _orderTiles();
    try { await loadBalances(); } catch (_) {}
    STATE.mode = 'order';
    if (STATE.tab !== 'campaigns' && STATE.tab !== 'reports') STATE.tab = 'campaigns';
    renderOrderTabs();
    await loadOrderTab();
  }

  function renderOrderTabs() {
    const el = $('adsOrderHeader'); if (!el) return;
    const b = STATE.balances || {};
    el.innerHTML =
      '<div class="ads-balance-bar">' +
        '<div><span class="ads-bal-label">🎁 Gift</span><b>' + usd(b.gift_cents) + '</b></div>' +
        '<div><span class="ads-bal-label">💵 Earned</span><b>' + usd(b.earned_cents) + '</b></div>' +
        '<div><span class="ads-bal-label">⚡ Karma</span><b>' + (b.karma == null ? 100 : b.karma) + '</b></div>' +
      '</div>' +
      '<div class="ads-tabs" style="margin-top:14px">' +
        '<button class="ads-tab' + (STATE.tab === 'campaigns' ? ' ads-tab--active' : '') + '" data-otab="campaigns">📊 Мои кампании</button>' +
        '<button class="ads-tab' + (STATE.tab === 'reports'   ? ' ads-tab--active' : '') + '" data-otab="reports">📥 На проверке</button>' +
      '</div>';
    el.querySelectorAll('[data-otab]').forEach((btn) => {
      btn.addEventListener('click', () => { STATE.tab = btn.dataset.otab; renderOrderTabs(); loadOrderTab(); });
    });
  }

  async function loadOrderTab() {
    const body = $('adsOrderBody'); if (!body) return;
    body.innerHTML = '<div style="padding:30px;text-align:center;opacity:.6">Загрузка…</div>';
    try {
      if (STATE.tab === 'campaigns') {
        const r = await api('GET', '/campaigns'); STATE.campaigns = r.items || r.campaigns || [];
        // Render campaigns inline (cribs from existing renderCampaigns logic)
        if (!STATE.campaigns.length) {
          body.innerHTML = '<div class="ads-empty"><h3>Пока нет кампаний</h3><p>Выбери тип кампании выше — создание занимает 1 минуту.</p></div>';
          return;
        }
        body.innerHTML = STATE.campaigns.map(_renderCampaignCard).join('');
      } else if (STATE.tab === 'reports') {
        const r = await api('GET', '/pending-reports'); STATE.reports = r.items || [];
        if (!STATE.reports.length) {
          body.innerHTML = '<div class="ads-empty"><h3>Нет отчётов на проверке</h3><p>Когда исполнители пришлют отчёт по твоим task-кампаниям, они появятся здесь.</p></div>';
          return;
        }
        body.innerHTML = STATE.reports.map(_renderReportCard).join('');
      }
    } catch (e) {
      body.innerHTML = '<div class="ads-empty"><h3>Ошибка загрузки</h3><p>' + esc(e.message || String(e)) + '</p></div>';
    }
  }

  function _renderCampaignCard(c) {
    const remaining = (c.target_count || 0) - (c.completed_count || 0);
    const kindLabel = { sub: '📢 Подписки', task: '📝 Задание', video: '🎬 Видео' }[c.kind] || c.kind;
    const title = esc(c.title || ('Кампания #' + c.id));
    return (
      '<div class="ads-campaign-card">' +
        '<div class="ads-campaign-head">' +
          '<div><div class="ads-campaign-title">' + title + '</div>' +
          '<div class="ads-campaign-sub">' + kindLabel + ' · #' + c.id + '</div></div>' +
          '<div>' + statusBadge(c.status) + '</div>' +
        '</div>' +
        '<div class="ads-campaign-stats">' +
          '<div><span>Награда</span><b>' + usd(c.reward_cents) + '</b></div>' +
          '<div><span>Прогресс</span><b>' + (c.completed_count || 0) + ' / ' + c.target_count + '</b></div>' +
          '<div><span>Осталось</span><b>' + Math.max(0, remaining) + '</b></div>' +
          '<div><span>Бюджет</span><b>' + usd(c.budget_cents) + '</b></div>' +
        '</div>' +
      '</div>'
    );
  }

  function _renderReportCard(r) {
    const photoBlock = r.photo_url ? '<div class="ads-report-photo"><img src="' + esc(r.photo_url) + '" alt=""></div>' : '';
    const text = (r.report_text || '').slice(0, 500);
    return (
      '<div class="ads-report-card">' +
        '<div class="ads-report-head">' +
          '<div><b>Отчёт #' + r.id + '</b> по кампании #' + r.campaign_id + '</div>' +
          '<div style="opacity:.6">' + fmtDate(r.submitted_at) + '</div>' +
        '</div>' +
        photoBlock +
        (text ? '<div class="ads-report-text">' + esc(text) + '</div>' : '') +
        '<div class="ads-report-actions">' +
          '<button class="ads-btn ads-btn-primary" onclick="window.AdsWeb.decideReport(' + r.claim_id + ', \'approve\')">✅ Принять</button>' +
          '<button class="ads-btn ads-btn-warn" onclick="window.AdsWeb.decideReport(' + r.claim_id + ', \'rework\')">🔄 На доработку</button>' +
          '<button class="ads-btn ads-btn-danger" onclick="window.AdsWeb.decideReport(' + r.claim_id + ', \'reject\')">❌ Отклонить</button>' +
          '<button class="ads-btn ads-btn-ghost" onclick="window.AdsWeb.aiCheckReport(' + r.claim_id + ')">🤖 AI-проверка</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── ads-earn page (Заработать) ────────────────────────────────────────────
  async function mountEarn(host) {
    if (!host) host = $('adsEarnContent'); if (!host) return;
    host.innerHTML = '<div id="adsEarnHero"></div><div id="adsEarnTiles"></div><div id="adsEarnHeader" style="margin-top:24px"></div><div id="adsEarnBody"></div>';
    $('adsEarnHero').innerHTML = _heroEarn();
    $('adsEarnTiles').innerHTML = _earnTiles();
    try { await loadBalances(); } catch (_) {}
    STATE.mode = 'earn';
    if (STATE.tab !== 'market' && STATE.tab !== 'claims') STATE.tab = 'market';
    STATE.earnFilter = 'all';
    renderEarnTabs();
    await loadEarnCatalog();
  }

  function renderEarnTabs() {
    const el = $('adsEarnHeader'); if (!el) return;
    const b = STATE.balances || {};
    el.innerHTML =
      '<div class="ads-balance-bar">' +
        '<div><span class="ads-bal-label">💵 Earned</span><b>' + usd(b.earned_cents) + '</b></div>' +
        '<div><span class="ads-bal-label">⚡ Karma</span><b>' + (b.karma == null ? 100 : b.karma) + '</b></div>' +
        '<div><span class="ads-bal-label">📦 Заявок</span><b>' + (STATE.claims ? STATE.claims.length : 0) + '</b></div>' +
      '</div>' +
      '<div class="ads-tabs" style="margin-top:14px">' +
        '<button class="ads-tab' + (STATE.tab === 'market' ? ' ads-tab--active' : '') + '" data-etab="market">💰 Каталог</button>' +
        '<button class="ads-tab' + (STATE.tab === 'claims' ? ' ads-tab--active' : '') + '" data-etab="claims">📜 Мои заявки</button>' +
      '</div>';
    el.querySelectorAll('[data-etab]').forEach((btn) => {
      btn.addEventListener('click', () => { STATE.tab = btn.dataset.etab; renderEarnTabs(); if (STATE.tab === 'market') loadEarnCatalog(); else loadEarnClaims(); });
    });
  }

  async function loadEarnCatalog() {
    const body = $('adsEarnBody'); if (!body) return;
    body.innerHTML = '<div style="padding:30px;text-align:center;opacity:.6">Загрузка…</div>';
    try {
      const r = await api('GET', '/marketplace'); let list = r.items || [];
      if (STATE.earnFilter && STATE.earnFilter !== 'all') {
        list = list.filter((c) => {
          const k = c._kind || c.kind || 'subscribe';
          if (STATE.earnFilter === 'subscribe') return k === 'subscribe' || k === 'sub';
          return k === STATE.earnFilter;
        });
      }
      // Filter chips header
      const filterChips = (
        '<div class="ads-filter-chips">' +
          ['all','subscribe','task','video'].map((f) => {
            const labels = { all: 'Все', subscribe: '📢 Подписки', task: '📝 Задания', video: '🎬 Видео' };
            const active = STATE.earnFilter === f ? ' ads-filter-chip--active' : '';
            return '<button class="ads-filter-chip' + active + '" onclick="window.AdsWeb.earnFilter(\'' + f + '\')">' + labels[f] + '</button>';
          }).join('') +
        '</div>'
      );
      if (!list.length) {
        body.innerHTML = filterChips + '<div class="ads-empty"><h3>Сейчас нет доступных заданий</h3><p>Загляни через 5 минут — каталог обновляется постоянно.</p></div>';
        return;
      }
      body.innerHTML = filterChips + '<div class="ads-earn-grid">' + list.map(_renderEarnCard).join('') + '</div>';
    } catch (e) {
      body.innerHTML = '<div class="ads-empty"><h3>Ошибка загрузки</h3><p>' + esc(e.message || String(e)) + '</p></div>';
    }
  }

  function _renderEarnCard(c) {
    const kind = c._kind || c.kind || 'subscribe';
    const remaining = (c.target_count || 0) - (c.completed_count || 0);
    if (kind === 'task') {
      return (
        '<div class="ads-earn-card ads-earn-card--task"' + (c.is_own ? ' style="border:1px solid rgba(251,191,36,0.4)"' : '') + '>' +
          '<div class="ads-earn-card-tag">📝 Задание' + karmaBadge + (c.is_own ? ' <span style="background:#fbbf2422;color:#fbbf24;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px;font-weight:700">ТВОЁ</span>' : '') + '</div>' +
          '<div class="ads-earn-card-title">' + esc((c.description || '').slice(0, 80)) + '</div>' +
          '<div class="ads-earn-card-meta">' + (c.photo_required ? '📸 фото · ' : '📝 ') + 'отчёт</div>' +
          '<div class="ads-earn-card-row"><span class="ads-earn-card-reward">' + usd(c.reward_cents) + '</span><span class="ads-earn-card-left">' + remaining + ' мест</span></div>' +
          (c.is_own
            ? '<a class="ads-btn ads-btn-ghost ads-earn-card-cta" href="#/ads-order">⚙️ Управлять</a>'
            : ((c.min_karma || 0) > (STATE.balances && STATE.balances.karma || 0))
            ? '<button class="ads-btn ads-btn-ghost ads-earn-card-cta" disabled style="opacity:.55;cursor:not-allowed">🔒 Карма ниже ' + c.min_karma + '</button>'
            : '<a class="ads-btn ads-btn-primary ads-earn-card-cta" href="https://t.me/Golden Connect_bizbot?start=task_' + c.id + '" target="_blank">📝 Взять в боте</a>') +
        '</div>'
      );
    }
    if (kind === 'video') {
      const modeLabel = { text_report: '✏️ отчёт', quiz: '🧪 квиз', voice_report: '🎤 голос' }[c.validation_mode] || '';
      return (
        '<div class="ads-earn-card ads-earn-card--video"' + (c.is_own ? ' style="border:1px solid rgba(251,191,36,0.4)"' : '') + '>' +
          '<div class="ads-earn-card-tag">🎬 Видео' + karmaBadge + (c.is_own ? ' <span style="background:#fbbf2422;color:#fbbf24;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px;font-weight:700">ТВОЁ</span>' : '') + '</div>' +
          '<div class="ads-earn-card-title">' + esc((c.title || c.video_title || 'Видео').slice(0, 80)) + '</div>' +
          '<div class="ads-earn-card-meta">' + modeLabel + ' · ⏱ ' + (c.video_duration_sec || '?') + 'с</div>' +
          '<div class="ads-earn-card-row"><span class="ads-earn-card-reward">' + usd(c.reward_cents) + '</span><span class="ads-earn-card-left">' + remaining + ' мест</span></div>' +
          (c.is_own
            ? '<a class="ads-btn ads-btn-ghost ads-earn-card-cta" href="#/ads-order">⚙️ Управлять</a>'
            : ((c.min_karma || 0) > (STATE.balances && STATE.balances.karma || 0))
            ? '<button class="ads-btn ads-btn-ghost ads-earn-card-cta" disabled style="opacity:.55;cursor:not-allowed">🔒 Карма ниже ' + c.min_karma + '</button>'
            : '<a class="ads-btn ads-btn-primary ads-earn-card-cta" href="https://t.me/Golden Connect_bizbot?start=video_' + c.id + '" target="_blank">▶️ Смотреть в боте</a>') +
        '</div>'
      );
    }
    var subLink = c.invite_link || (c.channel_username ? 'https://t.me/' + String(c.channel_username).replace(/^@/, '') : 'https://t.me/Golden Connect_bizbot');
    return (
      '<div class="ads-earn-card ads-earn-card--sub">' +
        '<div class="ads-earn-card-tag">📢 Канал' + karmaBadgeSub + '</div>' +
        '<div class="ads-earn-card-title">' + esc(c.channel_title || ('Канал #' + c.id)) + '</div>' +
        '<div class="ads-earn-card-meta">' + (c.channel_username ? esc(c.channel_username) : '&nbsp;') + '</div>' +
        '<div class="ads-earn-card-row"><span class="ads-earn-card-reward">' + usd(c.reward_cents) + '</span><span class="ads-earn-card-left">' + remaining + ' мест</span></div>' +
        '<button class="ads-btn ads-btn-primary ads-earn-card-cta" data-sub-id="' + c.id + '" data-sub-link="' + esc(subLink) + '" onclick="window.AdsWeb.subscribeOnSite(' + c.id + ', this)">📢 Подписаться</button>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.50);margin-top:6px;text-align:center">Возьми задание в @Golden Connect_bizbot — авто-зачёт через 1-2 сек.</div>' +
      '</div>'
    );
  }

  async function loadEarnClaims() {
    const body = $('adsEarnBody'); if (!body) return;
    body.innerHTML = '<div style="padding:30px;text-align:center;opacity:.6">Загрузка…</div>';
    try {
      const r = await api('GET', '/claims'); STATE.claims = r.items || [];
      if (!STATE.claims.length) {
        body.innerHTML = '<div class="ads-empty"><h3>Заявок пока нет</h3><p>Возьми задание из каталога — вкладка «💰 Каталог».</p></div>';
        return;
      }
      body.innerHTML = STATE.claims.map((cl) => (
        '<div class="ads-claim-card">' +
          '<div class="ads-claim-head">' +
            '<div>#' + cl.id + ' · <b>' + esc(cl.title || cl.kind || 'Заявка') + '</b></div>' +
            '<div>' + statusBadge(cl.status) + '</div>' +
          '</div>' +
          '<div class="ads-claim-meta">' + usd(cl.reward_cents) + ' · ' + fmtDate(cl.claimed_at) + '</div>' +
        '</div>'
      )).join('');
    } catch (e) {
      body.innerHTML = '<div class="ads-empty"><h3>Ошибка</h3><p>' + esc(e.message || String(e)) + '</p></div>';
    }
  }

  // ─── Multi-kind create dispatcher ──────────────────────────────────────────
  function openCreateKind(kind) {
    if (!kind) kind = 'sub';
    if (kind === 'sub')   return openCreateSub();
    if (kind === 'task')  return openCreateTask();
    if (kind === 'video') return openCreateVideo();
  }

  // Reuse existing openCreate as openCreateSub (existing flow is sub-only)
  function openCreateSub() {
    return openCreate(); // existing fn defined earlier in this file
  }

  function openCreateTask() {
    if ($('adsCreateModal')) return;
    const m = document.createElement('div');
    m.id = 'adsCreateModal'; m.className = 'ads-modal';
    m.innerHTML =
      '<div class="ads-modal-card">' +
        '<div class="ads-modal-head"><h2>📝 Новая кампания: задание с отчётом</h2>' +
        '<button class="ads-modal-close" onclick="window.AdsWeb.closeCreate()">✕</button></div>' +
        '<form id="adsCreateForm" class="ads-modal-body">' +
          '<input type="hidden" name="kind" value="task">' +
          '<div class="ads-field"><label>1. Описание задания (что должен сделать исполнитель)</label>' +
            '<textarea name="description" rows="3" required minlength="10" maxlength="500" placeholder="Напр.: Подпишись на наш Instagram @brand и пришли скриншот ленты"></textarea></div>' +
          '<div class="ads-field"><label>2. Что прислать в отчёте</label>' +
            '<input name="report_format" maxlength="200" placeholder="Скриншот ленты после подписки + ник">' +
            '<div class="ads-hint">Хорошие подсказки = точные отчёты.</div></div>' +
          '<div class="ads-field"><label><input type="checkbox" name="photo_required" checked> 📸 Требовать фото</label></div>' +
          '<div class="ads-field"><label><input type="checkbox" name="ai_check_enabled"> 🤖 Включить AI-проверку</label>' +
            '<textarea name="ai_check_criteria" rows="2" maxlength="800" placeholder="(если AI включён) что считать пройденным: например, видны ник @brand и подписка"></textarea></div>' +
          '<div class="ads-field"><label>3. Сколько отчётов нужно</label>' +
            '<input name="target_count" type="number" min="1" max="10000" placeholder="50" required></div>' +
          '<div class="ads-field"><label>4. Награда исполнителю, $</label>' +
            '<input name="reward_usd" type="number" step="0.01" min="0.01" placeholder="0.20" required></div>' +
          '<div class="ads-field"><label>5. Откуда списать</label>' +
            '<select name="wallet"><option value="gift">🎁 Gift-баланс</option><option value="earned">💵 Earned-баланс</option></select></div>' +
          '<div class="ads-modal-actions">' +
            '<button type="button" class="ads-btn ads-btn-ghost" onclick="window.AdsWeb.closeCreate()">Отмена</button>' +
            '<button type="submit" class="ads-btn ads-btn-primary">📝 Запустить</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) closeCreate(); });
    $('adsCreateForm').addEventListener('submit', _submitTaskOrVideo);
  }

  function openCreateVideo() {
    if ($('adsCreateModal')) return;
    const m = document.createElement('div');
    m.id = 'adsCreateModal'; m.className = 'ads-modal';
    m.innerHTML =
      '<div class="ads-modal-card">' +
        '<div class="ads-modal-head"><h2>🎬 Новая кампания: просмотр видео</h2>' +
        '<button class="ads-modal-close" onclick="window.AdsWeb.closeCreate()">✕</button></div>' +
        '<form id="adsCreateForm" class="ads-modal-body">' +
          '<input type="hidden" name="kind" value="video">' +
          '<div class="ads-field"><label>1. Заголовок (что увидит исполнитель)</label>' +
            '<input name="video_title" required maxlength="200" placeholder="Обзор Golden Connect за 60 секунд"></div>' +
          '<div class="ads-field"><label>2. Описание / о чём видео</label>' +
            '<textarea name="description" rows="2" required minlength="10" maxlength="500" placeholder="Короткий обзор платформы — что в нём посмотреть"></textarea></div>' +
          '<div class="ads-field"><label>3. URL видео (YouTube / Telegram / прямая ссылка mp4)</label>' +
            '<input name="video_url" type="url" required placeholder="https://youtube.com/watch?v=..."></div>' +
          '<div class="ads-field"><label>4. Длительность, сек</label>' +
            '<input name="video_duration_sec" type="number" min="5" max="3600" required placeholder="60"></div>' +
          '<div class="ads-field"><label>5. Способ валидации</label>' +
            '<select name="validation_mode">' +
              '<option value="text_report">✏️ Короткий текст-отчёт (что было в видео)</option>' +
              '<option value="voice_report">🎤 Голосовой отчёт</option>' +
              '<option value="quiz">🧪 Квиз (3-5 вопросов)</option>' +
            '</select></div>' +
          '<div class="ads-field"><label>6. Критерии для AI-проверки (опц.)</label>' +
            '<textarea name="ai_check_criteria" rows="2" maxlength="800" placeholder="Что должен упомянуть исполнитель в отчёте"></textarea></div>' +
          '<div class="ads-field"><label>7. Сколько просмотров нужно</label>' +
            '<input name="target_count" type="number" min="1" max="10000" placeholder="100" required></div>' +
          '<div class="ads-field"><label>8. Награда за просмотр, $</label>' +
            '<input name="reward_usd" type="number" step="0.01" min="0.01" placeholder="0.10" required></div>' +
          '<div class="ads-field"><label>9. Откуда списать</label>' +
            '<select name="wallet"><option value="gift">🎁 Gift-баланс</option><option value="earned">💵 Earned-баланс</option></select></div>' +
          '<div class="ads-modal-actions">' +
            '<button type="button" class="ads-btn ads-btn-ghost" onclick="window.AdsWeb.closeCreate()">Отмена</button>' +
            '<button type="submit" class="ads-btn ads-btn-primary">🎬 Запустить</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) closeCreate(); });
    $('adsCreateForm').addEventListener('submit', _submitTaskOrVideo);
  }

  async function _submitTaskOrVideo(e) {
    e.preventDefault();
    const form = e.target;
    const data = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.type === 'number') data[el.name] = el.value ? Number(el.value) : null;
      else data[el.name] = el.value;
    });
    try {
      const r = await api('POST', '/campaigns', data);
      closeCreate();
      window.AdsWeb.toast('🚀 Кампания #' + r.campaign_id + ' запущена! Бюджет ' + usd(r.budget_cents) + ' списан.');
      // Refresh order page if visible
      if (typeof window.loadAdsOrderPage === 'function') {
        STATE.tab = 'campaigns'; STATE.balances = null;
        await loadBalances(); renderOrderTabs(); loadOrderTab();
      }
    } catch (err) {
      window.AdsWeb.toast('❌ ' + (err.message || 'Ошибка создания'), 'error');
    }
  }

  function earnFilter(filter) {
    STATE.earnFilter = filter;
    if (STATE.tab !== 'market') { STATE.tab = 'market'; renderEarnTabs(); }
    loadEarnCatalog();
  }

  // ─── Public entry points (referenced from cabinet.html dispatcher) ─────────
  window.loadAdsOrderPage = function () { mountOrder(); };
  window.loadAdsEarnPage  = function () { mountEarn(); };

  // Expose new fns on AdsWeb global
  if (window.AdsWeb) {
    window.AdsWeb.openCreate = openCreateKind;
    window.AdsWeb.openCreateSub = openCreateSub;
    window.AdsWeb.openCreateTask = openCreateTask;
    window.AdsWeb.openCreateVideo = openCreateVideo;
    window.AdsWeb.earnFilter = earnFilter;
  }

})();
