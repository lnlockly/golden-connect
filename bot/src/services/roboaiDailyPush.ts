// bot/src/services/roboaiDailyPush.ts
//
// Утренний пуш в @Golden ConnectCRMBot каждому пользователю с активной CRM-сессией:
//   • Сколько аккаунтов прошли прогрев / в кулдауне / упали в Flood
//   • Сколько новых лидов спарсилось скрапингом за вчера
//   • Сколько диалогов / ответов получили
//   • Кнопки: 📋 CRM · 📊 Дашборд
//
// Триггер: каждый день в 9:00 МСК (= 6:00 UTC).
// Реализация — простой setInterval с проверкой "hh === 6 && mm === 0..14".

import type { Bot } from "grammy"
import type { Logger } from "pino"
import { InlineKeyboard } from "grammy"
import type { AppContext } from "../bot/middleware.js"

const ROBOAI_BASE =
	process.env.ROBOAI_INTERNAL_URL ||
	process.env.ROBOAI_ENGINE_URL ||
	"http://roboai-engine.golden-connect.svc.cluster.local:3001"
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ""
const CRM_URL =
	process.env.CRM_WEBAPP_URL || "https://crm.golden-connect.to/cabinet/crm-app.html"
const PUSH_HOUR_UTC = Number(process.env.ROBOAI_DAILY_PUSH_HOUR_UTC) || 6 // 9:00 МСК

interface RoboaiDailyDigest {
	chatId: number
	ownerTgId: number
	ru: boolean
	accounts: { ready: number; warming: number; cooldown: number; deactivated: number }
	leadsScrapedYesterday: number
	dialogsYesterday: number
	repliesYesterday: number
	flagged: Array<{ phone: string; reason: string }>
}

async function fetchDigests(): Promise<RoboaiDailyDigest[]> {
	try {
		const url = ROBOAI_BASE.replace(/\/+$/, "") + "/api/roboai/internal/daily-digest"
		const r = await fetch(url, {
			method: "GET",
			headers: { "X-Internal-Secret": INTERNAL_SECRET },
		})
		if (!r.ok) return []
		const json = (await r.json()) as { items?: RoboaiDailyDigest[] }
		return json.items || []
	} catch {
		return []
	}
}

function fmtDigest(d: RoboaiDailyDigest): { text: string; kb: InlineKeyboard } {
	const ru = d.ru
	const lines: string[] = []
	lines.push(ru ? "🌅 *Доброе утро!*" : "🌅 *Good morning!*")
	lines.push("")
	lines.push(
		ru
			? `🧑 Аккаунтов: *${d.accounts.ready}* готовы · ${d.accounts.warming} на прогреве · ${d.accounts.cooldown} в кулдауне`
			: `🧑 Accounts: *${d.accounts.ready}* ready · ${d.accounts.warming} warming · ${d.accounts.cooldown} cooldown`,
	)
	if (d.accounts.deactivated)
		lines.push(
			ru
				? `⚠️ Деактивировано: *${d.accounts.deactivated}*`
				: `⚠️ Deactivated: *${d.accounts.deactivated}*`,
		)
	if (d.leadsScrapedYesterday)
		lines.push(
			ru
				? `🆕 Новых лидов через scraping: *${d.leadsScrapedYesterday}*`
				: `🆕 New scraped leads: *${d.leadsScrapedYesterday}*`,
		)
	if (d.dialogsYesterday)
		lines.push(
			ru
				? `💬 Диалогов вчера: *${d.dialogsYesterday}* · ответили *${d.repliesYesterday}*`
				: `💬 Dialogs yesterday: *${d.dialogsYesterday}* · replied *${d.repliesYesterday}*`,
		)
	if (d.flagged?.length) {
		lines.push("")
		lines.push(ru ? "🚨 *Проблемы:*" : "🚨 *Issues:*")
		for (const f of d.flagged.slice(0, 5)) {
			lines.push(`• ${f.phone} — ${f.reason}`)
		}
	}
	const kb = new InlineKeyboard()
		.webApp(ru ? "📋 Открыть CRM" : "📋 Open CRM", CRM_URL)
		.row()
		.text(ru ? "🎯 Сессия" : "🎯 Session", "sess:start")
	return { text: lines.join("\n"), kb }
}

export function startRoboaiDailyPush(opts: { bot: Bot<AppContext>; logger: Logger }): void {
	const { bot, logger } = opts
	let lastFiredDay = -1

	async function tick(): Promise<void> {
		const now = new Date()
		const utcHour = now.getUTCHours()
		const utcMinute = now.getUTCMinutes()
		const day = now.getUTCDate()
		if (utcHour !== PUSH_HOUR_UTC) return
		if (utcMinute >= 15) return // only fire within first 15 min of the target hour
		if (lastFiredDay === day) return
		lastFiredDay = day
		try {
			const digests = await fetchDigests()
			for (const d of digests) {
				const { text, kb } = fmtDigest(d)
				try {
					await bot.api.sendMessage(d.chatId, text, {
						parse_mode: "Markdown",
						reply_markup: kb,
					})
				} catch (e) {
					logger.warn({ err: (e as Error).message, chatId: d.chatId }, "roboai daily push: send failed")
				}
			}
			logger.info({ count: digests.length }, "roboai daily push sent")
		} catch (e) {
			logger.warn({ err: (e as Error).message }, "roboai daily push tick failed")
		}
	}

	// Fire first check after 30s, then every 5 min.
	setTimeout(tick, 30_000)
	setInterval(tick, 5 * 60_000)
	logger.info({ pushHourUtc: PUSH_HOUR_UTC }, "roboai daily push scheduler armed")
}
