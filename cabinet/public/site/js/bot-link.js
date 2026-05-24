// Global helper: builds referral-aware bot links.
// Auto-rewrites all <a data-bot-link>, <button data-bot-link> elements on DOMContentLoaded.
//
// Usage:
//   <a href="#" data-bot-link>Открыть бот</a>            → t.me/GoldenConnect_bizbot?start=ref_<code>
//   <a href="#" data-bot-link="remind:ev_001">Напомнить</a> → t.me/GoldenConnect_bizbot?start=remind_ev_001_ref_<code>
//
// Or programmatically:
//   XHBot.url()              → ref-only link
//   XHBot.url('remind', 'ev_001') → remind deep link
//   XHBot.open('remind', 'ev_001') → window.open with new tab
//
// Resolves ref code from (in priority):
//  1. window.XH_REF (set explicitly)
//  2. URL ?ref=
//  3. window.me?.referralCode (in cabinet)
//  4. localStorage 'xh-ref' (sticky after first visit)

(function(){
  'use strict';

  var BOT_USERNAME = 'GoldenConnect_bizbot';
  var BOT_BASE = 'https://t.me/' + BOT_USERNAME;

  function readRefFromUrl() {
    try {
      var p = new URLSearchParams(location.search);
      var v = (p.get('ref') || '').trim().toLowerCase();
      return v || '';
    } catch(e) { return ''; }
  }

  function readRefFromStorage() {
    try { return (localStorage.getItem('xh-ref') || '').trim().toLowerCase(); }
    catch(e) { return ''; }
  }

  function persistRef(code) {
    if (!code) return;
    try { localStorage.setItem('xh-ref', code); } catch(e) {}
  }

  function resolveRef() {
    if (window.XH_REF) return String(window.XH_REF).trim().toLowerCase();
    var fromUrl = readRefFromUrl();
    if (fromUrl) { persistRef(fromUrl); return fromUrl; }
    var fromMe = (window.me && window.me.referralCode) || '';
    if (fromMe) { persistRef(fromMe); return String(fromMe).trim().toLowerCase(); }
    return readRefFromStorage();
  }

  function buildPayload(action, eventId, refCode) {
    var parts = [];
    if (action === 'remind' && eventId) {
      parts.push('remind_' + eventId);
      if (refCode) parts.push('ref_' + refCode);
    } else if (action === 'subscribe' && eventId) {
      parts.push('subscribe_' + eventId);
      if (refCode) parts.push('ref_' + refCode);
    } else if (action === 'event' && eventId) {
      parts.push('event_' + eventId);
      if (refCode) parts.push('ref_' + refCode);
    } else if (refCode) {
      parts.push('ref_' + refCode);
    } else if (action) {
      parts.push(String(action));
    }
    return parts.join('_');
  }

  function buildUrl(action, eventId) {
    var refCode = resolveRef();
    var payload = buildPayload(action, eventId, refCode);
    return payload ? BOT_BASE + '?start=' + encodeURIComponent(payload) : BOT_BASE;
  }

  function openBot(action, eventId) {
    var url = buildUrl(action, eventId);
    try { window.open(url, '_blank', 'noopener'); }
    catch(e) { location.href = url; }
    return url;
  }

  function applyToElement(el) {
    if (!el || el.getAttribute('data-bot-link-applied') === '1') return;
    var raw = String(el.getAttribute('data-bot-link') || '').trim();
    var action = '';
    var eventId = '';
    if (raw) {
      // formats: "remind:ev_001" / "subscribe:ev_002" / "event:ev_003"
      var parts = raw.split(':');
      action = parts[0] || '';
      eventId = parts[1] || '';
    }
    var url = buildUrl(action, eventId);
    if (el.tagName === 'A') {
      el.href = url;
      if (!el.target) el.target = '_blank';
      if (!el.rel) el.rel = 'noopener';
    } else {
      // button — attach click handler
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        openBot(action, eventId);
      });
    }
    el.setAttribute('data-bot-link-applied', '1');
  }

  function applyAll(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-bot-link]');
    for (var i = 0; i < nodes.length; i++) applyToElement(nodes[i]);
  }

  // Public API
  window.XHBot = {
    botUsername: BOT_USERNAME,
    url: function(action, eventId){ return buildUrl(action, eventId); },
    open: function(action, eventId){ return openBot(action, eventId); },
    refCode: function(){ return resolveRef(); },
    apply: applyAll,
    rewrite: applyAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ applyAll(); });
  } else {
    applyAll();
  }

  // Re-apply periodically for dynamic content (cabinet renders) — cheap
  var lastCount = 0;
  setInterval(function(){
    var nodes = document.querySelectorAll('[data-bot-link]:not([data-bot-link-applied="1"])');
    if (nodes.length !== lastCount && nodes.length > 0) {
      applyAll();
      lastCount = nodes.length;
    }
  }, 1500);
})();
