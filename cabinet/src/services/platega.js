// Platega.io card-acquiring (RUB).
// Real API: POST https://app.platega.io/transaction/process
// Auth: X-MerchantId + X-Secret headers
// Webhook is authenticated by the same X-MerchantId/X-Secret headers.
const https = require('https');

const PAYMENT_METHODS = {
  SBP: 2,                    // SBP with QR code
  CARDS_RUB: 10,             // Russian cards (MIR, Visa, Mastercard)
  CARD_ACQUIRING: 11,        // General card acquiring (default)
  INTERNATIONAL: 12,         // International cards
  CRYPTO: 13,                // Cryptocurrency
};

class PlategaNotConfiguredError extends Error {
  constructor() { super('Platega credentials are not configured'); this.name = 'PlategaNotConfiguredError'; this.code = 'platega_not_configured'; }
}

function _env(name, def) { return process.env[name] || def || ''; }

function plategaConfigured() { return !!_env('PLATEGA_MERCHANT_ID') && !!_env('PLATEGA_API_SECRET'); }
function assertConfigured() { if (!plategaConfigured()) throw new PlategaNotConfiguredError(); }

function usdToRubInt(amountUsd) {
  const rate = Number(_env('PLATEGA_USD_RATE', '95')) || 95;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('amountUsd must be a positive finite number');
  return Math.round(amountUsd * rate);
}

function _httpJson(method, urlStr, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const headers = Object.assign({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }, extraHeaders || {});
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request({
      method, hostname: url.hostname, port: url.port || 443,
      path: url.pathname + (url.search || ''), headers, timeout: 15000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, json, text: buf, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('platega timeout')));
    if (data) req.write(data);
    req.end();
  });
}

async function createInvoice(args) {
  // args: { amountUsd, orderId, description, returnUrl, failedUrl, paymentMethod, payload }
  assertConfigured();
  const merchantId = _env('PLATEGA_MERCHANT_ID');
  const apiSecret = _env('PLATEGA_API_SECRET');
  const baseUrl = _env('PLATEGA_BASE_URL', 'https://app.platega.io').replace(/\/$/, '');
  const amountRub = usdToRubInt(args.amountUsd);
  const body = {
    paymentMethod: args.paymentMethod || PAYMENT_METHODS.SBP,
    id: (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : require("crypto").randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-4$3-$4-")),
    paymentDetails: { amount: amountRub, currency: 'RUB' },
    description: args.description || 'Golden Connect',
    return: args.returnUrl || '',
    failedUrl: args.failedUrl || args.returnUrl || '',
    payload: args.payload || args.orderId,
  };
  const r = await _httpJson('POST', baseUrl + '/transaction/process', body, {
    'X-MerchantId': merchantId,
    'X-Secret': apiSecret,
  });
  if (!r || r.status >= 400 || !r.json) {
    throw new Error('platega ' + (r && r.status) + ': ' + ((r && r.text) || '').slice(0, 400));
  }
  const data = r.json;
  const pay_url = data.redirect || data.url;
  const invoice_id = data.transactionId || data.id;
  if (!pay_url || !invoice_id) {
    throw new Error('platega response missing redirect/transactionId: ' + JSON.stringify(data).slice(0, 400));
  }
  return { pay_url, invoice_id, amount_rub: amountRub, expires_in: data.expiresIn || null, raw: data };
}

async function getTransaction(transactionId) {
  assertConfigured();
  const merchantId = _env('PLATEGA_MERCHANT_ID');
  const apiSecret = _env('PLATEGA_API_SECRET');
  const baseUrl = _env('PLATEGA_BASE_URL', 'https://app.platega.io').replace(/\/$/, '');
  const r = await _httpJson('GET', baseUrl + '/transaction/' + encodeURIComponent(transactionId), null, {
    'X-MerchantId': merchantId,
    'X-Secret': apiSecret,
  });
  if (!r || r.status >= 400) throw new Error('platega get-tx ' + (r && r.status) + ': ' + ((r && r.text) || '').slice(0, 200));
  return r.json;
}

// Webhook is authenticated via the SAME X-MerchantId / X-Secret headers (not HMAC).
function verifyWebhookHeaders(headers) {
  const wantId = _env('PLATEGA_MERCHANT_ID');
  const wantSecret = _env('PLATEGA_API_SECRET') || _env('PLATEGA_WEBHOOK_SECRET');
  const gotId = headers['x-merchantid'] || headers['X-MerchantId'] || headers['x-merchant-id'] || '';
  const gotSecret = headers['x-secret'] || headers['X-Secret'] || '';
  if (!wantId || !wantSecret) return false;
  return String(gotId) === String(wantId) && String(gotSecret) === String(wantSecret);
}

function makeOrderId(prefix, opaque) { return prefix + '_' + opaque + '_' + Date.now(); }

function parseOrderId(orderId) {
  if (typeof orderId !== 'string') return null;
  const m = orderId.match(/^([a-z]+)_(.+?)_(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], opaque: m[2], ts: Number(m[3]) };
}

module.exports = { createInvoice, getTransaction, verifyWebhookHeaders, plategaConfigured, usdToRubInt, makeOrderId, parseOrderId, PAYMENT_METHODS, PlategaNotConfiguredError };
