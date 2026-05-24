// Golden Connect marketplace product-reviews widget. Reads pid from script src ?pid=N.
(function () {
  const src = (document.currentScript && document.currentScript.src) || '';
  const m = src.match(/[?&]pid=(\d+)/);
  const pid = m ? Number(m[1]) : 0;
  if (!pid) return;
  const t = new URLSearchParams(window.location.search).get('t');

  // Inject 5-star buttons
  function buildStars() {
    const box = document.getElementById('r-stars'); if (!box) return;
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += '<button type="button" data-r="' + i + '" style="background:rgba(0,0,0,.3);color:#9ca3af;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 14px;font-size:18px;cursor:pointer">★</button>';
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-r]').forEach(function (b) {
      b.addEventListener('click', function () { window._setRating(parseInt(b.getAttribute('data-r'), 10)); });
    });
  }

  window._curRating = 0;
  window._setRating = function (n) {
    window._curRating = n;
    document.querySelectorAll('#r-stars [data-r]').forEach(function (b) {
      const on = parseInt(b.getAttribute('data-r'), 10) <= n;
      b.style.color = on ? '#fbbf24' : '#9ca3af';
      b.style.borderColor = on ? 'rgba(251,191,36,.4)' : 'rgba(255,255,255,.1)';
    });
  };
  window._submitReview = async function () {
    const status = document.getElementById('review-status');
    if (!t) { status.innerHTML = '<span style="color:#ef4444">Нет токена покупки</span>'; return; }
    if (!window._curRating) { status.innerHTML = '<span style="color:#ef4444">Поставь оценку 1-5★</span>'; return; }
    const r = await fetch('/cabinet/api/product-reviews/' + pid + '', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t, rating: window._curRating, text: document.getElementById('r-text').value }),
    });
    const d = await r.json();
    if (r.ok && d.ok) {
      status.innerHTML = '<span style="color:#10b981">✅ Спасибо за отзыв!</span>';
      setTimeout(function () { window.location.reload(); }, 900);
    } else {
      const map = { 'already_reviewed': 'Вы уже оставили отзыв на эту покупку', 'not_a_buyer': 'Только покупатели могут писать отзывы', 'token_required': 'Нет токена покупки' };
      status.innerHTML = '<span style="color:#ef4444">' + (map[d.reason] || d.reason || 'Ошибка') + '</span>';
    }
  };

  function loadReviews() {
    fetch('/cabinet/api/product-reviews/' + pid + '').then(function (r) { return r.json(); }).then(function (d) {
      const c = document.getElementById('reviews-list'); if (!c) return;
      const rev = (d && d.reviews) || [];
      if (!rev.length) {
        c.innerHTML = '<div style="color:#6b7280;font-size:13px;padding:14px;background:rgba(0,0,0,.2);border-radius:10px">Пока нет отзывов. Будь первым после покупки!</div>';
        return;
      }
      c.innerHTML = rev.map(function (r) {
        const stars = '★★★★★'.slice(0, r.rating) + '☆☆☆☆☆'.slice(0, 5 - r.rating);
        const txt = (r.text || '').replace(/[<>]/g, '');
        return '<div style="background:rgba(13,17,36,.6);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#fbbf24">' + stars + '</span><span style="color:#9ca3af;font-size:11px">' + (r.buyer_email || 'Аноним') + ' · ' + (r.created_at || '').slice(0, 10) + '</span></div>' + (txt ? '<div style="color:#cbd5e1;font-size:13px;line-height:1.5">' + txt + '</div>' : '') + '</div>';
      }).join('');
    }).catch(function () { /* ignore */ });
  }

  if (t) {
    const wrap = document.getElementById('review-form-wrap');
    if (wrap) wrap.style.display = 'block';
    buildStars();
  }
  loadReviews();
})();
