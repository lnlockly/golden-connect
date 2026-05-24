// [lazy-router] Loads heavy route-scoped JS on first navigateTo() into matching page.
// Cuts ~340K (≈30%) from initial cabinet bundle for users who never open those pages.
// Safe to ship: only chunks the most isolated heavy modules; everything else stays eager.

(function () {
  'use strict';

  // page-name → array of script URLs to load before the page renders.
  // Use absolute /cabinet/js/... paths because cabinet is served under /cabinet/.
  var LAZY_MAP = {
    // shortener + bio share one big arsenal-ported bundle (226K)
    shortener: ['/cabinet/js/shortener-bio-arsenal.js?v=111'],
    bio:       ['/cabinet/js/shortener-bio-arsenal.js?v=111'],
    links:     ['/cabinet/js/shortener-bio-arsenal.js?v=111'],

    // TG-autoposting (65K)
    adcenter:  ['/cabinet/js/ad-center.js?v=6'],

    // AI-рассылки (49K) — same bundle for all 3 sub-pages
    'roboai-order':      ['/cabinet/js/roboai-pages.js?v=2fa_20260521'],
    'roboai-earn':       ['/cabinet/js/roboai-pages.js?v=2fa_20260521'],
    'roboai-moderation': ['/cabinet/js/roboai-pages.js?v=2fa_20260521'],

    // d3 + chart.js — needed only on graph-heavy pages
    network:     [
      'https://cdn.jsdelivr.net/npm/d3-force@3.0.0/dist/d3-force.min.js',
      'https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/dist/d3-selection.min.js',
      'https://cdn.jsdelivr.net/npm/d3-zoom@3.0.0/dist/d3-zoom.min.js',
    ],
    analytics:   ['https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'],
    leaderboard: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'],
    admin_stats: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'],
  };

  var loaded = Object.create(null);   // url → Promise
  function loadOne(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = false;   // preserve relative order if multiple urls for the page
      s.onload = function () { resolve(url); };
      s.onerror = function () {
        console.warn('[lazy-router] failed to load', url);
        delete loaded[url];   // allow retry on next nav
        resolve(url);          // never reject — degraded UX > broken nav
      };
      document.head.appendChild(s);
    });
    return loaded[url];
  }

  window.lazyLoadFor = function lazyLoadFor(pageName) {
    var urls = LAZY_MAP[pageName];
    if (!urls || !urls.length) return Promise.resolve();
    return Promise.all(urls.map(loadOne));
  };

  // [lazy-goPage-fix] Wrap window.goPage — that's the SPA's real nav entry
  // (defined inline in cabinet.html). Previously this wrapped navigateTo,
  // which doesn't exist anywhere in the cabinet → no lazy chunks ever loaded
  // → bio, marketplace, adcenter, roboai-*, network, analytics, leaderboard,
  // admin_stats all silently failed to render.
  function wrapNav(name) {
    var fn = window[name];
    if (typeof fn !== 'function' || fn.__lazyWrapped) return false;
    var orig = fn;
    var wrapped = function (page) {
      var args = arguments;
      var self = this;
      var urls = LAZY_MAP[page];
      if (!urls) return orig.apply(self, args);
      return window.lazyLoadFor(page).then(function () {
        return orig.apply(self, args);
      });
    };
    wrapped.__lazyWrapped = true;
    window[name] = wrapped;
    return true;
  }

  function wrapAll() {
    // wrap goPage (primary) + navigateTo (defensive — if reintroduced later)
    wrapNav('goPage');
    wrapNav('navigateTo');
    // [lazy-activatePage-fix] cabinet boot calls activatePage(hash) BEFORE
    // any goPage — without this wrap, deep-linked /cabinet/#/roboai-earn (and
    // any direct hash nav to a lazy page) renders empty because the chunk
    // never loads. Wraps the SAME way as goPage so the page first awaits
    // its bundles, then runs the original activatePage which calls loadPage.
    wrapNav('activatePage');
    return typeof window.goPage === 'function' && window.goPage.__lazyWrapped;
  }

  // goPage is defined by an inline script in cabinet.html, executed during
  // parse, BEFORE this defer-script runs → no polling needed in practice.
  // Keep a brief poll just in case load order changes.
  if (!wrapAll()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (wrapAll() || tries > 80) clearInterval(iv);   // ~8s max
    }, 100);
  }

  // [lazy-initial-hash] First-load deep-link handler. activatePage() is a
  // LOCAL fn in cabinet.html (not on window), so wrapNav cant touch it.
  // Instead we read location.hash on boot, eagerly load matching chunks,
  // then re-trigger page render via the inline-dispatch path
  // (loadPage finds the now-defined window.loadXxxPage and calls it).
  function getHashPage() {
    var h = (location.hash || "").replace(/^#\/?/, "").split(/[\/?&]/)[0];
    return h || "";
  }
  function preloadCurrentPage() {
    var name = getHashPage();
    if (!name || !LAZY_MAP[name]) return;
    window.lazyLoadFor(name).then(function () {
      // Try to re-render: prefer the page-specific loader if cabinet.html
      // already activated the page but the loader was undefined at dispatch.
      try {
        var fnMap = {
          "shortener": "loadShortener",
          "bio": "loadBioHubPage",
          "links": "loadShortener",
          "adcenter": "loadAdCenterPage",
          "roboai-order": "loadRoboaiOrderPage",
          "roboai-earn":  "loadRoboaiEarnPage",
          "roboai-moderation": "loadRoboaiModerationPage",
          "network": "loadNetworkV2",
          "analytics": "loadAnalyticsV2",
          "leaderboard": "loadLeaderboardPage",
          "admin_stats": "loadAdminStatsPage"
        };
        var fnName = fnMap[name];
        if (fnName && typeof window[fnName] === "function") window[fnName]();
      } catch (e) { console.warn("[lazy-initial-hash] re-render failed:", e.message); }
    });
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(preloadCurrentPage, 50);
  } else {
    window.addEventListener("DOMContentLoaded", function () { setTimeout(preloadCurrentPage, 50); });
  }
  // Also catch hash changes (bookmarks back/forward).
  window.addEventListener("hashchange", function () { setTimeout(preloadCurrentPage, 0); });
})();
