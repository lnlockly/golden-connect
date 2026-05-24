import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang } from "../../services/i18n.js";
import { registerStrings, ts } from "../../services/i18nPlugins.js";

registerStrings({
  'meet.title': { ru: '🎥 <b>Видеоконференции</b>', en: '🎥 <b>Video conferences</b>', zh: '🎥 <b>视频会议</b>' },
  'meet.intro': {
    ru: 'Встречи с командой и партнёрами прямо внутри Trendex.\n\n• Запланируй созвон → получишь ссылку\n• До 50 участников бесплатно\n• Запись + transcribe (AI расшифровка)\n• Интеграция с твоей командой',
    en: 'Meetings with team and partners right inside Trendex.\n\n• Schedule a call → get a link\n• Up to 50 participants free\n• Recording + transcribe (AI)\n• Integration with your team',
    zh: '在 Trendex 内与团队和合作伙伴会面。\n\n• 安排通话 → 获取链接\n• 最多 50 名参与者免费\n• 录制 + 转录 (AI)\n• 与团队整合',
  },
  'meet.btn_open': { ru: '🎥 Открыть встречи', en: '🎥 Open meetings', zh: '🎥 打开会议' },
  'meet.btn_team': { ru: '👥 Моя команда', en: '👥 My team', zh: '👥 我的团队' },
});

const WEBAPP_BASE = process.env.WEBAPP_BASE || process.env.WEBSITE_URL || 'https://trendex.biz/cabinet';

export function registerMeet(): { onCommand: (ctx: AppContext) => Promise<void> } {
  async function onCommand(ctx: AppContext): Promise<void> {
    const lang = pickLang(ctx.from?.language_code);
    const kb = new InlineKeyboard()
      .webApp(ts('meet.btn_open', lang), WEBAPP_BASE + '/cabinet.html#/meet').row()
      .webApp(ts('meet.btn_team', lang), WEBAPP_BASE + '/cabinet.html#/team').row();
    await ctx.reply(ts('meet.title', lang) + '\n\n' + ts('meet.intro', lang), { parse_mode: 'HTML', reply_markup: kb });
  }
  return { onCommand };
}
