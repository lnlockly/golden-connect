// Thin fetch wrapper around trendex-api /api/monar/*.
// Dormant: nothing imports this until activation.

const DEFAULT_BASE = 'http://trendex-api/api/monar';

function baseUrl() {
  return process.env.MONAR_API_BASE || DEFAULT_BASE;
}

async function get(path) {
  const r = await fetch(baseUrl() + path, { headers: { accept: 'application/json' } });
  return r.json();
}

async function post(path, body) {
  const r = await fetch(baseUrl() + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

module.exports = {
  health: () => get('/health'),
  getQueue: (lotId) => get('/queue/' + encodeURIComponent(lotId)),
  getBalances: (userId) => get('/balances/' + encodeURIComponent(userId)),
  getWorldPool: () => get('/world-pool/current'),
  createEntry: (payload) => post('/entries', payload),
  adminSimulate: (payload) => post('/admin/simulate', payload),
  adminGetRules: () => get('/admin/rules'),
  adminUpdateRules: (payload) => post('/admin/rules', payload),
};
