import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import type { UserRow } from "../../../types.js";
import { isValidRefCode } from "../../../services/refcode.js";
import { pickLang, t } from "../../../services/i18n.js";

const MAX_DEPTH = 5;
const MAX_PER_LEVEL = 30;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function handle(u: UserRow): string {
  if (u.username) return esc(`@${u.username}`);
  if (u.first_name) return esc(u.first_name);
  return String(u.tg_id);
}

async function renderNode(
  ctx: AppContext,
  u: UserRow,
  depth: number,
  out: string[],
): Promise<void> {
  const pad = "  ".repeat(depth);
  const direct = await ctx.state.repoUsers.directCount(u.id);
  out.push(`${pad}• ${handle(u)} <code>${esc(u.ref_code)}</code> (прям=${direct})`);
  if (depth >= MAX_DEPTH) {
    if (direct > 0) out.push(`${pad}  …глубже (${direct})`);
    return;
  }
  const totalChildren = await ctx.state.repoUsers.childrenCount(u.id);
  const kids = await ctx.state.repoUsers.children(u.id, MAX_PER_LEVEL, 0);
  for (const k of kids) await renderNode(ctx, k, depth + 1, out);
  const hidden = totalChildren - kids.length;
  if (hidden > 0) out.push(`${"  ".repeat(depth + 1)}… ещё ${hidden}`);
}

export async function onAdminTree(ctx: AppContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!arg) {
    await ctx.reply("Использование: /tree <ref_code|tg_id>");
    return;
  }
  const repo = ctx.state.repoUsers;
  let root: UserRow | undefined;
  if (isValidRefCode(arg)) {
    root = await repo.findByRefCode(arg);
  } else {
    const n = Number.parseInt(arg, 10);
    if (Number.isFinite(n)) root = await repo.findByTgId(n);
  }
  if (!root) {
    await ctx.reply("Не найдено.");
    return;
  }
  const stats = await repo.descendantStats(root.id);
  const out: string[] = [];
  out.push(`<b>Дерево</b> от ${handle(root)} <code>${esc(root.ref_code)}</code>`);
  out.push(`Сеть: ${stats.total_descendants} потомков, макс. глубина ${stats.max_depth ?? 0}`);
  out.push("");
  await renderNode(ctx, root, 0, out);

  const text = out.join("\n");
  const chunks = text.match(/[\s\S]{1,3500}/g) ?? [text];
  const dict = t(pickLang(ctx.from?.language_code ?? "en"));
  const backKb = new InlineKeyboard().text(dict.btn_back_admin, "admin:menu");
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await ctx.reply(chunks[i], {
      parse_mode: "HTML",
      reply_markup: isLast ? backKb : undefined,
    });
  }
}
