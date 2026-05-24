// Referral codes are the user's Telegram id serialized as a decimal string.
// Privacy trade-off: tg_id is exposed publicly in invite links. Accepted.
const REF_CODE_RE = /^[1-9]\d{0,15}$/;

export function refCodeForTgId(tgId: number): string {
  return String(tgId);
}

export function isValidRefCode(code: string): boolean {
  return REF_CODE_RE.test(code);
}

// Parses `/start` payload into a ref code or null.
// Accepts forms: "ref_<digits>" or raw "<digits>".
export function parseStartPayload(payload: string | undefined): string | null {
  if (!payload) return null;
  const trimmed = payload.trim();
  const candidate = trimmed.startsWith("ref_") ? trimmed.slice(4) : trimmed;
  return isValidRefCode(candidate) ? candidate : null;
}

export function buildInviteLink(botUsername: string, refCode: string): string {
  return `https://t.me/${botUsername}?start=ref_${refCode}`;
}

export function buildWebsiteLink(baseUrl: string, refCode: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/?ref=${refCode}`;
}

/**
 * URL for Telegram's native share sheet. Opens in the TG client as a
 * chat-picker: user taps, picks a target chat, TG prepends `text` above
 * the `url` in the sent message.
 */
export function buildShareUrl(url: string, text: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return `https://t.me/share/url?url=${u}&text=${t}`;
}
