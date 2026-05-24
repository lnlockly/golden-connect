// bot/src/bot/commands/password.ts
//
// /password command — restores cabinet password.
// Flow:
//   user types /password
//   → bot calls cabinet POST /api/auth/password-recovery with tg_id
//   → cabinet generates new password, saves hashed copy, returns plaintext once
//   → bot DMs user the new password + cabinet URL
//
// Privacy: bot deletes its own DM after 5 minutes (best-effort).

import type { AppContext } from "../middleware.js"

const CABINET_INTERNAL_URL =
	process.env.CABINET_INTERNAL_URL ||
	"http://trendex-cabinet.trendex.svc.cluster.local"

export async function onPassword(ctx: AppContext): Promise<void> {
	const tgId = ctx.from?.id
	if (!tgId) {
		await ctx.reply("Не могу определить твой Telegram. Попробуй /start ещё раз.")
		return
	}
	const secret = process.env.INTERNAL_API_SECRET || ""
	if (!secret) {
		await ctx.reply("Сервис временно недоступен (нет ключа). Попробуй позже.")
		return
	}
	try {
		const r = await fetch(CABINET_INTERNAL_URL + "/cabinet/api/auth/password-recovery", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-internal-secret": secret,
			},
			body: JSON.stringify({ tg_id: String(tgId) }),
		})
		if (!r.ok) {
			const text = await r.text()
			if (r.status === 404) {
				await ctx.reply(
					"Кабинет не найден. Сначала зарегистрируйся:\n\nhttps://trendex.biz/signup",
				)
				return
			}
			await ctx.reply(`Не получилось: ${text.slice(0, 200)}`)
			return
		}
		const j = (await r.json()) as { ok: boolean; new_password?: string; login?: string; cabinet_url?: string; reason?: string }
		if (!j.ok || !j.new_password) {
			await ctx.reply(`Ошибка: ${j.reason || "unknown"}`)
			return
		}
		const msg = await ctx.reply(
			[
				"🔑 <b>Новый пароль кабинета</b>",
				"",
				`<b>Логин:</b> <code>${escapeHtml(j.login || String(tgId))}</code>`,
				`<b>Пароль:</b> <code>${escapeHtml(j.new_password)}</code>`,
				"",
				`<b>Кабинет:</b> ${escapeHtml(j.cabinet_url || "https://trendex.biz/cabinet")}`,
				"",
				"⚠️ Это сообщение удалится через 5 минут — сохрани пароль или сразу зайди и поменяй его в Профиле.",
			].join("\n"),
			{ parse_mode: "HTML", link_preview_options: { is_disabled: true } },
		)
		// Best-effort auto-delete after 5 minutes for privacy.
		setTimeout(async () => {
			try { await ctx.api.deleteMessage(msg.chat.id, msg.message_id) } catch { /* ignore */ }
		}, 5 * 60_000)
	} catch (e) {
		await ctx.reply(`Сеть: ${(e as Error).message}`)
	}
}

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
