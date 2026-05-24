// Golden Connect: Web Push notification server module.
// Stores push subscriptions in state.json webPushSubscriptions = { endpoint: { userId, sub, createdAt } }
// Sends push via web-push library.

let webpush;
try {
  webpush = require('web-push');
} catch (e) {
  console.warn('[web-push] web-push package not installed, push disabled');
}

function initVapid(config) {
  if (!webpush) return false;
  const publicKey = config.vapidPublicKey || process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = config.vapidPrivateKey || process.env.VAPID_PRIVATE_KEY || '';
  const email = config.vapidEmail || process.env.VAPID_EMAIL || 'mailto:admin@cabinet.golden-connect.to';
  if (!publicKey || !privateKey) {
    console.warn('[web-push] VAPID keys not set, push disabled');
    return false;
  }
  try {
    webpush.setVapidDetails(email, publicKey, privateKey);
    console.log('[web-push] VAPID configured');
    return true;
  } catch (e) {
    console.error('[web-push] VAPID init failed:', e && e.message);
    return false;
  }
}

// Store subscription for a user
function saveSubscription(storage, userId, subscription) {
  if (!subscription || !subscription.endpoint) return false;
  try {
    const state = JSON.parse(require('fs').readFileSync(
      require('path').join(process.cwd(), process.env.DATA_DIR || 'data', 'state.json'), 'utf8'
    ));
    if (!state.webPushSubscriptions) state.webPushSubscriptions = {};
    state.webPushSubscriptions[subscription.endpoint] = {
      userId: userId,
      subscription: subscription,
      createdAt: new Date().toISOString(),
    };
    require('fs').writeFileSync(
      require('path').join(process.cwd(), process.env.DATA_DIR || 'data', 'state.json'),
      JSON.stringify(state, null, 2)
    );
    return true;
  } catch (e) {
    console.error('[web-push] save failed:', e && e.message);
    return false;
  }
}

function removeSubscription(storage, endpoint) {
  try {
    const p = require('path').join(process.cwd(), process.env.DATA_DIR || 'data', 'state.json');
    const state = JSON.parse(require('fs').readFileSync(p, 'utf8'));
    if (state.webPushSubscriptions && state.webPushSubscriptions[endpoint]) {
      delete state.webPushSubscriptions[endpoint];
      require('fs').writeFileSync(p, JSON.stringify(state, null, 2));
    }
    return true;
  } catch (e) { return false; }
}

function getSubscriptionsForUser(storage, userId) {
  try {
    const p = require('path').join(process.cwd(), process.env.DATA_DIR || 'data', 'state.json');
    const state = JSON.parse(require('fs').readFileSync(p, 'utf8'));
    const subs = state.webPushSubscriptions || {};
    return Object.values(subs).filter(s => s.userId === userId).map(s => s.subscription);
  } catch (e) { return []; }
}

function getAllSubscriptions() {
  try {
    const p = require('path').join(process.cwd(), process.env.DATA_DIR || 'data', 'state.json');
    const state = JSON.parse(require('fs').readFileSync(p, 'utf8'));
    return Object.values(state.webPushSubscriptions || {});
  } catch (e) { return []; }
}

// Send push notification
async function sendPush(subscription, payload) {
  if (!webpush || !subscription) return false;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      // Subscription expired — remove it
      removeSubscription(null, subscription.endpoint);
    }
    return false;
  }
}

// Send to all subscriptions of a user
async function sendPushToUser(storage, userId, payload) {
  const subs = getSubscriptionsForUser(storage, userId);
  let sent = 0;
  for (const sub of subs) {
    if (await sendPush(sub, payload)) sent++;
  }
  return sent;
}

// Send to ALL subscribers (broadcast)
async function sendPushBroadcast(payload) {
  const all = getAllSubscriptions();
  let sent = 0;
  for (const entry of all) {
    if (await sendPush(entry.subscription, payload)) sent++;
  }
  return sent;
}

module.exports = {
  initVapid,
  saveSubscription,
  removeSubscription,
  getSubscriptionsForUser,
  sendPush,
  sendPushToUser,
  sendPushBroadcast,
};
