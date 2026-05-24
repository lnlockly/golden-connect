// bot/src/bot/commands/crm-strings.ts
// Side-effect i18n registrations for the L5 CRM commands. Mirrors the
// menu-strings.ts pattern so all six locales stay aligned and TG never
// shows raw `cmd_desc.*` keys to users.

import { registerStrings } from "../../services/i18n.js";

registerStrings("ru", {
  cmd_desc: {
    crm: "📋 Моя CRM (база лидов)",
    session: "🎯 AI-сессия (поехали)",
    find: "🔍 Найти контакт",
    today: "📅 На сегодня",
    pitch: "✨ Сгенерить питч",
    pipeline: "📊 Воронка сделок",
    dashboard: "📈 Дашборд CRM",
    addlead: "➕ Добавить лида",
    next: "⏭ Следующий лид",
  },
});

registerStrings("en", {
  cmd_desc: {
    crm: "📋 My CRM (leads database)",
    session: "🎯 AI session (let's go)",
    find: "🔍 Find a contact",
    today: "📅 Today's tasks",
    pitch: "✨ Generate a pitch",
    pipeline: "📊 Deal pipeline",
    dashboard: "📈 CRM dashboard",
    addlead: "➕ Add a lead",
    next: "⏭ Next lead",
  },
});

// Other locales (uk/es/pt/tr) fall back to EN — keep the file slim and
// add them once those Lang values are added to types.ts.
