// Trendex Web Push client.
// Registers service worker, subscribes to push notifications,
// sends subscription to server API.
//
// Usage:
//   XHPush.init()              — call on page load
//   XHPush.subscribe()         — prompt user to subscribe
//   XHPush.isSubscribed()      — check if already subscribed
//   XHPush.unsubscribe()       — remove subscription

(function() {
  'use strict';

  var SW_PATH = '/cabinet/sw-push.js';
  var API_SUBSCRIBE = '/cabinet/api/push/subscribe';
  var API_UNSUBSCRIBE = '/cabinet/api/push/unsubscribe';
  var VAPID_PUBLIC_KEY = null; // loaded from /api/push/vapid-key
  var _registration = null;
  var _subscription = null;
  var _ready = false;

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function loadVapidKey() {
    if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
    try {
      var res = await fetch('/cabinet/api/push/vapid-key');
      var data = await res.json();
      if (data && data.ok && data.key) {
        VAPID_PUBLIC_KEY = data.key;
        return VAPID_PUBLIC_KEY;
      }
    } catch (e) {}
    return null;
  }

  async function init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[push] not supported');
      return false;
    }
    try {
      _registration = await navigator.serviceWorker.register(SW_PATH, { scope: '/cabinet/' });
      await navigator.serviceWorker.ready;
      _subscription = await _registration.pushManager.getSubscription();
      _ready = true;
      console.log('[push] ready, subscribed:', !!_subscription);
      return true;
    } catch (e) {
      console.error('[push] init failed:', e);
      return false;
    }
  }

  async function subscribe() {
    if (!_ready || !_registration) {
      var ok = await init();
      if (!ok) return { ok: false, reason: 'not_supported' };
    }
    var key = await loadVapidKey();
    if (!key) return { ok: false, reason: 'no_vapid_key' };
    try {
      _subscription = await _registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      // Send to server
      var res = await fetch(API_SUBSCRIBE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: _subscription.toJSON() }),
      });
      var data = await res.json();
      if (data && data.ok) {
        console.log('[push] subscribed');
        return { ok: true };
      }
      return { ok: false, reason: data && data.reason || 'server_error' };
    } catch (e) {
      console.error('[push] subscribe failed:', e);
      if (e.name === 'NotAllowedError') return { ok: false, reason: 'denied' };
      return { ok: false, reason: e.message || 'unknown' };
    }
  }

  async function unsubscribe() {
    if (_subscription) {
      try {
        await _subscription.unsubscribe();
        await fetch(API_UNSUBSCRIBE, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: _subscription.endpoint }),
        });
      } catch (e) {}
      _subscription = null;
    }
    return { ok: true };
  }

  function isSubscribed() {
    return !!_subscription;
  }

  function isSupported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window);
  }

  window.XHPush = {
    init: init,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    isSubscribed: isSubscribed,
    isSupported: isSupported,
  };

  // Auto-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); });
  } else {
    init();
  }
})();
