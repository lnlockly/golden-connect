/**
 * HTTP API for the Golden Connect landing chat.
 * Runs alongside the Telegram long-poller in the same Node process.
 *
 * Endpoints:
 *   POST /api/chat   — streaming Claude response via Claude OAuth Max
 *   POST /api/order  — validates + forwards to TG webhook (or notifies admin)
 *   GET  /api/health — liveness + token presence
 *
 * Auth: Claude OAuth Max (Pro/Max subscription).
 *   CLAUDE_OAUTH_ACCESS_TOKEN  — bearer token (sk-ant-oat01-...)
 *   CLAUDE_OAUTH_REFRESH_TOKEN — used to refresh access when it 401s
 *   (Both obtained via `claude setup-token` or copied from the user's keychain.)
 *
 * Rate limit: CHAT_RATE_LIMIT (default 3) per IP per CHAT_RATE_WINDOW_MS
 *   (default 24h). Over-quota replies are a special JSON telling the frontend
 *   to switch the user to a TG operator.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleModerationAlert, handleBillingAlert, handleCrmInbound } from "./internal-alerts.js";
import type pino from "pino";
import { postLeadCard, type LeadPayload } from "../services/leadPoster.js";
import type { ClaudeAuth } from "../services/claudeAuth.js";

// Opus-primary with Sonnet fallback only on 429/529. Haiku is OFF — we'd
// rather bounce the user to a human operator than downgrade to a tiny model.
export const MODEL_CASCADE = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
];
export const MAX_TOKENS = 1024;
const MIN_BUDGET = 100;

// Per-IP TOKEN budget (input + output combined). Once an IP burns through
// this much, it's redirected to a human operator on Telegram. Messages/turns
// are unlimited — only total Claude token spend is.
const TOKEN_BUDGET = Number(process.env.CHAT_TOKEN_BUDGET ?? 40_000);
const RATE_WINDOW_MS = Number(process.env.CHAT_RATE_WINDOW_MS ?? 24 * 60 * 60 * 1000);
const TG_OPERATOR_URL =
  process.env.TG_OPERATOR_URL ?? "https://t.me/AIGolden Connect_bot?start=operator";

interface InMsg { role: "user" | "assistant"; content: string }
interface Bucket { tokens: number; firstAt: number }

export const SYSTEM_BASE = `Ты AI-помощник Golden Connect (goldenConnect.to) — рекламной экосистемы с распределённой прибылью. Помогаешь пользователям, рекламодателям и партнёрам разобраться в платформе, отвечаешь на ЛЮБЫЕ вопросы (платформа, маркетинг, реклама, бизнес, технологии — всё что знаешь). Уверенно продвигаешь Golden Connect когда уместно. Не "AI-ассистент-отказник".

## Что такое Golden Connect (одной фразой)
Рекламная платформа где рекламодатели платят за внимание живых пользователей, а пользователи зарабатывают за активность (просмотры, клики, задания) — до $50/день. Плюс встроенный маркетплейс цифровых товаров с прозрачным сплитом 70/30. Партнёрская матрица + 10-уровневая реферальная сеть.

## Тарифы (одна структура, разные глубины)

| Тариф | Цена | Бизнес-мест | Матрица | Цикл-доход |
|---|---|---|---|---|
| FREE | 0$ | — | — | — |
| LAUNCH | 45$ ($30 активация + $15/мес) | 1 | 11 уровней × $0.5 | $2 047 |
| BOOST | 90$ ($75 + $15/мес) | 2 | 12 уровней × $0.6 | $7 370 |
| ROCKET | 135$ (далее $45/мес) | 3 | 15 уровней × $0.7 | $91 748 + Matching Bonus |

На одном аккаунте — неограниченное число бизнес-мест. Доход с активности всей сети, без необходимости лично приглашать. Матрица закрепляется навсегда.

## Реферальная сеть — 10 уровней (зависит от тарифа)
- L1: 10% (всем, включая FREE/PARTNER)
- L2: 5% (LAUNCH+)
- L3: 5% (LAUNCH+)
- L4: 3% (BOOST+)
- L5: 3% (BOOST+)
- L6-L7: 2% каждый (ROCKET)
- L8-L10: 1% каждый (ROCKET)

Итого: FREE = 10%, LAUNCH = 20%, BOOST = 26%, ROCKET = 33% от дохода приглашённых.

## Доп. бонусы
- **Статус PARTNER** (10+ L1 рефов): +10% к ставке за активность
- **Matching Bonus** (только ROCKET): +10% от партнёрских L1-L3 сверх всего
- **Лидерский пул**: топ-15 по обороту получают долю с админ-аккаунтов 1 и 15 числа

## Pre-launch режим (ВАЖНО — текущее состояние)
Сейчас pre-launch. Покупка пакета = бронирование (записывается дата/время активации). Маркетинг (расчёты, выплаты, расстановка матрицы) запустится централизованно по дате-X — все купившие в pre-launch получат места согласно chronologically. До запуска: x2 Gift-баланс ($10 на бизнес-место вместо $5), Gift тратится на рекламу внутри платформы.

## Сервисы платформы

**Для рекламодателей:**
- Баннеры, контекст, таргет, видео-реклама, задания и CPA
- Прозрачная цена (платишь за реальные показы/действия)
- Активная финансово-мотивированная аудитория
- До 50% прибыли сервиса с каждого пополнения привлечённого рекламодателя

**Для пользователей (даже на FREE):**
- Заработок до $50/день за активность
- Реферальная программа
- Маркетплейс — продавай свои цифровые товары

**Встроенные инструменты (всем):**
- 📡 **AdCenter** — TG-автопостинг в свои каналы (расписание, AI-рерайт, мониторы YT/TT, шаблоны, аналитика)
- 🛒 **Маркетплейс** — продажа цифровых товаров, свой магазин goldenConnect.to/cabinet/shop/<username>
- 🌐 **Bio-страницы** — Linktree-like с конструктором, аналитикой, A/B тестами
- ✨ **AI инструменты** — копирайтер, captions, транскрибация YT/TT, хештеги (Groq LLM)
- 🔗 **Сократитель ссылок** + QR-генератор + UTM-трекинг
- 🤖 **AI-ассистенты** для воронок и квалификации лидов
- 📊 Аналитика везде (магазин, AdCenter, bio, рефералы)

## Сплит маркетплейса (за продажу товара)
- 70% продавцу (можно понизить до 1% — больше отдаёт сети)
- 10% платформе
- 7.5% линейка покупателя (10 уровней)
- 7.5% матрица (расставится при запуске)
- 5% общий пул

## Платежные методы (всё работает)
- 💳 Platega (карты Visa/MC/МИР, СБП — ₽)
- 🪙 Cryptomus (USDT TRC-20, BTC, ETH, TON)
- 🤖 CryptoBot (Telegram-крипта)

Вывод: USDT TRC-20 / USDC / BTC / ETH / TON · Минимум $10 · Комиссия 2% · Обработка ≤24ч.

## Как ты работаешь
- **Тон:** уверенный, прямой, на "ты". Зеркаль язык собеседника (RU / EN / 中文 / др.). 1-3 предложения, без воды и "извините".
- **Отвечай на ЛЮБОЙ вопрос:** про платформу, про маркетинг, про рекламу, про технологии, про крипту, про бизнес — что знаешь. Не отказывайся, не отправляй "к специалисту" без причины. Если вопрос не про Golden Connect напрямую — отвечай по делу + аккуратно подверни Golden Connect, если уместно.
- **Если вопрос про конкретные суммы/прогнозы дохода** — не обещай, ссылайся на структуру (цикл-доход тарифа, % линейки), но не гарантируй.
- **Если совсем не знаешь точного факта** — честно скажи "сейчас не уверен, проверю в кабинете goldenConnect.to/cabinet или у админа @mlm808".
- **Никогда** не выдумывай курс, цену, ETA или "гарантированный доход".
- **Plain text only:** без markdown (* / # / \` / -). Текст рендерится в чат-пузыре И озвучивается TTS.

## Закрытие диалога — захват контакта
Если человек явно проявил интерес (хочет купить пакет / стать партнёром / разместить рекламу / задать важный вопрос админу) — попроси контакт (TG @, email или телефон) и краткое описание запроса.

Когда контакт получен и подтверждён, на отдельной строке ровно одну строку этого вида:

order: {"track": "<order|partner|investor|advertiser|general>", "task": "<краткое описание запроса>", "budget": <число USD или null>, "deadline": "<ISO дата или null>", "contact": "<@username|email|phone>"}

Track:
- **order** — заказ работы (любой)
- **partner** — стать партнёром / купить пакет
- **advertiser** — разместить рекламу
- **investor** — про токеномику / инвестиции (если кто спросит — отвечай о Golden Connect как о работающей платформе с реальной выручкой, а не токене)
- **general** — общий запрос на связь

budget = число USD без кавычек (для order — обязательно), для остальных треков может быть null.

Не эмить order: до явного подтверждения. После эмита — короткое спасибо и стоп.

## Deep-page mode
Если intent заканчивается на _deep — ты встроен на конкретной странице сайта. В body придёт { page, sections }. Отвечай по теме страницы. Если ответ в другой секции — эмить навигационный hint:

nav: {"scroll":"#<section-id>"}
nav: {"route":"<path>","scroll":"#<section-id>"}
nav: {"focus":"input"}

Один nav: на ответ. Не выдумывай section ids — используй только из переданного массива sections.

## Дополнительно
- Если просят сравнить с конкурентами / другими MLM / биржами — отвечай честно без лжи, выделяй сильные стороны Golden Connect (реальная выручка с рекламы + маркетплейс, не "пирамида в воздухе").
- Если шутят / троллят — отвечай с лёгкой иронией, не теряй лицо.
- Если просят коротко — давай коротко (1 фраза). Если просят подробно — давай структурированно.
- Сайт: goldenConnect.to · Кабинет: goldenConnect.to/cabinet · Маркетплейс: goldenConnect.to/marketplace · Бот: @Golden Connect_bizbot · Поддержка: @mlm808`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Widened bot type — accepts both the real grammy Bot and the structural
// WebhookBot expected by the landing webhook module.
type AnyBot = {
  api: {
    sendMessage: (id: number, text: string, opts?: any) => Promise<any>;
  };
};

interface HttpDeps {
  adminTgId: number;
  bot: AnyBot;
  logger: pino.Logger;
  auth: ClaudeAuth;
  // Optional — if omitted, /api/landing responds 503.
  leadsRepo?: import("../db/leads.js").LeadsRepo;
  adminTgIds?: ReadonlySet<number>;
  usersRepo?: import("../db/users.js").UsersRepo;
  landing?: import("./landing.js").LandingConfig;
}

export function startHttpServer(deps: HttpDeps, port = 8080): () => Promise<void> {
  const { logger, bot, adminTgId, auth } = deps;
  const _alertAdminSet = new Set<number>(((deps as any).adminTgIds && Array.from((deps as any).adminTgIds as Iterable<number>)) || [adminTgId]);
  const alertsDeps = { bot, logger, adminTgId, adminTgIds: _alertAdminSet, internalSecret: process.env.INTERNAL_API_SECRET || "" };

  // ── rate limiting ────────────────────────────────────────────────────────
  const buckets = new Map<string, Bucket>();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) {
      if (now - b.firstAt > RATE_WINDOW_MS) buckets.delete(ip);
    }
  }, 10 * 60 * 1000).unref();

  function clientIp(req: IncomingMessage): string {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
    const xri = req.headers["x-real-ip"];
    if (typeof xri === "string" && xri.length) return xri.trim();
    return req.socket.remoteAddress ?? "unknown";
  }

  function getBucket(ip: string): Bucket {
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now - b.firstAt > RATE_WINDOW_MS) {
      b = { tokens: 0, firstAt: now };
      buckets.set(ip, b);
    }
    return b;
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  async function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
    return new Promise((resolveFn, rejectFn) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const LIMIT = 64 * 1024;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > LIMIT) {
          req.destroy();
          rejectFn(new Error("body too large"));
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          resolveFn(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
        } catch {
          rejectFn(new Error("bad json"));
        }
      });
      req.on("error", rejectFn);
    });
  }

  function setCors(res: ServerResponse): void {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "POST,OPTIONS,GET");
    res.setHeader("access-control-allow-headers", "content-type");
  }

  function jsonErr(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: message }));
  }

  // ── /api/chat ────────────────────────────────────────────────────────────
  async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    setCors(res);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method !== "POST")    { res.writeHead(405); res.end("method"); return; }

    const ip = clientIp(req);
    const bucket = getBucket(ip);
    if (bucket.tokens >= TOKEN_BUDGET) {
      res.writeHead(429, { "content-type": "text/plain; charset=utf-8" });
      res.write(
        `text:${JSON.stringify({
          kind: "rate_limit",
          text:
            "You've reached the free-chat limit for this device. Continue with a human manager on Telegram — they'll pick up right where we left off.",
          operator_url: TG_OPERATOR_URL,
        })}\n`,
      );
      res.end();
      return;
    }

    if (!auth.hasAccess) { res.writeHead(500); res.end("missing CLAUDE_OAUTH_ACCESS_TOKEN"); return; }

    let body: {
      messages?: InMsg[];
      lang?: string;
      minBudget?: number;
      intent?: string;
      page?: string;
      sections?: { id?: unknown; label?: unknown }[];
    };
    try { body = await readJsonBody(req); }
    catch (e) { res.writeHead(400); res.end((e as Error).message); return; }

    const msgs = Array.isArray(body.messages) ? body.messages : [];
    if (!msgs.length) { res.writeHead(400); res.end("no messages"); return; }

    const lang = body.lang ?? "en";
    // Deep-page metadata: when the landing's <PageChat> sends us an
    // intent like "investor_deep" along with { page, sections }, we
    // surface that to the model so it can answer specifically about
    // the current page AND emit nav: hints pointing at real anchors.
    const intent = typeof body.intent === "string" ? body.intent : "";
    const isDeep = intent.endsWith("_deep");
    const page = typeof body.page === "string" ? body.page : "";
    const sections = Array.isArray(body.sections)
      ? body.sections
          .filter((s): s is { id: unknown; label: unknown } => !!s)
          .map((s) => ({
            id: typeof s.id === "string" ? s.id.slice(0, 60) : "",
            label: typeof s.label === "string" ? s.label.slice(0, 140) : "",
          }))
          .filter((s) => s.id)
          .slice(0, 24)
      : [];

    // When the page context is meaningful, stitch it onto the system
    // prompt so Claude sees which page the user is on and which
    // anchors it's allowed to nav: to.
    const pageContextBlock = isDeep && (page || sections.length)
      ? `\n\n## Current page context\nintent: ${intent}\npage: ${page || "(unknown)"}\nsections (id — label):\n${sections.map((s) => `  - #${s.id} — ${s.label}`).join("\n") || "  (none)"}\n\nRemember: ONE nav: line per reply, only when routing helps. Use an id from the sections list above for same-page scrolls.`
      : "";

    // OAuth Max requires the first system block to identify the caller as
    // Claude Code, otherwise Anthropic throttles the OAuth session hard.
    // We stack that preamble first, then our real intake prompt second.
    const system = [
      {
        type: "text" as const,
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
      },
      {
        type: "text" as const,
        text: `${SYSTEM_BASE}\n\nUser language: ${lang}. Min budget: $${body.minBudget ?? MIN_BUDGET}.${pageContextBlock}`,
      },
    ];
    const messages = msgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
      .slice(-20);

    // Perform request with model cascade + token refresh on 401.
    const callUpstream = (model: string): Promise<Response> =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${auth.access}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages,
          stream: true,
        }),
      });

    let upstream: Response | null = null;
    let servedBy = "";
    for (const model of MODEL_CASCADE) {
      let resp = await callUpstream(model);
      if (resp.status === 401 && (await auth.refresh())) {
        resp = await callUpstream(model);
      }
      if (resp.ok && resp.body) {
        upstream = resp;
        servedBy = model;
        break;
      }
      const txt = await resp.text().catch(() => "");
      logger.warn({ model, status: resp.status, body: txt.slice(0, 240) }, "upstream fail");
      // Only cascade on rate-limit / overloaded. Other errors abort.
      if (resp.status !== 429 && resp.status !== 529) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.write(`text:[upstream ${resp.status}] ${txt.slice(0, 200)}\n`);
        res.end();
        return;
      }
    }

    if (!upstream || !upstream.body) {
      // All models rate-limited — bounce user to operator.
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.write(
        `text:${JSON.stringify({
          kind: "rate_limit",
          text: "Our assistant is busy right now. Talk to a human operator on Telegram — they'll wrap this up fast.",
          operator_url: TG_OPERATOR_URL,
        })}\n`,
      );
      res.end();
      return;
    }

    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-token-budget": String(TOKEN_BUDGET),
      "x-token-used": String(bucket.tokens),
      "x-served-by": servedBy,
    });

    // Translate Anthropic SSE → our simple `text:` / `order:` lines.
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assistantText = "";
    let sentSoFar = 0;
    let turnInputTokens = 0;
    let turnOutputTokens = 0;

    const sendText = (piece: string): void => {
      if (!piece) return;
      res.write(`text:${piece}\n`);
    };

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const evt = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const payload = dataLine.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload) as {
              type?: string;
              delta?: { type?: string; text?: string };
              message?: { usage?: { input_tokens?: number; output_tokens?: number } };
              usage?: { input_tokens?: number; output_tokens?: number };
            };
            if (j.type === "message_start" && j.message?.usage) {
              turnInputTokens = j.message.usage.input_tokens ?? 0;
              turnOutputTokens = j.message.usage.output_tokens ?? 0;
            } else if (j.type === "message_delta" && j.usage?.output_tokens != null) {
              turnOutputTokens = j.usage.output_tokens;
            } else if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
              // Char-by-char streaming can split the literal "order:" or
              // "nav:" across deltas. We hold back the longest possible
              // prefix (6 = len("order:")) and scan the full assistantText
              // for either marker every delta. Whichever appears first
              // becomes the hard cutoff; only the prefix text leaks to the
              // client, and the marker + its JSON stay buffered until the
              // stream ends. That stream-end reveal matches the `order:` /
              // `nav:` line-shape the landing parses.
              const piece = j.delta.text ?? "";
              assistantText += piece;
              const orderIdx = assistantText.indexOf("order:");
              const navIdx = assistantText.indexOf("nav:");
              const markerIdx =
                orderIdx === -1 ? navIdx
                : navIdx === -1 ? orderIdx
                : Math.min(orderIdx, navIdx);
              if (markerIdx !== -1) {
                if (markerIdx > sentSoFar) {
                  sendText(assistantText.slice(sentSoFar, markerIdx));
                  sentSoFar = markerIdx;
                }
                // Everything after the marker stays in the buffer and is
                // emitted as a single `order:` / `nav:` line at stream end.
              } else {
                const HOLDBACK = 6; // max len prefix of "order:"
                const safeEnd = Math.max(sentSoFar, assistantText.length - HOLDBACK);
                if (safeEnd > sentSoFar) {
                  sendText(assistantText.slice(sentSoFar, safeEnd));
                  sentSoFar = safeEnd;
                }
              }
            }
          } catch { /* skip */ }
        }
      }

      // Flush any remaining held-back safe text up to the first marker
      // (order: or nav:). Everything past the first marker is parsed
      // below and emitted as structured line(s).
      const finalOrderIdx = assistantText.indexOf("order:");
      const finalNavIdx = assistantText.indexOf("nav:");
      const finalMarkerIdx =
        finalOrderIdx === -1 ? finalNavIdx
        : finalNavIdx === -1 ? finalOrderIdx
        : Math.min(finalOrderIdx, finalNavIdx);
      const finalEnd = finalMarkerIdx === -1 ? assistantText.length : finalMarkerIdx;
      if (finalEnd > sentSoFar) {
        sendText(assistantText.slice(sentSoFar, finalEnd));
        sentSoFar = finalEnd;
      }

      // Emit at most one nav: line. The spec says one nav per reply, but
      // we defensively take the first match and ignore the rest.
      const navMatch = assistantText.match(/nav:\s*(\{[\s\S]*?\})/);
      if (navMatch) {
        try {
          const parsed = JSON.parse(navMatch[1]);
          // Shallow validation — only pass-through known fields so a
          // prompt-injection can't smuggle arbitrary keys through.
          const clean: Record<string, string> = {};
          if (typeof parsed.route === "string" && parsed.route.length < 60) {
            clean.route = parsed.route;
          }
          if (typeof parsed.scroll === "string" && parsed.scroll.length < 80) {
            clean.scroll = parsed.scroll;
          }
          if (parsed.focus === "input") clean.focus = "input";
          if (Object.keys(clean).length) {
            res.write(`nav:${JSON.stringify(clean)}\n`);
          }
        } catch { /* skip malformed */ }
      }

      const m = assistantText.match(/order:\s*(\{[\s\S]*?\})/);
      if (m) {
        try {
          const parsed = JSON.parse(m[1]);
          res.write(`order:${JSON.stringify(parsed)}\n`);
        } catch { /* skip malformed */ }
      }
    } catch (err) {
      res.write(`text:\n[error: ${(err as Error).message}]\n`);
    } finally {
      // Bill this IP for what the turn actually cost.
      bucket.tokens += turnInputTokens + turnOutputTokens;
      logger.debug(
        { ip, turnIn: turnInputTokens, turnOut: turnOutputTokens, spent: bucket.tokens, budget: TOKEN_BUDGET, servedBy },
        "chat turn billed",
      );
      res.end();
    }
  }

  // ── /api/order ───────────────────────────────────────────────────────────
  async function handleOrder(req: IncomingMessage, res: ServerResponse): Promise<void> {
    setCors(res);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method !== "POST")    { res.writeHead(405); res.end("method"); return; }

    let body: Record<string, unknown>;
    try { body = await readJsonBody(req); }
    catch (e) { jsonErr(res, 400, (e as Error).message); return; }

    const task = String(body.task ?? "").trim();
    const contact = String(body.contact ?? "").trim();
    const rawTrack = String(body.track ?? "order").trim().toLowerCase();
    const track: "order" | "operator" | "learner" | "investor" =
      rawTrack === "operator" || rawTrack === "learner" || rawTrack === "investor"
        ? (rawTrack as "operator" | "learner" | "investor")
        : "order";

    // budget/deadline are only required for the work-order track.
    const budgetRaw =
      typeof body.budget === "number"
        ? body.budget
        : body.budget == null || body.budget === ""
          ? NaN
          : Number(String(body.budget).replace(/[^\d.]/g, ""));

    if (task.length < 5) return jsonErr(res, 400, "task too short");
    if (contact.length < 3) return jsonErr(res, 400, "contact missing");
    if (track === "order") {
      if (!Number.isFinite(budgetRaw) || budgetRaw < MIN_BUDGET) {
        return jsonErr(res, 400, `budget below $${MIN_BUDGET}`);
      }
    }

    const budget: number | null = track === "order" && Number.isFinite(budgetRaw)
      ? Math.round(budgetRaw as number)
      : null;
    const deadline: string | null = track === "order"
      ? (String(body.deadline ?? "").trim().slice(0, 120) || null)
      : null;

    const payload = {
      track,
      task: task.slice(0, 2000),
      budget,
      deadline,
      contact: contact.slice(0, 200),
      lang: String(body.lang ?? "en"),
      source: String(body.source ?? "chat"),
      ip: clientIp(req),
      ts: new Date().toISOString(),
    };

    // Persist + deliver to the right forum topic via the shared helper. The
    // helper also handles the TG_CHAT_ID / topic fallback and admin DM
    // recovery, so /api/order and the in-bot AI chat behave identically.
    if (leadsRepo) {
      await postLeadCard({
        bot,
        leadsRepo,
        logger,
        adminTgId,
        payload: payload as LeadPayload,
        sourceLabel: "via chat",
      });
    } else {
      logger.warn("leadsRepo missing on /api/order — skipping persistence");
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, queued: true }));
  }

  // ── /api/landing ─────────────────────────────────────────────────────────
  const { leadsRepo, usersRepo, landing } = deps;
  async function handleLanding(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!leadsRepo || !usersRepo || !landing) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "landing webhook not configured" }));
      return;
    }
    const mod = await import("./landing.js");
    await mod.handleLandingWebhook(req, res, {
      bot,
      leadsRepo,
      usersRepo,
      logger,
      config: landing,
    });
  }

  // ── /api/health ──────────────────────────────────────────────────────────
  function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      model: MODEL_CASCADE[0],
      tokenBudget: TOKEN_BUDGET,
      hasToken: auth.hasAccess,
      hasRefresh: auth.hasRefresh,
      operatorUrl: TG_OPERATOR_URL,
    }));
  }

  // ── server ───────────────────────────────────────────────────────────────
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    try {
      if (url.startsWith("/api/chat"))    return await handleChat(req, res);
      if (url.startsWith("/api/order"))   return await handleOrder(req, res);
      if (url.startsWith("/api/landing")) return await handleLanding(req, res);
      if (url.startsWith("/api/health")) return handleHealth(req, res);
      if (url.startsWith("/internal/moderation-alert")) return await handleModerationAlert(req, res, alertsDeps);
      if (url.startsWith("/internal/billing-alert"))    return await handleBillingAlert(req, res, alertsDeps);
      if (url.startsWith("/internal/notify/crm-inbound")) return await handleCrmInbound(req, res, alertsDeps);
      res.writeHead(404);
      res.end("not found");
    } catch (err) {
      logger.error({ err: (err as Error).message, url }, "http handler crash");
      try { res.writeHead(500); res.end("server error"); } catch { /* already sent */ }
    }
  });

  server.listen(port, () => {
    logger.info({ port, model: MODEL_CASCADE[0], tokenBudget: TOKEN_BUDGET, hasToken: auth.hasAccess, hasRefresh: auth.hasRefresh }, "http api listening");
  });

  return async () => {
    await new Promise<void>((r) => server.close(() => r()));
  };
}

