// Trendex force-watch video player.
// On every cabinet page load (and SPA hash change), asks /api/ads-site/video/should-show.
// If show=true — opens a fullscreen modal with the video, blocks UI for 10 seconds,
// then allows skip. CTA buttons before & after description.
//
// Tariff users (LAUNCH/BOOST/ROCKET) get show=false (paid_tariff) → never see this.
// Cooldown 6 hours per visitor.

(function () {
  'use strict';
  if (window.__trxForceWatchInit) return;
  window.__trxForceWatchInit = true;

  const API = (p) => '/cabinet/api/ads-site' + p;
  const STORAGE_DISMISS = 'trx_fw_dismiss_until';   // local browser cooldown (in addition to server)
  const PROBE_DELAY_MS = 4500;                       // wait 4.5s after page load before showing
  const HEARTBEAT_INTERVAL_MS = 2000;

  function _post(p, body) {
    return fetch(API(p), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {}),
      keepalive: true,
    }).then(r => r.json()).catch(() => null);
  }

  async function _shouldShow() {
    try {
      const dismissUntil = Number(localStorage.getItem(STORAGE_DISMISS) || 0);
      if (dismissUntil && Date.now() < dismissUntil) return null;
      const r = await fetch(API('/video/should-show'), { credentials: 'include' });
      if (!r.ok) return null;
      const j = await r.json();
      if (j && j.ok && j.show && j.video) return j.video;
      return null;
    } catch (_) { return null; }
  }

  function _showModal(video) {
    if (document.getElementById('trx-fw-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'trx-fw-modal';
    modal.innerHTML = `
      <style>
        #trx-fw-modal{position:fixed;inset:0;z-index:999990;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;backdrop-filter:blur(4px)}
        #trx-fw-modal *{box-sizing:border-box}
        #trx-fw-card{background:#0f172a;border:1px solid #1e293b;border-radius:18px;max-width:720px;width:100%;max-height:92vh;overflow:auto;position:relative}
        #trx-fw-video{width:100%;display:block;background:#000;max-height:60vh}
        #trx-fw-cta-top,#trx-fw-cta-bottom{display:block;background:linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%);color:#fff;padding:14px 18px;text-align:center;font-weight:700;text-decoration:none;font-size:15px;margin:14px 18px;border-radius:10px;box-shadow:0 4px 14px rgba(124,58,237,0.35)}
        #trx-fw-cta-top:hover,#trx-fw-cta-bottom:hover{transform:translateY(-1px)}
        #trx-fw-desc{padding:6px 22px 14px;color:#cbd5e1;font-size:14px;line-height:1.5;white-space:pre-wrap}
        #trx-fw-skip{position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;font-weight:600;display:flex;align-items:center;justify-content:center}
        #trx-fw-skip:disabled{cursor:not-allowed;opacity:0.4}
        #trx-fw-timer{position:absolute;top:14px;left:14px;background:rgba(0,0,0,0.6);color:#fbbf24;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;letter-spacing:.5px}
        #trx-fw-tariff-hint{padding:10px 18px;background:#0b1120;border-top:1px solid #1e293b;color:#94a3b8;font-size:12px;text-align:center}
        #trx-fw-tariff-hint a{color:#a78bfa;text-decoration:none;font-weight:600}
      </style>
      <div id="trx-fw-card">
        <button id="trx-fw-skip" disabled title="Можно закрыть после 10 сек">×</button>
        <div id="trx-fw-timer">⏱ 10s</div>
        <video id="trx-fw-video" src="${video.video_url}" ${video.thumb_url ? 'poster="' + video.thumb_url + '"' : ''}
               playsinline preload="auto" controls></video>
        <a id="trx-fw-cta-top" href="${video.target_url}" target="_blank" rel="noopener nofollow sponsored">${escapeAttr(video.title || 'Перейти →')}</a>
        ${video.description ? '<div id="trx-fw-desc">' + escapeText(video.description) + '</div>' : ''}
        <a id="trx-fw-cta-bottom" href="${video.target_url}" target="_blank" rel="noopener nofollow sponsored">Перейти на сайт →</a>
        <div id="trx-fw-tariff-hint">
          🚫 Хочешь убрать рекламу? <a href="#/marketing" id="trx-fw-tariff-link">Купи тариф LAUNCH ($45)</a> — и видео больше не будут показываться.
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const vid = modal.querySelector('#trx-fw-video');
    const skipBtn = modal.querySelector('#trx-fw-skip');
    const timer = modal.querySelector('#trx-fw-timer');
    const ctaTop = modal.querySelector('#trx-fw-cta-top');
    const ctaBottom = modal.querySelector('#trx-fw-cta-bottom');
    const tariffLink = modal.querySelector('#trx-fw-tariff-link');

    let watched = 0;
    let beat;
    let countdownLeft = video.min_watch_sec || 10;
    timer.textContent = '⏱ ' + countdownLeft + 's';

    const tick = () => {
      countdownLeft = Math.max(0, countdownLeft - 1);
      if (countdownLeft <= 0) {
        timer.style.background = 'rgba(34,197,94,0.25)';
        timer.style.color = '#86efac';
        timer.textContent = '✓ можно закрыть';
        skipBtn.disabled = false;
      } else {
        timer.textContent = '⏱ ' + countdownLeft + 's';
      }
    };
    const countdown = setInterval(tick, 1000);

    const heartbeat = async () => {
      watched = Math.min(600, vid.currentTime || watched);
      _post('/video/track/heartbeat', { video_id: video.id, watch_seconds: watched });
    };
    beat = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

    const close = () => {
      try { vid.pause(); } catch (_) {}
      clearInterval(beat);
      clearInterval(countdown);
      // Server-side cooldown is already recorded; also set local cooldown 6h.
      localStorage.setItem(STORAGE_DISMISS, String(Date.now() + 6 * 60 * 60 * 1000));
      modal.remove();
    };

    skipBtn.addEventListener('click', () => { if (!skipBtn.disabled) close(); });

    [ctaTop, ctaBottom].forEach(el => el.addEventListener('click', () => {
      _post('/video/track/click', { video_id: video.id });
      // Don't close — let viewer come back if they want; but most browsers will switch tabs.
    }));

    tariffLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate inside cabinet (closes modal first).
      close();
      try { window.location.hash = '#/marketing'; } catch (_) {}
    });

    // Try autoplay (muted helps in browsers).
    vid.muted = false;
    vid.play().catch(() => {
      // Some browsers block autoplay with sound — show a play overlay.
      vid.controls = true;
    });
  }

  function escapeText(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return String(s || '').replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  let _probedOnce = false;
  async function probe() {
    if (_probedOnce) return;
    _probedOnce = true;
    if (document.hidden) {
      // Defer until tab visible.
      const onVisible = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', onVisible); _runProbe(); } };
      document.addEventListener('visibilitychange', onVisible);
      return;
    }
    _runProbe();
  }

  async function _runProbe() {
    const v = await _shouldShow();
    if (v) _showModal(v);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(probe, PROBE_DELAY_MS));
  } else {
    setTimeout(probe, PROBE_DELAY_MS);
  }
})();
