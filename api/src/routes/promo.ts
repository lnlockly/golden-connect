import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { generatedQrcodes, promoTemplates } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { ADMIN_REF_CODE, getUserById } from '../services/users.js';
import { env } from '../services/env.js';

// Admin check keyed on ref_code (founder) or wallet allowlist. Mirrors the
// local isAdminRecord in routes/me.ts so we don't depend on a public helper
// that doesn't exist yet — Phase 1D doesn't touch the auth module.
async function isAdminUser(userId: number): Promise<boolean> {
  const record = await getUserById(userId);
  if (!record) return false;
  if (record.user.refCode === ADMIN_REF_CODE) return true;
  const addr = record.wallet?.address?.toLowerCase();
  if (addr && env.adminWallets.includes(addr)) return true;
  if (record.user.tgId != null) {
    const tgIds = (env.adminTgIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tgIds.includes(String(record.user.tgId))) return true;
  }
  return false;
}

const PROMO_CATEGORIES = ['referral', 'event', 'tariff', 'generic'] as const;

const templateInputSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i),
  category: z.enum(PROMO_CATEGORIES),
  title: z.string().min(1).max(200),
  default_text: z.string().min(1).max(4000),
  image_url: z.string().url().max(500).nullish(),
  hashtags: z.array(z.string().max(64)).max(30).nullish(),
  active: z.boolean().optional(),
});

const templatePatchSchema = templateInputSchema
  .omit({ id: true })
  .partial();

const qrSchema = z.object({
  target_url: z.string().url().max(1000),
  label: z.string().max(120).nullish(),
});

const aiPostSchema = z.object({
  template_id: z.string().max(64).nullish(),
  prompt: z.string().max(2000).nullish(),
});

function shapeTemplate(row: typeof promoTemplates.$inferSelect) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    default_text: row.defaultText,
    image_url: row.imageUrl,
    hashtags: row.hashtags ?? [],
    active: row.active,
    created_at: row.createdAt,
  };
}

// --- QR generation via `qrcode` lib. SVG is cheap to render server-side and
// compresses well for DB storage; we base64-encode it so callers can
// data-URL-inline it without extra escaping.
async function generateQrSvg(targetUrl: string): Promise<string> {
  // Lazy import so the module (and its dependency on canvas) doesn't need to
  // resolve at startup for pods that never hit /me/promo/qr.
  const mod = await import('qrcode');
  const qr = (mod as any).default ?? mod;
  const svg: string = await qr.toString(targetUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
  });
  return Buffer.from(svg, 'utf8').toString('base64');
}

const app = new Hono<{ Variables: AuthVars }>();

/* -------------------- public -------------------- */

app.get('/promo/templates', async (c) => {
  const category = c.req.query('category');
  const rows = category
    ? await db
        .select()
        .from(promoTemplates)
        .where(and(eq(promoTemplates.active, true), eq(promoTemplates.category, category)))
        .orderBy(asc(promoTemplates.createdAt))
    : await db
        .select()
        .from(promoTemplates)
        .where(eq(promoTemplates.active, true))
        .orderBy(asc(promoTemplates.createdAt));

  return c.json({ ok: true, templates: rows.map(shapeTemplate) });
});

app.get('/promo/templates/:id', async (c) => {
  const id = c.req.param('id');
  const row = await db.query.promoTemplates.findFirst({
    where: eq(promoTemplates.id, id),
  });
  if (!row || !row.active) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, template: shapeTemplate(row) });
});

/* -------------------- authenticated -------------------- */

app.use('/me/promo/*', requireAuth);

app.post('/me/promo/qr', async (c) => {
  const session = c.get('user');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = qrSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  let svgData: string;
  try {
    svgData = await generateQrSvg(parsed.data.target_url);
  } catch {
    return c.json({ ok: false, error: 'qr_generation_failed' }, 500);
  }

  const [row] = await db
    .insert(generatedQrcodes)
    .values({
      userId: session.id,
      targetUrl: parsed.data.target_url,
      svgData,
      label: parsed.data.label ?? null,
    })
    .returning();

  if (!row) return c.json({ ok: false, error: 'insert_failed' }, 500);

  return c.json({
    ok: true,
    qr: {
      id: Number(row.id),
      target_url: row.targetUrl,
      svg_data: row.svgData,
      label: row.label,
      created_at: row.createdAt,
    },
  });
});

app.post('/me/promo/ai-post', async (c) => {
  const session = c.get('user');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = aiPostSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return c.json({ ok: false, reason: 'groq_key_not_configured' });
  }

  // Resolve template (optional) so system-prompt placeholders can reference it.
  let templateText: string | null = null;
  if (parsed.data.template_id) {
    const row = await db.query.promoTemplates.findFirst({
      where: eq(promoTemplates.id, parsed.data.template_id),
    });
    if (row) templateText = row.defaultText;
  }

  const systemPrompt =
    'Ты — маркетолог TrendeX. TrendeX — это рекламная экосистема с тремя ролями: ' +
    'бизнес запускает рекламу, пользователи зарабатывают выполнением задач и ' +
    'просмотром рекламы, партнёры приглашают через 5-уровневую реф-систему и ' +
    'получают % с оплат команды. В платформе 8 тарифов (от free до royal).\n\n' +
    'Задача: создать короткий пост для соцсетей (Telegram/Instagram/TikTok) на ' +
    'основе указанного шаблона или запроса пользователя.\n\n' +
    'Требования:\n' +
    '- 3-5 предложений\n' +
    '- Живой, дружелюбный тон\n' +
    '- Призыв к действию с реф-ссылкой (используй плейсхолдер {link} — его ' +
    'подставит кабинет)\n' +
    '- 2-3 релевантных хэштега в конце (например #trendex #заработок #реклама)\n' +
    '- На русском языке, если пользователь не указал иначе\n\n' +
    'Запрещено: темы здоровья, wellness, БАДов, медицины, обещания доходов в ' +
    'процентах/суммах, «гарантированный заработок», финансовые прогнозы. ' +
    'Фокус — реклама, бизнес, партнёрская программа, заработок на задачах.';
  const userPrompt = [
    parsed.data.prompt?.trim(),
    templateText ? `Шаблон для переработки:\n${templateText}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? 'llama-3.1-70b-versatile',
        temperature: 0.8,
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              userPrompt ||
              'Сгенерируй универсальный промо-пост про TrendeX для партнёра, ' +
                'который хочет пригласить людей по своей реф-ссылке.',
          },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return c.json({ ok: false, error: 'groq_error', status: resp.status, body: errText.slice(0, 500) }, 502);
    }
    const data = (await resp.json()) as any;
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    return c.json({ ok: true, text });
  } catch (err) {
    return c.json({ ok: false, error: 'groq_unreachable', detail: String((err as Error).message) }, 502);
  }
});

/* -------------------- admin -------------------- */

app.use('/admin/promo/*', requireAuth);

app.post('/admin/promo/templates', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = templateInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  try {
    const [row] = await db
      .insert(promoTemplates)
      .values({
        id: parsed.data.id,
        category: parsed.data.category,
        title: parsed.data.title,
        defaultText: parsed.data.default_text,
        imageUrl: parsed.data.image_url ?? null,
        hashtags: parsed.data.hashtags ?? null,
        active: parsed.data.active ?? true,
      })
      .returning();
    return c.json({ ok: true, template: shapeTemplate(row!) });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return c.json({ ok: false, error: 'already_exists' }, 409);
    }
    throw e;
  }
});

app.patch('/admin/promo/templates/:id', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = templatePatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const patch: Partial<typeof promoTemplates.$inferInsert> = {};
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.default_text !== undefined) patch.defaultText = parsed.data.default_text;
  if (parsed.data.image_url !== undefined) patch.imageUrl = parsed.data.image_url ?? null;
  if (parsed.data.hashtags !== undefined) patch.hashtags = parsed.data.hashtags ?? null;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;

  if (Object.keys(patch).length === 0) {
    return c.json({ ok: false, error: 'empty_patch' }, 400);
  }

  const [row] = await db
    .update(promoTemplates)
    .set(patch)
    .where(eq(promoTemplates.id, id))
    .returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, template: shapeTemplate(row) });
});

/** Convenience — admins often want to inspect the full list incl. inactive. */
app.get('/admin/promo/templates', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  const rows = await db
    .select()
    .from(promoTemplates)
    .orderBy(desc(promoTemplates.createdAt));
  return c.json({ ok: true, templates: rows.map(shapeTemplate) });
});

/* -------------------- internal admin shortcuts (bot wizards) --------------------
 *
 * The bot has no user JWT — it authenticates with the shared
 * `x-trendex-secret` header. The bot side already verifies the caller is
 * in `ADMIN_TG_IDS` before invoking these, so the secret-only guard is
 * sufficient: there's no public surface for these routes.
 */

app.use('/internal/admin/promo/*', requireInternalSecret);

app.get('/internal/admin/promo/templates', async (c) => {
  const rows = await db
    .select()
    .from(promoTemplates)
    .orderBy(desc(promoTemplates.createdAt));
  return c.json({ ok: true, templates: rows.map(shapeTemplate) });
});

app.post('/internal/admin/promo/templates', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = templateInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  try {
    const [row] = await db
      .insert(promoTemplates)
      .values({
        id: parsed.data.id,
        category: parsed.data.category,
        title: parsed.data.title,
        defaultText: parsed.data.default_text,
        imageUrl: parsed.data.image_url ?? null,
        hashtags: parsed.data.hashtags ?? null,
        active: parsed.data.active ?? true,
      })
      .returning();
    return c.json({ ok: true, template: shapeTemplate(row!) });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return c.json({ ok: false, error: 'already_exists' }, 409);
    }
    throw e;
  }
});

app.patch('/internal/admin/promo/templates/:id', async (c) => {
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = templatePatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const patch: Partial<typeof promoTemplates.$inferInsert> = {};
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.default_text !== undefined) patch.defaultText = parsed.data.default_text;
  if (parsed.data.image_url !== undefined) patch.imageUrl = parsed.data.image_url ?? null;
  if (parsed.data.hashtags !== undefined) patch.hashtags = parsed.data.hashtags ?? null;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (Object.keys(patch).length === 0) return c.json({ ok: false, error: 'empty_patch' }, 400);

  const [row] = await db
    .update(promoTemplates)
    .set(patch)
    .where(eq(promoTemplates.id, id))
    .returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, template: shapeTemplate(row) });
});

app.delete('/internal/admin/promo/templates/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db
    .delete(promoTemplates)
    .where(eq(promoTemplates.id, id))
    .returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true });
});

export default app;
