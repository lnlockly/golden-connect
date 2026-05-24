/* Trendex Cabinet — Пополнить баланс (Platega + CryptoBot) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#ef4444' : 'linear-gradient(135deg,#10b981,#00D4FF)') + ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(0,212,255,.3);z-index:10000;';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2800);
  }

  let STATE = { plategaOk: false, balance: 0 };

  async function render() {
    const host = $('pay-content'); if (!host) return;
    host.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">Загрузка…</div>';

    try {
      const [stRes, stats] = await Promise.all([
        fetch('/cabinet/api/platega/status', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({ configured: false })),
        fetch('/cabinet/api/profile/stats', { credentials: 'same-origin' }).then(r => r.json()).catch(() => null),
      ]);
      STATE.plategaOk = !!(stRes && stRes.configured);
      // REAL working balance from api Postgres (was using planner gift_cents which is unrelated ads credit)
      try {
        const fr = await fetch('/cabinet/api/finance/balances', { credentials: 'same-origin' }).then(r => r.json());
        STATE.balance = fr && fr.balances && fr.balances.working ? Math.round(Number(fr.balances.working.usd) * 100) : 0;
      } catch (_) { STATE.balance = 0; }
    } catch (_) {}

    const balUsd = (STATE.balance / 100).toFixed(2);
    let html = '<div style="max-width:780px;margin:0 auto">' +
      '<div class="cab-card" style="background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(177,74,237,.08));border:1px solid rgba(0,212,255,.25);margin-bottom:18px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">' +
          '<div><div style="color:#9ca3af;font-size:12px">Текущий баланс</div>' +
          '<div style="font-size:36px;font-weight:800;color:#00D4FF;font-family:Orbitron,monospace">$' + balUsd + '</div></div>' +
          '<div style="text-align:right"><div style="color:#9ca3af;font-size:12px">Использовать для:</div>' +
          '<div style="font-size:13px;color:#cbd5e1;line-height:1.6">📡 Реклама в TG-каналах<br>🎯 Покупка тарифа<br>🛒 Покупка товаров</div></div>' +
        '</div>' +
      '</div>';

    html += '<div class="cab-card">' +
      '<h3 style="margin:0 0 14px;color:#fff">💰 Сумма пополнения</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:14px">';
    [10, 25, 50, 100, 250, 500, 1000].forEach(function (v) {
      html += '<button type="button" class="cab-btn" onclick="window.PayUI.setAmount(' + v + ')" data-amt="' + v + '" style="background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.1);padding:10px;font-weight:700">$' + v + '</button>';
    });
    html += '</div>' +
      '<div class="form-row"><label class="cab-label">Или введи свою сумму, USD (мин $5, макс $5000)</label>' +
      '<input class="cab-input" id="pay-amount" type="number" min="5" max="5000" step="1" value="50"></div>' +
      '<div style="font-size:13px;color:#9ca3af;margin-bottom:14px">≈ <span id="pay-rub">4 750</span> ₽ (по курсу Platega)</div>' +

      '<h3 style="margin:18px 0 12px;color:#fff">💳 Способ оплаты</h3>' +
      '<div style="display:grid;gap:10px">' +
        '<label class="pay-method" style="display:flex;align-items:center;gap:14px;padding:14px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);border-radius:10px;cursor:pointer">' +
          '<input type="radio" name="pay-method" value="platega" ' + (STATE.plategaOk ? 'checked' : 'disabled') + ' style="width:18px;height:18px">' +
          '<div style="flex:1"><div style="display:flex;justify-content:space-between"><strong style="color:#fff">💳 Карта (Visa / MC / МИР · Platega)</strong>' + (STATE.plategaOk ? '<span style="color:#10b981;font-size:11px">✓ доступно</span>' : '<span style="color:#ef4444;font-size:11px">⚠ не настроено</span>') + '</div>' +
          '<div style="font-size:12px;color:#9ca3af;margin-top:4px">Российские карты, СБП, мгновенно. Курс ₽ от Platega</div></div>' +
        '</label>' +
        '<label class="pay-method" style="display:flex;align-items:center;gap:14px;padding:14px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);border-radius:10px;cursor:pointer">' +
          '<input type="radio" name="pay-method" value="cryptobot" ' + (STATE.plategaOk ? '' : 'checked') + ' style="width:18px;height:18px">' +
          '<div style="flex:1"><div style="display:flex;justify-content:space-between"><strong style="color:#fff">🤖 Криптовалюта (CryptoBot)</strong><span style="color:#10b981;font-size:11px">✓ доступно</span></div>' +
          '<div style="font-size:12px;color:#9ca3af;margin-top:4px">USDT, BTC, ETH, TON через @CryptoBot — оплата прямо в Telegram</div></div>' +
        '</label>' +
      '</div>' +

      '<button class="cab-btn cab-btn-primary" id="pay-submit" style="width:100%;margin-top:18px;padding:14px;font-size:15px" onclick="window.PayUI.submit()">💸 Перейти к оплате</button>' +
    '</div></div>';
    host.innerHTML = html;

    $('pay-amount').addEventListener('input', function () { window.PayUI.recalc(); });
    window.PayUI.recalc();
  }

  window.PayUI = {};

  window.PayUI.setAmount = function (v) {
    $('pay-amount').value = v;
    window.PayUI.recalc();
  };

  window.PayUI.recalc = function () {
    const v = Number($('pay-amount').value) || 0;
    // Approximate RUB rate (matches PLATEGA_USD_RATE=95 baked into trendex-api)
    const rub = Math.round(v * 95);
    if ($('pay-rub')) $('pay-rub').textContent = rub.toLocaleString('ru-RU');
  };

  window.PayUI.submit = async function () {
    const amount = Math.max(5, Math.min(5000, Number($('pay-amount').value) || 0));
    if (!amount) return toast('Минимум $5', true);
    const method = (document.querySelector('input[name="pay-method"]:checked') || {}).value;
    if (!method) return toast('Выбери способ оплаты', true);
    const btn = $('pay-submit');
    btn.disabled = true; btn.textContent = '⏳ Создаём счёт…';
    try {
      let url = '';
      if (method === 'platega') {
        const r = await fetch('/cabinet/api/platega/topup', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount_usd: amount }),
        });
        const d = await r.json();
        if (!r.ok || d.ok === false) throw new Error(d.reason || 'platega_failed');
        url = d.pay_url;
      } else if (method === 'cryptobot') {
        // CryptoBot top-up via cabinet bridge → trendex-api creates invoice
        const r = await fetch('/cabinet/api/pay/create-invoice', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tariff_code: 'topup', method: 'cryptobot', amount_usd: amount }),
        });
        const d = await r.json();
        if (!r.ok || d.ok === false) throw new Error(d.reason || 'cryptobot_failed');
        url = d.pay_url || d.url || (d.invoice && d.invoice.pay_url);
      }
      if (url) window.location.href = url;
      else throw new Error('no_pay_url');
    } catch (e) {
      const map = {
        'platega_not_configured': 'Platega пока не подключён',
        'amount_invalid_min_5_max_5000': 'Сумма должна быть от $5 до $5000',
        'no_planner_user': 'Профиль не найден — войди заново',
        'cryptobot_not_configured': 'CryptoBot не настроен',
        'not_authenticated': 'Сессия истекла. Перенаправляю на вход...',
        'auth_required': 'Войди в кабинет, чтобы пополнить. Перенаправляю...',
      };
      toast('Ошибка: ' + (map[e.message] || e.message), true);
      if (e.message === 'not_authenticated' || e.message === 'auth_required') {
        setTimeout(() => {
          window.location.href = '/cabinet/login?next=' + encodeURIComponent('/cabinet#/finance');
        }, 1500);
      }
      btn.disabled = false; btn.textContent = '💸 Перейти к оплате';
    }
  };

  window.loadPayPage = render;
})();
