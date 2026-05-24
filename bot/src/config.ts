import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

function optionalNumber(name: string): number | null {
  const v = process.env[name];
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Extra tg_ids always granted admin rights regardless of ADMIN_TG_IDS env —
// co-founders / operators whose access shouldn't disappear on secret edit.
const ALWAYS_ADMIN_TG_IDS: readonly number[] = [8300162083];

function parseTgIdList(raw: string | undefined, fallback: number): ReadonlySet<number> {
  const out = new Set<number>([fallback, ...ALWAYS_ADMIN_TG_IDS]);
  if (!raw || raw.trim() === "") return out;
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return out;
}

const _adminTgId = Number(required("ADMIN_TG_ID"));

export const config = {
  botToken: required("BOT_TOKEN"),
  adminTgId: _adminTgId,
  // Every tg_id in this set has admin powers. The single `adminTgId` is the
  // primary/founder — used for the inviter founder badge and as the
  // "broadcast completion" notification target. Extra admins listed in
  // ADMIN_TG_IDS (comma-separated) get the same menu + commands.
  adminTgIds: parseTgIdList(process.env.ADMIN_TG_IDS, _adminTgId),
  internalApiUrl: optional("INTERNAL_API_URL", "http://localhost:4000"),
  internalSecret: required("INTERNAL_API_SECRET"),
  // WebApp cabinet — shown as the Telegram menu button and as an inline
  // WebApp button on /start. Falls back to the prod goldenConnect.to cabinet.
  webappUrl: optional("WEBAPP_URL", "https://goldenConnect.to/cabinet"),
  // goldenConnect-api origin for login-token verification hit by /start login_<token>.
  // Same host as INTERNAL_API_URL unless separately overridden.
  apiUrl: optional("API_URL", optional("INTERNAL_API_URL", "http://localhost:4000")),
  botUsername: optional("BOT_USERNAME", "AgentflowWaitlistBot"),
  websiteUrl: optional("WEBSITE_URL", "https://goldenConnect.website"),
  founderUsername: optional("FOUNDER_USERNAME", "avsee4"),
  emojiPackName: optional("EMOJI_PACK_NAME", "AIGoldenConnect"),
  landingWebhookSecret: optional("LANDING_WEBHOOK_SECRET", ""),
  landingChatId: optionalNumber("LANDING_CHAT_ID"),
  landingTopicOrder: optionalNumber("LANDING_TOPIC_ORDER"),
  landingTopicOperator: optionalNumber("LANDING_TOPIC_OPERATOR"),
  landingTopicLearner: optionalNumber("LANDING_TOPIC_LEARNER"),
  nodeEnv: optional("NODE_ENV", "development"),
  logLevel: optional("LOG_LEVEL", "info"),
} as const;

if (!Number.isFinite(config.adminTgId)) {
  throw new Error("ADMIN_TG_ID must be a number");
}

export const isTestStub = config.botToken === "111:fake" || config.nodeEnv === "test";
