// TRDX P2P Exchange v2 — corrects balance semantics:
//   TRDX  = storage.getTrxBalance(userId) — cabinet-local trxBalance per user
//   USD   = trendex-api /internal/finance/balances → working.usd (main withdrawal)
//   gift  = NOT used here — user explicitly said exchange uses main USD balance
//
// Listing create: debits TRDX from seller into escrow (recorded as negative
// ledger entry with reason 'p2p_listing_escrow'). Cancel refunds.
// Buy: credits TRDX to buyer (storage.awardTrx); USD split is recorded in
// trdx_trade_splits as a payout ledger (like marketplace shop-split).
// Actual USD transfer to seller's working balance happens via separate
// settlement (cron/admin) since trendex-api side payout endpoint TBD.

const express = require('express');

function createTrdxExchangeRoutes(deps) {
  const { storage, callTrendexApi, requireAuth, dbModule } = deps;
  const router = express.Router();
  const db = dbModule.getDb();

  // ── Schema (idempotent) ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS trdx_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_user_id INTEGER NOT NULL,
      amount_trdx_total REAL NOT NULL,
      amount_trdx_remaining REAL NOT NULL,
      price_per_trdx_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trdx_listings_open ON trdx_listings(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_trdx_listings_seller ON trdx_listings(seller_user_id);

    CREATE TABLE IF NOT EXISTS trdx_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      seller_user_id INTEGER NOT NULL,
      buyer_user_id INTEGER NOT NULL,
      amount_trdx REAL NOT NULL,
      total_usd REAL NOT NULL,
      seller_received_usd REAL NOT NULL,
      commission_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trdx_trades_buyer ON trdx_trades(buyer_user_id);
    CREATE INDEX IF NOT EXISTS idx_trdx_trades_seller ON trdx_trades(seller_user_id);

    CREATE TABLE IF NOT EXISTS trdx_trade_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      split_type TEXT NOT NULL,
      recipient_user_id INTEGER,
      upline_level INTEGER,
      amount_usd REAL NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trdx_trade_splits_trade ON trdx_trade_splits(trade_id);
  `);

  // [settled-column-migration-2026-05-14] add settled / settled_at columns
  // when the table pre-existed from earlier deploys without them.
  function ensureColumn(table, column, type) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      const has = cols.some((c) => c.name === column);
      if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (e) { console.warn('[trdx-exchange-alter]', table, column, e && e.message); }
  }
  ensureColumn('trdx_trade_splits', 'settled', "INTEGER NOT NULL DEFAULT 0");
  ensureColumn('trdx_trade_splits', 'settled_at', 'TEXT');
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_trdx_trade_splits_unsettled ON trdx_trade_splits(settled, created_at)");
  } catch (_) {}

  // ── Split logic (mirrors shop-split.js) ────────────────────────
  const SELLER_PCT = 0.70;
  const NON_SELLER = 1 - SELLER_PCT;
  const PROJECT_FRAC = 10 / 30;
  const LINEAR_FRAC = 7.5 / 30;
  const MATRIX_FRAC = 7.5 / 30;
  const POOL_FRAC = 5 / 30;
  const UPLINE_FRAC = [
    7.0/15.0, 2.0/15.0, 1.5/15.0, 1.0/15.0, 1.0/15.0,
    0.5/15.0, 0.5/15.0, 0.5/15.0, 0.5/15.0, 0.5/15.0,
  ];

  function getUpline(userId, maxDepth) {
    const out = [];
    if (!userId) return out;
    let cur = userId;
    for (let i = 0; i < maxDepth; i++) {
      const u = db.prepare('SELECT id, referred_by FROM users WHERE id = ?').get(cur);
      if (!u || !u.referred_by) break;
      out.push(u.referred_by);
      cur = u.referred_by;
    }
    return out;
  }

  function recordSplit(tradeId, totalUsd, sellerId, buyerId) {
    const sellerShare = +(totalUsd * SELLER_PCT).toFixed(6);
    const projectShare = +(totalUsd * NON_SELLER * PROJECT_FRAC).toFixed(6);
    const poolShare = +(totalUsd * NON_SELLER * POOL_FRAC).toFixed(6);
    const linearTotal = totalUsd * NON_SELLER * LINEAR_FRAC;
    const matrixShare = +(totalUsd * NON_SELLER * MATRIX_FRAC).toFixed(6);

    const ins = db.prepare(
      `INSERT INTO trdx_trade_splits (trade_id, split_type, recipient_user_id, upline_level, amount_usd)
       VALUES (?, ?, ?, ?, ?)`
    );
    ins.run(tradeId, 'seller', sellerId, null, sellerShare);
    ins.run(tradeId, 'project', null, null, projectShare);
    ins.run(tradeId, 'pool', null, null, poolShare);
    ins.run(tradeId, 'matrix_deferred', null, null, matrixShare);

    const upline = getUpline(buyerId, 10);
    let linearDistributed = 0;
    for (let i = 0; i < upline.length; i++) {
      const share = +(linearTotal * UPLINE_FRAC[i]).toFixed(6);
      ins.run(tradeId, 'linear', upline[i], i + 1, share);
      linearDistributed += share;
    }
    const unfilled = +(linearTotal - linearDistributed).toFixed(6);
    if (unfilled > 0.0001) {
      ins.run(tradeId, 'project_unfilled_linear', null, null, unfilled);
    }
    return { sellerShare, projectShare, poolShare, matrixShare };
  }

  // ── Balance helpers ────────────────────────────────────────────
  async function getEmail(req) {
    const u = req.webUser || storage.findWebUserById(req.session && req.session.userId);
    if (!u) return null;
    let email = String(u.email || '').trim().toLowerCase();
    const tgId = u.telegramUserId || u.telegram_user_id;
    if (!email && tgId) email = 'tg' + tgId + '@trendex.bot';
    return email || null;
  }

  async function getUsdWorking(email) {
    if (!email) return 0;
    try {
      const d = await callTrendexApi('/internal/finance/balances?email=' + encodeURIComponent(email));
      return Number((d && d.balances && d.balances.working && d.balances.working.usd) || 0);
    } catch (_) { return 0; }
  }

  // ── Routes ─────────────────────────────────────────────────────

  // GET /api/trdx-exchange/listings — public book
  router.get('/api/trdx-exchange/listings', requireAuth, (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const sort = req.query.sort === 'price-asc' ? 'price_per_trdx_usd ASC'
                : req.query.sort === 'price-desc' ? 'price_per_trdx_usd DESC'
                : req.query.sort === 'amount-desc' ? 'amount_trdx_remaining DESC'
                : 'created_at DESC';
      const rows = db.prepare(
        `SELECT l.*, u.tg_username, u.tg_first_name
         FROM trdx_listings l
         LEFT JOIN users u ON u.id = l.seller_user_id
         WHERE l.status = 'open' AND l.amount_trdx_remaining > 0
         ORDER BY ${sort} LIMIT ? OFFSET ?`
      ).all(limit, offset);
      res.json({ ok: true, listings: rows });
    } catch (e) {
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/trdx-exchange/my', requireAuth, (req, res) => {
    try {
      const uid = req.webUser.id;
      const listings = db.prepare(
        `SELECT * FROM trdx_listings WHERE seller_user_id = ? ORDER BY created_at DESC LIMIT 100`
      ).all(uid);
      const tradesAsBuyer = db.prepare(
        `SELECT * FROM trdx_trades WHERE buyer_user_id = ? ORDER BY created_at DESC LIMIT 50`
      ).all(uid);
      const tradesAsSeller = db.prepare(
        `SELECT * FROM trdx_trades WHERE seller_user_id = ? ORDER BY created_at DESC LIMIT 50`
      ).all(uid);
      res.json({ ok: true, listings, tradesAsBuyer, tradesAsSeller });
    } catch (e) {
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // POST /api/trdx-exchange/listings — debits TRDX from seller into escrow
  router.post('/api/trdx-exchange/listings', requireAuth, async (req, res) => {
    try {
      const { amount_trdx, price_total_usd, note } = req.body || {};
      const amt = Number(amount_trdx);
      const total = Number(price_total_usd);
      if (!(amt > 0)) return res.status(400).json({ ok: false, reason: 'amount_trdx > 0' });
      if (!(total > 0)) return res.status(400).json({ ok: false, reason: 'price_total_usd > 0' });
      if (amt < 1) return res.status(400).json({ ok: false, reason: 'min 1 TRDX' });
      if (total < 0.01) return res.status(400).json({ ok: false, reason: 'min $0.01' });

      const trdxBalance = Number(storage.getTrxBalance(req.webUser.id) || 0);
      if (trdxBalance < amt) {
        return res.status(400).json({
          ok: false, reason: 'insufficient_trdx',
          message: `На балансе ${trdxBalance.toFixed(2)} TRDX, нужно ${amt} TRDX`,
        });
      }

      // Real escrow: debit TRDX from seller now (refund on cancel)
      storage.awardTrx(req.webUser.id, -amt, 'p2p_listing_escrow', null);

      const pricePerTrdx = +(total / amt).toFixed(8);
      const r = db.prepare(
        `INSERT INTO trdx_listings (seller_user_id, amount_trdx_total, amount_trdx_remaining, price_per_trdx_usd, note)
         VALUES (?, ?, ?, ?, ?)`
      ).run(req.webUser.id, amt, amt, pricePerTrdx, note || null);

      res.json({ ok: true, listingId: r.lastInsertRowid });
    } catch (e) {
      console.error('[trdx-exchange/create]', e);
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // DELETE — refund remaining escrow TRDX to seller
  router.delete('/api/trdx-exchange/listings/:id', requireAuth, (req, res) => {
    try {
      const id = Number(req.params.id);
      const lst = db.prepare('SELECT * FROM trdx_listings WHERE id = ?').get(id);
      if (!lst) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (lst.seller_user_id !== req.webUser.id) return res.status(403).json({ ok: false, reason: 'not_owner' });
      if (lst.status !== 'open') return res.status(400).json({ ok: false, reason: 'already_closed' });

      // Refund unsold TRDX to seller
      const refund = Number(lst.amount_trdx_remaining || 0);
      if (refund > 0) {
        storage.awardTrx(lst.seller_user_id, refund, 'p2p_listing_cancel_refund', null);
      }
      db.prepare("UPDATE trdx_listings SET status = 'cancelled', amount_trdx_remaining = 0, updated_at = datetime('now') WHERE id = ?").run(id);
      res.json({ ok: true, refunded: refund });
    } catch (e) {
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // POST buy — credit TRDX to buyer; USD split recorded as ledger
  // (actual USD movement on trendex-api side is TBD via settlement job).
  router.post('/api/trdx-exchange/listings/:id/buy', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const amount = Number(req.body && req.body.amount_trdx);
      if (!(amount > 0)) return res.status(400).json({ ok: false, reason: 'amount > 0' });

      const lst = db.prepare('SELECT * FROM trdx_listings WHERE id = ?').get(id);
      if (!lst) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (lst.status !== 'open' || lst.amount_trdx_remaining <= 0) {
        return res.status(400).json({ ok: false, reason: 'listing_closed' });
      }
      if (amount > lst.amount_trdx_remaining) {
        return res.status(400).json({
          ok: false, reason: 'insufficient_supply',
          message: `Доступно ${lst.amount_trdx_remaining} TRDX, запрошено ${amount}`,
        });
      }
      if (lst.seller_user_id === req.webUser.id) {
        return res.status(400).json({ ok: false, reason: 'cannot_buy_own' });
      }

      const totalUsd = +(amount * lst.price_per_trdx_usd).toFixed(6);

      // Verify buyer has USD on MAIN withdrawal balance (working)
      const buyerEmail = await getEmail(req);
      const usdWorking = await getUsdWorking(buyerEmail);
      if (usdWorking < totalUsd) {
        return res.status(400).json({
          ok: false, reason: 'insufficient_usd',
          message: `На основном балансе $${usdWorking.toFixed(2)}, нужно $${totalUsd.toFixed(2)}`,
        });
      }

      // Reserve trade slot + run split atomically in cabinet DB
      const tx = db.transaction(() => {
        const sellerShare = +(totalUsd * SELLER_PCT).toFixed(6);
        const commission = +(totalUsd - sellerShare).toFixed(6);
        const tradeRes = db.prepare(
          `INSERT INTO trdx_trades (listing_id, seller_user_id, buyer_user_id, amount_trdx, total_usd, seller_received_usd, commission_usd, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')`
        ).run(id, lst.seller_user_id, req.webUser.id, amount, totalUsd, sellerShare, commission);
        const tradeId = tradeRes.lastInsertRowid;
        recordSplit(tradeId, totalUsd, lst.seller_user_id, req.webUser.id);

        const remaining = +(lst.amount_trdx_remaining - amount).toFixed(8);
        const newStatus = remaining <= 0.00000001 ? 'completed' : 'open';
        db.prepare(
          `UPDATE trdx_listings SET amount_trdx_remaining = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(Math.max(0, remaining), newStatus, id);
        db.prepare(`UPDATE trdx_trades SET completed_at = datetime('now') WHERE id = ?`).run(tradeId);

        return { tradeId, sellerShare, commission, remaining };
      });
      const result = tx();

      // Credit TRDX to buyer (cabinet-local)
      storage.awardTrx(req.webUser.id, amount, 'p2p_buy_trdx', lst.seller_user_id);

      // USD-side moves go through trendex-api settlement
      // (debit buyer's working, credit seller's working with 70%, distribute
      // commission to upline/project/pool). Pending until api endpoint exists.
      // [settle-real-api-2026-05-14] settle USD on trendex-api atomically.
      // Resolve seller's email from cabinet storage; api uses email→user_id
      // mapping. Amounts converted to micro (1 USD = 1_000_000 micro).
      const sellerObj = storage.findWebUserById(lst.seller_user_id);
      let sellerEmail = sellerObj ? String(sellerObj.email || '').trim().toLowerCase() : '';
      if (!sellerEmail && sellerObj) {
        const tgId = sellerObj.telegramUserId || sellerObj.telegram_user_id;
        if (tgId) sellerEmail = 'tg' + tgId + '@trendex.bot';
      }

      try {
        const apiRes = await callTrendexApi('/internal/finance/exchange-execute', {
          buyer_email: buyerEmail,
          seller_email: sellerEmail,
          total_micro: Math.round(totalUsd * 1_000_000),
          seller_share_micro: Math.round(result.sellerShare * 1_000_000),
          amount_trdx_micro: Math.round(amount * 1_000_000),
          trade_id: result.tradeId,
        });
        if (apiRes && apiRes.ok) {
          db.prepare("UPDATE trdx_trade_splits SET settled = 1, settled_at = datetime('now') WHERE trade_id = ?")
            .run(result.tradeId);
        } else {
          db.prepare("UPDATE trdx_trades SET status = 'pending_usd_settlement' WHERE id = ?").run(result.tradeId);
          console.warn('[trdx-exchange] api settle returned not-ok', apiRes);
        }
      } catch (apiErr) {
        db.prepare("UPDATE trdx_trades SET status = 'pending_usd_settlement' WHERE id = ?").run(result.tradeId);
        console.warn('[trdx-exchange] api settle threw', apiErr && apiErr.message);
      }

      res.json({ ok: true, trade: result });
    } catch (e) {
      console.error('[trdx-exchange/buy]', e);
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  return router;
}

module.exports = { createTrdxExchangeRoutes };
