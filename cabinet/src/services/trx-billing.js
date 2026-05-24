// TRDX billing — atomic charge/credit operations on webUser.trxBalance.
// Uses storage's awardTrx (signed amount) — passes negative to charge.
// Always writes to ledger so we have a full audit trail.

let _storage = null;

function init(storage) {
  _storage = storage;
}

function _store() {
  if (!_storage) throw new Error('trx-billing not initialized — call init(storage) at startup');
  return _storage;
}

// Charge userId by `amount` TRDX. Throws if insufficient balance.
function chargeTrx(userId, amount, reason, refMeta = {}) {
  if (!userId) throw new Error('userId required');
  if (!(amount > 0)) throw new Error('amount must be positive');
  const balance = _store().getTrxBalance(userId);
  if (balance < amount) {
    const e = new Error(`insufficient TRDX (have ${balance}, need ${amount})`);
    e.code = 'INSUFFICIENT_TRDX';
    e.balance = balance;
    e.required = amount;
    throw e;
  }
  // Round to 4 decimal places — internal precision.
  const charge = Math.round(amount * 10000) / 10000;
  const newBalance = _store().awardTrx(userId, -charge, reason, refMeta.refUserId || null);
  return { ok: true, charged: charge, balance: newBalance };
}

function tryCharge(userId, amount, reason, refMeta = {}) {
  try {
    return chargeTrx(userId, amount, reason, refMeta);
  } catch (e) {
    if (e.code === 'INSUFFICIENT_TRDX') return { ok: false, reason: 'insufficient', balance: e.balance };
    throw e;
  }
}

function refundTrx(userId, amount, reason, refMeta = {}) {
  if (!userId || !(amount > 0)) return null;
  const newBalance = _store().awardTrx(userId, Math.round(amount * 10000) / 10000, reason, refMeta.refUserId || null);
  return { ok: true, refunded: amount, balance: newBalance };
}

module.exports = { init, chargeTrx, tryCharge, refundTrx };
