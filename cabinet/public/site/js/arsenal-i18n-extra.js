// Golden Connect-specific i18n overrides for keys missing in arsenal-i18n.js
(function () {
  if (!window.i18n || !window.i18n.translations) return;
  const T = window.i18n.translations;
  function setKey(lang, path, value) {
    let cur = T[lang]; if (!cur) return;
    const parts = path.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;  // override: arsenal-i18n.js auto-fallback to English overwrites RU keys, so we always force-set
  }

  // RU shortener tweaks
  const RU = {
    "tools.shr.domain":     "Домен короткой ссылки",
    "tools.shr.campaign":   "Кампания",
    "tools.shr.my_alias":   "my-link",
    "tools.shr.tabBio":     "Bio-страница",
    "tools.shr.code_t2gift": "code.t2gift.com",
    "tools.shr.t2gift_com":  "t2gift.com/code",

    // Bio AI generator
    "tools.shr.bio_ai_title":        "AI-генератор контента",
    "tools.shr.bio_ai_description":  "Опишите свой бизнес или личный бренд",
    "tools.shr.bio_ai_placeholder":  "Например: Я фотограф из Москвы, снимаю свадьбы и портреты. Работаю с 2018 года.",
    "tools.shr.bio_ai_language":     "Язык контента",
    "tools.shr.bio_ai_style":        "Стиль",
    "tools.shr.bio_ai_professional": "Профессиональный",
    "tools.shr.bio_ai_creative":     "Креативный",
    "tools.shr.bio_ai_minimal":      "Минималистичный",
    "tools.shr.bio_ai_bold":         "Дерзкий",
    "tools.shr.bio_ai_generate":     "Сгенерировать",
    "tools.shr.bio_ai_result":       "Результат",
    "tools.shr.bio_ai_apply_all":    "Применить всё",
    "tools.shr.bio_ai_apply_text":   "Только текст",
    "tools.shr.bio_ai_apply_theme":  "Только оформление",

    // Bio A/B testing
    "tools.shr.bio_ab_title":   "A/B-тестирование",
    "tools.shr.bio_ab_create":  "Создать тест",
    "tools.shr.bio_ab_variantA":"Вариант A (текущий)",
    "tools.shr.bio_ab_variantB":"Вариант B",
    "tools.shr.bio_ab_winner":  "Победитель",
    "tools.shr.bio_ab_traffic": "Трафик",
    "tools.shr.bio_ab_clicks":  "Клики",
    "tools.shr.bio_ab_end":     "Завершить тест",
    "tools.shr.bio_ab_apply":   "Применить вариант B",
    // Marketplace (RU) — added 2026-04-26
    "tools.shr.mp_products":      "Товары",
    "tools.shr.mp_sales":         "Продажи",
    "tools.shr.mp_revenue":       "Доход",
    "tools.shr.mp_my_products":   "Мои товары",
    "tools.shr.mp_add_product":   "Добавить товар",
    "tools.shr.mp_browse":        "Каталог",
    "tools.shr.mp_browse_title":  "Маркетплейс — все товары",
    "tools.shr.mp_no_products":   "Пока нет товаров. Добавьте первый!",
    "tools.shr.mp_no_marketplace":"В каталоге пока пусто",
    "tools.shr.mp_title":         "Название",
    "tools.shr.mp_description":   "Описание",
    "tools.shr.mp_category":      "Категория",
    "tools.shr.mp_price":         "Цена (USD)",
    "tools.shr.mp_preview_image": "Картинка превью",
    "tools.shr.mp_download_url":  "Ссылка на товар (после покупки)",
    "tools.shr.mp_save":          "Сохранить",
    "tools.shr.mp_saved":         "Сохранено",
    "tools.shr.mp_deleted":       "Удалено",
    "tools.shr.mp_delete_confirm":"Удалить товар?",
    "tools.shr.mp_added_to_bio":  "Добавлено в Bio-страницу",
    "tools.shr.mp_removed_from_bio":"Убрано из Bio-страницы",
    "tools.shr.mp_bio_products":  "Товары на Bio",
  };
  for (const k of Object.keys(RU)) setKey("ru", k, RU[k]);

  // EN fallbacks
  const EN = {
    "tools.shr.domain": "Short domain", "tools.shr.campaign": "Campaign",
    "tools.shr.my_alias": "my-link", "tools.shr.tabBio": "Bio page",
    "tools.shr.code_t2gift": "code.t2gift.com", "tools.shr.t2gift_com": "t2gift.com/code",
    "tools.shr.bio_ai_title": "AI Content Generator",
    "tools.shr.bio_ai_description": "Describe your business or personal brand",
    "tools.shr.bio_ai_placeholder": "e.g. I am a photographer from NYC, focused on weddings and portraits. Working since 2018.",
    "tools.shr.bio_ai_language": "Content language", "tools.shr.bio_ai_style": "Style",
    "tools.shr.bio_ai_professional": "Professional", "tools.shr.bio_ai_creative": "Creative",
    "tools.shr.bio_ai_minimal": "Minimal", "tools.shr.bio_ai_bold": "Bold",
    "tools.shr.bio_ai_generate": "Generate", "tools.shr.bio_ai_result": "Result",
    "tools.shr.bio_ai_apply_all": "Apply all", "tools.shr.bio_ai_apply_text": "Apply text only",
    "tools.shr.bio_ai_apply_theme": "Apply theme only",
    "tools.shr.bio_ab_title": "A/B Testing", "tools.shr.bio_ab_create": "Create test",
    "tools.shr.bio_ab_variantA": "Variant A (current)", "tools.shr.bio_ab_variantB": "Variant B",
    "tools.shr.bio_ab_winner": "Winner", "tools.shr.bio_ab_traffic": "Traffic",
    "tools.shr.bio_ab_clicks": "Clicks", "tools.shr.bio_ab_end": "End test",
    "tools.shr.bio_ab_apply": "Apply variant B",
    "tools.shr.mp_products":      "Products",
    "tools.shr.mp_sales":         "Sales",
    "tools.shr.mp_revenue":       "Revenue",
    "tools.shr.mp_my_products":   "My products",
    "tools.shr.mp_add_product":   "Add product",
    "tools.shr.mp_browse":        "Browse",
    "tools.shr.mp_browse_title":  "Marketplace — all products",
    "tools.shr.mp_no_products":   "No products yet. Add your first one!",
    "tools.shr.mp_no_marketplace":"Catalog is empty",
  };
  for (const k of Object.keys(EN)) setKey("en", k, EN[k]);
})();
