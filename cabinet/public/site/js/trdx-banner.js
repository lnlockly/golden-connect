// TRDX launch announcement banner — shows once on top of cabinet, dismissible.
(function () {
  if (window.__trdxBannerInit) return;
  window.__trdxBannerInit = true;

  const STORAGE_KEY = 'trdx_launch_banner_v1';
  if (localStorage.getItem(STORAGE_KEY) === 'dismissed') return;

  function inject() {
    if (document.getElementById('trdx-launch-banner')) return;
    const div = document.createElement('div');
    div.id = 'trdx-launch-banner';
    div.innerHTML = ''
      + '<style id="trdx-banner-css">'
      + '#trdx-launch-banner{position:fixed;top:0;left:0;right:0;z-index:9999;'
      + 'background:linear-gradient(135deg,#7c3aed 0%,#3b82f6 50%,#06b6d4 100%);'
      + 'color:#fff;padding:14px 20px;display:flex;align-items:center;gap:14px;'
      + 'box-shadow:0 4px 20px rgba(124,58,237,0.5);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;}'
      + '#trdx-launch-banner .icon{font-size:30px;flex-shrink:0;}'
      + '#trdx-launch-banner .body{flex:1;min-width:0;line-height:1.4;}'
      + '#trdx-launch-banner .ttl{font-weight:800;font-size:15px;margin-bottom:2px}'
      + '#trdx-launch-banner .sub{font-size:13px;opacity:0.95}'
      + '#trdx-launch-banner .btns{display:flex;gap:8px;flex-shrink:0;align-items:center}'
      + '#trdx-launch-banner .btn-go{background:#fff;color:#7c3aed;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;white-space:nowrap}'
      + '#trdx-launch-banner .btn-go:hover{transform:translateY(-1px)}'
      + '#trdx-launch-banner .btn-x{background:rgba(255,255,255,0.18);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1}'
      + '#trdx-launch-banner .btn-x:hover{background:rgba(255,255,255,0.3)}'
      + 'body{padding-top:64px!important}'
      + '@media(max-width:680px){#trdx-launch-banner{padding:10px 12px;gap:10px}'
      + '#trdx-launch-banner .icon{font-size:24px}'
      + '#trdx-launch-banner .ttl{font-size:13px}'
      + '#trdx-launch-banner .sub{font-size:12px}'
      + '#trdx-launch-banner .btn-go{padding:6px 12px;font-size:12px}'
      + 'body{padding-top:80px!important}}'
      + '</style>'
      + '<div class="icon">💎</div>'
      + '<div class="body">'
      + '<div class="ttl">Запустили Genesis TRDX — твой пресейл-баланс уже +100</div>'
      + '<div class="sub">Накопи TRDX за рефералов и тарифы. После старта — биржа, дивиденды и розыгрыши.</div>'
      + '</div>'
      + '<div class="btns">'
      + '<a href="#/trdx" class="btn-go" onclick="(window.navigateTo||function(){})(\'trdx\');return true">Открыть TRDX →</a>'
      + '<button class="btn-x" title="Скрыть" aria-label="Скрыть">×</button>'
      + '</div>';
    document.body.insertBefore(div, document.body.firstChild);

    div.querySelector('.btn-x').addEventListener('click', function () {
      localStorage.setItem(STORAGE_KEY, 'dismissed');
      const css = document.getElementById('trdx-banner-css');
      if (css) css.remove();
      div.remove();
    });
    div.querySelector('.btn-go').addEventListener('click', function () {
      localStorage.setItem(STORAGE_KEY, 'dismissed');
      setTimeout(function () {
        const css = document.getElementById('trdx-banner-css');
        if (css) css.remove();
        if (div.parentNode) div.remove();
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
