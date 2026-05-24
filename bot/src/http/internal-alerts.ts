// bot/src/http/internal-alerts.ts
//
// Internal endpoints called by roboai-engine to push notifications via the
// bot to admins / users:
//
//   POST /internal/moderation-alert  → DM to admin TG IDs when a new
//                                       AdCampaign goes to PENDING_REVIEW.
//                                       Inline buttons: Approve / Reject.
//
//   POST /internal/billing-alert     → DM to advertiser TG when their
//                                       campaign was auto-topped-up OR is
//                                       low on balance.
//
// Auth: shared `x-internal-secret` header (env INTERNAL_API_SECRET).

import type { IncomingMessage, ServerResponse } from "node:http"
import type pino from "pino"
import { InlineKeyboard } from "grammy"

export interface InternalAlertsDeps {
	bot: { api: { sendMessage: (id: number, text: string, opts?: any) => Promise<{ message_id: number }> } }
	logger: pino.Logger
	adminTgId: number
	adminTgIds: ReadonlySet<number>
	internalSecret: string
}

const ROBOAI_BASE =
	process.env.ROBOAI_INTERNAL_URL ||
	process.env.ROBOAI_ENGINE_URL ||
	"http://roboai-engine.trendex.svc.cluster.local:3001"

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

async function readJson<T = any>(req: IncomingMessage): Promise<T> {
	return new Promise((resolveFn, rejectFn) => {
		const chunks: Buffer[] = []
		let size = 0
		const LIMIT = 32 * 1024
		req.on("data", (c: Buffer) => {
			size += c.length
			if (size > LIMIT) { req.destroy(); rejectFn(new Error("body too large")); return }
			chunks.push(c)
		})
		req.on("end", () => {
			try { resolveFn(JSON.parse(Buffer.concat(chunks).toString("utf8"))) }
			catch { rejectFn(new Error("bad json")) }
		})
		req.on("error", rejectFn)
	})
}

function ok(res: ServerResponse): void {
	res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}')
}
function err(res: ServerResponse, status: number, msg: string): void {
	res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: msg }))
}

function checkAuth(req: IncomingMessage, secret: string): boolean {
	if (!secret) return true
	const h = req.headers["x-internal-secret"]
	if (typeof h !== "string") return false
	if (h.length !== secret.length) return false
	// constant-time compare via simple xor (good enough — secret is high entropy)
	let diff = 0
	for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ secret.charCodeAt(i)
	return diff === 0
}

export async function handleModerationAlert(
	req: IncomingMessage,
	res: ServerResponse,
	deps: InternalAlertsDeps
): Promise<void> {
	if (req.method !== "POST") return err(res, 405, "method")
	if (!checkAuth(req, deps.internalSecret)) return err(res, 401, "unauthorized")
	let body: any
	try { body = await readJson(req) } catch (e) { return err(res, 400, (e as Error).message) }

	const campaignId = Number(body.campaign_id || 0)
	if (!campaignId) return err(res, 400, "campaign_id required")

	const niche = String(body.niche || "—")
	const targetUrl = String(body.target_url || "—")
	const advUid = Number(body.advertiser_user_id || 0)
	const reasons: string[] = Array.isArray(body.review_reasons) ? body.review_reasons.slice(0, 5) : []
	const score = typeof body.score === "number" ? body.score.toFixed(2) : "—"
	const promptPreview = String(body.system_prompt_preview || "").slice(0, 280)

	const text = [
		`🛡 <b>На модерацию: AdCampaign #${campaignId}</b>`,
		``,
		`<b>Юзер:</b> #${advUid}`,
		`<b>Ниша:</b> ${escapeHtml(niche)}`,
		`<b>URL:</b> ${escapeHtml(targetUrl)}`,
		`<b>AI-уверенность:</b> ${score}`,
		``,
		`<b>Причины ревью:</b>`,
		reasons.length ? reasons.map(r => "• " + escapeHtml(r)).join("\n") : "(нет)",
		``,
		`<b>Промт:</b>`,
		`<i>${escapeHtml(promptPreview)}…</i>`,
	].join("\n")

	const kb = new InlineKeyboard()
		.text("✅ Одобрить", `modapprove:${campaignId}`)
		.text("❌ Отклонить", `modreject:${campaignId}`)
		.row()
		.url("📋 Открыть в CRM", `https://crm.trendex.biz/cabinet/crm-app.html#/moderation/${campaignId}`)

	const tgts = new Set<number>()
	tgts.add(deps.adminTgId)
	for (const id of deps.adminTgIds) tgts.add(id)

	for (const tgId of tgts) {
		try {
			await deps.bot.api.sendMessage(tgId, text, { parse_mode: "HTML", reply_markup: kb })
		} catch (e) {
			deps.logger.warn({ err: (e as Error).message, tgId, campaignId }, "moderation alert send failed")
		}
	}
	return ok(res)
}

export async function handleBillingAlert(
	req: IncomingMessage,
	res: ServerResponse,
	deps: InternalAlertsDeps
): Promise<void> {
	if (req.method !== "POST") return err(res, 405, "method")
	if (!checkAuth(req, deps.internalSecret)) return err(res, 401, "unauthorized")
	let body: any
	try { body = await readJson(req) } catch (e) { return err(res, 400, (e as Error).message) }

	const userId = Number(body.userId || 0)
	const campaignId = Number(body.campaignId || 0)
	const title = String(body.title || "🔔 Уведомление")
	const text = String(body.body || "")
	const ctaUrl = body.cta_url ? String(body.cta_url) : null
	const ctaLabel = body.cta_label ? String(body.cta_label) : null

	if (!userId) return err(res, 400, "userId required")

	// Resolve user's TG chat_id via trendex-api internal.
	let chatId: number | null = null
	try {
		const apiBase = (process.env.TRENDEX_API_INTERNAL_URL || "https://api.trendex.biz/internal").replace(/\/internal\/?$/, "")
		const r = await fetch(
			apiBase + `/internal/users/by-id/${userId}`,
			{ headers: { "x-trendex-secret": deps.internalSecret } }
		)
		if (r.ok) {
			const j: any = await r.json()
			chatId = j?.user?.tg_id ? Number(j.user.tg_id) : null
		}
	} catch (e) {
		deps.logger.warn({ err: (e as Error).message, userId }, "tg_id resolve failed")
	}
	if (!chatId) return err(res, 404, "tg_id not found")

	const html = `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(text)}`
	const kb = ctaUrl && ctaLabel ? new InlineKeyboard().url(ctaLabel, ctaUrl) : undefined
	try {
		await deps.bot.api.sendMessage(chatId, html, { parse_mode: "HTML", reply_markup: kb })
	} catch (e) {
		deps.logger.warn({ err: (e as Error).message, chatId, campaignId }, "billing alert send failed")
		return err(res, 502, "send_failed")
	}
	return ok(res)
}

/**
 * POST /internal/notify/crm-inbound — called by roboai-engine CrmInboundCron
 * when a lead replies in a CRM manual-send conversation. DMs the operator
 * (conversation owner) via @TrendexCRMBot with preview + Open-in-CRM button.
 */
export async function handleCrmInbound(
	req: IncomingMessage,
	res: ServerResponse,
	deps: InternalAlertsDeps
): Promise<void> {
	if (req.method !== "POST") return err(res, 405, "method")
	if (!checkAuth(req, deps.internalSecret)) return err(res, 401, "unauthorized")
	let body: any
	try { body = await readJson(req) } catch (e) { return err(res, 400, (e as Error).message) }

	const ownerUserId = Number(body.owner_user_id || 0)
	const conversationId = Number(body.conversation_id || 0)
	const targetName = String(body.target_name || "Лид")
	const targetTgUsername = body.target_tg_username ? String(body.target_tg_username) : null
	const messageCount = Number(body.message_count || 1)
	const preview = String(body.preview || "").slice(0, 600)

	if (!ownerUserId || !conversationId) return err(res, 400, "owner_user_id + conversation_id required")

	let chatId: number | null = null
	try {
		const apiBase = (process.env.TRENDEX_API_INTERNAL_URL || "https://api.trendex.biz/internal").replace(/\/internal\/?$/, "")
		const r = await fetch(
			apiBase + `/internal/users/by-id/${ownerUserId}`,
			{ headers: { "x-trendex-secret": deps.internalSecret } }
		)
		if (r.ok) {
			const j: any = await r.json()
			chatId = j?.user?.tg_id ? Number(j.user.tg_id) : null
		}
	} catch (e) {
		deps.logger.warn({ err: (e as Error).message, ownerUserId }, "crm-inbound tg_id resolve failed")
	}
	if (!chatId) return err(res, 404, "tg_id not found")

	const leadLabel = targetTgUsername ? `${targetName} (@${targetTgUsername})` : targetName
	const html =
		`💬 <b>${escapeHtml(leadLabel)}</b> ответил${messageCount > 1 ? `и ${messageCount} раз` : ""} в CRM\n\n` +
		(preview ? `<i>${escapeHtml(preview)}</i>\n\n` : "") +
		`<a href="https://trendex.biz/cabinet/crm-app.html">→ Открыть в CRM</a>`
	const kb = new InlineKeyboard().url("📂 Открыть чат в CRM", "https://trendex.biz/cabinet/crm-app.html")
	try {
		await deps.bot.api.sendMessage(chatId, html, { parse_mode: "HTML", reply_markup: kb })
	} catch (e) {
		deps.logger.warn({ err: (e as Error).message, chatId, conversationId }, "crm-inbound send failed")
		return err(res, 502, "send_failed")
	}
	return ok(res)
}

// Callback handlers (registered in bot/index.ts) for inline-button taps.
export async function onModerationCallback(ctx: any, action: "approve" | "reject"): Promise<void> {
	const data = String(ctx.callbackQuery?.data || "")
	const campaignId = Number(data.split(":")[1] || 0)
	if (!campaignId) {
		await ctx.answerCallbackQuery({ text: "invalid id", show_alert: true }).catch(() => undefined)
		return
	}
	try {
		const url = ROBOAI_BASE + `/api/admin/moderation/${campaignId}/${action}`
		const r = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-internal-secret": process.env.INTERNAL_API_SECRET || "",
				"x-admin-tg-id": String(ctx.from?.id ?? ""),
			},
		})
		if (r.ok) {
			await ctx.answerCallbackQuery({ text: action === "approve" ? "✅ Одобрено" : "❌ Отклонено" }).catch(() => undefined)
			const baseText = ctx.callbackQuery?.message?.text || ""
			const marker = action === "approve" ? "\n\n— ✅ <b>ОДОБРЕНО</b>" : "\n\n— ❌ <b>ОТКЛОНЕНО</b>"
			await ctx.editMessageText(baseText + marker, { parse_mode: "HTML" }).catch(() => undefined)
		} else {
			const t = await r.text()
			await ctx.answerCallbackQuery({ text: `HTTP ${r.status}: ${t.slice(0,60)}`, show_alert: true }).catch(() => undefined)
		}
	} catch (e) {
		await ctx.answerCallbackQuery({ text: `Ошибка: ${(e as Error).message}`, show_alert: true }).catch(() => undefined)
	}
}
