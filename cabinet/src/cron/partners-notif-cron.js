// Partner-notifications worker — polls goldenConnect-api for undelivered rows in
// project_notifications_log, dispatches them to Telegram via the live bot
// instance, then marks them delivered. Runs every 30s.
//
// Three kinds of notifications:
//   - skip_missed:        sponsor in chain WITHOUT a link in this partner
//   - new_participant:    sponsor in chain WITH a link (their refferal arrived)
//   - author_new:         project author got a new participant (any depth)
//
// Templates ported from BN with light touch-ups for Golden Connect tone.

const { InlineKeyboard } = require('grammy');

const POLL_INTERVAL_MS = 30 * 1000;
const BATCH_LIMIT = 50;

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatLine(n) {
  return n === 1 ? '1-й линии' : `${n}-й линии`;
}

function buildSkipMessage(payload) {
  const line = Number(payload.line) || 1;
  const projectTitle = escapeHtml(payload.project_title || 'наш партнёр');
  const userName = escapeHtml(payload.user_label || 'новый пользователь');
  return (
    `⚠️ <b>Вы упустили реферала ${formatLine(line)} в партнёре "${projectTitle}"!</b>\n\n` +
    `Пользователь ${userName} уже зарегистрировался в этом партнёре и добавил свою реф-ссылку. ` +
    `Так как у вас нет своей ссылки в "${projectTitle}", реферал ушёл выше по цепочке.\n\n` +
    `💡 Зайди в раздел <b>«🤝 Наши партнёры»</b> и добавь свою ссылку, чтобы не терять будущих рефералов!`
  );
}

function buildNewParticipantMessage(payload) {
  const line = Number(payload.line) || 1;
  const projectTitle = escapeHtml(payload.project_title || 'твой партнёр');
  const userName = escapeHtml(payload.user_label || 'новый партнёр');
  return (
    `🎉 <b>Новый участник ${formatLine(line)} в партнёре "${projectTitle}"</b>\n\n` +
    `Пользователь: ${userName}\n\n` +
    `${line === 1
      ? '+10 TRDX уже начислены на твой баланс 💎'
      : 'Этот реферал считается в твою структуру, но без TRDX-награды (TRDX даём только за L1).'}`
  );
}

function buildAuthorNewMessage(payload) {
  const projectTitle = escapeHtml(payload.project_title || 'твой партнёр');
  const userName = escapeHtml(payload.user_label || 'новый партнёр');
  return (
    `🎉 <b>В твой партнёр "${projectTitle}" зарегистрировался новый участник</b>\n\n` +
    `Пользователь: ${userName}\n\n` +
    `Отличная работа — каталог растёт.`
  );
}

function buildButtons(payload, baseUrl) {
  const partnersUrl = baseUrl.replace(/\/$/, '') + '/cabinet#/partners';
  const detailUrl = payload.project_id
    ? `${baseUrl.replace(/\/$/, '')}/cabinet#/partners/${payload.project_id}`
    : partnersUrl;
  return new InlineKeyboard().url('🤝 Открыть партнёра', detailUrl);
}

function startPartnersNotifCron({ bot, config, callGolden ConnectApi }) {
  const baseUrl = config.publicBaseUrl || 'https://goldenConnect.to';
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const data = await callGolden ConnectApi(
        `/internal/partners/pending-notifications?limit=${BATCH_LIMIT}`,
      );
      const items = (data && data.notifications) || [];
      if (!items.length) return;

      const delivered = [];
      for (const n of items) {
        const tgId = Number(n.tg_id);
        if (!tgId) continue;
        const payload = n.payload || {};
        payload.project_title = payload.project_title || n.project_title;
        payload.project_id = payload.project_id || n.project_id;

        let text = '';
        if (n.kind === 'skip_missed') text = buildSkipMessage(payload);
        else if (n.kind === 'new_participant') text = buildNewParticipantMessage(payload);
        else if (n.kind === 'author_new') text = buildAuthorNewMessage(payload);
        else continue;

        try {
          await bot.api.sendMessage(tgId, text, {
            parse_mode: 'HTML',
            reply_markup: buildButtons(payload, baseUrl),
            disable_web_page_preview: true,
          });
          delivered.push(n.id);
        } catch (err) {
          // Block / chat-not-found / rate-limit — mark delivered anyway so we
          // don't retry forever on bad tgIds. Log for audit.
          const msg = String((err && err.description) || err);
          console.warn('[partners-notif] send failed for user', tgId, msg);
          if (/blocked|forbidden|chat not found|deactivated/i.test(msg)) {
            delivered.push(n.id);
          }
        }
        // Be gentle on Telegram throttle
        await new Promise((r) => setTimeout(r, 50));
      }

      if (delivered.length) {
        try {
          await callGolden ConnectApi('/internal/partners/mark-delivered', { ids: delivered });
        } catch (err) {
          console.error('[partners-notif] mark-delivered failed:', err && err.message);
        }
      }
    } catch (err) {
      console.error('[partners-notif] poll error:', err && err.message);
    } finally {
      running = false;
    }
  }

  // Start polling
  setTimeout(tick, 5000);
  setInterval(tick, POLL_INTERVAL_MS);
  console.log('[partners-notif] cron started — polling every', POLL_INTERVAL_MS / 1000, 'sec');
}

module.exports = { startPartnersNotifCron };
