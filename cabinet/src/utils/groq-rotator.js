const https = require('https');

let roundRobinIndex = 0;

function uniq(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function splitKeys(value) {
  return String(value || '')
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectKeys(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source.flatMap((item) => collectKeys(item));
  if (typeof source === 'object') {
    return [
      ...collectKeys(source.groqKeys),
      ...collectKeys(source.groqKey),
      ...collectKeys(source.groqApiKey),
    ];
  }
  return splitKeys(source);
}

function getGroqKeys(source) {
  const direct = uniq(collectKeys(source));
  if (direct.length) return direct;
  return uniq([
    ...collectKeys(process.env.GROQ_KEYS),
    ...collectKeys(process.env.GROQ_KEY),
    ...collectKeys(process.env.GROQ_API_KEY),
  ]);
}

function hasGroqKeys(source) {
  return getGroqKeys(source).length > 0;
}

function nextStartIndex(length) {
  if (!length) return 0;
  const current = roundRobinIndex % length;
  roundRobinIndex = (current + 1) % length;
  return current;
}

function extractGroqErrorMessage(statusCode, payload, raw) {
  if (payload && payload.error && payload.error.message) return String(payload.error.message);
  if (payload && payload.message) return String(payload.message);
  const compact = String(raw || '').replace(/\s+/g, ' ').trim();
  if (compact) return compact.slice(0, 400);
  return `Groq request failed with status ${statusCode || 0}`;
}

function buildGroqError(statusCode, payload, raw) {
  const error = new Error(extractGroqErrorMessage(statusCode, payload, raw));
  error.statusCode = Number(statusCode || 0) || 0;
  error.payload = payload || null;
  error.raw = raw || '';
  return error;
}

function shouldRotateGroqError(error) {
  const statusCode = Number(error && error.statusCode || 0) || 0;
  if ([401, 403, 429].includes(statusCode) || statusCode >= 500) return true;

  const code = String(error && error.code || '').trim().toUpperCase();
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ESOCKETTIMEDOUT'].includes(code)) return true;

  const message = String(error && error.message || '').toLowerCase();
  if (message === 'timeout') return true;
  return /rate limit|too many requests|quota|credit|billing|insufficient|exhausted|permission|unauthorized|invalid api key|tokens per minute|requests per minute/.test(message);
}

function requestOnce(options) {
  const method = options.method || 'POST';
  const timeoutMs = Number(options.timeoutMs || 25000) || 25000;
  const body = options.body == null ? '' : options.body;
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${options.apiKey}`,
  };

  if (body && headers['Content-Length'] == null) {
    headers['Content-Length'] = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(String(body));
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: options.path || '/openai/v1/chat/completions',
      method,
      headers,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let payload = null;
        try {
          payload = raw ? JSON.parse(raw) : null;
        } catch (_) {}

        if ((res.statusCode || 0) >= 400 || (payload && payload.error)) {
          return reject(buildGroqError(res.statusCode, payload, raw));
        }

        if (payload == null) {
          return reject(buildGroqError(res.statusCode, null, raw || 'Empty Groq response'));
        }

        resolve(payload);
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      const timeoutError = new Error('timeout');
      timeoutError.code = 'ETIMEDOUT';
      req.destroy(timeoutError);
    });

    if (body) req.write(body);
    req.end();
  });
}

async function requestGroqJson(options = {}) {
  const groqKeys = getGroqKeys(options.groqKeys);
  if (!groqKeys.length) throw new Error('GROQ keys not set');

  const startIndex = nextStartIndex(groqKeys.length);
  let lastError = null;

  for (let offset = 0; offset < groqKeys.length; offset += 1) {
    const keyIndex = (startIndex + offset) % groqKeys.length;
    try {
      return await requestOnce({
        ...options,
        apiKey: groqKeys[keyIndex],
      });
    } catch (error) {
      lastError = error;
      lastError.keyIndex = keyIndex;
      if (offset >= groqKeys.length - 1 || !shouldRotateGroqError(error)) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Groq request failed');
}

async function requestGroqChatCompletion(messages, options = {}) {
  const payload = await requestGroqJson({
    path: '/openai/v1/chat/completions',
    timeoutMs: options.timeoutMs || 25000,
    groqKeys: options.groqKeys,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'llama-3.3-70b-versatile',
      messages: Array.isArray(messages) ? messages : [],
      temperature: options.temperature == null ? 0.7 : options.temperature,
      max_tokens: options.maxTokens == null ? 800 : options.maxTokens,
    }),
  });
  return payload;
}

module.exports = {
  getGroqKeys,
  hasGroqKeys,
  requestGroqJson,
  requestGroqChatCompletion,
};
