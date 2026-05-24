// bot/src/bot/inline.ts
// Inline-mode handler for @Golden ConnectTGbot. Lets the user mention the bot
// inside any chat and get a popover of matching CRM contacts they can
// drop into the conversation (sharing the contact + an open-in-CRM button).
//
// Usage in any chat:
//   @Golden ConnectTGbot ivan
//   @Golden ConnectTGbot greenway moscow
//
// The shared message is plain text (so it survives forwarding/copying)
// plus an inline keyboard for the recipient to open the CRM card.

import type { Context } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { InlineKeyboard } from "grammy";
import { crm, type CrmContact } from "../services/crmApi.js";

const CRM_URL =
  process.env.CRM_WEBAPP_URL || "https://golden-connect.to/cabinet/crm-app.html";

function safe(s?: string): string {
  return String(s || "").replace(/[*_`[\]]/g, "");
}

function compose(c: CrmContact, lang: "ru" | "en"): {
  title: string;
  description: string;
  text: string;
  kb: InlineKeyboard;
} {
  const name = c.name || c.username || "—";
  const sub = [c.company, c.city || c.country].filter(Boolean).join(" · ");
  const lines: string[] = [];
  lines.push("👤 " + name + (c.crm?.status ? "  [" + c.crm.status + "]" : ""));
  if (sub) lines.push(sub);
  if (c.phone) lines.push("📞 " + c.phone);
  if (c.contacts?.telegram) lines.push("✈ " + c.contacts.telegram);
  if (c.contacts?.whatsapp) lines.push("📱 " + c.contacts.whatsapp);
  if (c.email) lines.push("✉ " + c.email);
  if (c.crm?.needs) lines.push((lang === "ru" ? "💡 " : "💡 ") + safe(c.crm.needs).slice(0, 200));
  const kb = new InlineKeyboard().webApp(
    lang === "ru" ? "📋 Открыть в CRM" : "📋 Open in CRM",
    CRM_URL,
  );
  if (c.contacts?.telegram) {
    kb.row().url(lang === "ru" ? "✈ Написать в TG" : "✈ Open Telegram", c.contacts.telegram);
  }
  return {
    title: name,
    description:
      [sub, c.phone, c.contacts?.telegram].filter(Boolean).join(" · ") ||
      (lang === "ru" ? "нажми, чтобы вставить" : "tap to share"),
    text: lines.join("\n"),
    kb,
  };
}

export async function onCrmInlineQuery(ctx: Context): Promise<void> {
  const q = (ctx.inlineQuery?.query || "").trim();
  const uid = ctx.from?.id;
  if (!uid) return;
  const lang = (ctx.from?.language_code || "").startsWith("ru") ? "ru" : "en";

  let items: CrmContact[] = [];
  if (q.length >= 2) {
    try {
      items = await crm.search(uid, q, 20);
    } catch (_) {
      items = [];
    }
  }

  // Promotion result: always include an "Open my CRM" inline result so the
  // user gets value even with empty queries.
  const results: InlineQueryResult[] = [];
  if (q.length < 2) {
    results.push({
      type: "article",
      id: "crm:open",
      title: lang === "ru" ? "📋 Открыть мою CRM" : "📋 Open my CRM",
      description:
        lang === "ru"
          ? "База ~6 700 MLM-контактов, питчи, задачи, сделки"
          : "~6 700 MLM contacts, pitches, tasks, deals",
      input_message_content: {
        message_text:
          lang === "ru"
            ? "📋 Открой мою CRM — все мои лиды и сделки в одном месте."
            : "📋 Open my CRM — all my leads and deals in one place.",
      },
      reply_markup: new InlineKeyboard().webApp(
        lang === "ru" ? "📋 Открыть CRM" : "📋 Open CRM",
        CRM_URL,
      ),
    });
  }

  for (const c of items.slice(0, 20)) {
    const { title, description, text, kb } = compose(c, lang);
    results.push({
      type: "article",
      id: "crm:" + (c.username || Math.random().toString(36).slice(2, 10)),
      title,
      description,
      input_message_content: {
        message_text: text,
        link_preview_options: { is_disabled: true },
      },
      reply_markup: kb,
    });
  }

  await ctx.answerInlineQuery(
    results,
    {
      cache_time: 30,
      is_personal: true,
      button: {
        text: lang === "ru" ? "📋 Открыть мою CRM" : "📋 Open my CRM",
        web_app: { url: CRM_URL },
      },
    },
  );
}
