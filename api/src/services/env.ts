import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.AUTH_JWT_SECRET ?? '',
  cookieDomain: optional('AUTH_COOKIE_DOMAIN'),
  bscChainId: Number(process.env.BSC_CHAIN_ID ?? 56),
  leadsWebhookSecret: optional('LEADS_WEBHOOK_SECRET'),
  // Shared secret for /internal/* endpoints, sent as `x-golden-connect-secret` by
  // the bot. Required at startup — a misconfigured deploy should refuse to
  // boot rather than silently serve internal APIs with no auth.
  internalSecret: process.env.INTERNAL_API_SECRET ?? '',
  // Comma-separated 0x-addresses granted admin UI privileges. Matched
  // case-insensitively against the SIWE-verified wallet on the session.
  // Plus the seeded root user (ref_code = ADMIN_REF_CODE) is always admin.
  adminWallets: (process.env.ADMIN_WALLETS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{40}$/.test(s)),
  // Fiat-card intake via Platega.io. All blank = feature disabled — routes
  // return 503 and the UI shows a "coming soon" toast. When creds arrive we
  // fill them locally without touching code.
  plategaMerchantId: optional('PLATEGA_MERCHANT_ID'),
  plategaApiSecret: optional('PLATEGA_API_SECRET'),
  plategaWebhookSecret: optional('PLATEGA_WEBHOOK_SECRET'),
  plategaBaseUrl: optional('PLATEGA_BASE_URL', 'https://platega.io'),
  // Static USD→RUB rate applied to tariff entry amounts when building a
  // Platega invoice. Manual knob — replaced by a CBR feed integration later.
  plategaUsdRate: Number(process.env.PLATEGA_USD_RATE ?? 95),
  // Public origin used to build `callback_url` / `return_url` sent to the
  // payment provider. Must match the TLS cert + CORS allow-list.
  appPublicUrl: optional('APP_PUBLIC_URL', 'https://api.golden-connect.to'),
  // BEP-20 USDT intake. Receive address has a hardcoded fallback so we
  // never accidentally generate an invoice against an empty wallet.
  bscReceiveAddress: optional(
    'BSC_RECEIVE_ADDRESS',
    '0x8C6AEE0a63b4F5011160BA0d455f7Ad57c1D426B',
  ),
  usdtBep20Contract: optional(
    'USDT_BEP20_CONTRACT',
    '0x55d398326f99059fF775485246999027B3197955',
  ),
  bscscanApiKey: optional('BSCSCAN_API_KEY'),
  // CryptoBot (Telegram @CryptoBot) Crypto Pay API token. Blank = feature
  // disabled; /me/pay/cryptobot returns 503 and /webhooks/cryptobot is a
  // silent no-op. The runtime reads process.env directly so tests can
  // stub this without module-cache gymnastics.
  cryptobotToken: optional('CRYPTOBOT_TOKEN'),
  // Comma-separated overrides for the referral distribution curve. When
  // unset, rewards.ts uses its built-in default curve.
  referralCurveJson: optional('REFERRAL_CURVE_JSON'),
  // Telegram bot token — used by services/admin-notifier.ts to DM founders
  // when a payment lands. Same token as the bot pod uses; if blank the
  // notifier becomes a no-op (see admin-notifier.ts).
  botToken: optional('BOT_TOKEN'),
  // Comma-separated admin tg_id allowlist that receives payment DMs and
  // has access to the bot's /payments admin view. Fallback list is
  // hard-coded in admin-notifier.ts so a dropped env doesn't lose alerts.
  adminTgIds: optional('ADMIN_TG_IDS'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Cloudflare Turnstile — captcha on /auth/signup. If blank, signup proceeds
  // without captcha (useful for dev). Site key is exposed to the client via
  // VITE_TURNSTILE_SITE_KEY (Vite env) — this secret is server-only.
  turnstileSecret: process.env.TURNSTILE_SECRET ?? "",
  // Resend — transactional email for /auth/send-verify. Blank = dev mode:
  // link is returned in the API response and logged to stdout, never sent.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Golden Connect <no-reply@golden-connect.to>",
  // Comma-separated origins from ALLOWED_ORIGINS — used by the email verify
  // redirect to pick a safe landing host.
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "",
};

export function assertServerEnv(): void {
  if (!env.jwtSecret) throw new Error('AUTH_JWT_SECRET is required');
  if (!env.databaseUrl) throw new Error('DATABASE_URL is required');
  if (!env.internalSecret) throw new Error('INTERNAL_API_SECRET is required');
}

export { required };
