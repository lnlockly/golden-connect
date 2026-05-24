// Trendex banner ad-loader.
// Usage in any page: <div data-ad-slot="cab-top" data-ad-format="728x90"></div>
// Then: <script src="/cabinet/js/ad-loader.js?v=1" defer></script>
//
// Auto-discovers all data-ad-slot containers, requests one banner per slot via
// /cabinet/api/ads-site/banner/serve, renders it, fires impression when ≥50%
// visible for ≥1s.

(function () {
  'use strict';
  if (window.__trxAdLoader) return;
  window.__trxAdLoader = true;

  const API = (path) => '/cabinet/api/ads-site' + path;

  function _post(path, body) {
    return fetch(API(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {}),
      keepalive: true,
    }).catch(() => {});
  }

  async function _serve(slot, format) {
    try {
      const r = await fetch(API('/banner/serve?slot=' + encodeURIComponent(slot)
        + '&format=' + encodeURIComponent(format)), { credentials: 'include' });
      if (!r.ok) return null;
      const j = await r.json();
      return (j && j.ok) ? j.banner : null;
    } catch (_) { return null; }
  }

  // [ad-loader-rework-2026-05-21] known banner format dimensions (must mirror server BANNER_FORMATS)
  const FORMAT_DIMS = {
    '728x90':  { w: 728, h: 90 },
    '300x250': { w: 300, h: 250 },
    '160x600': { w: 160, h: 600 },
    '320x100': { w: 320, h: 100 },
    'sticky-bottom': { w: 728, h: 90 },
  };
  function _dims(format, banner) {
    // Prefer the banner's own stored size if present, else the slot format,
    // else a safe 728x90 default.
    if (banner && banner.width && banner.height) return { w: banner.width, h: banner.height };
    return FORMAT_DIMS[format] || FORMAT_DIMS['728x90'];
  }

  function _renderBanner(host, banner, slot, format) {
    host.innerHTML = '';
    const dim = _dims(format, banner);
    const ratio = dim.w / dim.h;
    // Reserve the box BEFORE the image loads — no layout shift, no overflow.
    host.style.position = 'relative';
    host.style.width = '100%';
    host.style.maxWidth = dim.w + 'px';
    host.style.margin = host.style.margin || '0 auto';
    host.style.aspectRatio = dim.w + ' / ' + dim.h;
    host.style.minHeight = '';            // drop the old 50px that caused a jump
    host.style.overflow = 'hidden';
    host.style.borderRadius = '8px';

    const a = document.createElement('a');
    a.href = banner.click_url;
    a.target = '_blank';
    a.rel = 'noopener nofollow sponsored';
    a.dataset.bannerId = String(banner.id);
    a.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;text-decoration:none;line-height:0';

    const img = document.createElement('img');
    img.src = banner.image_url;
    img.alt = 'ad';
    img.loading = 'lazy';
    img.decoding = 'async';
    // object-fit:contain → image always fits the reserved box, never overflows
    // or stretches regardless of its real dimensions vs the slot format.
    img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;border-radius:8px';
    img.addEventListener('error', function(){ _renderEmpty(host); });
    a.appendChild(img);

    const tag = document.createElement('span');
    tag.textContent = 'Реклама';
    tag.style.cssText = 'position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,0.55);color:#fff;font:500 9px/1.4 -apple-system,sans-serif;padding:2px 6px;border-radius:4px;letter-spacing:0.3px;pointer-events:none';

    host.appendChild(a);
    host.appendChild(tag);

    // [impression-timer-fix] IntersectionObserver fires only when threshold is crossed.
    // We need to count an impression after the banner is ≥50% visible for ≥1 second
    // — so set a 1-second timer on enter, clear it on early exit. When timer fires,
    // banner is still visible → record impression.
    let counted = false;
    let timer = null;

    const obs = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (!counted && !timer) {
          timer = setTimeout(() => {
            timer = null;
            if (counted) return;
            counted = true;
            obs.disconnect();
            _post('/banner/track/impression', { banner_id: banner.id, slot });
          }, 1000);
        }
      } else {
        if (timer) { clearTimeout(timer); timer = null; }
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1.0] });
    obs.observe(host);

    a.addEventListener('click', () => {
      // Backup tracking — the /r/ redirect logs server-side too.
      _post('/banner/track/click', { banner_id: banner.id });
    });
  }

  function _renderEmpty(host) {
    // Don't take vertical space when no banner.
    host.style.display = 'none';
  }

  async function _hydrate(host) {
    const slot = host.getAttribute('data-ad-slot');
    const format = host.getAttribute('data-ad-format');
    if (!slot || !format) return;
    if (host.dataset.adHydrated === '1') return;
    host.dataset.adHydrated = '1';
    const banner = await _serve(slot, format);
    if (banner) _renderBanner(host, banner, slot, format);
    else _renderEmpty(host);
  }

  function _scan() {
    const hosts = document.querySelectorAll('[data-ad-slot]:not([data-ad-hydrated="1"])');
    hosts.forEach(_hydrate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scan);
  } else {
    _scan();
  }
  // Re-scan on cabinet page navigation (hash changes).
  window.addEventListener('hashchange', () => setTimeout(_scan, 80));
  // Mutation-observer for SPA injections.
  if (typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(() => _scan());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
