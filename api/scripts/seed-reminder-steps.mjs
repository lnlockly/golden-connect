/**
 * Seed the default 3-step onboarding reminder sequence.
 *
 * Source of the texts: `trendex-bot/src/db/migrate.ts` migration
 * `005_reminder_sequence`. Kept byte-compatible so existing users targeted by
 * the bot scheduler see exactly the same copy regardless of which stack is
 * running.
 *
 * Idempotent: rows with (order_idx, delay_hours) matching an existing row
 * are skipped — safe to run multiple times.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/seed-reminder-steps.mjs
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes('sslmode=require') ? 'require' : undefined,
  prepare: false,
});

const STEPS = [
  {
    order_idx: 1,
    delay_hours: 6,
    text_ru:
      'Эй, ты зарегался в TRENDEX, но на сайт так и не зашёл 👀\n\n' +
      'Без анкеты в приватный пул не попадёшь, приветственный бонус мимо. 3 направления: 🟢 Заказ / 🟡 Оператор / 🔵 Обучение. Выбери своё, займёт 2 минуты.\n\n' +
      'Жми /start — там твоя персональная ссылка на сайт.',
    text_en:
      'Hey, you joined TRENDEX but never opened the site 👀\n\n' +
      'No form = no private pool, no welcome bonus. 3 tracks: 🟢 Order / 🟡 Operator / 🔵 Learning. Pick one, 2 minutes.\n\n' +
      'Hit /start — your personal site link is there.',
    text_zh:
      '嘿，你加入了 TRENDEX 但还没打开网站 👀\n\n' +
      '没有填表 = 没有私享池访问权，也拿不到欢迎奖励。三个方向：🟢 订单 / 🟡 操作员 / 🔵 学习。选一个，2 分钟搞定。\n\n' +
      '点 /start — 你的专属网站链接就在那里。',
  },
  {
    order_idx: 2,
    delay_hours: 24,
    text_ru:
      'Напоминаю: 10–15 мая — публичный запуск, закрытый предстарт начнётся раньше. Без анкеты на сайте тебя не будет в приватном пуле.\n\n' +
      'Если ещё не решил, в какое направление идти — 🟢 Заказ (нужна работа AI-агентов), 🟡 Оператор (депозит 30$/мес, зарабатываешь на выполнении), 🔵 Обучение (5–50$/мес, учишься пилотировать агентов).\n\n' +
      'Деталей на сайте — дорожная карта, токеномика $FLOW, всё там. Тыкай /start.',
    text_en:
      "Heads-up: May 10–15 is the public launch; the closed pre-start kicks off earlier. No form on the site = not in the private pool.\n\n" +
      "If you're not sure which direction — 🟢 Order (need AI agents to ship something), 🟡 Operator (30$/mo deposit, earn by delivering), 🔵 Learning (5–50$/mo, learn to pilot agents).\n\n" +
      "Everything's on the site: roadmap, $FLOW tokenomics, project deck. Hit /start.",
    text_zh:
      '提醒一下：5 月 10–15 日公开上线，封闭预启动更早开始。不在网站填表 = 进不了私享池。\n\n' +
      '如果还没决定方向：🟢 订单（需要 AI 智能体完成工作），🟡 操作员（每月 30 美元押金，通过交付赚取），🔵 学习（每月 5–50 美元，学习驾驭智能体）。\n\n' +
      '一切都在网站上：路线图、$FLOW 代币经济学、项目介绍。点 /start。',
  },
  {
    order_idx: 3,
    delay_hours: 72,
    text_ru:
      'Последнее напоминание 🙏\n\n' +
      'Закрытый предстарт стартует на днях. Если ты не заполнишь анкету — просто не попадёшь в первую волну. Это 2 минуты.\n\n' +
      'После этого сообщения я перестану пинговать. Выбор за тобой: /start → сайт → заявка.',
    text_en:
      'Last reminder 🙏\n\n' +
      "The closed pre-start goes live in days. If you don't submit the form, you just won't be in the first wave. It's 2 minutes.\n\n" +
      "After this I'll stop pinging. Your call: /start → site → form.",
    text_zh:
      '最后一次提醒 🙏\n\n' +
      '封闭预启动几天后开始。如果你不提交表单，就不会进入第一波。2 分钟的事。\n\n' +
      '这条之后我不会再提醒。看你的：/start → 网站 → 表单。',
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const s of STEPS) {
    // Dedup on (order_idx, delay_hours) so re-runs never duplicate.
    const existing = await sql`
      SELECT id FROM reminder_steps
      WHERE order_idx = ${s.order_idx} AND delay_hours = ${s.delay_hours}
      LIMIT 1
    `;
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await sql`
      INSERT INTO reminder_steps
        (order_idx, delay_hours, text_ru, text_en, text_zh, enabled, updated_at)
      VALUES
        (${s.order_idx}, ${s.delay_hours}, ${s.text_ru}, ${s.text_en}, ${s.text_zh}, TRUE, NOW())
    `;
    inserted++;
  }

  console.log(`reminder_steps seed: inserted=${inserted}, skipped=${skipped}`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
