/* TRDX Exchange — v2, correct balance reading:
 *   TRDX balance  → /cabinet/api/trx/me (real TRDX, 31192.75)
 *   USD balance   → /cabinet/api/finance/balances → working.usd ($800, main withdrawal)
 *   gift balance  → NOT used (user clarified exchange uses main USD)
 */
(function () {
  'use strict';

  function fmtUsd(n) { return '$' + (Number(n) || 0).toFixed(2); }
  function fmtTrdx(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }
  function fmtRate(n) { return '$' + (Number(n) || 0).toFixed(6); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  let myTrdx = 0;
  let myUsd = 0;

  async function fetchJson(url, opts) {
    const r = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
    return r.json();
  }

  async function loadMyBalances() {
    try {
      const [trx, fin] = await Promise.all([
        fetchJson('/cabinet/api/trx/me'),
        fetchJson('/cabinet/api/finance/balances'),
      ]);
      myTrdx = (trx && trx.ok) ? Number(trx.balance || 0) : 0;
      myUsd = Number((fin && fin.balances && fin.balances.working && fin.balances.working.usd) || 0);
    } catch (_) { myTrdx = 0; myUsd = 0; }
  }

  function balanceHeader() {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px">
        <div class="cab-card" style="padding:16px;background:linear-gradient(135deg,rgba(0,224,255,.10),rgba(177,74,255,.08));border:1px solid rgba(0,224,255,.30)">
          <div style="font-size:11px;letter-spacing:.14em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:8px">💎 Мой TRDX</div>
          <div style="font-size:26px;font-weight:700;color:#fff;font-variant-numeric:proportional-nums">${fmtTrdx(myTrdx)} <span style="font-size:14px;color:#00e0ff">TRDX</span></div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px">Эти TRDX можно выставить на продажу</div>
        </div>
        <div class="cab-card" style="padding:16px;background:linear-gradient(135deg,rgba(0,255,148,.10),rgba(177,74,255,.08));border:1px solid rgba(0,255,148,.30)">
          <div style="font-size:11px;letter-spacing:.14em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:8px">💰 Основной USD (на вывод)</div>
          <div style="font-size:26px;font-weight:700;color:#fff;font-variant-numeric:proportional-nums">${fmtUsd(myUsd)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px">Этим балансом можно покупать TRDX</div>
        </div>
      </div>`;
  }

  function listingCard(l) {
    const isMine = window.me && Number(l.seller_user_id) === Number(window.me.id);
    const remaining = Number(l.amount_trdx_remaining || 0);
    const total = Number(l.amount_trdx_total || 0);
    const filled = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
    const totalPrice = +(remaining * l.price_per_trdx_usd).toFixed(2);
    const sellerName = l.tg_first_name || l.tg_username || 'partner #' + l.seller_user_id;
    return `
      <article class="cab-card" style="padding:16px;display:flex;flex-direction:column;gap:10px;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;color:#9ca3af">от <strong style="color:#fff">${esc(sellerName)}</strong></div>
          ${isMine ? '<span style="font-size:10px;background:rgba(177,74,255,.20);color:#b14aff;padding:3px 8px;border-radius:6px;font-weight:700;text-transform:uppercase">МОЁ</span>' : ''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
          <div>
            <div style="font-size:22px;font-weight:700;color:#fff;font-variant-numeric:proportional-nums">${fmtTrdx(remaining)} <span style="font-size:13px;color:#00e0ff">TRDX</span></div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px">осталось из ${fmtTrdx(total)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px;font-weight:700;color:#00ff94;font-variant-numeric:proportional-nums">${fmtUsd(totalPrice)}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">${fmtRate(l.price_per_trdx_usd)} / TRDX</div>
          </div>
        </div>
        ${filled > 0 ? `
          <div style="background:rgba(255,255,255,.06);border-radius:6px;overflow:hidden;height:4px">
            <div style="background:linear-gradient(90deg,#b14aff,#00e0ff);height:100%;width:${filled}%"></div>
          </div>
          <div style="font-size:11px;color:#9ca3af">Продано ${filled}%</div>
        ` : ''}
        ${l.note ? `<div style="font-size:12px;color:#9ca3af;font-style:italic;padding:8px;background:rgba(255,255,255,.03);border-radius:6px">"${esc(l.note)}"</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:4px">
          ${isMine
            ? `<button class="cab-btn" onclick="window.cancelTrdxListing(${l.id})" style="flex:1">Отменить</button>`
            : `<button class="cab-btn cab-btn-primary" onclick="window.openBuyDialog(${l.id}, ${remaining}, ${l.price_per_trdx_usd})" style="flex:1">Купить</button>`
          }
        </div>
      </article>`;
  }

  function createForm() {
    return `
      <div class="cab-card" style="padding:20px;margin-bottom:24px;background:rgba(20,22,38,0.72);border:1px solid rgba(177,74,255,.30);border-radius:14px">
        <h3 style="margin:0 0 4px;font-size:16px;color:#fff">📤 Выставить TRDX на продажу</h3>
        <p style="color:#9ca3af;margin:0 0 16px;font-size:13px;line-height:1.5">Укажи сколько TRDX продаёшь и за сколько в долларах (USD). Покупатель сможет взять часть пакета по этому курсу.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px">
          <label style="display:block">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:700">Количество TRDX</div>
            <input id="trdx-list-amount" class="cab-input" type="number" min="1" step="any" placeholder="например 1000" oninput="window.recalcTrdxRate()" />
            <div style="font-size:11px;color:#9ca3af;margin-top:4px">Доступно: <strong style="color:#fff">${fmtTrdx(myTrdx)} TRDX</strong></div>
          </label>
          <label style="display:block">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:700">Цена за всё (USD)</div>
            <input id="trdx-list-price" class="cab-input" type="number" min="0.01" step="any" placeholder="например 1.00" oninput="window.recalcTrdxRate()" />
            <div style="font-size:11px;color:#9ca3af;margin-top:4px">Курс: <strong id="trdx-list-rate" style="color:#00e0ff">$0.00 / TRDX</strong></div>
          </label>
        </div>
        <label style="display:block;margin-bottom:14px">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:700">Комментарий (необязательно)</div>
          <input id="trdx-list-note" class="cab-input" type="text" maxlength="200" placeholder="например: продаю ниже рынка, быстрая сделка" />
        </label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="cab-btn cab-btn-primary" onclick="window.submitTrdxListing()" style="padding:10px 22px">Выставить на биржу</button>
          <span style="font-size:12px;color:#9ca3af">Комиссия биржи — <strong style="color:#fff">30%</strong> с каждой сделки идёт в реф-сеть, матрицу и пул</span>
        </div>
      </div>`;
  }

  async function loadActive() {
    const d = await fetchJson('/cabinet/api/trdx-exchange/listings?sort=price-asc&limit=100');
    return (d && d.listings) || [];
  }
  async function loadMy() {
    return await fetchJson('/cabinet/api/trdx-exchange/my');
  }

  async function render() {
    // [robust-render-2026-05-14] paint shell immediately so user never sees
    // a dark screen even if API hangs / throws. Then fill async.
    const host = document.getElementById('trdx-exchange-content');
    if (!host) {
      console.error('[trdx-exchange] #trdx-exchange-content not found');
      return;
    }
    host.innerHTML = '<div style="max-width:1100px;margin:0 auto;padding:24px"><h2 style="margin:0 0 4px;font-size:24px;color:#fff">🔄 Биржа TRDX</h2><p style="color:#9ca3af;margin:0 0 24px">P2P-обмен TRDX за USD между партнёрами.</p><div id="trdx-exchange-skeleton" style="padding:40px 20px;text-align:center;color:#9ca3af;background:rgba(20,22,38,0.6);border-radius:14px;border:1px solid rgba(255,255,255,0.08)"><div style="font-size:32px;margin-bottom:12px">⏳</div><div>Загрузка биржи…</div></div></div>';

    let listings = [];
    let mine = { listings: [], tradesAsBuyer: [], tradesAsSeller: [] };
    try {
      await loadMyBalances();
      const results = await Promise.allSettled([loadActive(), loadMy()]);
      if (results[0].status === 'fulfilled') listings = results[0].value || [];
      if (results[1].status === 'fulfilled') {
        const m = results[1].value;
        if (m && m.ok) mine = m;
      }
      if (results[0].status === 'rejected') console.error('[trdx-exchange/listings]', results[0].reason);
      if (results[1].status === 'rejected') console.error('[trdx-exchange/my]', results[1].reason);
    } catch (e) {
      console.error('[trdx-exchange/render-fetch]', e);
      const sk = document.getElementById('trdx-exchange-skeleton');
      if (sk) sk.innerHTML = '<div style="font-size:32px;margin-bottom:12px">⚠️</div><div style="color:#ff5577">Ошибка загрузки: ' + esc(e.message || String(e)) + '</div>';
      return;
    }

    let html = '';
    try { html = '<div style="max-width:1100px;margin:0 auto;padding:8px 0">';
    html += '<h2 style="margin:0 0 4px;font-size:24px;letter-spacing:-0.02em;color:#fff">🔄 Биржа TRDX</h2>';
    html += '<p style="color:#9ca3af;margin:0 0 18px;font-size:13.5px;max-width:680px;line-height:1.5">P2P-обмен: партнёры продают TRDX за USD друг другу. Курс ставит продавец. 70% получает продавец на основной баланс, 30% — реф-сеть/матрица/пул.</p>';
    html += balanceHeader();
    html += createForm();

    html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">';
    html += '<h3 style="margin:0;font-size:18px;color:#fff">🟢 Активные предложения <span style="color:#9ca3af;font-size:14px;font-weight:400">(' + listings.length + ')</span></h3>';
    html += '<div style="flex:1"></div>';
    html += '<select id="trdx-sort" onchange="window.reloadTrdxExchange(this.value)" class="cab-input" style="max-width:180px;padding:6px 10px;font-size:13px">';
    html += '<option value="price-asc">Сначала дешевле</option>';
    html += '<option value="price-desc">Сначала дороже</option>';
    html += '<option value="amount-desc">По объёму</option>';
    html += '<option value="">Сначала новые</option>';
    html += '</select>';
    html += '</div>';

    if (!listings.length) {
      html += '<div class="cab-card" style="padding:40px 20px;text-align:center;color:#9ca3af;background:rgba(20,22,38,0.72)">Пока нет активных предложений. Стань первым продавцом!</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:30px">';
      listings.forEach(l => { html += listingCard(l); });
      html += '</div>';
    }

    if (mine && mine.listings && mine.listings.length) {
      html += '<h3 style="margin:24px 0 12px;font-size:18px;color:#fff">📋 Мои предложения</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
      mine.listings.forEach(l => { html += listingCard(l); });
      html += '</div>';
    }

    if (mine && ((mine.tradesAsBuyer || []).length + (mine.tradesAsSeller || []).length) > 0) {
      html += '<h3 style="margin:24px 0 12px;font-size:18px;color:#fff">💱 История сделок</h3>';
      html += '<div class="cab-card" style="padding:0;overflow:hidden;background:rgba(20,22,38,0.72)">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
      html += '<thead><tr style="background:rgba(255,255,255,.04);text-align:left"><th style="padding:10px">Тип</th><th style="padding:10px">TRDX</th><th style="padding:10px">USD</th><th style="padding:10px">Когда</th><th style="padding:10px">Статус</th></tr></thead><tbody>';
      const allTrades = [
        ...(mine.tradesAsBuyer || []).map(t => Object.assign({}, t, { side: 'BUY' })),
        ...(mine.tradesAsSeller || []).map(t => Object.assign({}, t, { side: 'SELL' })),
      ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      allTrades.slice(0, 30).forEach(t => {
        html += '<tr style="border-top:1px solid rgba(255,255,255,.05)">';
        html += `<td style="padding:10px;color:${t.side === 'BUY' ? '#00ff94' : '#ff5577'}"><strong>${t.side === 'BUY' ? '📥 Купил' : '📤 Продал'}</strong></td>`;
        html += `<td style="padding:10px;color:#fff">${fmtTrdx(t.amount_trdx)}</td>`;
        html += `<td style="padding:10px;color:#fff">${fmtUsd(t.total_usd)}</td>`;
        html += `<td style="padding:10px;color:#9ca3af">${t.created_at}</td>`;
        html += `<td style="padding:10px;color:${t.status === 'completed' ? '#00ff94' : '#fbbf24'}">${esc(t.status)}</td>`;
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    html += '</div>';
      host.innerHTML = html;
    } catch (e) {
      console.error('[trdx-exchange/render-build]', e);
      const sk = document.getElementById('trdx-exchange-skeleton');
      if (sk) sk.innerHTML = '<div style="font-size:32px;margin-bottom:12px">⚠️</div><div style="color:#ff5577">Ошибка отрисовки: ' + esc(e.message || String(e)) + '</div>';
    }
  }

  window.loadTrdxExchangePage = render;
  window.reloadTrdxExchange = render;

  window.recalcTrdxRate = function () {
    const amt = Number(document.getElementById('trdx-list-amount').value) || 0;
    const price = Number(document.getElementById('trdx-list-price').value) || 0;
    const rate = amt > 0 ? price / amt : 0;
    const el = document.getElementById('trdx-list-rate');
    if (el) el.textContent = '$' + rate.toFixed(6) + ' / TRDX';
  };

  window.submitTrdxListing = async function () {
    const amt = Number(document.getElementById('trdx-list-amount').value);
    const price = Number(document.getElementById('trdx-list-price').value);
    const note = document.getElementById('trdx-list-note').value.trim();
    if (!(amt > 0) || !(price > 0)) {
      window.toast && window.toast('Введи количество и цену', 'error');
      return;
    }
    const r = await fetchJson('/cabinet/api/trdx-exchange/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_trdx: amt, price_total_usd: price, note }),
    });
    if (r && r.ok) {
      window.toast && window.toast('Предложение создано', 'success');
      render();
    } else {
      window.toast && window.toast((r && r.message) || (r && r.reason) || 'Ошибка', 'error');
    }
  };

  window.cancelTrdxListing = async function (id) {
    if (!confirm('Снять предложение? Несписанные TRDX вернутся на баланс.')) return;
    const r = await fetchJson('/cabinet/api/trdx-exchange/listings/' + id, { method: 'DELETE' });
    if (r && r.ok) { window.toast && window.toast('Снято, возвращено ' + r.refunded + ' TRDX', 'success'); render(); }
    else { window.toast && window.toast((r && r.reason) || 'Ошибка', 'error'); }
  };

  window.openBuyDialog = function (listingId, remaining, rate) {
    const maxByUsd = rate > 0 ? Math.floor(myUsd / rate * 100) / 100 : 0;
    const max = Math.min(remaining, maxByUsd);
    const amt = prompt(`Сколько TRDX покупаешь?\n\nДоступно в листинге: ${remaining}\nМаксимум по USD-балансу: ${maxByUsd.toFixed(2)}\nКурс: $${rate.toFixed(6)} / TRDX`, max.toFixed(2));
    if (!amt) return;
    const n = Number(amt);
    if (!(n > 0)) { window.toast && window.toast('Введи число > 0', 'error'); return; }
    fetchJson('/cabinet/api/trdx-exchange/listings/' + listingId + '/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_trdx: n }),
    }).then(r => {
      if (r && r.ok) { window.toast && window.toast('Сделка проведена! +' + n + ' TRDX', 'success'); render(); }
      else { window.toast && window.toast((r && r.message) || (r && r.reason) || 'Ошибка', 'error'); }
    });
  };
})();
