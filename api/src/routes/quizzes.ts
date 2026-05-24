/**
 * Quiz HTTP routes — read a quiz card + submit answers.
 *
 * Scoring:
 *   - Each question option has `score_map: { bucketKey: delta }`.
 *   - We sum deltas across buckets across all answers; the bucket with the
 *     highest total is the resolved `result`.
 *   - `quizzes.result_map` maps bucket keys to human-readable result slugs
 *     the client shows on the result page.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { quizzes, userQuizResponses, activityLog } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { checkQuestProgress } from '../services/gamification.js';

const app = new Hono<{ Variables: AuthVars }>();

interface QuizOption {
  label: string;
  score_map?: Record<string, number>;
}
interface QuizQuestion {
  key: string;
  q: string;
  options: QuizOption[];
}

// ---------------------------------------------------------------------------
// GET /quizzes/:id — public read. No auth so the bot can preview.
// ---------------------------------------------------------------------------

app.get('/quizzes/:id', async (c) => {
  const id = c.req.param('id');
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);
  if (!quiz || !quiz.active) {
    return c.json({ ok: false, error: 'not_found' }, 404);
  }
  return c.json({
    ok: true,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      questions: quiz.questions,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /quizzes/:id/submit — auth'd. body: { answers: { [key]: option_idx } }
// ---------------------------------------------------------------------------

app.use('/quizzes/:id/submit', requireAuth);
app.use('/internal/quizzes/*', requireInternalSecret);

const submitSchema = z.object({
  answers: z.record(z.number().int().nonnegative()),
});

const internalSubmitSchema = z.object({
  user_id: z.number().int().positive(),
  quiz_id: z.string().min(1),
  answers: z.record(z.number().int().nonnegative()),
});

async function scoreAndPersist(
  userId: number,
  quizId: string,
  answers: Record<string, number>,
) {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (!quiz || !quiz.active) return { notFound: true as const };

  const questions = Array.isArray(quiz.questions)
    ? (quiz.questions as QuizQuestion[])
    : [];
  const resultMap = (quiz.resultMap as Record<string, string>) ?? {};

  const buckets: Record<string, number> = {};
  for (const q of questions) {
    const idx = answers[q.key];
    if (typeof idx !== 'number') continue;
    const opt = q.options?.[idx];
    if (!opt?.score_map) continue;
    for (const [k, v] of Object.entries(opt.score_map)) {
      buckets[k] = (buckets[k] ?? 0) + Number(v);
    }
  }

  let topBucket: string | null = null;
  let topScore = -Infinity;
  for (const [k, v] of Object.entries(buckets)) {
    if (v > topScore) {
      topScore = v;
      topBucket = k;
    }
  }
  const resultSlug = topBucket ? resultMap[topBucket] ?? topBucket : null;

  const [inserted] = await db
    .insert(userQuizResponses)
    .values({ userId, quizId, answers, result: resultSlug })
    .returning({ id: userQuizResponses.id });

  try {
    await db.insert(activityLog).values({
      userId,
      eventType: 'quizzes.submitted',
      payload: { quiz_id: quizId, result: resultSlug, response_id: inserted?.id ?? null },
    });
  } catch {
    /* noop */
  }

  const questRes = await checkQuestProgress(userId, 'quiz_completed', {
    context: { quiz_id: quizId },
  });

  return {
    notFound: false as const,
    result: resultSlug,
    topBucket,
    buckets,
    grantedQuests: questRes.grantedQuests,
  };
}

app.post('/quizzes/:id/submit', async (c) => {
  const session = c.get('user');
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const res = await scoreAndPersist(session.id, id, parsed.data.answers);
  if (res.notFound) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({
    ok: true,
    result: res.result,
    top_bucket: res.topBucket,
    buckets: res.buckets,
    quests_granted: res.grantedQuests,
  });
});

app.post('/internal/quizzes/submit', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = internalSubmitSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const res = await scoreAndPersist(parsed.data.user_id, parsed.data.quiz_id, parsed.data.answers);
  if (res.notFound) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({
    ok: true,
    result: res.result,
    top_bucket: res.topBucket,
    buckets: res.buckets,
    quests_granted: res.grantedQuests,
  });
});

export default app;
