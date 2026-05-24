/* ═════════════════════════════════════════════════════════════════════════
   Trendex Cabinet — Service Worker for Web Push
   Scope: /cabinet/
   Handles: push, notificationclick, notificationclose, install, activate.
   ═════════════════════════════════════════════════════════════════════════ */

const SW_VERSION = 'trendex-cabinet-sw-v1';

// ── Lifecycle: activate immediately, skip waiting ────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Push event: server sends webpush.sendNotification(sub, payload) ──────
// Payload shape (from /api/push/broadcast or send): {
//   title: string, body: string, url?: string,
//   icon?: string, image?: string, tag?: string, badge?: string
// }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Plain text fallback
    try { data = { title: 'Trendex', body: event.data ? event.data.text() : '' }; } catch (_) {}
  }

  const title = data.title || 'Trendex';
  const options = {
    body: data.body || '',
    icon: data.icon || '/cabinet/favicon-32x32.png',
    badge: data.badge || '/cabinet/favicon-32x32.png',
    image: data.image || undefined,
    tag: data.tag || 'trendex-push',
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    timestamp: Date.now(),
    data: {
      url: data.url || '/cabinet/',
      eventId: data.eventId || null,
    },
    actions: data.actions || [],
    vibrate: data.vibrate || [120, 50, 120],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: focus existing tab or open new one ───────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/cabinet/';
  // If action was clicked (e.g. "Открыть эфир"), use its URL if present
  if (event.action && event.notification.data && event.notification.data[event.action + '_url']) {
    // (Reserved for future action-specific URLs.)
  }

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // If an existing window has the cabinet open — focus it
    for (const c of allClients) {
      try {
        const u = new URL(c.url);
        if (u.pathname.startsWith('/cabinet')) {
          await c.focus();
          // Send postMessage so the SPA can navigate to the right hash
          try {
            c.postMessage({ type: 'push-click', url: targetUrl });
          } catch (_) {}
          // If targetUrl has a hash and current is plain /cabinet/, ask client to navigate
          if (targetUrl !== c.url && c.navigate) {
            try { await c.navigate(targetUrl); } catch (_) {}
          }
          return;
        }
      } catch (_) {}
    }
    // No window open — open a new one
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener('notificationclose', (event) => {
  // Optional analytics ping — for now, no-op
});

// ── Cache: minimal, just service worker self-update behaviour ────────────
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
