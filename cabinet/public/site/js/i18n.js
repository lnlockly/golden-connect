// Golden Connect Cabinet i18n runtime — Marketing v2 (2026-04).
//
// Loads a per-language dictionary from /cabinet/i18n/<lang>.json and walks the
// DOM to replace any element tagged with data-i18n="key" (textContent) or
// data-i18n-attr="attr:key[,attr2:key2]" (attribute values). Dynamic render
// functions call window.t(key, params?) for their own strings.
//
// Language is picked in this order: ?lang= query, localStorage.cabinetLang,
// user profile pref (set after /api/auth/me), browser navigator.language, 'ru'.
// When switched, the choice is persisted to localStorage and to the server
// via POST /api/profile (best-effort; non-blocking).

(function () {
  'use strict';

  var SUPPORTED = ['ru','en','es','fr','de','zh','ja','ko','pt','hi','tr'];
  var DEFAULT = 'ru';

  var dict = {};
  var lang = DEFAULT;
  var ready = false;
  var readyCallbacks = [];

  function normaliseLang(code) {
    if (!code) return DEFAULT;
    var base = String(code).toLowerCase().split('-')[0];
    return SUPPORTED.indexOf(base) >= 0 ? base : DEFAULT;
  }

  function pickInitialLang() {
    try {
      var u = new URL(window.location.href);
      var q = u.searchParams.get('lang');
      if (q) return normaliseLang(q);
    } catch (e) { /* ignore */ }
    try {
      var stored = localStorage.getItem('cabinetLang');
      if (stored) return normaliseLang(stored);
    } catch (e) { /* ignore */ }
    return normaliseLang(navigator.language || DEFAULT);
  }

  function loadDict(code) {
    return fetch('/cabinet/i18n/' + code + '.json', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('dict_http_' + r.status);
        return r.json();
      })
      .catch(function () { return {}; });
  }

  function t(key, params) {
    var value = (dict && dict[key]) || key;
    if (!params) return value;
    return String(value).replace(/\{(\w+)\}/g, function (_, name) {
      return params[name] != null ? params[name] : '{' + name + '}';
    });
  }

  function applyTranslations(root) {
    var scope = root || document;

    // textContent replacement via [data-i18n="key"]
    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      if (!key) continue;
      var params = null;
      var paramsJson = el.getAttribute('data-i18n-params');
      if (paramsJson) {
        try { params = JSON.parse(paramsJson); } catch (e) { /* ignore bad params */ }
      }
      // Preserve leading/trailing icons (emoji + space): if the original text has
      // a leading emoji keep it, otherwise replace outright.
      var prev = el.textContent || '';
      var leading = '';
      var match = prev.match(/^(\s*[\u{1F300}-\u{1FAFF}☀-➿][\u{1F300}-\u{1FAFF}☀-➿️]*\s*)/u);
      if (match && el.hasAttribute('data-i18n-keep-icon')) leading = match[1];
      el.textContent = leading + t(key, params);
    }

    // attribute replacement via [data-i18n-attr="attr1:key1,attr2:key2"]
    var attrNodes = scope.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      var el2 = attrNodes[j];
      var spec = el2.getAttribute('data-i18n-attr') || '';
      var parts = spec.split(',');
      for (var p = 0; p < parts.length; p++) {
        var kv = parts[p].split(':');
        if (kv.length !== 2) continue;
        var attrName = kv[0].trim();
        var attrKey = kv[1].trim();
        if (attrName && attrKey) el2.setAttribute(attrName, t(attrKey));
      }
    }

    // <title> — explicit one-off marker
    var titleEl = document.querySelector('title[data-i18n]');
    if (titleEl && titleEl !== scope) {
      var tKey = titleEl.getAttribute('data-i18n');
      if (tKey) document.title = t(tKey);
    }
  }

  function setLang(code, opts) {
    opts = opts || {};
    var target = normaliseLang(code);
    return loadDict(target).then(function (loaded) {
      dict = loaded || {};
      lang = target;
      try { localStorage.setItem('cabinetLang', lang); } catch (e) { /* ignore */ }
      document.documentElement.setAttribute('lang', lang);
      applyTranslations();
      // Best-effort server sync so other surfaces (bot welcome, future SSR)
      // can read the profile language.
      if (opts.pushToServer !== false) {
        try {
          fetch('/cabinet/api/profile', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preferredLang: lang }),
          }).catch(function () { /* non-blocking */ });
        } catch (e) { /* ignore */ }
      }
      ready = true;
      while (readyCallbacks.length) readyCallbacks.shift()(lang);
      window.dispatchEvent(new CustomEvent('cabinet-lang-changed', { detail: { lang: lang } }));
      return lang;
    });
  }

  function getLang() { return lang; }
  function onReady(fn) {
    if (ready) fn(lang);
    else readyCallbacks.push(fn);
  }

  // Public API
  window.Golden ConnectI18n = {
    supported: SUPPORTED,
    default: DEFAULT,
    setLang: setLang,
    getLang: getLang,
    t: t,
    apply: applyTranslations,
    onReady: onReady,
  };
  // Convenience globals
  window.t = t;
  window.applyTranslations = applyTranslations;

  // Bootstrap on DOM ready
  function boot() {
    setLang(pickInitialLang(), { pushToServer: false });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
