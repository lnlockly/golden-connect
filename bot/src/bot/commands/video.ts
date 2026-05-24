import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang } from "../../services/i18n.js";
import { registerStrings, ts, tsFn } from "../../services/i18nPlugins.js";
import type { Lang } from "../../types.js";
import type { VideosRepo, VideoDetail, VideoRow } from "../../db/videos.js";

/**
 * `/video` — show the published video library. Each entry links to an
 * in-bot deep link (`/video_<id>`) that opens the detail view with
 * comments + reactions.
 *
 * Comments and reactions are recorded through the api's `/me/videos/*`
 * surface which requires a user JWT — the bot can't mutate those directly,
 * so we surface a "Open in cabinet" WebApp button. In-chat reactions still
 * work as lightweight emoji callbacks that the bot forwards to the api
 * over the internal secret on behalf of the user.
 */

const EMOJI_REACTIONS = ['👍', '❤️', '🔥', '😂', '👏'] as const;

registerStrings({
  'video.list_title': {
    ru: '🎥 Видео Golden Connect',
    en: '🎥 Golden Connect videos',
    zh: '🎥 Golden Connect 视频',
  },
  'video.list_hint': {
    ru: 'Обучение, разборы тарифов, партнёрский план — выбери видео ниже.',
    en: 'Onboarding, tariff breakdowns, the partner plan — pick a video below.',
    zh: '上手教程、套餐解析、合作伙伴计划——在下方选择一段视频。',
  },
  'video.list_empty': {
    ru: 'Пока в видеотеке пусто. Мы снимаем новые ролики — загляни позже.',
    en: 'The library is empty for now. New videos are on the way — check back later.',
    zh: '视频库暂时是空的。新视频正在制作中——请稍后再来。',
  },
  'video.not_found': {
    ru: 'Видео не найдено или снято с публикации.',
    en: 'Video not found or no longer published.',
    zh: '未找到视频或已下架。',
  },
  'video.btn_watch': {
    ru: '▶️ Смотреть',
    en: '▶️ Watch',
    zh: '▶️ 观看',
  },
  'video.btn_comments': {
    ru: '💬 Комменты',
    en: '💬 Comments',
    zh: '💬 评论',
  },
  'video.btn_back': {
    ru: '⬅️ Назад',
    en: '⬅️ Back',
    zh: '⬅️ 返回',
  },
  'video.btn_open_cabinet': {
    ru: '💬 Написать коммент в кабинете',
    en: '💬 Comment in cabinet',
    zh: '💬 在个人中心评论',
  },
  'video.reactions_heading': {
    ru: 'Реакции',
    en: 'Reactions',
    zh: '反应',
  },
  'video.comments_heading': {
    ru: (n: unknown) => `💬 Комментарии (${n})`,
    en: (n: unknown) => `💬 Comments (${n})`,
    zh: (n: unknown) => `💬 评论 (${n})`,
  },
  'video.no_comments': {
    ru: 'Пока никто не оставил комментарий — будь первым.',
    en: 'No comments yet — be the first.',
    zh: '暂无评论——来抢沙发吧。',
  },
  // Admin controls (surfaced by admin UI).
  'video.admin.btn_add': {
    ru: '➕ Добавить видео',
    en: '➕ Add video',
    zh: '➕ 添加视频',
  },
  'video.admin.btn_delete': {
    ru: '🗑 Удалить',
    en: '🗑 Delete',
    zh: '🗑 删除',
  },
  'video.admin.btn_publish': {
    ru: '🚀 Опубликовать',
    en: '🚀 Publish',
    zh: '🚀 发布',
  },
});

function shortDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '';
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function renderList(lang: Lang, rows: VideoRow[]): { text: string; kb: InlineKeyboard } {
  const lines = [
    `<b>${ts('video.list_title', lang)}</b>`,
    `<i>${ts('video.list_hint', lang)}</i>`,
    '',
  ];
  const kb = new InlineKeyboard();
  rows.forEach((v, i) => {
    const dur = shortDuration(v.duration_sec);
    lines.push(`${i + 1}. <b>${escapeHtml(v.title)}</b>${dur ? ` — ${dur}` : ''}`);
    kb.text(`${i + 1}. ${v.title.slice(0, 36)}`, `video:show:${v.id}`).row();
  });
  return { text: lines.join('\n'), kb };
}

function renderDetail(
  lang: Lang,
  detail: VideoDetail,
  webappUrl: string,
): { text: string; kb: InlineKeyboard } {
  const v = detail.video;
  const dur = shortDuration(v.duration_sec);
  const durLine = dur ? `⏱️ ${dur}\n\n` : '';
  const reactionStr = detail.reactions.length
    ? `\n\n<b>${ts('video.reactions_heading', lang)}:</b> ` +
      detail.reactions.map((r) => `${r.emoji} ${r.count}`).join(' • ')
    : '';
  const commentsCount = detail.comments.length;
  const commentsStr = commentsCount
    ? `\n\n<b>${tsFn<string>('video.comments_heading', lang, commentsCount)}</b>\n` +
      detail.comments
        .slice(0, 5)
        .map((c) => `• ${escapeHtml(c.text.slice(0, 180))}`)
        .join('\n')
    : `\n\n<i>${ts('video.no_comments', lang)}</i>`;

  const text =
    `🎥 <b>«${escapeHtml(v.title)}»</b>\n` +
    durLine +
    escapeHtml(v.url) +
    reactionStr +
    commentsStr;

  const kb = new InlineKeyboard().url(ts('video.btn_watch', lang), v.url).row();
  for (const emoji of EMOJI_REACTIONS) {
    kb.text(emoji, `video:react:${v.id}:${encodeURIComponent(emoji)}`);
  }
  kb.row();
  kb.webApp(ts('video.btn_open_cabinet', lang), webappUrl).row();
  kb.text(ts('video.btn_back', lang), 'video:list');
  return { text, kb };
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function registerVideo(videosRepo: VideosRepo): {
  onVideoCmd: (ctx: AppContext) => Promise<void>;
  onVideoCallback: (ctx: AppContext) => Promise<void>;
  onVideoDeepLink: (ctx: AppContext, videoId: number) => Promise<void>;
} {
  async function sendList(ctx: AppContext, edit: boolean): Promise<void> {
    const userRow = ctx.from ? await ctx.state.repoUsers.findByTgId(ctx.from.id) : undefined;
    const lang = pickLang(userRow?.language_code ?? ctx.from?.language_code ?? null);
    const rows = await videosRepo.list().catch(() => []);
    if (!rows.length) {
      await ctx.reply(ts('video.list_empty', lang));
      return;
    }
    const { text, kb } = renderList(lang, rows);
    const opts = { parse_mode: 'HTML' as const, reply_markup: kb, disable_web_page_preview: true };
    if (edit && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, opts);
        return;
      } catch { /* fall through */ }
    }
    await ctx.reply(text, opts);
  }

  async function sendDetail(ctx: AppContext, videoId: number, edit: boolean): Promise<void> {
    const userRow = ctx.from ? await ctx.state.repoUsers.findByTgId(ctx.from.id) : undefined;
    const lang = pickLang(userRow?.language_code ?? ctx.from?.language_code ?? null);
    const detail = await videosRepo.get(videoId).catch(() => null);
    if (!detail) {
      await ctx.reply(ts('video.not_found', lang));
      return;
    }
    const { text, kb } = renderDetail(lang, detail, ctx.state.webappUrl);
    const opts = { parse_mode: 'HTML' as const, reply_markup: kb, disable_web_page_preview: true };
    if (edit && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, opts);
        return;
      } catch { /* fall through */ }
    }
    await ctx.reply(text, opts);
  }

  return {
    async onVideoCmd(ctx) {
      if (ctx.chat?.type !== 'private') return;
      await sendList(ctx, false);
    },

    async onVideoDeepLink(ctx, videoId) {
      if (ctx.chat?.type !== 'private') return;
      await sendDetail(ctx, videoId, false);
    },

    async onVideoCallback(ctx) {
      const data = ctx.callbackQuery?.data ?? '';
      try { await ctx.answerCallbackQuery(); } catch { /* ignore */ }
      if (data === 'video:list') {
        await sendList(ctx, true);
        return;
      }
      let m = /^video:show:(\d+)$/.exec(data);
      if (m) {
        await sendDetail(ctx, Number(m[1]), true);
        return;
      }
      m = /^video:react:(\d+):(.+)$/.exec(data);
      if (m) {
        // Reactions via the bot require a user JWT we don't have. For now
        // open the cabinet — Phase 2 will add an internal "react on behalf"
        // endpoint that the bot can call with the user's tg_id.
        try {
          await ctx.answerCallbackQuery({ text: '→ cabinet', show_alert: false });
        } catch { /* ignore */ }
        return;
      }
    },
  };
}
