// i18n-gt.js — Google Translate fallback layer for Golden Connect cabinet.
// Piggybacks on Golden ConnectI18n (data-i18n dictionary for menu) and translates
// everything else via Google's widget. Triggered on cabinet-lang-changed.
(function () {
  'use strict';

  var loaded = false;
  var initialised = false;

  function ensureContainer() {
    if (document.getElementById('google_translate_element')) return;
    var el = document.createElement('div');
    el.id = 'google_translate_element';
    el.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(el);
  }

  function hideGtChrome() {
    if (document.getElementById('gt-suppress-style')) return;
    var css = document.createElement('style');
    css.id = 'gt-suppress-style';
    css.textContent =
      '.goog-te-banner-frame, .skiptranslate, iframe.goog-te-banner-frame { display: none !important; visibility: hidden !important; }' +
      'body { top: 0 !important; position: static !important; }' +
      'font[style*="vertical-align"] { vertical-align: inherit !important; }' +
      '.goog-tooltip, .goog-tooltip:hover { display: none !important; }' +
      '.goog-text-highlight { background: transparent !important; box-shadow: none !important; }' +
      '#goog-gt-tt, .goog-te-balloon-frame { display: none !important; }';
    document.head.appendChild(css);
  }

  function loadGt() {
    if (loaded) return;
    loaded = true;
    ensureContainer();
    hideGtChrome();
    window.googleTranslateElementInit = function () {
      try {
        new google.translate.TranslateElement({
          pageLanguage: 'ru',
          autoDisplay: false,
          includedLanguages: 'en,es,fr,de,zh-CN,ja,ko,pt,hi,tr',
          layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        }, 'google_translate_element');
        initialised = true;
        applyCurrent();
      } catch (e) {
        console.warn('[i18n-gt] init failed', e && e.message);
      }
    };
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    s.onerror = function () { console.warn('[i18n-gt] script load failed'); };
    document.head.appendChild(s);
  }

  // Google uses zh-CN (not zh), so normalise cabinet lang codes to GT codes.
  function toGtCode(code) {
    if (!code) return '';
    if (code === 'zh') return 'zh-CN';
    return code;
  }

  function setGtLang(target) {
    var select = document.querySelector('.goog-te-combo');
    if (!select) return false;
    select.value = target || '';
    select.dispatchEvent(new Event('change'));
    return true;
  }

  function applyCurrent() {
    var lang = (window.Golden ConnectI18n && window.Golden ConnectI18n.getLang && window.Golden ConnectI18n.getLang()) || 'ru';
    var target = lang === 'ru' ? '' : toGtCode(lang);
    var tries = 0;
    (function tick() {
      if (setGtLang(target)) return;
      if (tries++ < 60) setTimeout(tick, 150);
    })();
  }

  window.addEventListener('cabinet-lang-changed', function (ev) {
    var lang = (ev && ev.detail && ev.detail.lang) || 'ru';
    if (!loaded) {
      if (lang !== 'ru') loadGt();
      return;
    }
    applyCurrent();
  });

  // Bootstrap if initial language is non-RU.
  function bootstrap() {
    var lang = (window.Golden ConnectI18n && window.Golden ConnectI18n.getLang && window.Golden ConnectI18n.getLang()) || 'ru';
    if (lang !== 'ru') loadGt();
  }

  if (window.Golden ConnectI18n && window.Golden ConnectI18n.onReady) {
    window.Golden ConnectI18n.onReady(bootstrap);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(bootstrap, 300); });
  } else {
    setTimeout(bootstrap, 300);
  }
})();
