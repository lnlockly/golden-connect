// Golden Connect: cron напоминаний об эфирах.
// [event-rsvp-kb] Inline keyboard with RSVP buttons attached to every reminder.
const { InlineKeyboard } = require('grammy');
const eventInvite = require('../services/event-invite'); // [event-invite-2026-05-21]
// [open-stream-chat-2026-05-21] live stream is hosted in the Golden Connect group's video chat
const GOLDEN_CONNECT_CHAT_URL = (function () {
  let c = String(process.env.GOLDEN_CONNECT_GROUP_CHAT || '@GOLDEN_CONNECT_AD').trim();
  if (/^https?:\/\//i.test(c)) return c;
  return 'https://t.me/' + c.replace(/^@/, '');
})();
//
// SUBSCRIBER phases (only people who explicitly subscribed to the event):
//   D-2  (48-24ч до, утро МСК)
//   D-1  (24-1ч до,  утро МСК)
//   D-0  (менее 24ч до, утро МСК)
//   H-1  (65-50 мин до)
//   H-0  (±5 мин от старта)
//
// GLOBAL phases (every webUser with telegramUserId, no subscription needed):
//   T-12h  (11h45min – 12h15min до)
//   T-6h   (5h45min – 6h15min до)
//   T-15m  (10 – 20 мин до)
//
// Per-user/per-event/per-phase dedup via:
//   - state.webEventSubscriptions[eventId][userId].phases[phase] for subs
//   - state.webEventGlobalSent[eventId][userId][phase]           for global

function isMskMorning() {
  const h = new Date().getUTCHours();
  return h >= 6 && h < 8;   // 9-11 МСК
}

function formatMsk(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
    }) + ' МСК';
  } catch (e) { return ''; }
}

function escapeHtmlEv(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildText(ev, phase) {
  const topic = String(ev.topic || '').trim();
  const title = String(ev.title || '').trim();
  const description = String(ev.description || '').trim();
  const speakerName = String(ev.speakerName || '').trim();
  const speakers = Array.isArray(ev.speakers) && ev.speakers.length
    ? ev.speakers.filter(Boolean)
    : (speakerName ? [speakerName] : []);

  const phaseHeaders = {
    d2:  '📅 <b>Через 2 дня — эфир Golden Connect</b>',
    d1:  '📅 <b>Завтра — эфир Golden Connect</b>',
    d0:  '🔔 <b>Сегодня эфир Golden Connect!</b>',
    t12: '⏳ <b>Через 12 часов начнётся эфир Golden Connect</b>',
    t6:  '⏰ <b>Через 6 часов — эфир Golden Connect</b>',
    h1:  '⏰ <b>Через час начинается эфир!</b>',
    t15: '🔴 <b>Через 15 минут — эфир!</b>',
    t5:  '🔴 <b>Через 5 минут начинается эфир!</b>',
    h0:  '🔴 <b>Эфир начинается прямо сейчас!</b>',
  };

  const lines = [phaseHeaders[phase] || `📡 ${escapeHtmlEv(title)}`, ''];
  lines.push('🔴 <b>Живая встреча по теме:</b>');
  lines.push(escapeHtmlEv(topic || title));
  lines.push('');

  if (speakers.length) {
    lines.push('👤 <b>Выступают профессора:</b>');
    speakers.forEach(s => lines.push('• ' + escapeHtmlEv(s)));
    lines.push('');
  }

  const norm = (s) => s.toLowerCase().replace(/[^\wа-яё]+/gi, ' ').trim().slice(0, 50);
  const dup = description && (
    norm(description).startsWith(norm(title).slice(0, 30)) ||
    (topic && norm(description).startsWith(norm(topic).slice(0, 30)))
  );
  // [event-invite-2026-05-21] prefer the freshly generated daily body (already HTML-safe with <b>)
  if (ev._dailyBody) {
    lines.push('💡 <b>Почему стоит прийти:</b>');
    lines.push(ev._dailyBody);
    lines.push('');
  } else if (description && !dup) {
    lines.push('💡 <b>Почему тебе туда нужно:</b>');
    const short = description.length > 300 ? description.slice(0, 300).trim() + '…' : description;
    lines.push(escapeHtmlEv(short));
    lines.push('');
  }

  lines.push('📅 ' + escapeHtmlEv(formatMsk(ev.startsAt)));

  if (phase !== 'h0' && phase !== 't15' && phase !== 't5') lines.push('', '👉 <b>Запишись и приходи!</b>');

  lines.push('', `▶️ <a href="${GOLDEN_CONNECT_CHAT_URL}">Открыть эфир в чате Golden Connect</a>`); // [open-stream-chat-2026-05-21]

  return lines.filter(l => l !== undefined && l !== null).join('\n');
}

// Build inline keyboard with RSVP buttons + live counts. Optional joinUrl row.
function buildRsvpKeyboard(ev, storage, userId) {
  const stats = (storage.getEventRsvpStats && storage.getEventRsvpStats(ev.id)) || { attend: 0, record: 0, skip: 0 };
  const my = userId ? (storage.getEventRsvp && storage.getEventRsvp(ev.id, userId)) : null;
  const mark = (kind) => (my === kind ? '✓ ' : '');
  const kb = new InlineKeyboard()
    .text(`${mark('attend')}✅ Приду · ${stats.attend}`,  `xh_rsvp:${ev.id}:attend`)
    .text(`${mark('record')}📼 Запись · ${stats.record}`,  `xh_rsvp:${ev.id}:record`)
    .row()
    .text(`${mark('skip')}🙅 Не приду · ${stats.skip}`,  `xh_rsvp:${ev.id}:skip`);
  kb.row().url('▶️ Открыть эфир', GOLDEN_CONNECT_CHAT_URL); // [open-stream-chat-2026-05-21]
  return kb;
}

async function sendToTgId(bot, tgId, text, ev) {
  if (!tgId) return false;
  try {
    // If event has a cover image, send as photo with caption. Otherwise plain message.
    if (ev && ev.coverImage) {
      const photoUrl = ev.coverImage.startsWith('http')
        ? ev.coverImage
        : 'https://goldenConnect.to' + ev.coverImage;
      // Telegram caption limit is 1024 chars; trim if needed
      const caption = text.length > 1024 ? text.slice(0, 1020) + '…' : text;
      try {
        const _kbPhoto = _storage ? buildRsvpKeyboard(ev, _storage, null) : undefined;
        await bot.api.sendPhoto(tgId, photoUrl, { caption, parse_mode: 'HTML', reply_markup: _kbPhoto });
        return true;
      } catch (e) {
        // Photo failed (bad URL etc) — fall through to plain message
        console.warn('[xh_cron_send_photo_failed]', tgId, e && e.message);
      }
    }
    const _kbMsg = _storage && ev ? buildRsvpKeyboard(ev, _storage, null) : undefined;
    await bot.api.sendMessage(tgId, text, { parse_mode: 'HTML', disable_web_page_preview: false, reply_markup: _kbMsg });
    return true;
  } catch (e) {
    console.error('[xh_cron_send]', tgId, e && e.message);
    return false;
  }
}

async function sendToUser(bot, storage, userId, text, ev) {
  const user = storage.findWebUserById(userId);
  if (!user || !user.telegramUserId) return false;
  return sendToTgId(bot, user.telegramUserId, text, ev);
}

// Subscriber dedup (existing path)
function pickSubscriberPhase(diffMs) {
  if (diffMs <= 5 * 60 * 1000 && diffMs >= -5 * 60 * 1000) return 'h0';
  if (diffMs >= 50 * 60 * 1000 && diffMs <= 65 * 60 * 1000) return 'h1';
  if (isMskMorning()) {
    if (diffMs > 24 * 3600 * 1000 && diffMs <= 48 * 3600 * 1000) return 'd2';
    if (diffMs > 60 * 60 * 1000 && diffMs <= 24 * 3600 * 1000) {
      return diffMs > 12 * 3600 * 1000 ? 'd1' : 'd0';
    }
  }
  return null;
}

// Global broadcast phase (every webUser with TG)
function pickGlobalPhase(diffMs) {
  // T-12h: 11h45min — 12h15min window (30min, generous so 5-min cron catches it)
  if (diffMs >= (12*3600 - 15*60) * 1000 && diffMs <= (12*3600 + 15*60) * 1000) return 't12';
  // T-6h: 5h45min — 6h15min window
  if (diffMs >= (6*3600 - 15*60) * 1000 && diffMs <= (6*3600 + 15*60) * 1000) return 't6';
  // T-15min: 10–20 min window
  if (diffMs >= 10 * 60 * 1000 && diffMs <= 20 * 60 * 1000) return 't15';
  // T-5min: 3–8 min window
  if (diffMs >= 3 * 60 * 1000 && diffMs <= 8 * 60 * 1000) return 't5';
  return null;
}

// Global dedup using state.webEventGlobalSent — created/written via storage helpers below.
function wasGlobalSent(storage, eventId, userId, phase) {
  if (typeof storage.wasEventGlobalReminderSent === 'function') {
    return storage.wasEventGlobalReminderSent(userId, eventId, phase);
  }
  return false;
}
function markGlobalSent(storage, eventId, userId, phase) {
  if (typeof storage.markEventGlobalReminderSent === 'function') {
    return storage.markEventGlobalReminderSent(userId, eventId, phase);
  }
  return false;
}

async function processPhase(bot, storage) {
  try {
    const events = storage.listUpcomingEvents(50);
    const now = Date.now();

    // [event-invite-2026-05-21] generate (once/day, cached) the fresh invite body + cover image
    let _daily = null;
    try { _daily = await eventInvite.getDailyInvite(); } catch (e) { console.warn('[event-invite]', e && e.message); }

    for (const ev of events) {
      if (_daily) {
        ev._dailyBody = _daily.body || null;
        if (_daily.coverImage) ev.coverImage = _daily.coverImage;   // new themed image each day
      }
      if (!ev.startsAt || ev.canceled) continue;
      if (ev.isPublished === false) continue;
      const startsMs = Date.parse(ev.startsAt);
      const diffMs = startsMs - now;

      // ── A) SUBSCRIBER reminders (5 existing phases) ──────────────────
      const subPhase = pickSubscriberPhase(diffMs);
      if (subPhase) {
        const subs = storage.getEventSubscribers(ev.id);
        for (const uid of Object.keys(subs)) {
          const sub = subs[uid] || {};
          const phases = sub.phases || {};
          if (phases[subPhase]) continue;
          const userId = Number(uid);
          const text = buildText(ev, subPhase);
          const sent = await sendToUser(bot, storage, userId, text, ev);
          if (sent) {
            storage.markEventReminderSent(userId, ev.id, subPhase);
            console.log(`[xh_reminder] phase=${subPhase} event=${ev.id} user=${userId} (subscriber)`);
          }
        }
      }

      // ── B) GLOBAL reminders (every webUser with TG) ─────────────────
      const globalPhase = pickGlobalPhase(diffMs);
      if (globalPhase) {
        const users = typeof storage.listAllWebUsers === 'function'
          ? storage.listAllWebUsers()
          : [];
        let sentCount = 0, skipCount = 0;
        for (const u of users) {
          if (!u || !u.telegramUserId) continue;
          if (wasGlobalSent(storage, ev.id, u.id, globalPhase)) { skipCount++; continue; }
          const text = buildText(ev, globalPhase);
          const sent = await sendToTgId(bot, u.telegramUserId, text, ev);
          if (sent) {
            markGlobalSent(storage, ev.id, u.id, globalPhase);
            sentCount++;
            // gentle throttle so we don't burst >25 msg/sec
            await new Promise(r => setTimeout(r, 50));
          }
        }
        console.log(`[xh_global_reminder] phase=${globalPhase} event=${ev.id} sent=${sentCount} dedup=${skipCount} pool=${users.length}`);
      }
    }
  } catch (e) {
    console.error('[xh_events_cron_error]', e && e.message);
  }
}

let _storage = null;
function startEventRemindersCron(bot, storage) {
  _storage = storage;
  setTimeout(() => processPhase(bot, storage), 30 * 1000).unref();
  const timer = setInterval(() => processPhase(bot, storage), 5 * 60 * 1000);
  if (timer.unref) timer.unref();
  console.log('[xh_events_cron] started — 5 subscriber phases + 3 global phases (t12/t6/t15), every 5 min');
}

module.exports = { startEventRemindersCron, buildRsvpKeyboard };
