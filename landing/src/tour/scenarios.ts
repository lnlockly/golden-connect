/**
 * Guided-tour scripts per route. Each step scrolls the user to a
 * section, optionally spotlights specific elements, points a visual
 * cursor at one, plays a voice clip, and moves on.
 *
 * Russian copy: spelled phonetically (токен флоу, not $FLOW) so TTS
 * doesn't read "доллар флоу" awkwardly. Keep each step <=35 words so
 * the voice clip stays under 15s and phrasing feels tight.
 */

export type Lang = 'ru' | 'en' | 'zh';

export interface TourStep {
  id: string;
  /** Optional sub-page the step lives on. If set and different from
   *  the current pathname, the player navigates there before scroll. */
  route?: string;
  /** CSS selector of the section to scroll to. */
  scrollTo: string;
  /** Voice text per locale. */
  voice: Record<Lang, string>;
  /** Visible captions per locale. Falls back to voice text. */
  caption?: Record<Lang, string>;
  /** Visible captions with inline HTML (links, <b>, etc.). When set,
   *  renders via dangerouslySetInnerHTML — keep any HTML to a
   *  trusted whitelist. Used sparingly, e.g. a named external link
   *  next to a voice mention that should be clickable on screen. */
  captionHtml?: Record<Lang, string>;
  /** Element selectors to lift out of the dimmer (cutout). */
  spotlight?: string[];
  /** Element selector the pointer arrow lands on. */
  pointer?: string;
  /** Extra dwell after voice ends. */
  holdMs?: number;
  /** How to park the target vertically. 'center' puts it in the
   *  middle of the visible area above the caption (default).
   *  'start' pins its top ~80px below the top of the viewport —
   *  use this when the target is taller than the phone screen so
   *  the user sees its opening content first. */
  scrollAlign?: 'center' | 'start';
}

const HOME_STEPS: TourStep[] = [
  {
    id: 'hero',
    scrollTo: '#top',
    voice: {
      ru: 'Привет. Мир меняется быстрее, чем кажется. Мы — АгентФлоу. Наша задача — чтобы ИИ работал на людей, а не против них. Покажу за пару минут.',
      en: 'Hi. The world is shifting faster than it looks. We are TrendeX. Our mission — make AI work for people, not against them. Two minutes, I will show you how.',
      zh: '你好。世界变化比想象中更快。我们是 TrendeX。我们的使命 — 让 AI 为人服务,而不是相反。两分钟带你看懂。',
    },
    spotlight: ['.hero-chat-card', '.nav-logo'],
    pointer: '.hero-chat-card',
    holdMs: 0,
  },
  {
    id: 'split',
    scrollTo: '#split .split-rolling',
    voice: {
      ru: 'ИИ уже забирает работу — у учителей, юристов, врачей, дизайнеров, программистов. Это не страшилка, это происходит прямо сейчас. Посмотри сайт Рент-э-Хьюман — там ИИ уже сам нанимает людей себе на работу. Уйти в сторону не получится.',
      en: 'AI is already taking jobs — teachers, lawyers, doctors, designers, developers. Not a scare story, this is happening now. Look at rent-a-human dot io — AI is already hiring humans for its own work there. You cannot sit this one out.',
      zh: 'AI 已经在夺走工作 — 教师、律师、医生、设计师、开发者。这不是危言,正在发生。看看 Rent-a-Human 网站 — AI 已经在那里雇人为它工作。你躲不过去。',
    },
    captionHtml: {
      ru: 'ИИ уже забирает работу — у учителей, юристов, врачей, дизайнеров, программистов. Это не страшилка, это происходит прямо сейчас. Посмотри сайт <a href="https://rentahuman.ai" target="_blank" rel="noopener noreferrer">rentahuman.ai</a> — там ИИ уже сам нанимает людей себе на работу. Уйти в сторону не получится.',
      en: 'AI is already taking jobs — teachers, lawyers, doctors, designers, developers. Not a scare story, this is happening now. Check <a href="https://rentahuman.ai" target="_blank" rel="noopener noreferrer">rentahuman.ai</a> — AI is already hiring humans for its own work there. You cannot sit this one out.',
      zh: 'AI 已经在夺走工作 — 教师、律师、医生、设计师、开发者。这不是危言,正在发生。看看 <a href="https://rentahuman.ai" target="_blank" rel="noopener noreferrer">rentahuman.ai</a> — AI 已经在那里雇人为它工作。你躲不过去。',
    },
    spotlight: ['#split .split-rolling', '#split .split-list'],
    pointer: '#split .split-rolling',
    holdMs: 0,
  },
  {
    id: 'split-tracks',
    scrollTo: '#split .split-tracks',
    scrollAlign: 'start',
    voice: {
      ru: 'У нас простой ответ. Либо становишься оператором — управляешь ИИ-помощниками и зарабатываешь. Либо учишься — за месяц доводим до уровня оператора.',
      en: 'Our answer is simple. Become an operator — run the AI agents and earn. Or learn — we take you from zero to operator in a month.',
      zh: '我们的答案很简单。要么成为运营者 — 驾驭 AI 助手并赚钱。要么学习 — 一个月把你带到运营者水平。',
    },
    spotlight: ['#split .split-tracks'],
    pointer: '#split .split-leader',
    holdMs: 0,
  },
  {
    id: 'how',
    scrollTo: '#nav-how',
    voice: {
      ru: 'Как работает. Пишешь задачу своими словами. ИИ делает черновик. Живой оператор проверяет и сдаёт результат. Быстро, честно, без лишних посредников.',
      en: 'How it works. Describe the task in your words. AI drafts it. A real operator reviews and ships it. Fast, fair, no middlemen.',
      zh: '工作流程。用自己的话描述任务。AI 起草。真人运营者审核并交付。快速、公正、无中间人。',
    },
    spotlight: ['#nav-how'],
    pointer: '#nav-how',
    holdMs: 0,
  },
  {
    id: 'business',
    scrollTo: '#nav-business',
    voice: {
      ru: 'Подходит везде, где есть цифровая работа: тексты, код, дизайн, реклама, аналитика, документы. Если задача повторяется — у нас есть связка из ИИ и человека.',
      en: 'Works anywhere there is digital work: copy, code, design, ads, analytics, docs. If the task repeats — we already have the AI plus human pair for it.',
      zh: '适用于所有数字化工作:文案、代码、设计、广告、分析、文档。只要任务可重复 — 我们就有 AI 与人的搭配。',
    },
    spotlight: ['#nav-business'],
    pointer: '#nav-business',
    holdMs: 0,
  },
  {
    id: 'operators',
    scrollTo: '#nav-operators',
    voice: {
      ru: 'Оператор получает от 60 до 65 процентов с каждой работы. Выглядит скромно? Фишка в том, что оператор настраивает ИИ-агентов, а дальше агенты сами тянут заказы — это пассивный доход. А остаток уходит в общий пул бонусов операторам и в стейкинг: пока идёт заказ, и клиент, и оператор получают доходность сверху. Такого нигде больше нет.',
      en: 'An operator earns 60 to 65 percent per job. Sounds modest? The trick is the operator only sets up AI agents — the agents pull the work on their own. This is passive income. The rest goes into a shared operator bonus pool and into staking: while a job is live, both client and operator earn yield on top. No one else does this.',
      zh: '运营者每单拿 60 到 65 个百分点。看起来不多?关键在于 — 运营者只是配置 AI 智能体,之后智能体自己接单,这是被动收入。剩下的部分进入运营者共同奖金池并用于质押:工作期间,客户和运营者都能额外获得收益。别人没有这个。',
    },
    spotlight: ['#nav-operators'],
    pointer: '#nav-operators',
    holdMs: 0,
  },
  {
    id: 'token',
    scrollTo: '#nav-token',
    voice: {
      ru: 'Важный момент. Токен флоу — не обычная криптомонета. Его нельзя просто купить на бирже впрок. Токен получают только за реальное действие: за заказ, за сделанную работу или за пройденное обучение. Никаких пустых мешков и спекуляций.',
      en: 'Important. The FLOW token is not a regular crypto coin. You cannot just buy it on an exchange to hold. You get FLOW only through real action — an order, delivered work, or a completed learning step. No idle bags, no speculation.',
      zh: '重点。FLOW 代币不是普通的加密货币。你不能在交易所直接囤着买。获取 FLOW 的唯一方式是真实行动 — 下单、完成工作,或完成一个学习阶段。没有空仓,没有炒作。',
    },
    spotlight: ['#nav-token'],
    pointer: '#nav-token',
    holdMs: 0,
  },
  {
    id: 'token-safety',
    scrollTo: '#nav-token',
    voice: {
      ru: 'Почему токен, а не обычные деньги? Во-первых — безопасно: каждый токен обеспечен реальной работой, раздуть из воздуха нельзя. Во-вторых — оператор получает выплаты постепенно, пока работает, как аванс. Эта разница уходит в общий резерв — она удешевляет платформу и держит ликвидность стабильной.',
      en: 'Why a token and not regular fiat money? First — safety: every token is backed by real work, you cannot inflate it out of thin air. Second — operators get paid gradually while they work, like an advance. That spread feeds the shared reserve — it lowers platform costs and keeps liquidity stable.',
      zh: '为什么用代币,而不是普通法币?第一 — 安全:每枚代币都由真实工作支撑,不能凭空增发。第二 — 运营者在工作期间逐步领取报酬,像预支。这个差额进入共同储备 — 降低平台成本,稳定流动性。',
    },
    spotlight: ['#nav-token'],
    pointer: '#nav-token',
    holdMs: 0,
  },
  {
    id: 'capital-market',
    scrollTo: '#capital-market',
    scrollAlign: 'start',
    voice: {
      ru: 'С каждой сданной работы двадцать процентов уходит в общий резерв флоу. Резерв только растёт. Чем больше работы на платформе — тем глубже резерв и тем устойчивее токен.',
      en: 'Twenty percent of every completed job flows into the shared reserve. The reserve only grows. More work on the platform means deeper reserve and a stronger token.',
      zh: '每完成一单,百分之二十流入共同储备。储备只会增长。平台工作越多,储备越深,代币越稳。',
    },
    spotlight: ['#capital-market'],
    pointer: '#capital-market',
    holdMs: 0,
  },
  {
    id: 'launch-team',
    scrollTo: '#capital-market',
    scrollAlign: 'start',
    voice: {
      ru: 'Кто запускает токен. Команды, которые стояли за крупнейшими запусками на Тоне, Солане и Бинансе. Топ-маркетологи, эксперты в сетевом маркетинге и DeFi. На старте мы сами заливаем основную ликвидность в платформу, и у нас уже есть крупные клиенты. 50 процентов ранних заработков протокола возвращаются в рынок: 25 процентов в ликвидность, 25 процентов в аирдропы ранним участникам.',
      en: 'Who is launching the token. Teams behind the biggest launches on TON, Solana and Binance. Top marketers, network-marketing pros, DeFi experts. At launch we seed the main liquidity ourselves, and major clients are already on board. 50 percent of early protocol earnings flows back into the market — 25 into liquidity, 25 into airdrops for early participants.',
      zh: '谁来发行代币。是 TON、Solana、Binance 上最大规模发行背后的团队。顶级营销人员、网络营销专家、DeFi 行家。启动时我们自己注入主要流动性 — 而且大客户已经在列。协议早期利润的 50 百分比回流市场:25 进入流动性,25 用于早期参与者的空投。',
    },
    spotlight: ['#capital-market'],
    pointer: '#capital-market',
    holdMs: 0,
  },
  {
    id: 'referral',
    scrollTo: '#referral .section-head',
    voice: {
      ru: 'Почему проект взорвётся органически. За месяц осваиваешь профессию, уже в процессе учёбы получаешь токены, потом зарабатываешь на реальных заказах — плюс доход с приглашённых на сто уровней вглубь. И главное — наши ИИ-агенты сами гонят трафик на платформу. Фермы аккаунтов, генерация сайтов, продуктов, контента. Круглосуточно, без нашего участия.',
      en: 'Why this scales organically. In a month you pick up a new profession, earn tokens while learning, then earn on real jobs — plus referral income a hundred levels deep. And the killer detail — our own AI agents drive the traffic themselves. Account farms, generated sites, products, content. Around the clock, on autopilot.',
      zh: '为什么会自然扩散。一个月学到新职业,学习过程中就获得代币,然后从真实订单赚钱 — 加上百层深度的推荐收益。而且关键是 — 我们的 AI 智能体自己带来流量。账户农场、生成网站、产品、内容。全天候、自动化。',
    },
    spotlight: ['#referral'],
    pointer: '#referral',
    holdMs: 0,
  },
  {
    id: 'trust',
    scrollTo: '#capital-market',
    scrollAlign: 'start',
    voice: {
      ru: 'Клиенту — никакого риска. Деньги лежат на безопасном счёте, пока работу не приняли. Не подошло — вернём. Всё прозрачно.',
      en: 'Zero risk for the client. Money sits in escrow until you accept the work. Not happy — we refund. Fully transparent.',
      zh: '客户零风险。款项托管,直到你验收。不满意 — 退款。全程透明。',
    },
    spotlight: ['#capital-market'],
    pointer: '#capital-market',
    holdMs: 0,
  },
  {
    id: 'investor',
    scrollTo: '#nav-investors',
    voice: {
      ru: 'Для инвесторов — это доля в рынке услуг, который всё равно изменится. Вопрос только в том, кто сделает это первым. Мы делаем это сейчас.',
      en: 'For investors — this is a stake in a services market that will change regardless. The only question is who moves first. We are moving now.',
      zh: '对投资者而言 — 这是必然变革的服务市场份额。问题只是谁先行。我们正在先行。',
    },
    spotlight: ['#nav-investors'],
    pointer: '#nav-investors',
    holdMs: 0,
  },
  {
    id: 'manifesto',
    scrollTo: '#manifesto',
    voice: {
      ru: 'Мы не строим очередную платформу с ИИ. Мы берём эту технологию в свои руки — чтобы она работала на обычных людей, а не только на гигантов.',
      en: 'We are not building another AI platform. We are taking this technology into our own hands — to make it work for regular people, not just giants.',
      zh: '我们不是在造又一个 AI 平台。我们把这项技术掌握在自己手中 — 让它为普通人服务,而不只是巨头。',
    },
    spotlight: ['#top'],
    pointer: '#top',
    holdMs: 0,
  },
  {
    id: 'waitlist',
    scrollTo: '#top',
    voice: {
      ru: 'Финальный шаг, самый важный. Жми ВАЙТЛИСТ сверху — это ведёт в наш бот. Там ознакомься с проектом, получи приветственный токен и свою реферальную ссылку. Потом возвращайся сюда и прямо в ИИ-чате оставляй заявку — на продукт, на обучение, на роль оператора или на раннее инвестирование. Не тяни. Окно короткое — кто зашёл первым, тот и забрал долю.',
      en: 'Final step, the most important one. Hit WAITLIST at the top — it takes you into our bot. Read the intro, pick up your welcome token and personal referral link. Then come straight back and leave your request right in the AI chat — for a product, for learning, for the operator role, or for early investment. Do not wait. The window is short — first in, biggest share.',
      zh: '最后一步,也最重要。点击顶部的 WAITLIST — 进入我们的机器人。了解项目,领取欢迎代币和个人推荐链接。然后立刻回到这里,直接在 AI 聊天中提交申请 — 产品、学习、运营者角色,或早期投资。别犹豫。窗口很短 — 先行者拿最大份额。',
    },
    spotlight: ['.nav-waitlist-wrap', '.hero-area-waitlist'],
    pointer: '.nav-waitlist-wrap',
    holdMs: 0,
  },
];

export function stepsFor(pathname: string): TourStep[] {
  // Home scenario for every route for now. Per-page scripts can slot
  // in here later; unresolved selectors are silently skipped, so the
  // home script degrades gracefully on deep pages too.
  if (pathname === '/' || pathname === '') return HOME_STEPS;
  return HOME_STEPS;
}
