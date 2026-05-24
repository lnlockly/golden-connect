import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { pickLang, t } from "../../../services/i18n.js";

const PAGE_SIZE = 10;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function formatPage(
  ctx: AppContext,
  page: number,
): Promise<{ text: string; kb: InlineKeyboard }> {
  const repo = ctx.state.repoUsers;
  const total = await repo.totalUsers();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const rows = await repo.listPaginated(PAGE_SIZE, p * PAGE_SIZE);

  const lines: string[] = [];
  lines.push(`<b>Пользователи</b> (стр. ${p + 1}/${totalPages}, всего ${total})`);
  lines.push("");
  // Resolve per-row direct / descendant counts in parallel — sequential
  // awaits made the page render too slow once we went over HTTP.
  const enriched = await Promise.all(
    rows.map(async (u) => {
      const [direct, stats] = await Promise.all([
        repo.directCount(u.id),
        repo.descendantStats(u.id),
      ]);
      return { u, direct, stats };
    }),
  );
  for (const { u, direct, stats } of enriched) {
    const handle = u.username
      ? esc(`@${u.username}`)
      : (u.first_name ? esc(u.first_name) : String(u.tg_id));
    const joined = new Date(u.joined_at).toISOString().slice(0, 10);
    lines.push(
      `<code>${u.tg_id}</code> ${handle} · ${joined} · прям=${direct} всего=${stats.total_descendants}`,
    );
  }
  if (rows.length === 0) lines.push("<i>пусто</i>");

  const kb = new InlineKeyboard();
  if (p > 0) kb.text("←", `users:${p - 1}`);
  kb.text(`${p + 1}/${totalPages}`, "users:noop");
  if (p < totalPages - 1) kb.text("→", `users:${p + 1}`);
  const dict = t(pickLang(ctx.from?.language_code ?? "en"));
  kb.row().text(dict.btn_back_admin, "admin:menu");

  return { text: lines.join("\n"), kb };
}

export async function onAdminUsers(ctx: AppContext): Promise<void> {
  const { text, kb } = await formatPage(ctx, 0);
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

export async function onAdminUsersCallback(ctx: AppContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("users:")) return;
  const rest = data.slice(6);
  if (rest === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }
  const page = Number.parseInt(rest, 10);
  if (!Number.isFinite(page)) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { text, kb } = await formatPage(ctx, page);
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } catch {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}
