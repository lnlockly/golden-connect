import { InputFile } from "grammy";
import type { AppContext } from "../../middleware.js";

function csvEscape(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function onAdminExport(ctx: AppContext): Promise<void> {
  const repo = ctx.state.repoUsers;
  const rows = await repo.allForExport();

  const header = [
    "tg_id",
    "username",
    "ref_code",
    "invited_by_ref_code",
    "direct_count",
    "total_descendants",
    "joined_at",
  ];
  const out: string[] = [header.join(",")];
  for (const u of rows) {
    const [direct, stats] = await Promise.all([
      repo.directCount(u.id),
      repo.descendantStats(u.id),
    ]);
    out.push(
      [
        csvEscape(u.tg_id),
        csvEscape(u.username),
        csvEscape(u.ref_code),
        csvEscape(u.invited_by_ref_code),
        csvEscape(direct),
        csvEscape(stats.total_descendants),
        csvEscape(new Date(u.joined_at).toISOString()),
      ].join(","),
    );
  }
  const csv = out.join("\n");
  const buf = Buffer.from(csv, "utf8");
  await ctx.replyWithDocument(new InputFile(buf, `goldenConnect-users-${Date.now()}.csv`));
}
