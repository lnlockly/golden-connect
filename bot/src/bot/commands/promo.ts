import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang } from "../../services/i18n.js";
import { registerStrings, ts } from "../../services/i18nPlugins.js";
import type { Lang } from "../../types.js";
import { PromoRepo } from "../../db/promo.js";
import { buildInviteLink, buildWebsiteLink } from "../../services/refcode.js";

/**
 * `/promo` — REKLAMA HUB.
 *
 * Three sections:
 *   1. Buy advertising (advertisers → opens AdCenter / pays for ads)
 *   2. Earn from ads (users → opens cabinet earnings / activates ad views)
 *   3. Promo materials (existing — templates / QR / ref link)
 *
 * Clicking opens the appropriate cabinet WebApp page or shows inline content.
 */

registerStrings({
  'reklama.hub_title': {
    ru: '📣 <b>Реклама в Golden Connect</b>',
    en: '📣 <b>Advertising on Golden Connect</b>',
    zh: '📣 <b>Golden Connect 广告</b>',
  },
  'reklama.hub_subtitle': {
    ru: 'Выбери что тебе нужно:\n\n💼 <b>Купить рекламу</b> — рекламодатели платят за внимание живых юзеров\n💰 <b>Заработок на рекламе</b> — получай $ за просмотры/клики/задания\n📦 <b>Промо-материалы</b> — готовые тексты, QR, реф-ссылка',
    en: 'Pick what you need:\n\n💼 <b>Buy ads</b> — advertisers pay for real user attention\n💰 <b>Earn from ads</b> — get $ for views/clicks/tasks\n📦 <b>Promo materials</b> — ready posts, QR, ref link',
    zh: '选择您需要的：\n\n💼 <b>购买广告</b> — 广告商支付以获取真实用户的关注\n💰 <b>从广告中赚钱</b> — 通过观看/点击/任务获得$\n📦 <b>促销材料</b> — 现成的帖子、QR、推荐链接',
  },
  'reklama.btn_buy': { ru: '💼 Купить рекламу', en: '💼 Buy ads', zh: '💼 购买广告' },
  'reklama.btn_earn': { ru: '💰 Заработать на рекламе', en: '💰 Earn from ads', zh: '💰 从广告中赚钱' },
  'reklama.btn_promo': { ru: '📦 Промо-материалы', en: '📦 Promo materials', zh: '📦 促销材料' },
  'reklama.btn_back': { ru: '← Назад', en: '← Back', zh: '← 返回' },

  // BUY section
  'reklama.buy_title': { ru: '💼 <b>Купить рекламу</b>', en: '💼 <b>Buy advertising</b>', zh: '💼 <b>购买广告</b>' },
  'reklama.buy_intro': {
    ru: 'Размещай: 📡 баннеры · 🎯 контекст · 🎬 видео-реклама · 📋 задания CPA · 🤖 TG-автопостинг в каналы.\n\n<i>Прозрачная цена. Платишь за реальные показы и действия.</i>',
    en: 'Formats: 📡 banners · 🎯 context · 🎬 video ads · 📋 CPA tasks · 🤖 TG-autoposting to channels.\n\n<i>Transparent pricing. You pay for real impressions and actions.</i>',
    zh: '格式：📡 横幅 · 🎯 上下文 · 🎬 视频广告 · 📋 CPA 任务 · 🤖 TG-自动发帖到频道。\n\n<i>透明定价。您只需支付真实的展示和行动。</i>',
  },
  'reklama.buy_btn_create': { ru: '📡 Создать кампанию', en: '📡 Create campaign', zh: '📡 创建活动' },
  'reklama.buy_btn_topup': { ru: '💳 Пополнить баланс', en: '💳 Top up balance', zh: '💳 充值余额' },
  'reklama.buy_btn_my': { ru: '📊 Мои кампании', en: '📊 My campaigns', zh: '📊 我的活动' },
  'reklama.buy_btn_adcenter': { ru: '🚀 AdCenter (TG автопостинг)', en: '🚀 AdCenter (TG autoposting)', zh: '🚀 AdCenter (TG 自动发帖)' },

  // EARN section
  'reklama.earn_title': { ru: '💰 <b>Заработай на рекламе</b>', en: '💰 <b>Earn from ads</b>', zh: '💰 <b>从广告中赚钱</b>' },
  'reklama.earn_intro': {
    ru: 'До <b>$50/день</b> за активность: 👁 просмотры, 👆 клики, ✅ выполненные задания.\n\n<b>Статус PARTNER</b> (10+ рефов на любом тарифе) → <b>+10%</b> к ставке.\n\n<i>Регистрация бесплатна. Выплаты с первого дня.</i>',
    en: 'Up to <b>$50/day</b> for activity: 👁 views, 👆 clicks, ✅ completed tasks.\n\n<b>PARTNER status</b> (10+ refs on any plan) → <b>+10%</b> rate.\n\n<i>Free registration. Payouts from day one.</i>',
    zh: '每天高达 <b>$50</b> 的活动收入：👁 观看、👆 点击、✅ 完成任务。\n\n<b>PARTNER 状态</b>（任何计划上 10+ 推荐）→ <b>+10%</b> 费率。\n\n<i>免费注册。从第一天起即可支付。</i>',
  },
  'reklama.earn_btn_dashboard': { ru: '📊 Моя статистика', en: '📊 My stats', zh: '📊 我的统计' },
  'reklama.earn_btn_tasks': { ru: '🎯 Доступные задания', en: '🎯 Available tasks', zh: '🎯 可用任务' },
  'reklama.earn_btn_payouts': { ru: '💸 История выплат', en: '💸 Payout history', zh: '💸 支付历史' },
  'reklama.earn_btn_invite': { ru: '🔗 Пригласить (PARTNER)', en: '🔗 Invite (PARTNER)', zh: '🔗 邀请 (PARTNER)' },

  // PROMO section
  'reklama.promo_title': { ru: '📦 <b>Промо-материалы</b>', en: '📦 <b>Promo materials</b>', zh: '📦 <b>促销材料</b>' },
  'reklama.promo_intro': {
    ru: 'Готовые материалы для промо твоей реф-ссылки и магазина:',
    en: 'Ready materials to promote your ref link and shop:',
    zh: '推广您的推荐链接和商店的现成材料：',
  },
  'reklama.promo_btn_templates': { ru: '📝 Готовые посты (шаблоны)', en: '📝 Ready posts (templates)', zh: '📝 现成帖子（模板）' },
  'reklama.promo_btn_qr': { ru: '📱 Мой QR-код', en: '📱 My QR code', zh: '📱 我的 QR 码' },
  'reklama.promo_btn_ref': { ru: '🔗 Реф-ссылка', en: '🔗 Ref link', zh: '🔗 推荐链接' },
  'reklama.promo_btn_video': { ru: '🎬 Видео-баннеры', en: '🎬 Video banners', zh: '🎬 视频横幅' },
  'reklama.promo_btn_shop': { ru: '🏪 Мой магазин', en: '🏪 My shop', zh: '🏪 我的商店' },

  // No templates
  'reklama.no_templates': {
    ru: 'Шаблонов пока нет. Мы наполняем библиотеку — загляни чуть позже.',
    en: 'No templates yet. We are filling the library — check back soon.',
    zh: '暂无模板。我们正在填充内容库——请稍后回来查看。',
  },
  'reklama.tpl_counter': {
    ru: 'Шаблон {n} из {total}',
    en: 'Template {n} of {total}',
    zh: '模板 {n} 共 {total} 个',
  },
  'reklama.tpl_copy': { ru: '📋 Копировать', en: '📋 Copy', zh: '📋 复制' },
  'reklama.tpl_qr': { ru: '📱 QR', en: '📱 QR', zh: '📱 QR' },
  'reklama.tpl_prev': { ru: '←', en: '←', zh: '←' },
  'reklama.tpl_next': { ru: '→', en: '→', zh: '→' },
});

const WEBAPP_BASE = process.env.WEBAPP_BASE || process.env.WEBSITE_URL || 'https://golden-connect.to/cabinet';

function _hub(lang: Lang) {
  const kb = new InlineKeyboard()
    .text(ts('reklama.btn_buy', lang), 'reklama:buy').row()
    .text(ts('reklama.btn_earn', lang), 'reklama:earn').row()
    .text(ts('reklama.btn_promo', lang), 'reklama:promo').row();
  return { text: ts('reklama.hub_title', lang) + '\n\n' + ts('reklama.hub_subtitle', lang), kb };
}

function _buy(lang: Lang) {
  const kb = new InlineKeyboard()
    .webApp(ts('reklama.buy_btn_create', lang), WEBAPP_BASE + '/cabinet.html#/adcenter').row()
    .webApp(ts('reklama.buy_btn_topup', lang), WEBAPP_BASE + '/cabinet.html#/pay').row()
    .webApp(ts('reklama.buy_btn_my', lang), WEBAPP_BASE + '/cabinet.html#/adcenter').row()
    .webApp(ts('reklama.buy_btn_adcenter', lang), WEBAPP_BASE + '/cabinet.html#/adcenter').row()
    .text(ts('reklama.btn_back', lang), 'reklama:hub').row();
  return { text: ts('reklama.buy_title', lang) + '\n\n' + ts('reklama.buy_intro', lang), kb };
}

function _earn(lang: Lang) {
  const kb = new InlineKeyboard()
    .webApp(ts('reklama.earn_btn_dashboard', lang), WEBAPP_BASE + '/cabinet.html#/dashboard').row()
    .webApp(ts('reklama.earn_btn_tasks', lang), WEBAPP_BASE + '/cabinet.html#/tasks').row()
    .webApp(ts('reklama.earn_btn_payouts', lang), WEBAPP_BASE + '/cabinet.html#/withdrawals').row()
    .webApp(ts('reklama.earn_btn_invite', lang), WEBAPP_BASE + '/cabinet.html#/team').row()
    .text(ts('reklama.btn_back', lang), 'reklama:hub').row();
  return { text: ts('reklama.earn_title', lang) + '\n\n' + ts('reklama.earn_intro', lang), kb };
}

function _promo(lang: Lang) {
  const kb = new InlineKeyboard()
    .text(ts('reklama.promo_btn_templates', lang), 'reklama:tpl:0').row()
    .text(ts('reklama.promo_btn_qr', lang), 'reklama:qr').row()
    .text(ts('reklama.promo_btn_ref', lang), 'reklama:ref').row()
    .webApp(ts('reklama.promo_btn_video', lang), WEBAPP_BASE + '/cabinet.html#/tools').row()
    .webApp(ts('reklama.promo_btn_shop', lang), WEBAPP_BASE + '/cabinet.html#/myshop').row()
    .text(ts('reklama.btn_back', lang), 'reklama:hub').row();
  return { text: ts('reklama.promo_title', lang) + '\n\n' + ts('reklama.promo_intro', lang), kb };
}

function _tplCard(lang: Lang, tpl: { id: number; title?: string; body?: string }, idx: number, total: number) {
  const refLink = WEBAPP_BASE.replace(/\/cabinet$/, '');
  const body = (tpl.body || '').replace(/\{ref_link\}/g, refLink).replace(/\{site\}/g, refLink);
  const text = '<b>' + (tpl.title || 'Template') + '</b>\n\n' + body + '\n\n<i>' +
    ts('reklama.tpl_counter', lang).replace('{n}', String(idx + 1)).replace('{total}', String(total)) + '</i>';
  const kb = new InlineKeyboard();
  if (idx > 0) kb.text(ts('reklama.tpl_prev', lang), 'reklama:tpl:' + (idx - 1));
  kb.text(ts('reklama.tpl_qr', lang), 'reklama:qr');
  if (idx + 1 < total) kb.text(ts('reklama.tpl_next', lang), 'reklama:tpl:' + (idx + 1));
  kb.row().text(ts('reklama.btn_back', lang), 'reklama:promo');
  return { text, kb };
}

export function registerPromo(promoRepo: PromoRepo): {
  onPromoCmd: (ctx: AppContext) => Promise<void>;
  onPromoCallback: (ctx: AppContext) => Promise<void>;
} {
  const deps = { promoRepo };
  async function onCommand(ctx: AppContext): Promise<void> {
    const lang = pickLang(ctx.from?.language_code);
    const { text, kb } = _hub(lang);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  }

  async function onCallback(ctx: AppContext): Promise<void> {
    const data = (ctx.callbackQuery?.data || '').trim();
    if (!data.startsWith('reklama:')) return;
    const lang = pickLang(ctx.from?.language_code);
    const action = data.slice('reklama:'.length);
    let view: { text: string; kb: InlineKeyboard } | null = null;

    if (action === 'hub') view = _hub(lang);
    else if (action === 'buy') view = _buy(lang);
    else if (action === 'earn') view = _earn(lang);
    else if (action === 'promo') view = _promo(lang);
    else if (action.startsWith('tpl:')) {
      const idx = Math.max(0, parseInt(action.slice('tpl:'.length), 10) || 0);
      try {
        const list = await deps.promoRepo.listTemplates();
        const total = list.length;
        if (!total) {
          await ctx.answerCallbackQuery({ text: ts('reklama.no_templates', lang), show_alert: true });
          return;
        }
        const tpl = list[Math.min(idx, total - 1)];
        view = _tplCard(lang, tpl as unknown as { id: number; title?: string; body?: string }, Math.min(idx, total - 1), total);
      } catch { /* ignore */ }
    } else if (action === 'qr') {
      const refCode = (ctx as { refCode?: string }).refCode || '';
      const link = buildInviteLink(process.env.BOT_USERNAME || 'Golden Connect_bizbot', refCode);
      await ctx.answerCallbackQuery({ text: 'QR: ' + link, show_alert: true });
      return;
    } else if (action === 'ref') {
      const refCode = (ctx as { refCode?: string }).refCode || '';
      const link = buildInviteLink(process.env.BOT_USERNAME || 'Golden Connect_bizbot', refCode);
      const site = buildWebsiteLink(process.env.WEBSITE_URL || 'https://golden-connect.to', refCode);
      const txt = '🔗 <b>Твоя реф-ссылка</b>\n\n<b>Бот:</b> <code>' + link + '</code>\n<b>Сайт:</b> <code>' + site + '</code>\n\n<i>Делись — получай 10% L1 + до 33% по 10 уровням (зависит от тарифа).</i>';
      await ctx.editMessageText(txt, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(ts('reklama.btn_back', lang), 'reklama:promo') });
      await ctx.answerCallbackQuery();
      return;
    }

    if (view) {
      try {
        await ctx.editMessageText(view.text, { parse_mode: 'HTML', reply_markup: view.kb });
      } catch {
        await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.kb });
      }
      await ctx.answerCallbackQuery();
    }
  }

  return { onPromoCmd: onCommand, onPromoCallback: onCallback };
}


// Legacy export alias for src/bot/index.ts that imports onPromoCallback directly.
// Returns true if handled, false otherwise (for the chained handler pattern).
export async function onPromoCallback(_ctx: AppContext): Promise<boolean> {
  // No-op: registerPromo() returns the actual handler. This is a stub for back-compat.
  return false;
}
