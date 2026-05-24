// Trendex Ads — web cabinet router. Mirrors the bot's ads-module functions
// over REST so users can manage campaigns/balances/claims from the browser.
// Reuses applySchema + makeStore from src/ads.js (same DB, same logic).

const { getApi, debitApi, creditApi } = require('../services/balance-bridge');
const express = require('express');
const https = require('https');
const dbModule = require('../planner/db/database');
const { applySchema, makeStore } = require('../ads');

const CENTS = 100;
const COMMISSION_BPS = 1000;
const SPONSOR_BPS = 500;
const MIN_REWARD_CENTS = 1;  // $0.01 — unified min reward
const MIN_TARGET = 10;
const MAX_TARGET = 100000;
const KARMA_INITIAL = 100;
// Karma proxy: api /internal/karma/award (fire-and-forget)
function _karmaAward(webUser, kind, sourceId, memo) {
  if (!webUser) return;
  const apiBase = process.env.TRENDEX_API_INTERNAL_URL || 'http://trendex-api:4001';
  const apiSecret = process.env.TRENDEX_API_INTERNAL_SECRET;
  if (!apiSecret) return;
  const tgId = webUser.telegramUserId || webUser.telegram_user_id;
  const email = webUser.email || (tgId ? 'tg' + tgId + '@trendex.bot' : null);
  if (!email) return;
  const data = JSON.stringify({ email: email, kind: kind, source_id: sourceId || null, memo: memo || null });
  const httpMod = apiBase.startsWith('https') ? require('https') : require('http');
  try {
    const url = new URL(apiBase + '/internal/karma/award');
    const req = httpMod.request({
      method: 'POST', hostname: url.hostname,
      port: url.port || (apiBase.startsWith('https') ? 443 : 80),
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-trendex-secret': apiSecret,
      },
      timeout: 5000,
    }, function (res) { res.resume(); });
    req.on('error', function () {});
    req.on('timeout', function () { req.destroy(); });
    req.write(data); req.end();
  } catch (e) {}
}


function tgApi(method, params) {
  const token = process.env.BOT_TOKEN || '';
  if (!token) return Promise.reject(new Error('BOT_TOKEN not set'));
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params || {});
    const req = https.request({
      method: 'POST',
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) resolve(parsed.result);
          else reject(new Error(parsed.description || 'tg_api_error'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('tg_api_timeout')));
    req.write(body);
    req.end();
  });
}

function createAdsWebRouter(config, storage, requireAuth, bot) {
  function ensureExecuting(req) {
    try {
      const sess = req.session || {};
      const wuId = sess.userId;
      if (!wuId) return null;
      const wu = storage.findWebUserById(wuId);
      if (!wu) return null;
      // Ensure planner-side user exists too (ads-system uses planner.users)
      const db = require('../planner/db/database');
      const tgId = Number(wu.telegramUserId) || (-Math.abs(Number(wu.id)));
      return db.ensureUser({ id: tgId, first_name: wu.displayName || ('User'+wu.id), username: wu.telegramUsername || null });
    } catch (e) { return null; }
  }


  applySchema(dbModule);
  const store = makeStore(dbModule);
  const router = express.Router();
  const rawDb = dbModule.getDb();

  function plannerUserFor(webUser) {
    let u;
    if (webUser.telegramUserId) {
      u = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(Number(webUser.telegramUserId));
      if (u) return u;
    }
    const syntheticTgId = -Math.abs(Number(webUser.id));
    u = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(syntheticTgId);
    if (u) return u;
    return dbModule.ensureUser({
      id: syntheticTgId,
      username: (webUser.email || 'user').split('@')[0],
      first_name: webUser.displayName || webUser.email || ('User ' + webUser.id),
    });
  }

  // ── Balances + karma + payout target
  router.get('/balances', requireAuth, async (req, res) => {
    try {
      const u = plannerUserFor(req.webUser);
      // Phase D/F: prefer api Postgres balances; fallback to planner only if api is down.
      let giftCents = 0, earnedCents = 0, karma = 100;
      try {
        const apiRes = await getApi({ tgId: u.tg_id });
        if (apiRes && apiRes.ok) {
          giftCents   = Number(apiRes.gift_cents || 0);
          earnedCents = Number(apiRes.working_cents || 0);
          karma       = Number(apiRes.karma || 100);
        } else {
          throw new Error('api unavailable');
        }
      } catch (_) {
        const b = store.get.balances(u.id);
        giftCents   = b.gift;
        earnedCents = b.earned;
        karma       = b.karma;
      }
      res.json({
        ok: true,
        gift_cents: giftCents,
        earned_cents: earnedCents,
        karma: karma,
        payout_target: u.ads_payout_target || 'earned',
      });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  router.post('/payout-target', requireAuth, (req, res) => {
    try {
      const target = req.body && req.body.target === 'gift' ? 'gift' : 'earned';
      const u = plannerUserFor(req.webUser);
      store.put.setPayoutTarget(u.id, target);
      res.json({ ok: true, payout_target: target });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // ── My campaigns (advertiser)
  router.get('/campaigns', requireAuth, (req, res) => {
    try {
      const u = plannerUserFor(req.webUser);
      const list = store.get.myCampaigns(u.id).map((c) => {
        const full = store.get.campaign(c.id);
        return {
          ...c,
          channel_title: full && full.channel ? full.channel.channel_title : null,
          channel_username: full && full.channel ? full.channel.channel_username : null,
          invite_link: full && full.channel ? full.channel.invite_link : null,
        };
      });
      res.json({ ok: true, items: list });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // ── Channel preview (verify bot is admin, fetch title/members)
  router.post('/channel-preview', requireAuth, async (req, res) => {
    try {
      const ref = String((req.body && req.body.channel) || '').trim();
      if (!ref) return res.status(400).json({ ok: false, reason: 'channel_required' });
      const target = ref.startsWith('@') ? ref : (/^-?\d+$/.test(ref) ? Number(ref) : '@' + ref);
      const chat = await tgApi('getChat', { chat_id: target });
      const me = await tgApi('getMe', {});
      const member = await tgApi('getChatMember', { chat_id: chat.id, user_id: me.id });
      const isAdmin = ['administrator', 'creator'].includes(member.status);
      let invite = chat.username ? 'https://t.me/' + chat.username : null;
      if (!invite && isAdmin) {
        try { const link = await tgApi('createChatInviteLink', { chat_id: chat.id, name: 'Trendex Ads' }); invite = link.invite_link; }
        catch (_) {}
      }
      let memberCount = 0;
      try { memberCount = await tgApi('getChatMemberCount', { chat_id: chat.id }); } catch (_) {}
      res.json({
        ok: true,
        chat_id: chat.id,
        title: chat.title,
        username: chat.username || null,
        type: chat.type,
        is_admin: isAdmin,
        invite_link: invite,
        member_count: memberCount,
        bot_username: me.username,
      });
    } catch (e) { res.status(400).json({ ok: false, reason: e.message }); }
  });

  // ── Create channel-subscribe campaign (atomic pay)
  router.post('/campaigns', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const kind = String(body.kind || 'sub').toLowerCase();
      if (!['sub', 'task', 'video'].includes(kind)) return res.status(400).json({ ok: false, reason: 'unsupported_kind' });

      // ── Phase I: task & video kinds ──
      if (kind === 'task' || kind === 'video') {
        const description = String(body.description || '').trim();
        const target = parseInt(body.target_count, 10);
        const rewardUsd = parseFloat(String(body.reward_usd || '').replace(',', '.'));
        const wallet = body.wallet === 'earned' ? 'earned' : 'gift';
        if (!description || description.length < 10) return res.status(400).json({ ok: false, reason: 'description_required' });
        if (!Number.isFinite(target) || target < 1 || target > MAX_TARGET) return res.status(400).json({ ok: false, reason: 'invalid_target' });
        if (!Number.isFinite(rewardUsd) || rewardUsd <= 0) return res.status(400).json({ ok: false, reason: 'invalid_reward' });
        const reward_cents = Math.round(rewardUsd * CENTS);
        if (reward_cents < MIN_REWARD_CENTS) return res.status(400).json({ ok: false, reason: 'reward_too_low' });

        const u = plannerUserFor(req.webUser);
        const payoutBudget = reward_cents * target;
        const fee = Math.round((payoutBudget * COMMISSION_BPS) / (10000 - COMMISSION_BPS));
        const budget = payoutBudget + fee;
        const sponsorCents = Math.round((budget * SPONSOR_BPS) / 10000);

        const apiWallet = wallet === 'gift' ? 'gift' : 'working';
        const dr = await debitApi({
          tgId: u.tg_id, wallet: apiWallet, cents: budget,
          kind: 'campaign_fund_web_' + kind,
          memo: 'web ' + kind + ' campaign: ' + description.slice(0, 60),
        });
        if (!dr || !dr.ok) {
          if (String(dr && dr.error || '').startsWith('insufficient')) return res.status(402).json({ ok: false, reason: 'insufficient_balance', wallet });
          return res.status(500).json({ ok: false, reason: 'api_debit_failed', error: dr && dr.error });
        }

        let campaignId;
        try {
          campaignId = store.txn(() => {
            const id = store.put.createCampaign({
              owner_user_id: u.id, kind, title: description.slice(0, 80),
              budget_cents: budget, reward_cents, fee_cents: fee, sponsor_cents: sponsorCents,
              target_count: target, paid_wallet: wallet,
              // min_karma is system-managed (advertiser cannot set)
            });

            if (kind === 'task') {
              const photo_required = body.photo_required ? 1 : 0;
              const ai_check_enabled = body.ai_check_enabled ? 1 : 0;
              const ai_check_criteria = String(body.ai_check_criteria || '').slice(0, 1000);
              const report_format = String(body.report_format || '').slice(0, 500);
              store.put.createCustomTask({
                campaign_id: id,
                description,
                report_format,
                ai_check_enabled,
                ai_check_criteria,
                photo_required,
              });
            } else {
              const video_url = String(body.video_url || '').slice(0, 500);
              const video_title = String(body.video_title || description).slice(0, 200);
              const video_duration_sec = parseInt(body.video_duration_sec, 10) || 30;
              const validation_mode = ['text_report', 'quiz', 'voice_report'].includes(body.validation_mode) ? body.validation_mode : 'text_report';
              let quiz_json = null;
              if (body.quiz_questions) {
                try { quiz_json = (typeof body.quiz_questions === 'string') ? JSON.parse(body.quiz_questions) : body.quiz_questions; }
                catch (_) { quiz_json = null; }
              }
              const criteria = String(body.ai_check_criteria || '').slice(0, 1000);
              store.put.createVideoTask({
                campaign_id: id,
                video_url, video_title, video_duration_sec,
                validation_mode, quiz_json, criteria,
                min_score: parseInt(body.min_score, 10) || 70,
              });
            }

            store.put.logTx({ kind: 'campaign_fund', user_id: u.id, wallet, amount_cents: -budget, campaign_id: id, note: 'web ' + kind + ' (api-debit)' });
            if (u.referred_by) {
              const sponsor = store.get.userById(u.referred_by);
              if (sponsor) {
                store.put.balanceDelta(sponsor.id, 'earned', sponsorCents);
                store.put.logTx({ kind: 'sponsor_bonus', user_id: sponsor.id, wallet: 'earned', amount_cents: sponsorCents, campaign_id: id, note: 'from web ref ' + u.id });
              }
            }
            const poolDelta = fee - (u.referred_by ? sponsorCents : 0);
            if (poolDelta > 0) {
              store.put.feePoolDelta(poolDelta);
              store.put.logTx({ kind: 'platform_fee', wallet: 'fee_pool', amount_cents: poolDelta, campaign_id: id });
            }
            return id;
          })();
        } catch (e) { return res.status(500).json({ ok: false, reason: 'create_failed', detail: e.message }); }

        try {
          _karmaAward(req.webUser, 'ad_submit', campaignId, 'campaign:' + campaignId);
          _karmaAward(req.webUser, 'ad_first', campaignId, 'first_campaign');
        } catch (_) {}

        return res.status(201).json({ ok: true, campaign_id: campaignId, kind, budget_cents: budget, fee_cents: fee, reward_cents, target });
      }

      // ── existing sub kind below ──
      const channel = String(body.channel || '').trim();
      const target = parseInt(body.target_count, 10);
      const rewardUsd = parseFloat(String(body.reward_usd || '').replace(',', '.'));
      const wallet = body.wallet === 'earned' ? 'earned' : 'gift';
      if (!channel) return res.status(400).json({ ok: false, reason: 'channel_required' });
      if (!Number.isFinite(target) || target < MIN_TARGET || target > MAX_TARGET) return res.status(400).json({ ok: false, reason: 'invalid_target' });
      if (!Number.isFinite(rewardUsd) || rewardUsd <= 0) return res.status(400).json({ ok: false, reason: 'invalid_reward' });
      const reward_cents = Math.round(rewardUsd * CENTS);
      if (reward_cents < MIN_REWARD_CENTS) return res.status(400).json({ ok: false, reason: 'reward_too_low' });

      // Verify channel + admin
      const ref = channel.startsWith('@') ? channel : (/^-?\d+$/.test(channel) ? Number(channel) : '@' + channel);
      const chat = await tgApi('getChat', { chat_id: ref });
      const me = await tgApi('getMe', {});
      const member = await tgApi('getChatMember', { chat_id: chat.id, user_id: me.id });
      if (!['administrator', 'creator'].includes(member.status)) {
        return res.status(400).json({ ok: false, reason: 'bot_not_admin', bot_username: me.username, channel_title: chat.title });
      }
      let invite = chat.username ? 'https://t.me/' + chat.username : null;
      if (!invite) {
        try { const link = await tgApi('createChatInviteLink', { chat_id: chat.id, name: 'Trendex Ads' }); invite = link.invite_link; }
        catch (_) {}
      }

      // Pricing
      const payoutBudget = reward_cents * target;
      const fee = Math.round((payoutBudget * COMMISSION_BPS) / (10000 - COMMISSION_BPS));
      const budget = payoutBudget + fee;
      const sponsorCents = Math.round((budget * SPONSOR_BPS) / 10000);
      const u = plannerUserFor(req.webUser);

      // Phase F (web): check + debit via api Postgres (planner is now legacy)
      const apiWallet = wallet === 'gift' ? 'gift' : 'working';
      const dr = await debitApi({
        tgId: u.tg_id, wallet: apiWallet, cents: budget,
        kind: 'campaign_fund_web', memo: 'web sub campaign: ' + (chat.title || chat.username || '?').slice(0, 60),
      });
      if (!dr || !dr.ok) {
        if (String(dr && dr.error || '').startsWith('insufficient')) {
          return res.status(402).json({ ok: false, reason: 'insufficient_balance', wallet });
        }
        return res.status(500).json({ ok: false, reason: 'api_debit_failed', error: dr && dr.error });
      }

      let campaignId;
      try {
        campaignId = store.txn(() => {
          const id = store.put.createCampaign({
            owner_user_id: u.id, kind: 'sub', title: chat.title || 'Канал',
            budget_cents: budget, reward_cents, fee_cents: fee, sponsor_cents: sponsorCents,
            target_count: target, paid_wallet: wallet,
            // min_karma is system-managed (advertiser cannot set)
          });
          store.put.setChannelTask(id, {
            channel_chat_id: chat.id,
            channel_username: chat.username ? '@' + chat.username : null,
            channel_title: chat.title || 'Канал',
            invite_link: invite,
          });
          // Note: balance already debited via api above; planner balance not changed.
          store.put.logTx({ kind: 'campaign_fund', user_id: u.id, wallet, amount_cents: -budget, campaign_id: id, note: 'web (api-debit)' });
          if (u.referred_by) {
            const sponsor = store.get.userById(u.referred_by);
            if (sponsor) {
              store.put.balanceDelta(sponsor.id, 'earned', sponsorCents);
              store.put.logTx({ kind: 'sponsor_bonus', user_id: sponsor.id, wallet: 'earned', amount_cents: sponsorCents, campaign_id: id, note: 'from web ref ' + u.id });
            }
          }
          const poolDelta = fee - (u.referred_by ? sponsorCents : 0);
          if (poolDelta > 0) {
            store.put.feePoolDelta(poolDelta);
            store.put.logTx({ kind: 'platform_fee', wallet: 'fee_pool', amount_cents: poolDelta, campaign_id: id });
          }
          return id;
        })();
      } catch (e) { return res.status(500).json({ ok: false, reason: 'create_failed', detail: e.message }); }

      // Karma: ad_submit (cap 10/day) + ad_first (lifetime, server enforces)
      try {
        _karmaAward(req.webUser, 'ad_submit', campaignId, 'campaign:' + campaignId);
        _karmaAward(req.webUser, 'ad_first', campaignId, 'first_campaign');
      } catch (_) {}

      res.status(201).json({ ok: true, campaign_id: campaignId, budget_cents: budget, fee_cents: fee, reward_cents, target, channel_title: chat.title });
    } catch (e) { res.status(400).json({ ok: false, reason: e.message }); }
  });

  router.post('/campaigns/:id/pause', requireAuth, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const c = store.get.campaign(id);
      const u = plannerUserFor(req.webUser);
      if (!c || c.owner_user_id !== u.id) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (c.status !== 'active') return res.status(400).json({ ok: false, reason: 'not_active' });
      store.put.setCampaignStatus(id, 'paused');
      res.json({ ok: true, status: 'paused' });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  router.post('/campaigns/:id/resume', requireAuth, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const c = store.get.campaign(id);
      const u = plannerUserFor(req.webUser);
      if (!c || c.owner_user_id !== u.id) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (!['paused', 'paused_missing_admin'].includes(c.status)) return res.status(400).json({ ok: false, reason: 'cant_resume' });
      store.put.setCampaignStatus(id, 'active');
      res.json({ ok: true, status: 'active' });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  router.delete('/campaigns/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const c = store.get.campaign(id);
      const u = plannerUserFor(req.webUser);
      if (!c || c.owner_user_id !== u.id) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (['done', 'archived', 'refunded'].includes(c.status)) return res.status(400).json({ ok: false, reason: 'already_closed' });
      const spent = c.reward_cents * c.completed_count;
      const remaining = c.budget_cents - c.fee_cents - spent;
      if (remaining <= 0) return res.status(400).json({ ok: false, reason: 'no_remaining' });
      const wallet = c.paid_wallet || 'gift';

      // Phase I.r2: refund via api Postgres (single source of truth post-Phase H)
      const apiWallet = wallet === 'gift' ? 'gift' : 'working';
      const cr = await creditApi({
        tgId: u.tg_id, wallet: apiWallet, cents: remaining,
        kind: 'campaign_refund', memo: 'cancel campaign #' + id,
      });
      if (!cr || !cr.ok) {
        return res.status(502).json({ ok: false, reason: 'api_credit_failed', error: cr && cr.error });
      }

      store.txn(() => {
        store.put.setCampaignStatus(id, 'refunded');
        store.put.logTx({ kind: 'campaign_refund', user_id: c.owner_user_id, wallet, amount_cents: remaining, campaign_id: id, note: 'web (api)' });
      })();

      // L.16: auto-reject any pending claims + notify those executors
      try {
        const ddb = require('../planner/db/database').getDb();
        const pending = ddb.prepare("SELECT id, executor_user_id FROM ad_task_claims WHERE campaign_id = ? AND status IN ('claimed','submitted','rework')").all(id);
        if (pending.length) {
          ddb.prepare("UPDATE ad_task_claims SET status = 'expired', decision_note = 'campaign_cancelled' WHERE campaign_id = ? AND status IN ('claimed','submitted','rework')").run(id);
          const botToken = (config && config.botToken) || process.env.BOT_TOKEN;
          if (botToken) {
            for (const p of pending) {
              const ex = ddb.prepare('SELECT tg_id FROM users WHERE id = ?').get(p.executor_user_id);
              if (ex && ex.tg_id) {
                const data = JSON.stringify({ chat_id: ex.tg_id, text: `⚠️ Кампания #${id} отменена заказчиком. Твоя заявка #${p.id} закрыта без выплаты.`, parse_mode: 'HTML' });
                const req = require('https').request({ method: 'POST', hostname: 'api.telegram.org', path: `/bot${botToken}/sendMessage`, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, () => {});
                req.on('error', () => {}); req.write(data); req.end();
              }
            }
          }
        }
      } catch (e) { console.warn('[delete-campaign notify]', e.message); }

      res.json({ ok: true, refunded_cents: remaining, wallet });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // ── My executor claims
  router.get('/claims', requireAuth, (req, res) => {
    try {
      const u = plannerUserFor(req.webUser);
      const list = store.get.myClaims(u.id, 100);
      res.json({ ok: true, items: list });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // ── Transactions feed (paginated)
  router.get('/transactions', requireAuth, (req, res) => {
    try {
      const u = plannerUserFor(req.webUser);
      const limit = Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 50));
      const items = rawDb.prepare(`SELECT * FROM ad_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(u.id, limit);
      res.json({ ok: true, items });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // ── Marketplace: active subscribe campaigns user can take
  // Pending reports for the OWNER (campaigns where executors submitted reports)
  router.get('/pending-reports', requireAuth, (req, res) => {
    try {
      const u = ensureExecuting(req);
      if (!u) return res.json({ ok: false, reason: 'no_user' });
      const items = store.get.listMyPendingReports(u.id, 50);
      res.json({ ok: true, items });
    } catch (e) {
      res.status(500).json({ ok: false, reason: 'pending_reports_failed' });
    }
  });

  // Decide on a report (approve / reject / rework / ai-check)
  router.post('/reports/:claimId/decide', requireAuth, async (req, res) => {
    try {
      const u = ensureExecuting(req);
      if (!u) return res.json({ ok: false, reason: 'no_user' });
      const claimId = parseInt(req.params.claimId, 10);
      const body = req.body || {};
      const decision = String(body.decision || '').toLowerCase();
      const reason = String(body.reason || '').trim();
      const runAi = !!body.runAi;

      const claim = store.get.claim(claimId);
      if (!claim) return res.status(404).json({ ok: false, reason: 'claim_not_found' });
      const camp = store.get.campaign(claim.campaign_id);
      if (!camp || camp.owner_user_id !== u.id) return res.status(403).json({ ok: false, reason: 'not_owner' });

      if (runAi) {
        const rep = require('../planner/db/database').getDb()
          .prepare('SELECT * FROM ad_custom_task_reports WHERE claim_id = ? ORDER BY id DESC LIMIT 1').get(claimId);
        const task = store.get.customTaskByCampaign(claim.campaign_id);
        if (!rep || !task) return res.json({ ok: false, reason: 'no_report_or_task' });
        // L.19: cache — return previous AI verdict if already computed
        if (rep.ai_score != null && rep.ai_verdict) {
          return res.json({ ok: true, ai: { score: rep.ai_score, verdict: rep.ai_verdict, reasoning: rep.ai_reasoning || '' }, cached: true });
        }
        const checker = require('../services/ai-task-checker');
        const r = rep.photo_url
          ? await checker.checkPhotoReport({ criteria: task.ai_check_criteria || task.report_format, photoUrl: rep.photo_url, taskDescription: task.description })
          : await checker.checkTextReport({ criteria: task.ai_check_criteria || task.report_format, reportText: rep.report_text, taskDescription: task.description });
        require('../planner/db/database').getDb()
          .prepare('UPDATE ad_custom_task_reports SET ai_score=?, ai_verdict=?, ai_reasoning=? WHERE id=?')
          .run(r.score, r.verdict, r.reasoning, rep.id);
        return res.json({ ok: true, ai: r });
      }

      if (!['approve', 'reject', 'rework'].includes(decision)) {
        return res.status(400).json({ ok: false, reason: 'invalid_decision' });
      }
      if ((decision === 'reject' || decision === 'rework') && reason.length < 3) {
        return res.status(400).json({ ok: false, reason: 'reason_required' });
      }
      // Phase J: decideClaim is now async (api Postgres credit for approve)
      const result = await store.put.decideClaim({ claim_id: claimId, decision, reason });
      if (!result.ok) {
        return res.status(500).json({ ok: false, reason: result.reason || 'decide_failed', error: result.error });
      }
      // L.10: notify executor via TG (best-effort) — use process.env.BOT_TOKEN directly
      // and add resubmit button on rework so executor can re-submit from web-driven decisions too
      try {
        const exTg = require('../planner/db/database').getDb().prepare('SELECT tg_id FROM users WHERE id = ?').get(result.executor_user_id);
        const botToken = (config && config.botToken) || process.env.BOT_TOKEN;
        if (exTg && exTg.tg_id && botToken) {
          const text = decision === 'approve'
            ? `✅ Отчёт по кампании #${camp.id} принят! Награда зачислена.`
            : decision === 'reject'
              ? `❌ Отчёт по кампании #${camp.id} отклонён.\n\nПричина: ${reason}`
              : `🔄 Отчёт по кампании #${camp.id} нужно доработать.\n\nКомментарий заказчика:\n${reason}\n\nНажми кнопку ниже и пришли исправленный отчёт.`;
          const payload = { chat_id: exTg.tg_id, text, parse_mode: 'HTML' };
          if (decision === 'rework') {
            payload.reply_markup = { inline_keyboard: [[{ text: '📝 Прислать новый отчёт', callback_data: 'resubmit_report_' + claimId }]] };
          }
          const data = JSON.stringify(payload);
          const req = require('https').request({
            method: 'POST', hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
          }, () => {});
          req.on('error', () => {});
          req.write(data); req.end();
        }
      } catch (e) {}
      res.json({ ok: true, result });
    } catch (e) {
      console.error('[reports/decide]', e && e.message);
      res.status(500).json({ ok: false, reason: 'decide_failed' });
    }
  });

  // ─── [sub-take-site] Site-side subscribe flow (mirrors bot's tryAutoCreditClaim) ───
  router.post('/sub/take', requireAuth, express.json({ limit: '8kb' }), async (req, res) => {
    try {
      const u = ensureExecuting(req);
      if (!u) return res.status(401).json({ ok: false, reason: 'auth' });
      if (!u.tg_id || u.tg_id <= 0) {
        return res.status(400).json({ ok: false, reason: 'no_tg_link',
          detail: 'Привяжи Telegram к аккаунту чтобы засчитывать подписки.' });
      }
      const campaignId = Number(req.body && req.body.campaign_id);
      if (!campaignId) return res.status(400).json({ ok: false, reason: 'no_campaign' });

      const camp = store.get.campaign(campaignId);
      if (!camp || camp.status !== 'active' || camp.kind !== 'sub') {
        return res.status(400).json({ ok: false, reason: 'campaign_inactive' });
      }
      if (camp.owner_user_id === u.id) {
        return res.status(400).json({ ok: false, reason: 'self_forbidden', detail: 'Нельзя подписаться на свой канал.' });
      }
      if (camp.completed_count >= camp.target_count) {
        return res.status(400).json({ ok: false, reason: 'campaign_done' });
      }

      // Daily cap
      const today = new Date().toISOString().slice(0, 10);
      const rl = store.put.consumeDailyClaim(u.id, today);
      if (!rl.ok) return res.status(429).json({ ok: false, reason: 'daily_cap' });

      // Channel
      const channel = rawDb.prepare('SELECT * FROM ad_channel_tasks WHERE campaign_id = ?').get(campaignId);
      if (!channel) return res.status(500).json({ ok: false, reason: 'no_channel_data' });

      // Existing claim?
      let claim = store.get.claimByPair(campaignId, u.id);
      if (!claim) {
        const payoutTarget = u.ads_payout_target || 'earned';
        const claimId = store.put.createClaim({
          campaign_id: campaignId, executor_user_id: u.id,
          status: 'claimed', payout_target: payoutTarget, reward_cents: camp.reward_cents,
        });
        claim = { id: claimId, status: 'claimed' };
      }

      const link = channel.invite_link ||
        (channel.channel_username ? `https://t.me/${String(channel.channel_username).replace(/^@/, '')}` : null);

      return res.json({
        ok: true,
        claim_id: claim.id,
        already_paid: claim.status === 'paid',
        channel_link: link,
        channel_title: channel.channel_title || null,
        reward_cents: camp.reward_cents,
      });
    } catch (e) {
      console.error('[sub/take]', e && e.message);
      return res.status(500).json({ ok: false, reason: 'take_failed' });
    }
  });

  // POST /sub/check — verify subscription & credit.
  router.post('/sub/check', requireAuth, express.json({ limit: '8kb' }), async (req, res) => {
    try {
      if (!bot || !bot.api) return res.status(503).json({ ok: false, reason: 'bot_unavailable' });
      const u = ensureExecuting(req);
      if (!u) return res.status(401).json({ ok: false, reason: 'auth' });
      const claimId = Number(req.body && req.body.claim_id);
      if (!claimId) return res.status(400).json({ ok: false, reason: 'no_claim' });

      const claim = store.get.claim(claimId);
      if (!claim || Number(claim.executor_user_id) !== Number(u.id)) {
        return res.status(404).json({ ok: false, reason: 'not_found' });
      }
      if (claim.status === 'paid') {
        return res.json({ ok: true, already_paid: true, reward_cents: claim.reward_cents });
      }
      if (claim.status !== 'claimed') {
        return res.status(400).json({ ok: false, reason: 'wrong_status', current: claim.status });
      }

      const camp = store.get.campaign(claim.campaign_id);
      if (!camp || camp.status !== 'active') return res.status(400).json({ ok: false, reason: 'campaign_inactive' });
      const channel = rawDb.prepare('SELECT * FROM ad_channel_tasks WHERE campaign_id = ?').get(claim.campaign_id);
      if (!channel || !channel.channel_chat_id) return res.status(500).json({ ok: false, reason: 'no_channel' });

      // Verify membership via bot
      let mem;
      try { mem = await bot.api.getChatMember(channel.channel_chat_id, u.tg_id); }
      catch (e) {
        return res.status(502).json({ ok: false, reason: 'check_failed', detail: e && e.message });
      }
      if (!['member', 'administrator', 'creator'].includes(mem && mem.status)) {
        return res.status(200).json({ ok: false, reason: 'not_subscribed', status: mem && mem.status });
      }

      // Credit + log
      try {
        store.txn(() => {
          const target = claim.payout_target || 'earned';
          store.put.balanceDelta(u.id, target, claim.reward_cents);
          store.put.updateClaim(claim.id, { status: 'paid', decided_at: new Date().toISOString() });
          store.put.incCompleted(camp.id);
          store.put.karmaDelta(u.id, +1);
          store.put.logChannelJoin({ campaign_id: camp.id, executor_user_id: u.id, channel_chat_id: channel.channel_chat_id });
          store.put.logTx({ kind: 'claim_reward', user_id: u.id, wallet: target, amount_cents: claim.reward_cents,
            campaign_id: camp.id, claim_id: claim.id, note: 'site_recheck' });
        })();
      } catch (e) {
        return res.status(500).json({ ok: false, reason: 'credit_failed', detail: e && e.message });
      }

      return res.json({ ok: true, credited: true, reward_cents: claim.reward_cents });
    } catch (e) {
      console.error('[sub/check]', e && e.message);
      return res.status(500).json({ ok: false });
    }
  });

    router.get('/marketplace', requireAuth, (req, res) => {
    try {
      const u = ensureExecuting(req);
      if (!u) return res.json({ ok: false, reason: 'no_user' });
      const items = [];
      // 1. Subscribe campaigns (existing)
      try {
        const subs = store.get.activeChannelMarket ? store.get.activeChannelMarket(20) : [];
        subs.forEach(c => items.push({ ...c, _kind: 'subscribe' }));
      } catch {}
      // 2. Custom tasks (with reports) — show ALL active, mark own with is_own flag
      try {
        const tasks = store.get.activeCustomCampaigns ? store.get.activeCustomCampaigns(20) : [];
        tasks.forEach(c => items.push({
          id: c.id, kind: 'task', _kind: 'task',
          title: c.description ? c.description.slice(0, 80) : c.title,
          description: c.description, report_format: c.report_format,
          photo_required: !!c.photo_required,
          reward_cents: c.reward_cents, target_count: c.target_count,
          completed_count: c.completed_count, status: c.status,
          min_karma: c.min_karma || 0,
          is_own: !!(u && u.id && c.owner_user_id === u.id),
        }));
      } catch {}
      // 3. Video tasks — same: include all, mark own
      try {
        const vids = store.get.activeVideoCampaigns ? store.get.activeVideoCampaigns(20) : [];
        vids.forEach(c => items.push({
          id: c.id, kind: 'video', _kind: 'video',
          title: c.video_title || 'Видео-задание',
          validation_mode: c.validation_mode,
          video_duration_sec: c.video_duration_sec,
          reward_cents: c.reward_cents, target_count: c.target_count,
          completed_count: c.completed_count, status: c.status,
          min_karma: c.min_karma || 0,
          is_own: !!(u && u.id && c.owner_user_id === u.id),
        }));
      } catch {}
      res.json({ ok: true, items });
    } catch (e) {
      console.error('[marketplace v2]', e && e.message);
      res.status(500).json({ ok: false, reason: 'marketplace_failed' });
    }
  });

  // Leaderboard — top earners (by earned_balance + ad_transactions sum)
  router.get('/leaderboard', (req, res) => {
    try {
      const period = String((req.query && req.query.period) || 'all').toLowerCase();
      const db = require('../planner/db/database').getDb();
      let dateClause = '';
      if (period === 'day')   dateClause = "AND t.created_at >= datetime('now', '-1 day')";
      else if (period === 'week') dateClause = "AND t.created_at >= datetime('now', '-7 days')";
      else if (period === 'month') dateClause = "AND t.created_at >= datetime('now', '-30 days')";
      const rows = db.prepare(`
        SELECT u.id, u.tg_username, u.tg_first_name, u.tg_last_name,
               COALESCE(SUM(CASE WHEN t.kind = 'reward' THEN t.amount_cents ELSE 0 END), 0) AS earned_cents,
               COUNT(DISTINCT t.claim_id) AS tasks_done
        FROM users u
        LEFT JOIN ad_transactions t ON t.user_id = u.id ${dateClause}
        GROUP BY u.id
        HAVING earned_cents > 0
        ORDER BY earned_cents DESC
        LIMIT 50
      `).all();
      const items = rows.map((r, i) => ({
        rank: i + 1,
        user_id: r.id,
        name: r.tg_first_name || ('User#' + r.id),
        username: r.tg_username || null,
        earned_cents: r.earned_cents,
        tasks_done: r.tasks_done,
        medal: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '',
      }));
      res.json({ ok: true, period, items });
    } catch (e) {
      console.error('[leaderboard]', e && e.message);
      res.status(500).json({ ok: false, reason: 'leaderboard_failed' });
    }
  });

  // [removed marketplace_OLD_DISABLED zombie route]
  router.get('/health', (_req, res) => {
    try { const n = rawDb.prepare('SELECT COUNT(*) AS n FROM ad_campaigns').get().n; res.json({ ok: true, campaigns: n }); }
    catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  return router;
}

module.exports = { createAdsWebRouter };
