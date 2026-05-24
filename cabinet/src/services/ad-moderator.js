// AI auto-moderator for ad banners.
// Uses Groq vision model to inspect the rendered banner WebP and decide:
//   - 'approve'  → auto-activate (skip admin queue)
//   - 'reject'   → mark rejected with AI reason (admin can override)
//   - 'review'   → fall back to trust-score / admin queue (current default)
//
// Checks (per JSON schema in prompt):
//   nsfw, hate, drugs, weapons, violence, scam, mlm_claim, brand_violation,
//   misleading_earnings, low_quality
//
// Risk score 0–100. Auto-approve only if verdict='approve' AND risk ≤ 30.
//
// Graceful degrade: if Groq is unreachable / quota exhausted / invalid JSON,
// returns { verdict: 'review', risk_score: 50, reasons: ['ai_unavailable'] }.
// In that case the caller falls back to existing trust-score behavior.

const fs = require('fs');

const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
let _keyIdx = 0;
function _nextKey() {
  if (!GROQ_KEYS.length) return null;
  const k = GROQ_KEYS[_keyIdx % GROQ_KEYS.length];
  _keyIdx++;
  return k;
}

// Vision-capable Groq model. Fast, ~$0 cost on free tier.
const MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const TIMEOUT_MS = 12_000;

// PERMISSIVE policy (user 2026-05-17): "по сути нам только порно нельзя
// остальное все можно". We approve everything except NSFW / sexual content
// (and CSAM / illegal — those are universal hard-blocks regardless).
const PROMPT = `You are an ad-platform content moderator. The image is a banner ad
submitted by a user on Golden Connect. The platform is permissive: business offers, MLM,
crypto, betting, financial services, dropshipping, lead-gen — all welcome.

The ONLY content we hard-block is:
  - sexual / pornographic imagery (nudity, sex acts, fetish content)
  - sexualised minors / CSAM (any depiction of children in sexual context)
  - extreme gore / graphic violence (e.g. real corpses, torture)
  - illegal goods (firearms sales to civilians, narcotics market, weapons for terror)

EVERYTHING ELSE IS ALLOWED, including: bold money-promise copy, "earn $X/day",
piles of cash, MLM / network-marketing offers, crypto airdrops, generic stock
imagery, low-effort text-only banners, mild brand references, betting/casino
ads, adult-product ads that are NOT sexually explicit (e.g. vitamins, supplements).

Output STRICT JSON only, no markdown, no commentary, this exact schema:
{
  "verdict": "approve" | "reject",
  "risk_score": <integer 0..100>,
  "categories": {
    "nsfw": <0..100>,
    "csam": <0..100>,
    "extreme_gore": <0..100>,
    "illegal_goods": <0..100>
  },
  "reasons": [ "<short reason if reject>" ]
}

Decision rules:
- "reject" if ANY of {nsfw, csam, extreme_gore, illegal_goods} >= 70.
- Otherwise "approve" (even if other risks exist — they're not our concern).
- If unsure between approve and reject for borderline NSFW (e.g. swimwear,
  cleavage, lingerie not sexually explicit): APPROVE. We only block clear porn.

Return ONLY the JSON object.`;

async function moderateBanner({ imagePath, name, targetUrl, format }) {
  if (!GROQ_KEYS.length) {
    return { ok: false, verdict: 'review', risk_score: 50, reasons: ['ai_unavailable'], categories: {} };
  }
  let buf;
  try {
    buf = await fs.promises.readFile(imagePath);
  } catch (e) {
    return { ok: false, verdict: 'review', risk_score: 50, reasons: ['image_read_failed: ' + (e?.message || e)], categories: {} };
  }
  const b64 = buf.toString('base64');
  const dataUrl = `data:image/webp;base64,${b64}`;

  const userText = [
    'Banner name (user-supplied, may be empty/spam): ' + (name || '(none)'),
    'Banner format: ' + (format || '(unknown)'),
    'Target landing URL: ' + (targetUrl || '(none)'),
    'Now classify the banner image. Return strict JSON only.',
  ].join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let raw = '';
  let httpStatus = 0;
  try {
    // Try each key once on failure (quota / 5xx)
    for (let attempt = 0; attempt < Math.max(1, GROQ_KEYS.length); attempt++) {
      const key = _nextKey();
      if (!key) break;
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: dataUrl } },
            ] },
          ],
        }),
      });
      httpStatus = r.status;
      raw = await r.text();
      if (r.ok) break;
      // Retry on 429 / 5xx with next key, otherwise abort early
      if (r.status !== 429 && r.status < 500) break;
    }
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, verdict: 'review', risk_score: 50, reasons: ['ai_request_failed: ' + (e?.name || e?.message || 'unknown')], categories: {} };
  }
  clearTimeout(timer);

  if (httpStatus < 200 || httpStatus >= 300) {
    return { ok: false, verdict: 'review', risk_score: 50, reasons: ['ai_http_' + httpStatus], categories: {}, raw_excerpt: raw.slice(0, 240) };
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const content = parsed?.choices?.[0]?.message?.content;
  if (!content) {
    return { ok: false, verdict: 'review', risk_score: 50, reasons: ['ai_no_content'], categories: {}, raw_excerpt: raw.slice(0, 240) };
  }
  let json;
  try { json = JSON.parse(content); }
  catch {
    return { ok: false, verdict: 'review', risk_score: 50, reasons: ['ai_invalid_json'], categories: {}, raw_excerpt: content.slice(0, 240) };
  }

  const verdict = ['approve', 'reject', 'review'].includes(json.verdict) ? json.verdict : 'review';
  const risk = Math.max(0, Math.min(100, Number(json.risk_score) || 50));
  const reasons = Array.isArray(json.reasons) ? json.reasons.map((s) => String(s).slice(0, 120)).slice(0, 6) : [];
  const categories = (json.categories && typeof json.categories === 'object') ? json.categories : {};

  return {
    ok: true,
    verdict,
    risk_score: risk,
    reasons,
    categories,
    model: MODEL,
  };
}

// ─────────────────────────────────────────────────────────────────
// Decision helper — PERMISSIVE policy (2026-05-17):
//   Only block clear NSFW / CSAM / extreme-gore / illegal-goods.
//   Everything else auto-approves regardless of MLM / scam / quality.
//
// Trust-score is no longer used to *gate* approval — only as a hint when
// AI is unavailable (then we fall through to active, since AI being down
// shouldn't lock the entire platform).
// ─────────────────────────────────────────────────────────────────
function decide({ trustDecision, ai }) {
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  // AI says reject → trust it
  if (ai?.ok && ai.verdict === 'reject') {
    return {
      status: 'rejected',
      approvedAt: null,
      rejectReason: 'AI: ' + (ai.reasons[0] || 'policy_violation_nsfw'),
      source: 'ai_reject',
    };
  }
  // AI says approve (or AI unavailable) → auto-approve.
  // Under permissive policy we don't queue for human review anymore.
  if (ai?.ok && ai.verdict === 'approve') {
    return {
      status: 'active',
      approvedAt: nowIso,
      rejectReason: null,
      source: 'ai_approve',
    };
  }
  // AI unavailable / borderline — permissive default: auto-approve.
  return {
    status: 'active',
    approvedAt: nowIso,
    rejectReason: null,
    source: ai?.ok ? 'ai_fallthrough' : 'ai_unavailable',
  };
}

module.exports = {
  moderateBanner,
  decide,
};
