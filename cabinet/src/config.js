const path = require('path');
require('dotenv').config();

function asInt(value, fallback) {
  const parsed = parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function asOptionalText(value) {
  const text = String(value || '').trim();
  return text || '';
}

function asOptionalChatId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function asList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function asRawList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const dataDir = asText(process.env.DATA_DIR, './data');
const groqKeys = Array.from(new Set([
  ...asRawList(process.env.GROQ_KEYS),
  ...[asOptionalText(process.env.GROQ_KEY), asOptionalText(process.env.GROQ_API_KEY)].filter(Boolean),
]));

module.exports = {
  botToken: asText(process.env.BOT_TOKEN),
  botUsername: asOptionalText(process.env.BOT_USERNAME),
  port: asInt(process.env.PORT, 3810),
  dataDir: path.resolve(process.cwd(), dataDir),
  goldenConnectVideoDbPath: path.resolve(process.cwd(), asText(process.env.GOLDEN_CONNECT_VIDEO_DB_PATH, '../data/tiktok-publisher.db')),
  goldenConnectVideoMetadataPath: path.resolve(process.cwd(), asText(process.env.GOLDEN_CONNECT_VIDEO_METADATA_PATH, './data/golden-connect-video-library.jsonl')),
  goldenConnectVideoDir: path.resolve(process.cwd(), asText(process.env.GOLDEN_CONNECT_VIDEO_DIR, '../golden-connect-videos')),
  goldenConnectVideoPublicPath: asText(process.env.GOLDEN_CONNECT_VIDEO_PUBLIC_PATH, '/video-library'),
  pointsPerReferral: asInt(process.env.POINTS_PER_REFERRAL, 100),
  publicBaseUrl: asOptionalText(process.env.PUBLIC_BASE_URL),
  // [sso] Cross-subdomain cookie scope. Set to ".golden-connect.to" so the
  // session cookie issued at app.golden-connect.to is also sent to crm.golden-connect.to.
  cookieDomain: asOptionalText(process.env.COOKIE_DOMAIN),
  sessionCookieName: asText(process.env.SESSION_COOKIE_NAME, 'goldenConnect_site_session'),
  sessionTtlDays: asInt(process.env.SESSION_TTL_DAYS, 30),
  links: {
    mainChat: asOptionalText(process.env.WELCOME_MAIN_CHAT_URL),
    results: asOptionalText(process.env.WELCOME_RESULTS_URL),
    channel: asOptionalText(process.env.CHANNEL_URL),
    shop: asOptionalText(process.env.SHOP_WEBAPP_URL),
    payment: asOptionalText(process.env.PAYMENT_URL),
    presentation: asOptionalText(process.env.PRESENTATION_URL),
    marketingPlan: asOptionalText(process.env.MARKETING_PLAN_URL),
    structure: asOptionalText(process.env.PARTNER_STRUCTURE_URL),
    companyRegistrationTemplate: asOptionalText(process.env.COMPANY_REGISTRATION_URL_TEMPLATE),
    companyCatalog: asOptionalText(process.env.COMPANY_CATALOG_URL),
    companyMain: asOptionalText(process.env.COMPANY_MAIN_URL),
    arsenalApp: asOptionalText(process.env.ARSENAL_APP_URL || 'https://app.arsenalprofi.com'),
    arsenalReferral: asOptionalText(process.env.ARSENAL_REFERRAL_URL || 'https://app.arsenalprofi.com'),
    arsenalBioHub: asOptionalText(process.env.ARSENAL_BIO_HUB_URL),
    arsenalPdfTools: asOptionalText(process.env.ARSENAL_PDF_TOOLS_URL),
    arsenalImageTools: asOptionalText(process.env.ARSENAL_IMAGE_TOOLS_URL),
    arsenalRemoveBg: asOptionalText(process.env.ARSENAL_REMOVE_BG_URL),
    arsenalSocialKit: asOptionalText(process.env.ARSENAL_SOCIAL_KIT_URL),
    arsenalBannerTools: asOptionalText(process.env.ARSENAL_BANNER_TOOLS_URL),
    arsenalVideoTools: asOptionalText(process.env.ARSENAL_VIDEO_TOOLS_URL),
    arsenalOgImage: asOptionalText(process.env.ARSENAL_OG_IMAGE_URL)
  },
  arsenal: {
    apiBaseUrl: asOptionalText(process.env.ARSENAL_API_BASE_URL || 'https://app.arsenalprofi.com'),
    apiKey: asOptionalText(process.env.ARSENAL_API_KEY),
    proxyEnabled: String(process.env.ARSENAL_PROXY_ENABLED || '1').trim() !== '0'
  },
  contentAdminEmails: asList(process.env.CONTENT_ADMIN_EMAILS),
  supportUsername: asOptionalText(process.env.SUPPORT_USERNAME),
  supportForwardChatId: asOptionalChatId(process.env.SUPPORT_FORWARD_CHAT_ID),
  monitorChatId: asOptionalChatId(process.env.MONITOR_CHAT_ID),
  monitorIntervalMs: asInt(process.env.MONITOR_INTERVAL_MS, 5 * 60 * 1000),
  monitorMemoryMb: asInt(process.env.MONITOR_MEMORY_MB, 500),
  monitorBackupStaleHours: asInt(process.env.MONITOR_BACKUP_STALE_HOURS, 12),
  backupDir: asOptionalText(process.env.BACKUP_DIR),
  backupRetentionDays: asInt(process.env.BACKUP_RETENTION_DAYS, 30),
  backupIntervalMs: asInt(process.env.BACKUP_INTERVAL_MS, 6 * 60 * 60 * 1000),
  rateLimitEnabled: String(process.env.RATE_LIMIT_ENABLED || '1').trim() !== '0',
  rateLimitApiPerMin: asInt(process.env.RATE_LIMIT_API_PER_MIN, 300),
  rateLimitPublicPerMin: asInt(process.env.RATE_LIMIT_PUBLIC_PER_MIN, 60),
  rateLimitAuthPerMin: asInt(process.env.RATE_LIMIT_AUTH_PER_MIN, 10),
  groqKey: groqKeys[0] || '',
  groqKeys,
  vapidPublicKey: asOptionalText(process.env.VAPID_PUBLIC_KEY),
  vapidPrivateKey: asOptionalText(process.env.VAPID_PRIVATE_KEY),
  vapidEmail: asOptionalText(process.env.VAPID_EMAIL || 'mailto:admin@cabinet.golden-connect.to'),
  requiredChatEnabled: String(process.env.REQUIRED_CHAT_ENABLED || (process.env.REQUIRED_CHAT_ID ? '1' : '0')).trim() !== '0',
  requiredChatId: asOptionalText(process.env.REQUIRED_CHAT_ID),
  requiredChatTitle: asOptionalText(process.env.REQUIRED_CHAT_TITLE),
  requiredChatUrl: asOptionalText(process.env.REQUIRED_CHAT_URL),
  requiredChatReminderCooldownMs: asInt(process.env.REQUIRED_CHAT_REMINDER_COOLDOWN_MIN, 60) * 60 * 1000,
  requiredChatCheckTtlMs: asInt(process.env.REQUIRED_CHAT_CHECK_TTL_DAYS, 7) * 24 * 60 * 60 * 1000,
  tgMonitorEnabled: String(process.env.TG_MONITOR_ENABLED || '1').trim() !== '0',
  tgMonitorWatchChats: asRawList(process.env.TG_MONITOR_WATCH_CHATS),
  tgMonitorAdminUsernames: asList(process.env.TG_MONITOR_ADMIN_USERNAMES || 'mlm808'),
  tgMonitorRetentionDays: asInt(process.env.TG_MONITOR_RETENTION_DAYS, 30),
  tgMonitorMaxEvents: asInt(process.env.TG_MONITOR_MAX_EVENTS, 10000),
  tgMonitorAiMaxItems: asInt(process.env.TG_MONITOR_AI_MAX_ITEMS, 80),
  tgMonitorDailyHourMsk: asInt(process.env.TG_MONITOR_DAILY_HOUR_MSK, 21),
  tgMonitorDailyMinuteMsk: asInt(process.env.TG_MONITOR_DAILY_MINUTE_MSK, 0),
  // Bridge to legacy golden-connect-api (Hono + Postgres) that owns CryptoBot +
  // Platega + bookings ledger. Cabinet proxies /api/pay/* calls there via
  // x-golden-connect-secret to avoid duplicating payment infra.
  goldenConnectApiBaseUrl: asOptionalText(process.env.GOLDEN_CONNECT_API_BASE_URL, 'https://api.golden-connect.to'),
  goldenConnectApiInternalSecret: asOptionalText(process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET)
};
