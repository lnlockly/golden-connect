// bot/src/bot/crmMedia.ts
// Voice memo + business-card photo handlers for CRM enrichment.
//
// Voice flow (Whisper via Groq):
//   user → sends voice → bot downloads → Whisper → transcript
//   if user has an "active" contact pinned (last opened via /find or
//   crm:open: callback), append as note. Otherwise create a free-form
//   note attached to a synthetic "voice-{date}" username so it shows
//   up on the dashboard.
//
// Photo flow (vision via OpenRouter or Groq vision):
//   user → sends photo (e.g. paper business card) → bot calls vision
//   to extract {name, phone, email, telegram, company} → creates a
//   contact via crm.addContact() and confirms with inline buttons.

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { crm } from "../services/crmApi.js";

const CRM_URL =
  process.env.CRM_WEBAPP_URL || "https://golden-connect.to/cabinet/crm-app.html";
const GROQ_KEYS = (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Per-user "currently active contact" — the last contact the user opened
// in chat. Voice memos and photo notes attach to this contact. In-memory:
// resets on bot restart. Could be moved to cabinet if persistence matters.
const activeContact = new Map<number, string>();

export function setActiveContact(tgId: number, username: string): void {
  activeContact.set(tgId, username);
}

export function getActiveContact(tgId: number): string | undefined {
  return activeContact.get(tgId);
}

function pickGroqKey(): string {
  if (!GROQ_KEYS.length) throw new Error("no_groq_key");
  return GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];
}

async function transcribeVoice(fileUrl: string): Promise<string> {
  const key = pickGroqKey();
  const r = await fetch(fileUrl);
  const ab = await r.arrayBuffer();
  const blob = new Blob([ab], { type: "audio/ogg" });
  const form = new FormData();
  form.append("file", blob, "voice.ogg");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const resp = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form,
    },
  );
  if (!resp.ok) throw new Error("whisper_" + resp.status);
  const j = (await resp.json()) as { text?: string };
  return (j.text || "").trim();
}

async function extractContactFromImage(fileUrl: string): Promise<{
  name?: string;
  phone?: string;
  email?: string;
  telegram?: string;
  company?: string;
  raw: string;
}> {
  const key = pickGroqKey();
  // Groq vision: llama-3.2-90b-vision-preview. Returns JSON.
  const prompt =
    "Extract contact info from this business card or screenshot. Return STRICT JSON: " +
    `{"name":"","phone":"","email":"","telegram":"","company":""}. ` +
    "Empty strings if field absent. Phone with country code if possible.";
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      model: "llama-3.2-90b-vision-preview",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: fileUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 256,
    }),
  });
  if (!resp.ok) throw new Error("vision_" + resp.status);
  const j = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const txt = j.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(txt) as Record<string, string>;
    return { ...parsed, raw: txt };
  } catch {
    return { raw: txt };
  }
}

export async function onCrmVoice(ctx: Context): Promise<void> {
  const uid = ctx.from?.id;
  const voice = ctx.message?.voice;
  if (!uid || !voice) return;
  try {
    await ctx.replyWithChatAction("typing");
    const file = await ctx.api.getFile(voice.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const text = await transcribeVoice(url);
    if (!text) {
      await ctx.reply("⚠️ Транскрипт пустой. Попробуй переписать.");
      return;
    }
    const target = getActiveContact(uid);
    if (target) {
      await crm.appendHistory(uid, target, text, "note");
      await ctx.reply(
        `🎙️ Записал к @${target}:\n\n_${text.slice(0, 300)}${text.length > 300 ? "…" : ""}_`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().webApp("📋 Открыть карточку", CRM_URL),
        },
      );
    } else {
      // No active contact → save as standalone "voice-YYYYMMDD-HHMM" entry.
      const slug = "voice-" + new Date().toISOString().slice(0, 16).replace(/[:T-]/g, "");
      await crm.addContact(uid, { username: slug, name: "Голосовая заметка", description: text });
      await ctx.reply(
        `🎙️ Сохранил заметку \`${slug}\`:\n\n${text.slice(0, 400)}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().webApp("📋 Открыть CRM", CRM_URL),
        },
      );
    }
  } catch (e) {
    await ctx.reply("⚠️ Не получилось: " + (e as Error).message);
  }
}

/** Returns true if photo was handled as a CRM card; otherwise false (pass-through). */
export async function onCrmPhoto(ctx: Context): Promise<boolean> {
  const uid = ctx.from?.id;
  const photo = ctx.message?.photo;
  if (!uid || !photo || !photo.length) return false;
  // Only auto-process when the caption hints at CRM (or no caption at all and
  // private chat). Avoid hijacking the bot's other photo-driven flows.
  const caption = (ctx.message?.caption || "").toLowerCase();
  const isCardHint =
    caption.includes("/card") ||
    caption.includes("визитка") ||
    caption.includes("contact") ||
    caption.includes("crm");
  if (!isCardHint) return false;
  try {
    await ctx.replyWithChatAction("typing");
    const biggest = photo[photo.length - 1];
    const file = await ctx.api.getFile(biggest.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const parsed = await extractContactFromImage(url);
    if (!parsed.name && !parsed.phone && !parsed.email) {
      await ctx.reply("⚠️ Не смог распознать контакт на фото.");
      return true;
    }
    const c = await crm.addContact(uid, {
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      company: parsed.company,
      contacts: parsed.telegram ? { telegram: parsed.telegram } : undefined,
    });
    setActiveContact(uid, c.username);
    const kb = new InlineKeyboard()
      .text("✨ Сгенерить питч", "crm:pitch:" + c.username)
      .row()
      .webApp("📋 Открыть карточку", CRM_URL);
    await ctx.reply(
      "📸 Распознал визитку:\n\n" +
        `*${c.name || "—"}*\n` +
        (c.company ? `_${c.company}_\n` : "") +
        (c.phone ? `📞 ${c.phone}\n` : "") +
        (c.email ? `✉ ${c.email}\n` : "") +
        (parsed.telegram ? `✈ ${parsed.telegram}\n` : ""),
      { parse_mode: "Markdown", reply_markup: kb },
    );
    return true;
  } catch (e) {
    await ctx.reply("⚠️ Распознавание упало: " + (e as Error).message);
    return true;
  }
}
