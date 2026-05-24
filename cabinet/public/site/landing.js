/* Golden Connect landing router */
(function () {
  'use strict';

  const PRODUCT_IMAGES = { 'live-water': 'media/products/live-water.jpg', 'dihydroquercetin': 'media/uploads/dhqx6.jpg', 'oligochit-iod-53': 'media/uploads/oligohit-yod.jpg', 'oligochit-osteo': 'media/products/oligochit-osteo.jpg', 'oligochit-zoo': 'media/products/oligochit-zoo.jpg', hitabs: 'media/products/hitabs.jpg', h538: 'media/uploads/h538.jpg', tempulis: 'media/products/tempulis.jpg', reventus: 'media/products/reventus.jpg', skaveran: 'media/products/skaveran.jpg', melaris: 'media/products/melaris.jpg', 'cinalis-c6': 'media/products/cinalis-c6.jpg', 'tuberlin-c6': 'media/products/tuberlin-c6.jpg', 'alfa-nektar': 'media/products/alfa-nektar.jpg', geksanidin: 'media/products/geksanidin.jpg', provitera: 'media/products/provitera.jpg', fungirex: 'media/products/fungirex.jpg', 'omega-3': 'media/products/omega-3.jpg', calcium: 'media/products/calcium.jpg', dna: 'media/products/dna.jpg', formidium: 'media/products/formidium.jpg', boroflavin: 'media/uploads/boroflavin.jpg', 'premium-balm': 'media/uploads/vedov.jpg', 'hair-balm': 'media/products/hair-balm.jpg', 'ambulance-balm': 'media/products/ambulance-balm.jpg', phytoshampoo: 'media/products/phytoshampoo.jpg', 'woman-complex': 'media/products/woman-complex.jpg' };
  const EXPERT_IMAGES = { Чернин: 'media/experts/chernin.jpg', Пашнюк: 'media/experts/pashnyuk.jpg', Ведов: 'media/experts/vedov.jpg', Тарасова: 'media/experts/tarasova.jpg', Аванесов: 'media/experts/avanesov.jpg', Румянцев: 'media/experts/rumyancev.jpg', Варламов: 'media/experts/varlamov.jpg', Провоторов: 'media/experts/provotorov.jpg', Нефедов: 'media/experts/nefedov.jpg', Евгений: 'media/experts/evgeny.png' };
  const HERO_MEDIA = {
    health: [
      { src: 'media/uploads/water-9.jpg', alt: 'Живая вода Golden Connect', caption: 'Живая вода и ежедневная база', large: true },
      { src: 'media/experts/chernin.jpg', alt: 'Чернин Владимир Вячеславович', caption: 'Эфиры и научная база' },
      { src: 'media/uploads/awards2.png', alt: 'Награды Golden Connect', caption: 'Признание и доверие' },
    ],
    business: [
      { src: 'media/experts/evgeny.png', alt: 'Евгений Кузнецов', caption: 'Компания и система', large: true },
      { src: 'media/uploads/reviews-wheel.png', alt: 'Отзывы Golden Connect', caption: 'Социальное доказательство' },
      { src: 'media/experts/pashnyuk.jpg', alt: 'Пашнюк Денис Александрович', caption: 'Производственная база' },
    ],
    hybrid: [
      { src: 'media/uploads/water-video-1.webp', alt: 'Направления Golden Connect', caption: 'Здоровье, продукт и движение', large: true },
      { src: 'media/experts/tarasova.jpg', alt: 'Тарасова Лариса Николаевна', caption: 'Эксперты и авторы линий' },
      { src: 'media/uploads/awards2.png', alt: 'Награды Golden Connect', caption: 'Официальный контур компании' },
    ],
  };
  const COMPANY_MEDIA = [
    { src: 'media/uploads/awards2.png', alt: 'Награды Golden Connect', caption: 'Официальное признание и сильный визуальный proof', tall: true },
    { src: 'media/experts/evgeny.png', alt: 'Евгений Кузнецов', caption: 'Руководство и сооснователи компании' },
    { src: 'media/experts/chernin.jpg', alt: 'Чернин Владимир Вячеславович', caption: 'Наука, эфиры и продуктовая экспертиза' },
    { src: 'media/uploads/water-video-1.webp', alt: 'Живая вода Golden Connect', caption: 'Сильные продуктовые направления и материалы' },
  ];
  const FEATURED_PRODUCTS = { health: 'live-water', business: 'alfa-nektar', hybrid: 'tempulis' };
  const PRODUCT_DIRECTIONS = [
    { filterId: 'foundation', title: 'Вода и ежедневная база', text: 'Мягкий вход в тему здоровья через воду, антиоксидантную поддержку и понятные ежедневные продукты.', ids: ['live-water', 'dihydroquercetin', 'omega-3'] },
    { filterId: 'immunity', title: 'Иммунитет и восстановление', text: 'Продукты для людей, которые ищут системную поддержку, восстановление и ощущение ресурса.', ids: ['tempulis', 'dna', 'formidium', 'oligochit-iod-53'] },
    { filterId: 'beauty', title: 'Anti-age и красота', text: 'Косметические и beauty-направления, которые сильнее продаются через людей, кейсы и экспертные имена.', ids: ['h538', 'reventus', 'skaveran', 'melaris', 'premium-balm'] },
    { filterId: 'women', title: 'Женское направление', text: 'Подборки с акцентом на ежедневную поддержку и женские сценарии применения.', ids: ['boroflavin', 'woman-complex', 'omega-3'] },
    { filterId: 'silver', title: 'Защита и серебряные технологии', text: 'Серебряный контур и защитные решения, где важна не только польза, но и научная подача.', ids: ['provitera', 'geksanidin'] },
    { filterId: 'expert', title: 'Экспертные продуктовые блоки', text: 'Линейки, которые логично показывать рядом с конкретными врачами и авторами направлений.', ids: ['tuberlin-c6', 'cinalis-c6', 'alfa-nektar'] },
  ];
  const PRODUCT_SPOTLIGHTS = [
    { id: 'live-water', title: 'Старт через воду и качество жизни', text: 'Один из лучших входов в диалог: легко объяснить пользу, визуально показать продукт и перевести человека в тему ежедневной поддержки.' },
    { id: 'tempulis', title: 'Иммунитет и восстановление', text: 'Сильный продукт для сценариев, где человеку нужен не "каталог", а понятная тема поддержки и следующий шаг в эфиры и материалы.' },
    { id: 'h538', title: 'Beauty-направление с экспертом', text: 'Хорошо работает в связке с людьми, anti-age направлением и карточками автора продуктовой линии.' },
    { id: 'provitera', title: 'Серебряные технологии и защита', text: 'Подходит для подчеркивания технологичности, экспертности и отдельного продуктового контура внутри Golden Connect.' },
  ];
  const PRODUCT_PACKS = [
    { title: 'База на каждый день', text: 'Связка для мягкого старта и ежедневной поддержки: сначала польза и комфорт, потом уже более глубокое знакомство с системой.', ids: ['live-water', 'dihydroquercetin', 'omega-3'] },
    { title: 'Иммунитет и восстановление', text: 'Пакет для сценариев, где человек ищет ресурс, восстановление и понятный набор продуктов под тему иммунитета.', ids: ['tempulis', 'dna', 'formidium'] },
    { title: 'Anti-age и уход', text: 'Красивый вход через косметику и уходовые решения, которые логично усиливать историями экспертов и визуальным контентом.', ids: ['h538', 'reventus', 'premium-balm'] },
  ];
  const PRODUCT_FILTERS = [
    { id: 'all', title: 'Все продукты', titleEn: 'All products' },
    { id: 'foundation', title: 'Вода и база', titleEn: 'Water and base', ids: ['live-water', 'dihydroquercetin', 'omega-3'] },
    { id: 'immunity', title: 'Иммунитет', titleEn: 'Immunity', ids: ['tempulis', 'dna', 'formidium', 'oligochit-iod-53'] },
    { id: 'beauty', title: 'Anti-age и beauty', titleEn: 'Anti-age and beauty', ids: ['h538', 'reventus', 'skaveran', 'melaris', 'premium-balm', 'hair-balm', 'phytoshampoo'] },
    { id: 'women', title: 'Женское направление', titleEn: 'Women focus', ids: ['boroflavin', 'woman-complex', 'omega-3'] },
    { id: 'silver', title: 'Серебряные технологии', titleEn: 'Silver tech', ids: ['provitera', 'geksanidin'] },
    { id: 'expert', title: 'Экспертные линии', titleEn: 'Expert lines', ids: ['tuberlin-c6', 'cinalis-c6', 'alfa-nektar'] },
  ];
  const PRODUCT_EXPERT_MAP = {
    'live-water': 'Чернин Владимир Вячеславович',
    'dihydroquercetin': 'Чернин Владимир Вячеславович',
    'oligochit-iod-53': 'Чернин Владимир Вячеславович',
    'oligochit-osteo': 'Чернин Владимир Вячеславович',
    'oligochit-zoo': 'Чернин Владимир Вячеславович',
    hitabs: 'Чернин Владимир Вячеславович',
    h538: 'Тарасова Лариса Николаевна',
    tempulis: 'Тарасова Лариса Николаевна',
    reventus: 'Тарасова Лариса Николаевна',
    skaveran: 'Тарасова Лариса Николаевна',
    'cinalis-c6': 'Тарасова Лариса Николаевна',
    'tuberlin-c6': 'Тарасова Лариса Николаевна',
    'alfa-nektar': 'Олег Аванесов',
    geksanidin: 'Александр Варламов',
    provitera: 'Михаил Провоторов',
    'omega-3': 'Пашнюк Денис Александрович',
    calcium: 'Пашнюк Денис Александрович',
    dna: 'Пашнюк Денис Александрович',
    formidium: 'Пашнюк Денис Александрович',
    boroflavin: 'Пашнюк Денис Александрович',
    'woman-complex': 'Пашнюк Денис Александрович',
    'premium-balm': 'Ведов Юрий Владимирович',
    'hair-balm': 'Ведов Юрий Владимирович',
    'ambulance-balm': 'Ведов Юрий Владимирович',
    phytoshampoo: 'Ведов Юрий Владимирович',
  };
  const DIRECTION_STORIES = [
    {
      id: 'water-system',
      eyebrow: 'Рекомендация эксперта',
      eyebrowEn: 'Expert recommendation',
      title: 'Живая вода — с чего я рекомендую начинать каждому',
      titleEn: 'Live water — where I recommend everyone starts',
      text: 'Как врач с 40-летним стажем, я рекомендую начинать именно с воды. Биоактиватор «Живая вода» насыщает обычную питьевую воду молекулярным водородом, магнием и кремнием. Это самый простой и понятный первый шаг к системному оздоровлению. Добавьте дигидрокверцетин для антиоксидантной защиты и Омега-3 — и вы получите базовый комплекс на каждый день.',
      textEn: 'As a doctor with 40 years of experience, I recommend starting with water. The bioactivator enriches ordinary drinking water with molecular hydrogen, magnesium and silicon.',
      note: 'Биоактиватор питьевой воды, Дигидрокверцетин в липосомальной форме, Омега-3',
      noteEn: 'Live water bioactivator, Liposomal Dihydroquercetin, Omega-3',
      image: 'media/uploads/water-4.jpg',
      expert: 'Чернин Владимир Вячеславович',
      filterId: 'foundation',
      productIds: ['live-water', 'dihydroquercetin', 'omega-3'],
    },
    {
      id: 'beauty-author',
      eyebrow: 'Рекомендация эксперта',
      eyebrowEn: 'Expert recommendation',
      title: 'Anti-age программа — моя авторская разработка для молодости кожи',
      titleEn: 'Anti-age program — my signature development for skin youth',
      text: 'Я разработала линейку anti-age продуктов на основе многолетних клинических наблюдений. H538 содержит гиалуроновую кислоту, эластин и коллаген для глубокого восстановления кожи. Темпулис укрепляет иммунитет изнутри, а Ревентус завершает программу комплексного омоложения. Результаты видны уже через 2-3 недели систематического применения.',
      textEn: 'I developed the anti-age product line based on years of clinical observations. H538, Tempulis and Reventus provide comprehensive rejuvenation.',
      note: 'H538, Темпулис, Ревентус — комплексная программа омоложения',
      noteEn: 'H538, Tempulis, Reventus — comprehensive rejuvenation program',
      image: 'media/uploads/h538.jpg',
      expert: 'Тарасова Лариса Николаевна',
      filterId: 'beauty',
      productIds: ['h538', 'tempulis', 'reventus'],
    },
    {
      id: 'silver-tech',
      eyebrow: 'Рекомендация эксперта',
      eyebrowEn: 'Expert recommendation',
      title: 'Серебряные технологии — инновационная защита организма',
      titleEn: 'Silver technologies — innovative body protection',
      text: 'Наша команда создала уникальную технологию SilverFleece на основе коллоидного серебра. Провитера обеспечивает мощную антимикробную защиту без побочных эффектов антибиотиков. Гексанидин дополняет защитный контур, формируя надёжный барьер. Я рекомендую эти продукты всем, кто ценит научный подход к здоровью и хочет использовать передовые разработки.',
      textEn: 'Our team created the unique SilverFleece technology based on colloidal silver. Provitera and Hexanidine form a reliable protective barrier.',
      note: 'Провитера, Гексанидин — серебряный защитный контур',
      noteEn: 'Provitera, Hexanidine — silver protection circuit',
      image: 'media/uploads/provitera.jpg',
      expert: 'Михаил Провоторов',
      filterId: 'silver',
      productIds: ['provitera', 'geksanidin'],
    },
    {
      id: 'daily-nutri',
      eyebrow: 'Рекомендация эксперта',
      eyebrowEn: 'Expert recommendation',
      title: 'Женское здоровье и ежедневная нутрицевтическая поддержка',
      titleEn: 'Women health and daily nutraceutical support',
      text: 'Как микробиолог и руководитель производства, я знаю состав каждого продукта до молекулы. Женский комплекс разработан для ежедневной поддержки гормонального баланса. Борофлавин восполняет дефицит бора и флавоноидов. В сочетании с Омега-3 вы получаете полноценную программу заботы о женском здоровье без перегруза организма.',
      textEn: 'As a microbiologist, I know every product down to the molecule. The women complex supports hormonal balance daily.',
      note: 'Женский комплекс, Борофлавин, Омега-3 — забота о женском здоровье',
      noteEn: 'Women complex, Boroflavin, Omega-3 — women health care',
      image: 'media/uploads/woman-complex.jpg',
      expert: 'Пашнюк Денис Александрович',
      filterId: 'women',
      productIds: ['woman-complex', 'boroflavin', 'omega-3'],
    },
    {
      id: 'vedov-care',
      eyebrow: 'Рекомендация эксперта',
      eyebrowEn: 'Expert recommendation',
      title: 'Авторские бальзамы и уходовая линия Ведова',
      titleEn: 'Vedov signature balms and care line',
      text: 'За 30 лет клинической практики я создал линию натуральных бальзамов, которые работают на клеточном уровне. Премиум-бальзам — это концентрат из 48 природных компонентов для восстановления кожи. Бальзам для волос останавливает выпадение и стимулирует рост. А фитошампунь бережно очищает, сохраняя естественный pH. Мои пациенты видят результат после первого курса.',
      textEn: 'Over 30 years of practice, I created a line of natural balms that work at the cellular level. Premium balm, hair balm and phytoshampoo form a complete care system.',
      note: 'Премиум-бальзам, Бальзам для волос, Фитошампунь — авторская система ухода',
      noteEn: 'Premium balm, Hair balm, Phytoshampoo — signature care system',
      image: 'media/uploads/premium.jpg',
      expert: 'Ведов Юрий Владимирович',
      filterId: 'beauty',
      productIds: ['premium-balm', 'hair-balm', 'phytoshampoo'],
    },
  ];
  const ORDER = { health: ['pillars-section', 'company-section', 'results-section', 'direction-stories-section', 'products-section', 'partner-section', 'content-section'], business: ['pillars-section', 'partner-section', 'company-section', 'results-section', 'direction-stories-section', 'content-section', 'products-section'], hybrid: ['pillars-section', 'company-section', 'results-section', 'direction-stories-section', 'partner-section', 'products-section', 'content-section'] };

  const BASE = {
    nav: { company: 'Company', products: 'Products', partner: 'Partners', content: 'Materials', cabinet: 'Workspace', login: 'Login', register: 'Create account' },
    badge: 'Golden Connect partner ecosystem',
    titles: { pillars: 'Value, trust and a clear next step', products: 'Golden Connect products', partner: 'Partner system and growth path', materials: 'Materials and ready resources', results: 'Results and social proof', ai: 'Ask AI about product and launch', cta: 'Open your personal Golden Connect workspace' },
    labels: { directions: 'Directions', about: 'About', experts: 'Experts', awards: 'Recognition', results: 'Results', catalog: 'Catalog', partnership: 'Partners', levels: 'Levels', materials: 'Materials', ai: 'AI assistant', start: 'Start' },
    notes: { ref: 'This page is personalized by invitation code: {{ref}}', base: 'Study the scenario, then register and open your personal links and materials.', results: 'Real stories, trust signals and prepared proof blocks help move a person from interest to the next step.' },
    ctas: { health: 'Explore products', business: 'Partner model', hybrid: 'See the system' },
    next: { health: 'Lead with product value, then move people into your workspace.', business: 'Show the system, duplication and ready tools for a faster start.', hybrid: 'Combine health, business and growth in one clear story.' },
    buttons: { more: 'Learn more', source: 'Source', open: 'Open' },
    growth: { current: 'Current mode', language: 'Language', referral: 'Invitation code', next: 'Next step', switch: 'Switch scenario' },
    footer: { desc: 'Golden Connect platform for products, partner growth and launch support in one space.', nav: 'Navigation', contacts: 'Contacts', copy: '© 2026 Golden Connect. All rights reserved.' },
    aiPlaceholder: 'Ask about products, partner flow or launch...',
    prompts: { health: ['Какие продукты подходят для начала?', 'How do I present Golden Connect softly?', 'Когда следующий эфир с профессором?'], business: ['How do I explain the partner system simply?', 'What should a beginner show first?', 'How do I invite someone into the business scenario?'], hybrid: ['How do I combine product value and business opportunity?', 'How do I guide a client who may become a partner?', 'How do I present health, business and growth together?'] },
  };
  const I18N = {
    ru: { nav: { company: 'О компании', products: 'Продукты', partner: 'Партнёрам', content: 'Материалы', cabinet: 'Кабинет', login: 'Войти', register: 'Создать аккаунт' }, badge: 'Партнёрская экосистема Golden Connect', titles: { pillars: 'Возможности для здоровья, эфиры и поддержка', products: 'Продукты Golden Connect', partner: 'Партнёрская система и путь к росту', materials: 'Материалы и готовые ресурсы', results: 'Отзывы, истории и социальное доказательство', ai: 'Спросите AI о продукте и запуске', cta: 'Откройте свой личный кабинет Golden Connect' }, labels: { directions: 'Направления', about: 'О компании', experts: 'Эксперты', awards: 'Признание', results: 'Отзывы', catalog: 'Каталог', partnership: 'Партнёрам', levels: 'Уровни', materials: 'Материалы', ai: 'AI-помощник', start: 'Старт' }, notes: { ref: 'Страница открыта по коду приглашения: {{ref}}', base: 'Изучите сценарий, затем зарегистрируйтесь и откройте свои ссылки и материалы.', results: 'Отзывы, награды и реальные сценарии помогают объяснить проект мягко и убедительно.' }, ctas: { health: 'Смотреть продукты', business: 'Партнёрская модель', hybrid: 'Вся система' }, next: { health: 'Сначала даём пользу через продукт, потом переводим человека в кабинет.', business: 'Показываем систему, дубликацию и готовые инструменты для старта.', hybrid: 'Соединяем здоровье, бизнес и путь роста в одном сценарии.' }, buttons: { more: 'Подробнее', source: 'Источник', open: 'Открыть' }, growth: { current: 'Текущий сценарий', language: 'Язык', referral: 'Код приглашения', next: 'Следующий шаг', switch: 'Переключить сценарий' }, footer: { desc: 'Платформа Golden Connect для продукта, партнёрского роста и запуска в одном пространстве.', nav: 'Навигация', contacts: 'Контакты', copy: '© 2026 Golden Connect. Все права защищены.' }, aiPlaceholder: 'Спросите о продуктах, запуске или партнёрской системе...' },
    es: { nav: { company: 'Empresa', products: 'Productos', partner: 'Socios', content: 'Materiales', cabinet: 'Cabina', login: 'Entrar', register: 'Crear cuenta' }, badge: 'Ecosistema de socios Golden Connect', buttons: { more: 'Ver mas', source: 'Fuente', open: 'Abrir' }, ctas: { health: 'Ver productos', business: 'Modelo de negocio', hybrid: 'Ver sistema' } },
    de: { nav: { company: 'Unternehmen', products: 'Produkte', partner: 'Partner', content: 'Materialien', cabinet: 'Workspace', login: 'Login', register: 'Konto erstellen' }, badge: 'Golden Connect Partner-Okosystem', buttons: { more: 'Mehr erfahren', source: 'Quelle', open: 'Offnen' } },
    fr: { nav: { company: 'Societe', products: 'Produits', partner: 'Partenaires', content: 'Materiaux', cabinet: 'Espace', login: 'Connexion', register: 'Creer un compte' }, badge: 'Ecosysteme partenaire Golden Connect', buttons: { more: 'Voir plus', source: 'Source', open: 'Ouvrir' } },
    it: { nav: { company: 'Azienda', products: 'Prodotti', partner: 'Partner', content: 'Materiali', cabinet: 'Area', login: 'Accedi', register: 'Crea account' }, badge: 'Ecosistema partner Golden Connect', buttons: { more: 'Scopri di piu', source: 'Fonte', open: 'Apri' } },
    pt: { nav: { company: 'Empresa', products: 'Produtos', partner: 'Parceiros', content: 'Materiais', cabinet: 'Workspace', login: 'Entrar', register: 'Criar conta' }, badge: 'Ecossistema parceiro Golden Connect', buttons: { more: 'Saiba mais', source: 'Fonte', open: 'Abrir' } },
    tr: { nav: { company: 'Sirket', products: 'Urunler', partner: 'Partnerler', content: 'Materyaller', cabinet: 'Panel', login: 'Giris', register: 'Hesap olustur' }, badge: 'Golden Connect partner ekosistemi', buttons: { more: 'Detay', source: 'Kaynak', open: 'Ac' } },
    ar: { nav: { company: 'الشركة', products: 'المنتجات', partner: 'الشركاء', content: 'المواد', cabinet: 'المنصة', login: 'دخول', register: 'إنشاء حساب' }, badge: 'منظومة الشراكة Golden Connect' },
    zh: { nav: { company: '公司', products: '产品', partner: '伙伴', content: '资料', cabinet: '工作台', login: '登录', register: '创建账户' }, badge: 'Golden Connect合作伙伴生态', buttons: { more: '了解更多', source: '来源', open: '打开' } },
  };

  const state = { site: null, products: [], library: null, lang: 'ru', landing: 'health', ref: '', productFilter: 'all' };
  let aiMessages = [];
  let broadcastCountdownTimer = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(v) { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; }
  function merge(base, extra) { return Object.assign({}, base || {}, extra || {}); }
  function fill(tpl, data) { return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] || ''); }
  function copy() { const extra = I18N[state.lang] || {}; return { nav: merge(BASE.nav, extra.nav), titles: merge(BASE.titles, extra.titles), labels: merge(BASE.labels, extra.labels), notes: merge(BASE.notes, extra.notes), ctas: merge(BASE.ctas, extra.ctas), next: merge(BASE.next, extra.next), buttons: merge(BASE.buttons, extra.buttons), growth: merge(BASE.growth, extra.growth), footer: merge(BASE.footer, extra.footer), prompts: BASE.prompts, badge: extra.badge || BASE.badge, aiPlaceholder: extra.aiPlaceholder || BASE.aiPlaceholder }; }
  function l(map, fallback) { return map && typeof map === 'object' ? (map[state.lang] || map.ru || fallback || '') : (fallback || ''); }
  function langDef() { return arr(state.library && state.library.languages).find((x) => x.id === state.lang) || arr(state.library && state.library.languages)[0] || { id: 'ru', label: 'Русский', nativeLabel: 'Русский' }; }
  function landingDef() { return arr(state.library && state.library.types).find((x) => x.id === state.landing) || arr(state.library && state.library.types)[0] || null; }
  function setText(sel, val, root) { const n = $(sel, root); if (n) n.textContent = val || ''; }
  function rel(path) { const u = new URL(path, window.location.origin); if (state.ref) u.searchParams.set('ref', state.ref); return u.pathname + u.search; }
  function href(nextLanding, nextLang) { const u = new URL(window.location.href); u.searchParams.set('landing', nextLanding); u.searchParams.set('lang', nextLang); if (state.ref) u.searchParams.set('ref', state.ref); else u.searchParams.delete('ref'); return u.pathname + u.search; }
  function syncFromUrl() { const u = new URL(window.location.href); const langs = arr(state.library && state.library.languages); const types = arr(state.library && state.library.types); const qLang = String(u.searchParams.get('lang') || (state.library && state.library.defaultLanguage) || 'ru').toLowerCase(); const qLanding = String(u.searchParams.get('landing') || 'health').toLowerCase(); state.lang = langs.find((x) => x.id === qLang) ? qLang : ((state.library && state.library.defaultLanguage) || (langs[0] && langs[0].id) || 'ru'); state.landing = types.find((x) => x.id === qLanding) ? qLanding : ((types[0] && types[0].id) || 'health'); state.ref = String(u.searchParams.get('ref') || '').trim(); }
  function syncUrl() { const u = new URL(window.location.href); u.searchParams.set('landing', state.landing); u.searchParams.set('lang', state.lang); if (state.ref) u.searchParams.set('ref', state.ref); else u.searchParams.delete('ref'); history.replaceState({}, '', u.pathname + u.search + u.hash); }
  function imgForProduct(p) { return p.imageUrl || PRODUCT_IMAGES[p.id] || PRODUCT_IMAGES[p.slug] || ''; }
  function imgForExpert(name) { const k = Object.keys(EXPERT_IMAGES).find((x) => name && name.indexOf(x) !== -1); return k ? EXPERT_IMAGES[k] : ''; }
  function productById(id) { return arr(state.products).find((item) => item && (item.id === id || item.slug === id)) || null; }
  function productFilterById(id) { return PRODUCT_FILTERS.find((item) => item.id === id) || PRODUCT_FILTERS[0]; }
  function teacherIndexByName(name) { return arr(state.site && state.site.teachers).findIndex((item) => item && item.name === name); }
  function teacherByName(name) { return arr(state.site && state.site.teachers).find((item) => item && item.name === name) || null; }
  function expertForProduct(product) { if (!product) return null; return PRODUCT_EXPERT_MAP[product.id] || PRODUCT_EXPERT_MAP[product.slug] || null; }
  function formatDate(value) {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return String(value);
    }
  }
  function productMatchesFilter(product, filterId) {
    if (!product || !filterId || filterId === 'all') return true;
    const filter = productFilterById(filterId);
    return arr(filter && filter.ids).includes(product.id) || arr(filter && filter.ids).includes(product.slug);
  }
  function shorten(text, limit) { const raw = String(text || '').trim(); if (!raw || raw.length <= limit) return raw; return raw.slice(0, Math.max(0, limit - 1)).trim() + '…'; }
  function orderSections() { const wrap = $('#landing-wrap'); const foot = $('.footer', wrap); (ORDER[state.landing] || ORDER.health).forEach((id) => { const n = document.getElementById(id); if (wrap && foot && n) wrap.insertBefore(n, foot); }); }
  function stats(c) { if (state.landing === 'business') return [{ v: '5', l: c.labels.levels }, { v: 'AI', l: 'AI' }, { v: '10', l: 'Languages' }]; if (state.landing === 'hybrid') return [{ v: '25', l: c.labels.catalog }, { v: '5', l: c.labels.levels }, { v: '360°', l: 'Growth' }]; return [{ v: '25', l: c.labels.catalog }, { v: '7+', l: c.labels.directions }, { v: '10', l: 'Languages' }]; }
  function renderTrust(items) { const el = $('#trust-strip'); if (el) el.innerHTML = arr(items).map((t) => '<div class="trust-item"><span class="trust-item-icon">' + esc(t.icon || '✓') + '</span><span class="trust-item-text">' + esc(t.text) + '</span></div>').join(''); }
  function renderHeroVisual() {
    const el = $('#hero-media-grid');
    const media = HERO_MEDIA[state.landing] || HERO_MEDIA.health;
    if (!el) return;
    el.innerHTML = arr(media).map((item) => '<div class="hero-card-media-tile' + (item.large ? ' hero-card-media-tile--large' : '') + '">' + '<img src="' + esc(item.src) + '" alt="' + esc(item.alt || 'Golden Connect') + '" loading="eager">' + (item.caption ? '<div class="hero-card-media-caption">' + esc(item.caption) + '</div>' : '') + '</div>').join('');
  }
  function renderPillars(items) { const el = $('#pillars-grid'); if (el) el.innerHTML = arr(items).map((p) => '<article class="pillar-card"><div class="pillar-card-icon">' + esc(p.icon || '✦') + '</div><h3 class="pillar-card-title">' + esc(p.title) + '</h3><p class="pillar-card-text">' + esc(p.text) + '</p></article>').join(''); }
  function renderCompany(company) {
    if (!company) return;
    setText('#company-title', company.title || '');
    setText('#company-intro', company.intro || '');
    setText('#company-description', company.description || '');
    const meta = $('#company-meta');
    if (meta) {
      setText('#company-updated', formatDate(company.updatedAt) || '');
      setText('#company-methodology', company.methodology || '');
      setText('#company-disclaimer', company.disclaimer || '');
      const hasMeta = Boolean(company.updatedAt || company.methodology || company.disclaimer);
      meta.style.display = hasMeta ? '' : 'none';
    }

    const highlights = $('#company-highlights');
    if (highlights) {
      highlights.innerHTML = arr(company.highlights).map((item) => '<article class="card"><div class="card-eyebrow">Golden Connect</div><h3 class="card-title">' + esc(item.title) + '</h3><p class="card-text">' + esc(item.text) + '</p></article>').join('');
    }

    const facts = $('#company-facts');
    if (facts) {
      facts.innerHTML = arr(company.facts).map((item) => '<article class="fact-card"><div class="fact-card-value">' + esc(item.value) + '</div><div class="fact-card-label">' + esc(item.label) + '</div></article>').join('');
    }

    const offices = $('#company-offices');
    if (offices) {
      const list = arr(state.site && state.site.offices);
      if (!list.length) {
        offices.style.display = 'none';
      } else {
        offices.innerHTML = list.map((item) => '<span class="office-chip"><strong>' + esc(item.city || '') + '</strong>' + (item.country ? ' • ' + esc(item.country) : '') + (item.status ? ' — ' + esc(item.status) : '') + '</span>').join('');
      }
    }

    const sources = $('#company-sources');
    if (sources) {
      sources.innerHTML = arr(company.sources).map((item) => '<a class="btn btn--outline btn--sm" href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.label) + '</a>').join('');
    }

    const collage = $('#company-media-collage');
    if (collage) {
      collage.innerHTML = COMPANY_MEDIA.map((item) => '<article class="company-media-item' + (item.tall ? ' company-media-item--tall' : '') + '">' + '<img src="' + esc(item.src) + '" alt="' + esc(item.alt || 'Golden Connect') + '" loading="lazy">' + '<div class="company-media-caption">' + esc(item.caption) + '</div></article>').join('');
    }

    const leadership = $('#company-leadership-grid');
    if (leadership) {
      leadership.innerHTML = arr(company.experts).map((item) => {
        const img = imgForExpert(item.name);
        const chips = arr(item.focus).slice(0, 3).map((tag) => '<span class="expert-tag">' + esc(tag) + '</span>').join('');
        const teacherIndex = teacherIndexByName(item.name);
        const button = teacherIndex >= 0 ? '<div class="expert-actions"><button type="button" class="btn btn--ghost btn--sm expert-details-btn" data-teacher-index="' + esc(String(teacherIndex)) + '">Подробнее</button></div>' : '';
        return '<article class="expert-card">' +
          (img ? '<img src="' + esc(img) + '" alt="' + esc(item.name) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;flex-shrink:0">' : '<div class="expert-avatar">' + esc((item.name || '?')[0]) + '</div>') +
          '<div><div class="expert-role">' + esc(item.role) + '</div><h3 class="expert-name">' + esc(item.name) + '</h3><p class="expert-summary">' + esc(item.summary) + '</p>' +
          (chips ? '<div class="expert-tags">' + chips + '</div>' : '') + button + '</div></article>';
      }).join('');
      leadership.querySelectorAll('[data-teacher-index]').forEach((btn) => {
        btn.addEventListener('click', function () {
          openTeacherDialog(Number(btn.getAttribute('data-teacher-index')));
        });
      });
    }

    const awards = $('#company-awards');
    if (awards) {
      awards.innerHTML = arr(company.awards).map((item) => '<article class="award-card"><div class="award-icon">🏆</div><div><h3 class="award-title">' + esc(item.title) + '</h3><p class="award-text">' + esc(item.note) + '</p></div></article>').join('');
    }
  }
  function renderDirectionStories() {
    const el = $('#direction-story-grid');
    if (!el) return;
    const filterLabel = state.lang === 'ru' ? 'Открыть подборку' : 'Open selection';
    const expertLabel = state.lang === 'ru' ? 'Подробнее об эксперте' : 'About the expert';
    el.innerHTML = DIRECTION_STORIES.map((story) => {
      const teacherIndex = teacherIndexByName(story.expert);
      const products = story.productIds.map((id) => productById(id)).filter(Boolean);
      const chips = products.map((product) => '<span class="expert-tag expert-tag--product">' + esc(product.title) + '</span>').join('');
      const note = state.lang === 'ru' ? story.note : (story.noteEn || story.note);
      return '<article class="direction-story-card">' +
        '<div class="direction-story-card__media">' +
        '<img src="' + esc(story.image) + '" alt="' + esc(story.title) + '" loading="lazy">' +
        '<div class="direction-story-card__badge">Golden Connect</div>' +
        '</div>' +
        '<div class="direction-story-card__body">' +
        '<div class="direction-story-card__eyebrow">' + esc(state.lang === 'ru' ? story.eyebrow : (story.eyebrowEn || story.eyebrow)) + '</div>' +
        '<h3 class="direction-story-card__title">' + esc(state.lang === 'ru' ? story.title : (story.titleEn || story.title)) + '</h3>' +
        '<p class="direction-story-card__text">' + esc(state.lang === 'ru' ? story.text : (story.textEn || story.text)) + '</p>' +
        '<p class="direction-story-card__note">' + esc(note) + '</p>' +
        (chips ? '<div class="direction-story-card__products">' + chips + '</div>' : '') +
        '<div class="direction-story-card__actions">' +
        '<button type="button" class="btn btn--primary btn--sm" data-story-filter="' + esc(story.filterId) + '">' + esc(filterLabel) + '</button>' +
        (teacherIndex >= 0 ? '<button type="button" class="btn btn--ghost btn--sm" data-story-teacher-index="' + esc(String(teacherIndex)) + '">' + esc(expertLabel) + '</button>' : '') +
        '</div>' +
        '</div></article>';
    }).join('');

    el.querySelectorAll('[data-story-filter]').forEach((btn) => {
      btn.addEventListener('click', function () {
        state.productFilter = btn.getAttribute('data-story-filter') || 'all';
        renderProducts(copy());
        const target = document.getElementById('products-section');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    el.querySelectorAll('[data-story-teacher-index]').forEach((btn) => {
      btn.addEventListener('click', function () {
        openTeacherDialog(Number(btn.getAttribute('data-story-teacher-index')));
      });
    });
  }
  function renderProducts(c) {
    const items = arr(state.products);
    const registerUrl = rel('/cabinet/register');
    const instructionLabel = state.lang === 'ru' ? 'Применение' : 'Instructions';
    const featured = productById(FEATURED_PRODUCTS[state.landing] || FEATURED_PRODUCTS.health) || items[0] || null;
    const activeFilter = productFilterById(state.productFilter);
    const filteredItems = items.filter((product) => productMatchesFilter(product, activeFilter.id));

    const heroImage = $('#products-hero-image');
    const heroEyebrow = $('#products-hero-eyebrow');
    const heroTitle = $('#products-hero-title');
    const heroText = $('#products-hero-text');
    if (featured) {
      if (heroImage) {
        heroImage.src = imgForProduct(featured) || 'media/brand-og.jpg';
        heroImage.alt = featured.title || 'Golden Connect';
      }
      if (heroEyebrow) heroEyebrow.textContent = state.lang === 'ru' ? 'Ключевое направление' : 'Featured direction';
      if (heroTitle) heroTitle.textContent = featured.title || '';
      if (heroText) heroText.textContent = featured.story || featured.shortDescription || '';
    }

    const productsKpiGrid = $('#products-kpi-grid');
    if (productsKpiGrid) {
      const kpis = [
        { value: String(items.length || 0), label: state.lang === 'ru' ? 'продуктов в каталоге' : 'products in catalog' },
        { value: String(PRODUCT_DIRECTIONS.length), label: state.lang === 'ru' ? 'маршрутов выбора' : 'selection routes' },
        { value: '8+', label: state.lang === 'ru' ? 'людей и направлений в подаче' : 'experts and directions' },
      ];
      productsKpiGrid.innerHTML = kpis.map((item) => '<article class="fact-card products-kpi-card"><div class="fact-card-value">' + esc(item.value) + '</div><div class="fact-card-label">' + esc(item.label) + '</div></article>').join('');
    }

    const resources = $('#products-resource-actions');
    if (resources) {
      const links = state.site && state.site.links;
      const buttons = [
        links && links.companyCatalog ? { label: state.lang === 'ru' ? 'Открыть каталог компании' : 'Open catalog', url: links.companyCatalog } : null,
        links && links.instructions ? { label: state.lang === 'ru' ? 'Смотреть инструкции' : 'Open instructions', url: links.instructions } : null,
        links && links.results ? { label: state.lang === 'ru' ? 'Отзывы и результаты' : 'Results', url: links.results } : null,
      ].filter(Boolean);
      resources.innerHTML = buttons.map((item) => '<a class="btn btn--outline btn--sm" href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.label) + '</a>').join('');
    }

    const directionGrid = $('#products-direction-grid');
    if (directionGrid) {
      directionGrid.innerHTML = PRODUCT_DIRECTIONS.map((direction) => {
        const available = direction.ids.map((id) => productById(id)).filter(Boolean);
        const chips = available.slice(0, 3).map((product) => '<span class="expert-tag">' + esc(product.title) + '</span>').join('');
        const openLabel = state.lang === 'ru' ? 'Открыть подборку' : 'Open selection';
        return '<article class="products-direction-card"><div class="products-direction-card__count">' + esc(String(available.length)) + '</div><h4>' + esc(direction.title) + '</h4><p>' + esc(direction.text) + '</p>' + (chips ? '<div class="expert-tags">' + chips + '</div>' : '') + '<div class="expert-actions"><button type="button" class="btn btn--ghost btn--sm" data-product-filter="' + esc(direction.filterId || 'all') + '">' + esc(openLabel) + '</button></div></article>';
      }).join('');
      directionGrid.querySelectorAll('[data-product-filter]').forEach((btn) => {
        btn.addEventListener('click', function () {
          state.productFilter = btn.getAttribute('data-product-filter') || 'all';
          renderProducts(c);
          const target = document.getElementById('product-grid');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    const spotlightGrid = $('#products-spotlight-grid');
    if (spotlightGrid) {
      spotlightGrid.innerHTML = PRODUCT_SPOTLIGHTS.map((item) => {
        const product = productById(item.id);
        if (!product) return '';
        return '<article class="products-spotlight-card"><div class="products-spotlight-card__media">' + '<img src="' + esc(imgForProduct(product)) + '" alt="' + esc(product.title) + '" loading="lazy">' + '</div><div class="products-spotlight-card__body"><h4>' + esc(item.title) + '</h4><p>' + esc(item.text) + '</p><small>' + esc(product.title) + (product.category ? ' · ' + esc(product.category) : '') + '</small></div></article>';
      }).join('');
    }

    const packGrid = $('#products-pack-grid');
    if (packGrid) {
      packGrid.innerHTML = PRODUCT_PACKS.map((pack) => {
        const bundle = pack.ids.map((id) => productById(id)).filter(Boolean);
        const cover = bundle[0];
        const chips = bundle.map((product) => '<span class="expert-tag expert-tag--product">' + esc(product.title) + '</span>').join('');
        return '<article class="products-pack-card"><div class="products-pack-card__media">' + (cover ? '<img src="' + esc(imgForProduct(cover)) + '" alt="' + esc(pack.title) + '" loading="lazy">' : '') + '</div><div class="products-pack-card__body"><h4>' + esc(pack.title) + '</h4><p>' + esc(pack.text) + '</p>' + (chips ? '<div class="expert-tags">' + chips + '</div>' : '') + '</div></article>';
      }).join('');
    }

    const filterBar = $('#product-filter-bar');
    if (filterBar) {
      filterBar.innerHTML = PRODUCT_FILTERS.map((filter) => {
        const count = items.filter((product) => productMatchesFilter(product, filter.id)).length;
        const label = state.lang === 'ru' ? filter.title : (filter.titleEn || filter.title);
        return '<button type="button" class="product-filter-btn ' + (filter.id === activeFilter.id ? 'is-active' : '') + '" data-grid-filter="' + esc(filter.id) + '">' + '<span>' + esc(label) + '</span><span class="product-filter-btn__count">' + esc(String(count)) + '</span></button>';
      }).join('');
      filterBar.querySelectorAll('[data-grid-filter]').forEach((btn) => {
        btn.addEventListener('click', function () {
          state.productFilter = btn.getAttribute('data-grid-filter') || 'all';
          renderProducts(c);
        });
      });
    }

    const summary = $('#product-grid-summary');
    if (summary) {
      if (activeFilter.id === 'all') {
        summary.textContent = state.lang === 'ru'
          ? 'Показываем полный каталог Golden Connect: выбирайте фильтр, чтобы быстро перейти к своему сценарию.'
          : 'Showing the full Golden Connect catalog. Use a filter to jump straight to your scenario.';
      } else {
        const label = state.lang === 'ru' ? activeFilter.title : (activeFilter.titleEn || activeFilter.title);
        summary.textContent = state.lang === 'ru'
          ? 'Показано ' + filteredItems.length + ' из ' + items.length + ' продуктов в подборке «' + label + '».'
          : 'Showing ' + filteredItems.length + ' of ' + items.length + ' products for "' + label + '".';
      }
    }

    const el = $('#product-grid');
    if (!el) return;
    el.innerHTML = filteredItems.map((p) => {
      const expertName = expertForProduct(p);
      const teacherIndex = teacherIndexByName(expertName);
      const expertButton = expertName && teacherIndex >= 0
        ? '<button type="button" class="product-card-expert" data-product-teacher-index="' + esc(String(teacherIndex)) + '">Эксперт: ' + esc(expertName) + '</button>'
        : '';
      return '<article class="product-card"><div class="product-card-img">' + (imgForProduct(p) ? '<img src="' + esc(imgForProduct(p)) + '" alt="' + esc(p.title) + '" loading="lazy">' : '📦') + '</div><div class="product-card-body"><div class="product-card-meta"><span class="product-card-category">' + esc(p.category || '') + '</span>' + expertButton + '</div><h3 class="product-card-name">' + esc(p.title) + '</h3><p class="product-card-desc">' + esc(p.shortDescription || '') + '</p>' + (p.story ? '<p class="product-card-story">' + esc(shorten(p.story, 170)) + '</p>' : '') + (p.priceLabel ? '<div class="product-card-price">' + esc(p.priceLabel) + '</div>' : '') + '<div class="product-card-tags">' + arr(p.useCases).map((u) => '<span class="product-tag">' + esc(u) + '</span>').join('') + '</div><div class="product-card-actions"><a href="' + esc(registerUrl) + '" class="btn btn--product-3d">' + (state.lang === 'ru' ? 'Заказать' : 'Order') + '</a><a href="/cabinet/product/' + esc(p.slug || p.id) + '" target="_blank" rel="noopener" class="btn btn--product-detail">' + esc(c.buttons.more) + '</a></div></div></article>';
    }).join('');
    el.querySelectorAll('[data-product-teacher-index]').forEach((btn) => {
      btn.addEventListener('click', function () {
        openTeacherDialog(Number(btn.getAttribute('data-product-teacher-index')));
      });
    });
  }
  function renderPartner(partner) { return; /* renderPartner disabled — using static HTML */ }
  function renderContent(c) {
    const el = $('#content-grid');
    if (el) {
      el.innerHTML = arr(state.site && state.site.contentHub).map((x) => {
        const type = String(x.type || 'link').toLowerCase();
        const classes = 'content-card content-card--' + type;
        const external = /^https?:/i.test(String(x.url || ''));
        return '<article class="' + classes + '"><span class="content-card-type">' + esc(x.type || 'link') + '</span>' + (x.imageUrl ? '<div class="content-card-media"><img src="' + esc(x.imageUrl) + '" alt="' + esc(x.title || 'content') + '" loading="lazy"></div>' : '') + '<h3 class="content-card-title">' + esc(x.title) + '</h3><p class="content-card-desc">' + esc(x.description || '') + '</p>' + (x.url ? '<a href="' + esc(x.url) + '" class="btn btn--outline btn--sm"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(c.buttons.open) + '</a>' : '') + '</article>';
      }).join('');
    }

    const packsEl = $('#launch-pack-grid');
    if (!packsEl) return;
    const packs = arr(state.site && state.site.mediaCenter && state.site.mediaCenter.packs);
    packsEl.innerHTML = packs.map((pack) => {
      const visual = arr(pack.visualAssets)[0];
      const hooks = arr(pack.hooks).slice(0, 2).map((item) => '<li>' + esc(item) + '</li>').join('');
      const assets = arr(pack.assetChecklist).slice(0, 5).map((item) => '<span class="expert-tag">' + esc(item) + '</span>').join('');
      const landingType = arr(state.library && state.library.types).find((item) => item.id === pack.landingId);
      const landingLabel = landingType ? l(landingType.labels, pack.landingId) : pack.landingId;
      const scenarioLabel = state.lang === 'ru' ? 'Открыть этот сценарий' : 'Open this scenario';
      const officialLabel = state.lang === 'ru' ? 'Официальный контур' : 'Official source';
      const officialUrl = state.site && state.site.links && (state.site.links.companyMain || state.site.links.officialSite) || rel('/');
      return '<article class="launch-pack-card">' +
        (visual ? '<div class="launch-pack-card__media"><img src="' + esc(visual.imageUrl) + '" alt="' + esc(pack.title) + '" loading="lazy"></div>' : '') +
        '<div class="launch-pack-card__meta"><span class="expert-tag expert-tag--accent">' + esc(pack.audience || '') + '</span><span class="expert-tag">' + esc(landingLabel || '') + '</span></div>' +
        '<h3 class="launch-pack-card__title">' + esc(pack.title) + '</h3>' +
        '<p class="launch-pack-card__summary">' + esc(pack.summary || '') + '</p>' +
        (hooks ? '<ul class="launch-pack-card__list">' + hooks + '</ul>' : '') +
        (assets ? '<div class="launch-pack-card__assets">' + assets + '</div>' : '') +
        '<div class="launch-pack-card__actions">' +
        '<button type="button" class="btn btn--primary btn--sm" data-pack-landing="' + esc(pack.landingId || 'health') + '">' + esc(scenarioLabel) + '</button>' +
        '<a class="btn btn--ghost btn--sm" href="' + esc(officialUrl) + '" target="_blank" rel="noopener">' + esc(officialLabel) + '</a>' +
        '</div></article>';
    }).join('');
    packsEl.querySelectorAll('[data-pack-landing]').forEach((btn) => {
      btn.addEventListener('click', function () {
        state.landing = btn.getAttribute('data-pack-landing') || 'health';
        apply();
        const hero = document.getElementById('hero');
        if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  function renderResults(showcase) { const cards = $('#results-cards'); const actions = $('#results-actions'); const image = $('#results-image'); if (image && showcase && showcase.imageUrl) image.src = showcase.imageUrl; if (image && showcase && showcase.imageAlt) image.alt = showcase.imageAlt; if (cards) cards.innerHTML = arr(showcase && showcase.items).map((item) => '<article class="result-story-card"><div class="result-story-badge">' + esc(item.badge || 'Proof') + '</div><h3 class="result-story-title">' + esc(item.title) + '</h3><p class="result-story-text">' + esc(item.text) + '</p></article>').join(''); if (actions) actions.innerHTML = arr(showcase && showcase.actions).map((item) => '<a class="btn btn--outline btn--sm" href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.label) + '</a>').join(''); }
  function renderPrompts(c) { const el = $('#ai-prompt-row'); if (el) el.innerHTML = arr(c.prompts[state.landing] || c.prompts.health).map((p) => '<button class="ai-prompt-btn" type="button" data-prompt="' + esc(p) + '">' + esc(p) + '</button>').join(''); }
  function renderAi() { const el = $('#ai-preview-messages'); if (el) { el.innerHTML = aiMessages.map((m) => '<div class="ai-msg ai-msg--' + (m.role === 'user' ? 'user' : 'bot') + '">' + esc(m.text) + '</div>').join(''); el.scrollTop = el.scrollHeight; } }
  function aiAnswer(q, c) { const txt = String(q || '').toLowerCase(); if (txt.indexOf('продукт') !== -1 || txt.indexOf('product') !== -1) return c.next[state.landing] + ' ' + rel('/cabinet/register'); if (txt.indexOf('парт') !== -1 || txt.indexOf('business') !== -1 || txt.indexOf('partner') !== -1) return c.next.business + ' ' + rel('/cabinet/register'); return c.next[state.landing] + ' ' + rel('/cabinet/register'); }
  function canonicalUrl() { const defaultLang = String((state.library && state.library.defaultLanguage) || 'ru').toLowerCase(); const url = new URL('/', window.location.origin); if (state.landing !== 'health') url.searchParams.set('landing', state.landing); if (state.lang !== defaultLang) url.searchParams.set('lang', state.lang); return url.toString(); }
  function absoluteAsset(path) { const raw = String(path || '').trim(); if (!raw) return new URL('/cabinet/media/brand-og.jpg', window.location.origin).toString(); if (/^https?:\/\//i.test(raw)) return raw; return new URL(raw.startsWith('/') ? raw : `/${raw}`, window.location.origin).toString(); }
  function buildStructuredData(title, description, image) { return [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Golden Connect', url: `${window.location.origin}/`, inLanguage: state.lang }, { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: canonicalUrl(), inLanguage: state.lang, primaryImageOfPage: image }]; }
  function updateHead(title, description) { const seo = (state.site && state.site.seo) || {}; const image = absoluteAsset((seo.landingImages && seo.landingImages[state.landing]) || seo.defaultImage || 'media/brand-og.jpg'); const canonical = canonicalUrl(); const fullTitle = title.toLowerCase().includes('golden-connect') ? title : `${title} | Golden Connect`; document.title = fullTitle; if ($('#meta-description')) $('#meta-description').setAttribute('content', description); if ($('#meta-canonical')) $('#meta-canonical').setAttribute('href', canonical); if ($('#meta-og-title')) $('#meta-og-title').setAttribute('content', fullTitle); if ($('#meta-og-description')) $('#meta-og-description').setAttribute('content', description); if ($('#meta-og-url')) $('#meta-og-url').setAttribute('content', canonical); if ($('#meta-og-image')) $('#meta-og-image').setAttribute('content', image); if ($('#meta-og-image-alt')) $('#meta-og-image-alt').setAttribute('content', `${title} — Golden Connect`); if ($('#meta-twitter-title')) $('#meta-twitter-title').setAttribute('content', fullTitle); if ($('#meta-twitter-description')) $('#meta-twitter-description').setAttribute('content', description); if ($('#meta-twitter-image')) $('#meta-twitter-image').setAttribute('content', image); const structuredData = $('#structured-data'); if (structuredData) structuredData.textContent = JSON.stringify(buildStructuredData(title, description, image)).replace(/</g, '\\u003c'); }
  function apply() {
    const c = copy(); const landing = landingDef(); const lang = langDef(); const heroTitle = l(landing && landing.heroTitle, 'Golden Connect'); const heroText = l(landing && landing.heroText, ''); const meta = l(landing && landing.descriptions, heroText); const showcase = state.site && state.site.resultsShowcase; const ch = $all('#company-section .section-header'); const ph = $all('#partner-section .section-header'); const aiSection = $('#ai-prompt-row') ? $('#ai-prompt-row').closest('section') : null;
    syncUrl(); orderSections(); document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr'; updateHead(heroTitle, meta);
    const selector = $('#lang-selector'); if (selector) { selector.innerHTML = arr(state.library && state.library.languages).map((x) => '<option value="' + esc(x.id) + '">' + esc(x.id.toUpperCase()) + '</option>').join(''); selector.value = state.lang; }
    [['company', c.nav.company], ['products', c.nav.products], ['partner', c.nav.partner], ['content', c.nav.content], ['cabinet', c.nav.cabinet]].forEach((x) => $all('[data-nav-link="' + x[0] + '"],[data-footer-link="' + x[0] + '"]').forEach((n) => { n.textContent = x[1]; }));
    if ($('#nav-login-btn')) { $('#nav-login-btn').textContent = c.nav.login; $('#nav-login-btn').href = rel('/cabinet/login'); }
    if ($('#nav-register-btn')) { $('#nav-register-btn').textContent = c.nav.register; $('#nav-register-btn').href = rel('/cabinet/register'); }
    if ($('#hero-primary-btn')) { $('#hero-primary-btn').textContent = c.nav.register; $('#hero-primary-btn').href = rel('/cabinet/register'); }
    if ($('#hero-secondary-btn')) { $('#hero-secondary-btn').textContent = c.ctas[state.landing] || c.ctas.health; $('#hero-secondary-btn').href = state.landing === 'business' ? '#partner-section' : (state.landing === 'hybrid' ? '#company-section' : '#products-section'); }
    if ($('#cta-register-btn')) { $('#cta-register-btn').textContent = c.nav.register; $('#cta-register-btn').href = rel('/cabinet/register'); }
    if ($('#cta-login-btn')) { $('#cta-login-btn').textContent = c.nav.login; $('#cta-login-btn').href = rel('/cabinet/login'); }
    setText('#hero-badge-text', c.badge); setText('#hero-title', heroTitle); setText('#hero-text', heroText); setText('#hero-marketing-note', fill(state.ref ? c.notes.ref : c.notes.base, { ref: state.ref })); setText('#pillars-section .s-eyebrow', c.labels.directions); setText('#pillars-section .s-title', c.titles.pillars); setText('#pillars-section .s-subtitle', heroText); if (ch[0]) setText('.s-eyebrow', c.labels.about, ch[0]); if (ch[1]) { setText('.s-eyebrow', c.labels.experts, ch[1]); setText('.s-title', state.lang === 'ru' ? 'Команда и производственная база' : 'Team and production base', ch[1]); } if (ch[2]) { setText('.s-eyebrow', c.labels.awards, ch[2]); setText('.s-title', state.lang === 'ru' ? 'Награды и достижения' : 'Awards and achievements', ch[2]); } setText('#results-eyebrow', c.labels.results); setText('#results-title', c.titles.results); setText('#results-intro', (showcase && showcase.intro) || c.notes.results); setText('#direction-stories-eyebrow', state.lang === 'ru' ? 'Сценарии' : 'Scenarios'); setText('#direction-stories-title', state.lang === 'ru' ? 'Как мы продаём через направления, а не через случайный каталог' : 'How we sell through directions, not a random catalog'); setText('#direction-stories-intro', state.lang === 'ru' ? 'Каждое сильное направление Golden Connect можно упаковать через пользу, конкретного человека, понятные продукты и готовый следующий шаг.' : 'Each strong Golden Connect direction can be packaged through value, a real person, a clear product set and the next step.');
    setText('#products-section .s-eyebrow', c.labels.catalog); setText('#products-section .s-title', c.titles.products); setText('#products-section .s-subtitle', meta); if (ph[0]) { setText('.s-eyebrow', c.labels.partnership, ph[0]); setText('.s-title', c.titles.partner, ph[0]); setText('.s-subtitle', c.next[state.landing] || c.next.health, ph[0]); } if (ph[1]) { setText('.s-eyebrow', c.labels.levels, ph[1]); setText('.s-title', state.lang === 'ru' ? 'Маркетинг-план' : 'Marketing plan', ph[1]); } setText('#content-section .s-eyebrow', c.labels.materials); setText('#content-section .s-title', c.titles.materials); setText('#content-section .s-subtitle', c.next[state.landing] || c.next.health); if (aiSection) { setText('.s-eyebrow', c.labels.ai, aiSection); setText('.s-title', c.titles.ai, aiSection); setText('.s-subtitle', c.next[state.landing] || c.next.health, aiSection); } setText('.cta-section .s-eyebrow', c.labels.start); setText('.cta-title', c.titles.cta); setText('.cta-text', c.notes.base); if ($('#ai-preview-input')) $('#ai-preview-input').placeholder = c.aiPlaceholder;
    const fTitles = $all('.footer-col-title'); if (fTitles[0]) fTitles[0].textContent = c.footer.nav; if (fTitles[1]) fTitles[1].textContent = c.footer.contacts; setText('.footer-desc', c.footer.desc); setText('.footer-copy', c.footer.copy);
    $all('.hero-stat').forEach((card, i) => { const s = stats(c)[i]; if (!s) return; setText('.hero-stat-num', s.v, card); setText('.hero-stat-label', s.l, card); });
    renderHeroVisual();
    renderTrust([{ icon: landing && landing.icon ? landing.icon : '✓', text: l(landing && landing.titles, state.landing) }, { icon: '🌐', text: lang.nativeLabel || lang.label || state.lang.toUpperCase() }, { icon: state.ref ? '🔗' : '🧭', text: state.ref || (c.next[state.landing] || c.next.health) }].concat(arr(state.site && state.site.landing && state.site.landing.trustStrip).slice(0, 2)));
    renderPillars(arr(state.site && state.site.landing && state.site.landing.pillars)); renderResults(showcase); renderDirectionStories(); renderProducts(c); renderContent(c); renderPrompts(c);
    const growth = $('#hero-growth-strip'); if (growth) growth.innerHTML = ['<div class="growth-card"><div class="growth-card-title">' + esc(c.growth.current) + '</div><div class="growth-card-text">' + esc(l(landing && landing.labels, state.landing)) + '</div></div>', '<div class="growth-card"><div class="growth-card-title">' + esc(c.growth.language) + '</div><div class="growth-card-text">' + esc(lang.nativeLabel || lang.label || state.lang.toUpperCase()) + '</div></div>', '<div class="growth-card"><div class="growth-card-title">' + esc(state.ref ? c.growth.referral : c.growth.next) + '</div><div class="growth-card-text">' + esc(state.ref || (c.next[state.landing] || c.next.health)) + '</div></div>'].concat(arr(state.library && state.library.types).map((x) => '<a class="growth-card-link ' + (x.id === state.landing ? 'is-active' : '') + '" href="' + esc(href(x.id, state.lang)) + '" data-landing-switch="' + esc(x.id) + '"><div class="growth-card"><div class="growth-card-title">' + esc(c.growth.switch) + '</div><div class="growth-card-text">' + esc(l(x.labels, x.id)) + '</div><div class="growth-card-action">' + esc(l(x.descriptions, '')) + '</div></div></a>')).join('');
  }
  function bind() {
    if ($('#lang-selector')) $('#lang-selector').addEventListener('change', (e) => { state.lang = String(e.target.value || 'ru').toLowerCase(); apply(); });
    if ($('#ai-preview-form')) { var _aiform = $('#ai-preview-form'); _aiform.addEventListener('submit', function(e) { e.preventDefault(); var _inp = $('#ai-preview-input'); var _q = (_inp && _inp.value || '').trim(); if (!_q) return; aiMessages.push({ role: 'user', text: _q }); if (_inp) _inp.value = ''; renderAi(); fetch('/cabinet/api/ai/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: _q }) }).then(function(r) { return r.json(); }).then(function(d) { aiMessages.push({ role: 'assistant', text: d.reply || 'Error' }); if (aiMessages.length > 10) aiMessages = aiMessages.slice(-10); renderAi(); }).catch(function() { aiMessages.push({ role: 'assistant', text: 'Error' }); renderAi(); }); }); }
    document.addEventListener('click', (e) => { const prompt = e.target.closest('.ai-prompt-btn'); if (prompt && $('#ai-preview-input')) { $('#ai-preview-input').value = prompt.dataset.prompt || ''; $('#ai-preview-input').focus(); } const sw = e.target.closest('[data-landing-switch]'); if (sw) { e.preventDefault(); state.landing = sw.dataset.landingSwitch || 'health'; apply(); } });
  }

  Promise.all([fetch('/cabinet/api/site/config', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({})), fetch('/cabinet/api/products', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({}))]).then((res) => {
    const sitePayload = res[0] || {}; const productsPayload = res[1] || {};
    state.site = sitePayload.site || sitePayload || {}; state.products = productsPayload.items || productsPayload || []; state.library = state.site.landingLibrary || { defaultLanguage: 'ru', languages: [{ id: 'ru', label: 'Русский', nativeLabel: 'Русский' }], types: [{ id: 'health', labels: { ru: 'Здоровье' }, titles: { ru: 'Здоровье' }, descriptions: { ru: '' }, heroTitle: { ru: 'Golden Connect' }, heroText: { ru: '' } }] };
    syncFromUrl(); renderCompany(state.site.company); renderPartner(state.site.partner);
    renderBroadcastSection(state.site); renderTeachersSection(state.site); renderReviewsSection(state.site); renderOfficesSection(state.site); renderSupportLinks(state.site); renderShortReviews(state.site);
    loadCompanyLinkForButtons();
    renderLandingsPreview();
    bind(); apply();
  });

  function loadCompanyLinkForButtons() {
    var ref = state.ref || '';
    fetch('/cabinet/api/company-link' + (ref ? '?ref=' + ref : '')).then(function(r) { return r.json(); }).then(function(data) {
      var link = data.companyLink || 'https://golden-connect.to/';
      // Replace all golden-connect.to links (except /faq and /instructions) with company referral link
      document.querySelectorAll('a[href*="golden-connect.to"]').forEach(function(a) {
        if (!a.href.includes('/instructions') && !a.href.includes('/faq')) a.href = link;
      });
      // Also find "Официальный сайт" buttons in company-sources
      var sources = document.getElementById('company-sources');
      if (sources) {
        sources.querySelectorAll('a').forEach(function(a) {
          var text = a.textContent || '';
          if (text.indexOf('Официальный сайт') !== -1 || text.indexOf('Official') !== -1) {
            a.href = link;
          }
        });
      }
    }).catch(function() {});
  }

  function renderLandingsPreview() {
    var grid = document.getElementById('landings-preview-grid');
    var showAll = document.getElementById('landings-show-all');
    if (!grid) return;
    var ref = state.ref || '';
    var refSuffix = ref ? '?ref=' + ref : '';
    var langSuffix = state.lang !== 'ru' ? '&lang=' + state.lang : '';
    var previews = [
      { id: 'catalog', title: 'Каталог продукции', desc: '25 продуктов с фото, ценами и кнопками заказа. Полная копия официального каталога с вашей привязкой.', url: '/cabinet/landing/catalog' + refSuffix + langSuffix, color: '#10b981' },
      { id: 'biopunk', title: 'Биохакинг нового поколения', desc: 'Дерзкий футуристичный дизайн для продвинутой аудитории. Нанотехнологии и прорывные решения.', url: '/cabinet/landing/biopunk' + refSuffix, color: '#00ff88' },
      { id: 'one-product', title: 'Один стакан с утра', desc: 'Лендинг-история про Живую Воду. Один продукт — одно решение. Максимальная конверсия.', url: '/cabinet/landing/one-product' + refSuffix, color: '#06b6d4' }
    ];
    grid.innerHTML = previews.map(function(p) {
      return '<div style="border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);transition:all .3s" onmouseover="this.style.transform=\'translateY(-6px)\';this.style.boxShadow=\'0 16px 48px rgba(16,185,129,.12)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">' +
        '<div style="width:100%;height:180px;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.06);position:relative">' +
        '<iframe src="' + esc(p.url) + '" style="width:200%;height:200%;transform:scale(.5);transform-origin:top left;border:none;pointer-events:none" loading="lazy" sandbox="allow-same-origin" tabindex="-1"></iframe>' +
        '<a href="' + esc(p.url) + '" target="_blank" style="position:absolute;inset:0;z-index:2"></a>' +
        '</div>' +
        '<div style="padding:16px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="width:8px;height:8px;border-radius:50%;background:' + p.color + '"></div><h3 style="font-size:.95rem;font-weight:700;margin:0">' + esc(p.title) + '</h3></div>' +
        '<p style="font-size:.8rem;color:rgba(255,255,255,.5);line-height:1.5;margin-bottom:12px">' + esc(p.desc) + '</p>' +
        '<a href="' + esc(p.url) + '" target="_blank" class="btn btn--primary btn--sm" style="width:100%;text-align:center">Открыть лендинг</a>' +
        '</div></div>';
    }).join('');
    if (showAll) {
      showAll.href = '/cabinet/landings' + refSuffix;
    }
  }

  /* ── New TZ sections ── */
  function renderBroadcastSection(site) {
    var b = site && site.nextBroadcast;
    if (!b) return;
    var title = document.getElementById('broadcast-title');
    var speaker = document.getElementById('broadcast-speaker');
    var desc = document.getElementById('broadcast-description');
    if (title) title.textContent = b.title || '';
    if (speaker) speaker.textContent = (b.speaker || '') + (b.speakerRole ? ' — ' + b.speakerRole : '');
    if (desc) desc.textContent = b.description || '';
    // Directions
    var dirEl = document.getElementById('broadcast-directions');
    var icons = { 'Иммунитет': '🛡', 'Антиэйдж': '✨', 'Косметология': '💄', 'Энергия': '⚡', 'Дезинфекция': '🧼', 'Детокс': '🍃', 'Реабилитация': '💪', 'Животные': '🐾' };
    if (dirEl && b.directions) {
      dirEl.innerHTML = b.directions.map(function(d) {
        return '<article class="pillar-card card-3d" style="text-align:center;padding:20px"><div style="font-size:28px;margin-bottom:8px">' + (icons[d] || '🔬') + '</div><h3 style="font-size:14px;font-weight:600">' + esc(d) + '</h3></article>';
      }).join('');
    }
    // Countdown
    if (b.date) {
      var countEl = null; // DISABLED — countdown runs from index.html inline script
      if (countEl) {
        if (broadcastCountdownTimer) {
          clearInterval(broadcastCountdownTimer);
          broadcastCountdownTimer = null;
        }
        function updateCountdown() {
          var now = Date.now();
          var target = new Date(b.date).getTime();
          var diff = target - now;
          if (diff <= 0) { countEl.innerHTML = '<span style="color:var(--accent);font-family:var(--font-display);font-size:1.2rem">Эфир идёт прямо сейчас!</span>'; return; }
          var days = Math.floor(diff / 86400000);
          var hours = Math.floor((diff % 86400000) / 3600000);
          var mins = Math.floor((diff % 3600000) / 60000);
          var secs = Math.floor((diff % 60000) / 1000);
          function box(v, l) { return '<div style="text-align:center"><div style="font-family:var(--font-display);font-size:1.8rem;font-weight:700;color:var(--accent)">' + v + '</div><div style="font-size:0.7rem;color:var(--text-sec)">' + l + '</div></div>'; }
          countEl.innerHTML = box(days, 'дней') + box(hours, 'часов') + box(mins, 'минут') + box(secs, 'секунд');
        }
        updateCountdown();
        broadcastCountdownTimer = setInterval(updateCountdown, 1000);
      }
    }
  }

  function renderTeachersSection(site) { return; // DISABLED — using static HTML (4 teachers only)
    var t = site && site.teachers;
    if (!t || !t.length) return;
    var el = document.getElementById('teachers-grid');
    if (!el) return;
    el.innerHTML = t.map(function(p) {
      var chips = arr(p.focus).slice(0, 3).map(function(item) {
        return '<span class="expert-tag">' + esc(item) + '</span>';
      }).join('');
      var button = arr(p.details).length ? '<button type="button" class="btn btn--ghost btn--sm expert-details-btn" data-teacher-index="' + esc(String(t.indexOf(p))) + '">Подробнее</button>' : '';
      return '<article class="expert-card card-3d"><div class="expert-avatar-wrap">' +
        (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" class="expert-avatar-img" loading="lazy">' : '<div class="expert-avatar">' + esc((p.name || '?')[0]) + '</div>') +
        '</div><div class="expert-info"><div class="expert-role">' + esc(p.title || '') + (p.years ? ' <span style="color:var(--text-sec)">(' + esc(p.years) + ')</span>' : '') +
        '</div><h3 class="expert-name">' + esc(p.name) + '</h3><p class="expert-summary">' + esc(p.summary || '') + '</p>' +
        (chips ? '<div class="expert-tags">' + chips + '</div>' : '') +
        (button ? '<div class="expert-actions">' + button + '</div>' : '') +
        '</div></article>';
    }).join('');
    el.querySelectorAll('[data-teacher-index]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openTeacherDialog(Number(btn.getAttribute('data-teacher-index')));
      });
    });
  }

  function renderTeacherDialogBody(teacher) {
    if (!teacher) return '';
    var details = arr(teacher.details).map(function(item) {
      return '<p class="expert-dialog-copy">' + esc(item) + '</p>';
    }).join('');
    var focus = arr(teacher.focus).map(function(item) {
      return '<span class="expert-tag expert-tag--accent">' + esc(item) + '</span>';
    }).join('');
    var products = arr(teacher.products).map(function(item) {
      return '<span class="expert-tag expert-tag--product">' + esc(item) + '</span>';
    }).join('');
    return '<div class="expert-dialog-shell">' +
      '<div class="expert-dialog-media">' +
      (teacher.image ? '<img src="' + esc(teacher.image) + '" alt="' + esc(teacher.name) + '" loading="lazy">' : '<div class="expert-avatar expert-avatar--lg">' + esc((teacher.name || '?')[0]) + '</div>') +
      '</div>' +
      '<div class="expert-dialog-body">' +
      '<div class="expert-dialog-role">' + esc(teacher.title || '') + (teacher.years ? ' <span class="expert-dialog-years">(' + esc(teacher.years) + ')</span>' : '') + '</div>' +
      '<h3 class="expert-dialog-title">' + esc(teacher.name || '') + '</h3>' +
      (teacher.summary ? '<p class="expert-dialog-lead">' + esc(teacher.summary) + '</p>' : '') +
      (details ? '<div class="expert-dialog-block"><div class="expert-dialog-label">Чем занимается</div>' + details + '</div>' : '') +
      (focus ? '<div class="expert-dialog-block"><div class="expert-dialog-label">Направления</div><div class="expert-tags expert-tags--dialog">' + focus + '</div></div>' : '') +
      (products ? '<div class="expert-dialog-block"><div class="expert-dialog-label">Связанные продукты</div><div class="expert-tags expert-tags--dialog">' + products + '</div></div>' : '') +
      '</div></div>';
  }

  function openTeacherDialog(index) {
    var list = arr(state.site && state.site.teachers);
    var teacher = list[index];
    var dialog = document.getElementById('teacher-dialog');
    var body = document.getElementById('teacher-dialog-content');
    if (!teacher || !dialog || !body) return;
    body.innerHTML = renderTeacherDialogBody(teacher);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', 'open');
  }

  function closeTeacherDialog() {
    var dialog = document.getElementById('teacher-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function renderReviewsSection(site) {
    var r = site && site.reviews;
    if (!r || !r.length) return;
    var el = document.getElementById('reviews-carousel');
    if (!el) return;
    el.innerHTML = '<div style="display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 0;-webkit-overflow-scrolling:touch">' +
      r.map(function(rev) {
        var stars = '';
        for (var i = 0; i < (rev.rating || 5); i++) stars += '⭐';
        return '<div style="flex:0 0 300px;scroll-snap-align:start;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:24px;position:relative">' +
          '<div style="font-size:14px;margin-bottom:4px">' + stars + '</div>' +
          '<p style="color:var(--text);font-size:14px;line-height:1.6;margin-bottom:16px">"' + esc(rev.text) + '"</p>' +
          '<div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px">' + esc((rev.name || '?')[0]) + '</div>' +
          '<div><div style="font-weight:600;font-size:13px">' + esc(rev.name) + '</div><div style="font-size:12px;color:var(--text-sec)">' + esc(rev.city || '') + '</div></div></div></div>';
      }).join('') + '</div>';
  }

  function renderOfficesSection(site) {
    var o = site && site.offices;
    if (!o || !o.length) return;
    var el = document.getElementById('offices-grid');
    if (!el) return;
    el.innerHTML = o.map(function(off) {
      return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px;text-align:center"><div style="font-size:24px;margin-bottom:8px">🏢</div><div style="font-weight:600;font-size:14px">' + esc(off.city) + '</div><div style="font-size:12px;color:var(--text-sec)">' + esc(off.country || '') + '</div><div style="font-size:11px;color:var(--accent);margin-top:4px">' + esc(off.status || '') + '</div></div>';
    }).join('');
  }

  function renderSupportLinks(site) {
    var el = document.getElementById('support-links-grid');
    if (!el) return;
    var links = site && site.links || {};
    var cards = [
      { title: 'Основной Telegram-чат', text: 'Когда нужен живой контакт, быстрый ответ и сопровождение по продуктам.', icon: '💬', url: links.mainChat || '' },
      { title: 'Результаты и кейсы', text: 'Открыть social proof, отзывы и истории, которые помогают перевести интерес в действие.', icon: '⭐', url: links.results || '' },
      { title: 'Официальный контур', text: 'Перейти на официальный сайт Golden Connect и посмотреть компанию, каталог и направления.', icon: '🌐', url: links.companyMain || links.officialSite || '' },
      { title: 'Открыть кабинет', text: 'Создать аккаунт и получить личные ссылки, материалы и следующий шаг для запуска.', icon: '🚀', url: rel('/cabinet/register') },
    ].filter(function(item) { return item.url; });
    el.innerHTML = cards.map(function(item) {
      var external = /^https?:/i.test(item.url) && item.url.indexOf(window.location.origin) !== 0;
      return '<a class="support-link-card" href="' + esc(item.url) + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '><span class="support-link-card__icon">' + esc(item.icon) + '</span><div><h3 class="support-link-card__title">' + esc(item.title) + '</h3><p class="support-link-card__text">' + esc(item.text) + '</p></div></a>';
    }).join('');
  }

  // Short reviews on landing (3-4 cards)
  function renderShortReviews(site) {
    var r = site && site.reviews;
    if (!r || !r.length) return;
    var el = document.getElementById('reviews-short-grid');
    if (!el) return;
    var show = r.slice(0, 6);
    el.innerHTML = show.map(function(rev) {
      var stars = '';
      for (var i = 0; i < (rev.rating || 5); i++) stars += '\u2b50';
      return '<div class="review-card-3d">' +
        '<div style="margin-bottom:10px">' + stars + '</div>' +
        '<p style="color:var(--text-sec);font-size:0.9rem;line-height:1.6;flex:1;margin-bottom:14px;font-style:italic">\u201c' + esc(rev.text) + '\u201d</p>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:auto">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#000;font-weight:700;font-size:14px;flex-shrink:0">' + esc((rev.name || '?')[0]) + '</div>' +
        '<div><div style="font-weight:600;font-size:13px">' + esc(rev.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text-dim)">' + esc(rev.city || '') + '</div></div></div></div>';
    }).join('');
  }


  // Ask question form
  var askForm = document.getElementById('ask-form');
  if (askForm) {
    askForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var name = askForm.querySelector('[name="name"]').value || '';
      var question = askForm.querySelector('[name="question"]').value || '';
      if (!question.trim()) return;
      var status = document.getElementById('ask-status');
      var registerUrl = rel('/cabinet/register');
      var supportUrl = state.site && state.site.links && state.site.links.mainChat;
      fetch('/cabinet/api/support/requests', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Вопрос от ' + (name || 'посетителя'), category: 'general', message: question })
      }).then(function(r) {
        if (r.status === 401 || r.status === 403) {
          if (status) {
            status.innerHTML = supportUrl
              ? 'Чтобы отправить вопрос, <a href="' + esc(registerUrl) + '">создайте аккаунт</a> или напишите в <a href="' + esc(supportUrl) + '" target="_blank" rel="noopener">Telegram</a>.'
              : 'Чтобы отправить вопрос, <a href="' + esc(registerUrl) + '">создайте аккаунт</a>.';
            status.style.color = 'var(--text-secondary)';
          }
          return null;
        }
        return r.json();
      }).then(function(d) {
        if (!d) return;
        if (status) { status.textContent = d.ok ? 'Вопрос отправлен! Мы ответим в ближайшее время.' : 'Ошибка отправки'; status.style.color = d.ok ? 'var(--accent)' : 'var(--danger,#ff4757)'; }
        if (d.ok) askForm.reset();
      }).catch(function() { if (status) { status.textContent = 'Ошибка сети'; status.style.color = 'var(--danger,#ff4757)'; } });
    });
  }

  var teacherDialog = document.getElementById('teacher-dialog');
  if (teacherDialog) {
    teacherDialog.addEventListener('click', function(e) {
      if (e.target === teacherDialog) closeTeacherDialog();
    });
    teacherDialog.addEventListener('close', function() {
      var body = document.getElementById('teacher-dialog-content');
      if (body) body.innerHTML = '';
    });
  }
  document.querySelectorAll('[data-teacher-dialog-close]').forEach(function(btn) {
    btn.addEventListener('click', function() { closeTeacherDialog(); });
  });
})();
