import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang } from "../../services/i18n.js";
import { registerStrings, ts } from "../../services/i18nPlugins.js";

registerStrings({
  'scheduler.title': {
    ru: '📅 <b>Планировщик публикаций</b>',
    en: '📅 <b>Post scheduler</b>',
    zh: '📅 <b>帖子调度器</b>',
  },
  'scheduler.intro': {
    ru: 'Автопостинг в твои Telegram-каналы:\n\n• Расписание (интервал или конкретное время)\n• AI-рерайт каждой публикации\n• Авто-мониторы YouTube/TikTok/Instagram\n• Шаблоны постов\n• Smart-очередь по лучшим часам\n• Календарь и аналитика',
    en: 'Autoposting to your Telegram channels:\n\n• Schedule (interval or exact time)\n• AI rewrite for each post\n• Auto-monitors for YouTube/TikTok/Instagram\n• Post templates\n• Smart queue by best hours\n• Calendar and analytics',
    zh: '自动发帖到您的 Telegram 频道：\n\n• 计划（间隔或确切时间）\n• 每个帖子的 AI 重写\n• YouTube/TikTok/Instagram 自动监控\n• 帖子模板\n• 智能队列按最佳时间\n• 日历和分析',
  },
  'scheduler.btn_open': { ru: '🚀 Открыть планировщик', en: '🚀 Open scheduler', zh: '🚀 打开调度器' },
});

const WEBAPP_BASE = process.env.WEBAPP_BASE || process.env.WEBSITE_URL || 'https://goldenConnect.to/cabinet';

export function registerScheduler(): { onCommand: (ctx: AppContext) => Promise<void> } {
  async function onCommand(ctx: AppContext): Promise<void> {
    const lang = pickLang(ctx.from?.language_code);
    const kb = new InlineKeyboard().webApp(ts('scheduler.btn_open', lang), WEBAPP_BASE + '/cabinet.html#/adcenter');
    await ctx.reply(ts('scheduler.title', lang) + '\n\n' + ts('scheduler.intro', lang), { parse_mode: 'HTML', reply_markup: kb });
  }
  return { onCommand };
}
