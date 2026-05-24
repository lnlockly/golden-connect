(function () {
  'use strict';

  var DATA_URL = '/cabinet/data/golden-connect-product-library.json';
  var state = {
    data: null,
    search: '',
    category: 'all',
    family: 'all',
    archiveShown: Object.create(null),
    generalShown: 12,
  };

  var dom = {
    summaryStrip: document.getElementById('summary-strip'),
    chatTitle: document.getElementById('chat-title'),
    chatSourceNote: document.getElementById('chat-source-note'),
    chatLink: document.getElementById('chat-link'),
    search: document.getElementById('library-search'),
    categoryFilters: document.getElementById('category-filters'),
    familySelect: document.getElementById('family-select'),
    results: document.getElementById('library-results'),
    productNav: document.getElementById('product-nav'),
    generalBlock: document.getElementById('general-block'),
    productsBlock: document.getElementById('products-block'),
    themeToggle: document.getElementById('theme-toggle'),
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getRefCode() {
    try {
      if (window.XHBot && typeof window.XHBot.refCode === 'function') {
        return window.XHBot.refCode() || '';
      }
      var params = new URLSearchParams(window.location.search);
      return (params.get('ref') || '').trim().toLowerCase();
    } catch (error) {
      return '';
    }
  }

  function withRef(url) {
    var ref = getRefCode();
    if (!url || !ref) return url || '#';
    try {
      var absolute = /^https?:\/\//i.test(url);
      var parsed = new URL(url, window.location.origin);
      if (!parsed.searchParams.get('ref')) parsed.searchParams.set('ref', ref);
      return absolute ? parsed.toString() : parsed.pathname + parsed.search + parsed.hash;
    } catch (error) {
      return url;
    }
  }

  function formatDate(value) {
    if (!value) return 'дата не указана';
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function uniqueStrings(items) {
    var seen = Object.create(null);
    return (Array.isArray(items) ? items : []).filter(function (item) {
      var value = String(item || '').trim();
      var key = normalize(value);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function (item) {
      return String(item || '').trim();
    });
  }

  function humanList(items) {
    var clean = uniqueStrings(items).filter(Boolean);
    if (!clean.length) return '';
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return clean[0] + ' и ' + clean[1];
    return clean.slice(0, -1).join(', ') + ' и ' + clean[clean.length - 1];
  }

  function firstSentence(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    var match = text.match(/.+?[.!?](?:\s|$)/);
    return match ? match[0].trim() : text;
  }

  function shortDateRange(range) {
    if (!range || !range.first || !range.last) return 'Период обсуждений уточняется';
    return formatDate(range.first) + ' — ' + formatDate(range.last);
  }

  function applyThemeToggle() {
    if (!dom.themeToggle) return;
    var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    dom.themeToggle.textContent = currentTheme === 'light' ? '☾' : '☼';
    dom.themeToggle.addEventListener('click', function () {
      var active = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = active === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('xh-theme', next);
      dom.themeToggle.textContent = next === 'light' ? '☾' : '☼';
    });
  }

  function getCategoryLabel(key) {
    if (!state.data || !state.data.categoryTitles) return key;
    return state.data.categoryTitles[key] || key;
  }

  function buildSearchBlob(product) {
    return normalize([
      product.title,
      product.category,
      product.family,
      product.shortDescription,
      product.story,
      (product.useCases || []).join(' '),
      (product.relatedTeachers || []).map(function (teacher) {
        return teacher.name + ' ' + teacher.title + ' ' + teacher.summary;
      }).join(' '),
      (product.allEntries || []).slice(0, 14).map(function (entry) {
        return entry.text;
      }).join(' '),
    ].join(' '));
  }

  function matchesProduct(product) {
    if (state.category !== 'all' && product.category !== state.category) return false;
    if (state.family !== 'all' && product.family !== state.family) return false;
    if (!state.search) return true;
    if (!product._searchBlob) product._searchBlob = buildSearchBlob(product);
    return product._searchBlob.indexOf(normalize(state.search)) !== -1;
  }

  function getVisibleProducts() {
    if (!state.data || !Array.isArray(state.data.products)) return [];
    return state.data.products.filter(matchesProduct);
  }

  function createSummaryTiles() {
    if (!state.data) return '';
    var summary = state.data.summary || {};
    var productsVisible = getVisibleProducts().length;
    var participants = state.data.chat && state.data.chat.participantsCount
      ? String(state.data.chat.participantsCount)
      : 'публично';

    return [
      {
        label: 'Продуктов',
        value: summary.productCount || 0,
        sub: productsVisible + ' видно по текущему фильтру',
      },
      {
        label: 'Материалов',
        value: summary.matchedEntries || 0,
        sub: 'Фрагменты из продуктовых обсуждений чата',
      },
      {
        label: 'Линий',
        value: (summary.families || []).length,
        sub: 'От базовой поддержки до anti-age и серебряных технологий',
      },
      {
        label: 'Сообщество',
        value: participants,
        sub: 'Участников в публичном чате компании',
      },
    ].map(function (item) {
      return (
        '<div class="summary-tile">' +
          '<div class="summary-tile-label">' + escapeHtml(item.label) + '</div>' +
          '<div class="summary-tile-value">' + escapeHtml(item.value) + '</div>' +
          '<div class="summary-tile-sub">' + escapeHtml(item.sub) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderSummary() {
    if (!state.data) return;
    dom.summaryStrip.innerHTML = createSummaryTiles();
    if (dom.chatTitle) dom.chatTitle.textContent = state.data.chat && state.data.chat.title || 'Telegram-чат Golden Connect';
    if (dom.chatSourceNote) {
      var note = [];
      if (state.data.chat && state.data.chat.historyCount) note.push('История: ' + state.data.chat.historyCount + ' сообщений');
      if (state.data.summary && state.data.summary.dateRange) note.push(shortDateRange(state.data.summary.dateRange));
      dom.chatSourceNote.textContent = note.join(' • ') || 'Публичный источник компании';
    }
    if (dom.chatLink && state.data.chat && state.data.chat.url) {
      dom.chatLink.href = state.data.chat.url;
    }
  }

  function renderFilters() {
    if (!state.data) return;
    var categories = ['all'].concat(state.data.summary.categories || []);
    dom.categoryFilters.innerHTML = categories.map(function (category) {
      var label = category === 'all' ? 'Все категории' : category;
      var isActive = state.category === category ? ' is-active' : '';
      return '<button class="filter-chip' + isActive + '" type="button" data-category="' + escapeHtml(category) + '">' + escapeHtml(label) + '</button>';
    }).join('');

    var families = state.data.summary.families || [];
    dom.familySelect.innerHTML = ['<option value="all">Все линии</option>']
      .concat(families.map(function (family) {
        var selected = family === state.family ? ' selected' : '';
        return '<option value="' + escapeHtml(family) + '"' + selected + '>' + escapeHtml(family) + '</option>';
      }))
      .join('');
  }

  function renderProductNav(products) {
    if (!products.length) {
      dom.productNav.innerHTML = '<div class="section-note">По текущему фильтру пока ничего не найдено.</div>';
      return;
    }
    dom.productNav.innerHTML = products.map(function (product) {
      return (
        '<a class="product-nav-link" href="#product-' + escapeHtml(product.slug) + '">' +
          '<strong>' + escapeHtml(product.title) + '</strong>' +
          '<span>' + escapeHtml(product.stats.total) + '</span>' +
        '</a>'
      );
    }).join('');
  }

  function renderEntryTags(entry) {
    var tags = Array.isArray(entry.categories) ? entry.categories : [];
    return tags.map(function (key) {
      return '<span class="entry-tag">' + escapeHtml(getCategoryLabel(key)) + '</span>';
    }).join('');
  }

  function renderEntryCard(entry, options) {
    var opts = options || {};
    var text = opts.fullText ? (entry.text || entry.excerpt || '') : (entry.excerpt || entry.text || '');
    var sourceLabel = opts.sourceLabel || 'Открыть источник';
    var metaRight = opts.hideScore ? '' : '<span class="entry-score">Релевантность: ' + escapeHtml(entry.score) + '</span>';
    return (
      '<article class="entry-card">' +
        '<div class="entry-tags">' + renderEntryTags(entry) + '</div>' +
        '<p>' + escapeHtml(text) + '</p>' +
        '<div class="entry-meta">' +
          '<span class="entry-date">' + escapeHtml(formatDate(entry.date)) + '</span>' +
          metaRight +
        '</div>' +
        '<div class="entry-actions">' +
          '<a class="btn btn--outline btn--sm" href="' + escapeHtml(entry.url || '#') + '" target="_blank" rel="noopener">' + escapeHtml(sourceLabel) + '</a>' +
        '</div>' +
      '</article>'
    );
  }

  function renderGeneralSection() {
    if (!state.data) return;
    var entries = Array.isArray(state.data.generalEntries) ? state.data.generalEntries : [];
    var visible = entries.slice(0, state.generalShown);
    var moreButton = entries.length > visible.length
      ? '<button class="btn btn--ghost btn--sm" type="button" data-action="load-general">Показать ещё ' + Math.min(12, entries.length - visible.length) + '</button>'
      : '';

    dom.generalBlock.innerHTML =
      '<div class="section-card-head">' +
        '<div class="section-card-copy">' +
          '<div class="card-eyebrow">Общий контекст</div>' +
          '<div class="card-title">Общие обсуждения продукции и продуктовых линеек</div>' +
          '<p>Здесь собраны сообщения, которые относятся к продукции в целом, к прайсам, линейкам и общему контексту, но не были жёстко привязаны к одному конкретному продукту.</p>' +
        '</div>' +
        '<div class="section-note">' + escapeHtml(entries.length) + ' сохранённых фрагментов</div>' +
      '</div>' +
      '<div class="general-grid">' + visible.map(function (entry) { return renderEntryCard(entry); }).join('') + '</div>' +
      '<div class="archive-toolbar">' +
        '<div class="archive-status">Показано ' + escapeHtml(visible.length) + ' из ' + escapeHtml(entries.length) + '</div>' +
        moreButton +
      '</div>';
  }

  function renderTeacherCard(teacher) {
    var details = Array.isArray(teacher.details) && teacher.details.length
      ? (
        '<details class="teacher-details">' +
          '<summary>Подробнее об эксперте</summary>' +
          '<ul>' +
            teacher.details.map(function (detail) {
              return '<li>' + escapeHtml(detail) + '</li>';
            }).join('') +
          '</ul>' +
        '</details>'
      )
      : '';

    return (
      '<article class="teacher-card">' +
        '<div class="teacher-head">' +
          '<img class="teacher-avatar" src="' + escapeHtml(teacher.image || '') + '" alt="' + escapeHtml(teacher.name) + '" loading="lazy">' +
          '<div>' +
            '<div class="teacher-name">' + escapeHtml(teacher.name) + '</div>' +
            '<div class="teacher-role">' + escapeHtml(teacher.title || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="teacher-summary">' + escapeHtml(teacher.summary || '') + '</div>' +
        '<div class="teacher-focus">' +
          (teacher.focus || []).map(function (item) {
            return '<span>' + escapeHtml(item) + '</span>';
          }).join('') +
        '</div>' +
        details +
      '</article>'
    );
  }

  function buildSellingLead(product) {
    var parts = [];
    var shortText = String(product.shortDescription || '').trim();
    var storyFirst = firstSentence(product.story);
    if (shortText) parts.push(shortText);
    if (storyFirst && normalize(storyFirst) !== normalize(shortText)) parts.push(storyFirst);
    return parts.join(' ');
  }

  function buildAudienceBullets(product) {
    var bullets = [];
    var useCases = Array.isArray(product.useCases) ? product.useCases.slice(0, 3) : [];
    if (product.category) {
      bullets.push('Тем, кто выбирает направление «' + product.category + '» и хочет начать с продукта, который легко понять и объяснить.');
    }
    if (useCases.length) {
      bullets.push('Тем, кому сейчас особенно важны ' + humanList(useCases) + ' в ежедневной или курсовой поддержке.');
    }
    if (product.family) {
      bullets.push('Тем, кто собирает свою систему внутри линии «' + product.family + '» и хочет начать с сильной опорной позиции.');
    }
    if (product.format) {
      bullets.push('Тем, кто ценит понятный формат без перегруженных схем: ' + product.format + '.');
    }
    return uniqueStrings(bullets).slice(0, 3);
  }

  function buildBenefitBullets(product) {
    var bullets = [];
    var useCases = Array.isArray(product.useCases) ? product.useCases.slice(0, 3) : [];
    if (useCases.length) {
      bullets.push('В подаче Golden Connect этот продукт связывают с акцентами на ' + humanList(useCases) + '.');
    }
    if (product.stats && Number(product.stats.instructions || 0) > 0) {
      bullets.push('По продукту уже есть живые вопросы и обсуждения применения, а значит человеку проще двигаться дальше осознанно.');
    }
    if (product.family) {
      bullets.push('Хорошо встраивается в линию «' + product.family + '», когда человек собирает не разрозненные позиции, а понятную систему.');
    }
    if (product.priceLabel || product.format) {
      bullets.push('Формат знакомства понятен уже на старте: ' + (product.priceLabel || product.format) + '.');
    }
    return uniqueStrings(bullets).slice(0, 3);
  }

  function buildTrustBullets(product, teachers) {
    var bullets = [];
    var teacherNames = (Array.isArray(teachers) ? teachers : []).map(function (teacher) {
      return teacher.name;
    }).filter(Boolean);
    if (product.stats && Number(product.stats.reviews || 0) > 0) {
      bullets.push('В открытом чате Golden Connect найдено ' + product.stats.reviews + ' сообщений с отзывами, личным опытом и наблюдениями по этому продукту.');
    }
    if (product.stats && Number(product.stats.instructions || 0) > 0) {
      bullets.push('Помимо отзывов по продукту есть ' + product.stats.instructions + ' обсуждений применения и пользовательских вопросов.');
    }
    if (teacherNames.length) {
      bullets.push('С этим направлением связаны ' + humanList(teacherNames.slice(0, 3)) + ', что усиливает доверие к продуктовой линии.');
    }
    if (product.sourceUrl) {
      bullets.push('Продукт присутствует в публичной витрине Golden Connect и встроен в общий каталог компании.');
    }
    return uniqueStrings(bullets).slice(0, 3);
  }

  function renderBulletList(items) {
    var points = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!points.length) return '<div class="section-note">Подробные акценты по этому блоку будут дополняться по мере расширения базы.</div>';
    return '<ul class="sales-list">' + points.map(function (item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('') + '</ul>';
  }

  function pickProductEntries(product, category, limit, minLength) {
    var entries = Array.isArray(product && product.allEntries) ? product.allEntries : [];
    return entries.filter(function (entry) {
      var categories = Array.isArray(entry.categories) ? entry.categories : [];
      var text = String(entry.text || '').replace(/\s+/g, ' ').trim();
      if (categories.indexOf(category) === -1) return false;
      if (minLength && text.length < minLength) return false;
      return true;
    }).slice(0, limit || 4);
  }

  function renderReviewSection(product) {
    var reviews = pickProductEntries(product, 'reviews', 6, 60);
    if (!reviews.length) return '';
    return (
      '<div class="card review-panel">' +
        '<div class="review-panel-head">' +
          '<div>' +
            '<div class="card-eyebrow">Реальные отзывы</div>' +
            '<div class="card-title">Что пишут о продукте в живом чате Golden Connect</div>' +
            '<p class="sales-lead">Ниже собраны реальные сообщения из открытого Telegram-чата компании. По кнопке можно перейти прямо к исходному сообщению.</p>' +
          '</div>' +
          '<div class="section-note">' + escapeHtml(product.stats.reviews) + ' отзывов в базе</div>' +
        '</div>' +
        '<div class="review-grid">' + reviews.map(function (entry) {
          return renderEntryCard(entry, {
            sourceLabel: 'Открыть отзыв в чате',
            hideScore: true,
          });
        }).join('') + '</div>' +
      '</div>'
    );
  }

  function renderFeaturedGroup(title, entries) {
    if (!entries || !entries.length) return '';
    return (
      '<div class="card">' +
        '<div class="card-eyebrow">' + escapeHtml(title) + '</div>' +
        '<div class="featured-grid">' + entries.map(function (entry) { return renderEntryCard(entry); }).join('') + '</div>' +
      '</div>'
    );
  }

  function renderProductCard(product) {
    var teachers = Array.isArray(product.relatedTeachers) ? product.relatedTeachers : [];
    var evidenceText = product.stats.total
      ? 'Период обсуждений: ' + shortDateRange(product.dateRange)
      : 'По этому продукту пока мало открытых обсуждений в чате.';
    var sellingLead = buildSellingLead(product);
    var audienceBullets = buildAudienceBullets(product);
    var benefitBullets = buildBenefitBullets(product);
    var trustBullets = buildTrustBullets(product, teachers);
    var reviewsBlock = renderReviewSection(product);

    var teacherBlock = teachers.length
      ? (
        '<div class="card">' +
          '<div class="card-eyebrow">Люди и авторы направления</div>' +
          '<div class="card-title">Кто связан с продуктом</div>' +
          '<div class="teacher-grid">' + teachers.map(renderTeacherCard).join('') + '</div>' +
        '</div>'
      )
      : (
        '<div class="card">' +
          '<div class="card-eyebrow">Люди и авторы направления</div>' +
          '<div class="card-title">Экспертная связь уточняется</div>' +
          '<p class="card-text">В текущей публичной базе не найдено отдельной карточки эксперта, жёстко привязанной к этому продукту, но продукт остаётся в каталоге и общей продуктовой системе Golden Connect.</p>' +
        '</div>'
      );

    return (
      '<article class="card dossier-card" id="product-' + escapeHtml(product.slug) + '">' +
        '<div class="dossier-top">' +
          '<div class="poster-frame" data-product-poster="' + escapeHtml(product.id) + '">' +
            '<img class="poster-image" src="' + escapeHtml(product.imageUrl || '') + '" alt="' + escapeHtml(product.title) + '" loading="lazy">' +
            '<div class="poster-content">' +
              '<div class="poster-badges">' +
                '<span class="poster-badge poster-badge--accent">' + escapeHtml(product.category || 'Категория') + '</span>' +
                '<span class="poster-badge">' + escapeHtml(product.family || 'Линия Golden Connect') + '</span>' +
              '</div>' +
              '<div>' +
                '<div class="poster-title">' + escapeHtml(product.title) + '</div>' +
                '<p class="poster-sub">' + escapeHtml(product.priceLabel || product.format || '') + '</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="dossier-copy">' +
            '<div class="dossier-family">' + escapeHtml(product.family || '') + '</div>' +
            '<h2 class="dossier-title">' + escapeHtml(product.title) + '</h2>' +
            '<p class="dossier-desc">' + escapeHtml(product.shortDescription || '') + '</p>' +
            '<p class="dossier-story">' + escapeHtml(product.story || '') + '</p>' +
            '<div class="product-chip-row">' +
              (product.useCases || []).map(function (item) {
                return '<span class="product-chip">' + escapeHtml(item) + '</span>';
              }).join('') +
            '</div>' +
            '<div class="metrics-grid">' +
              '<div class="metric-card"><div class="metric-label">Найдено материалов</div><div class="metric-value">' + escapeHtml(product.stats.total) + '</div><div class="metric-sub">' + escapeHtml(evidenceText) + '</div></div>' +
              '<div class="metric-card"><div class="metric-label">Отзывы</div><div class="metric-value">' + escapeHtml(product.stats.reviews) + '</div><div class="metric-sub">Личный опыт, отклики и наблюдения</div></div>' +
              '<div class="metric-card"><div class="metric-label">Применение</div><div class="metric-value">' + escapeHtml(product.stats.instructions) + '</div><div class="metric-sub">Вопросы, схемы и комментарии по использованию</div></div>' +
            '</div>' +
            '<div class="dossier-actions">' +
              '<a class="btn btn--primary" href="' + escapeHtml(withRef(product.productPageUrl || '#')) + '">Карточка продукта</a>' +
              '<a class="btn btn--outline" href="' + escapeHtml(withRef(product.instructionsUrl || '/faq')) + '">Инструкции</a>' +
              '<a class="btn btn--ghost" href="' + escapeHtml(withRef(product.sourceUrl || '/cabinet/landing/catalog')) + '" target="_blank" rel="noopener">Официальный источник</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sales-grid" style="margin-top:18px;">' +
          '<div class="card">' +
            '<div class="card-eyebrow">Подача продукта</div>' +
            '<div class="card-title">Как воспринимать этот продукт</div>' +
            '<p class="sales-lead">' + escapeHtml(sellingLead || product.story || product.shortDescription || '') + '</p>' +
            renderBulletList(benefitBullets) +
          '</div>' +
          '<div class="card">' +
            '<div class="card-eyebrow">Кому подходит</div>' +
            '<div class="card-title">Кому особенно откликается этот продукт</div>' +
            renderBulletList(audienceBullets) +
          '</div>' +
          '<div class="card">' +
            '<div class="card-eyebrow">Доверие и доказательства</div>' +
            '<div class="card-title">Почему продукт воспринимается серьёзно</div>' +
            renderBulletList(trustBullets) +
          '</div>' +
        '</div>' +
        '<div style="margin-top:18px;">' + teacherBlock + '</div>' +
        reviewsBlock +
        '<div class="archive-panel" style="margin-top:18px;">' +
          renderFeaturedGroup('О продукте', product.featured && product.featured.overview) +
          renderFeaturedGroup('Применение и вопросы', product.featured && product.featured.instructions) +
          renderFeaturedGroup('Эфиры и анонсы', product.featured && product.featured.broadcasts) +
          renderFeaturedGroup('Контекст компании', product.featured && product.featured.company) +
          '<div class="card">' +
            '<div class="archive-toolbar">' +
              '<div>' +
                '<div class="card-eyebrow">Полная база</div>' +
                '<div class="card-title">Все найденные фрагменты по продукту</div>' +
              '</div>' +
              '<button class="btn btn--ghost btn--sm" type="button" data-action="open-archive" data-product-id="' + escapeHtml(product.id) + '">Показать полную базу (' + escapeHtml(product.allEntries.length) + ')</button>' +
            '</div>' +
            '<div class="archive-status" id="archive-status-' + escapeHtml(product.id) + '">Архив не раскрыт</div>' +
            '<div class="archive-grid" id="archive-grid-' + escapeHtml(product.id) + '"></div>' +
            '<div class="entry-actions" id="archive-actions-' + escapeHtml(product.id) + '"></div>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderProducts() {
    if (!state.data) return;
    var products = getVisibleProducts();
    dom.results.textContent = 'Найдено продуктов: ' + products.length + ' из ' + state.data.summary.productCount;
    renderProductNav(products);

    if (!products.length) {
      dom.productsBlock.innerHTML =
        '<div class="empty-state">' +
          '<h3>Ничего не найдено</h3>' +
          '<p>Попробуй изменить запрос или выбрать другую продуктовую линию. База уже собрана, просто текущий фильтр слишком узкий.</p>' +
        '</div>';
      return;
    }

    dom.productsBlock.innerHTML = products.map(renderProductCard).join('');
    if (window.XHBot && typeof window.XHBot.apply === 'function') {
      window.XHBot.apply(dom.productsBlock);
    }
    wirePosterFallbacks();
  }

  function wirePosterFallbacks() {
    var images = document.querySelectorAll('.poster-image, .teacher-avatar');
    images.forEach(function (image) {
      image.addEventListener('error', function () {
        image.style.display = 'none';
      }, { once: true });
    });
  }

  function renderArchiveChunk(productId, append) {
    if (!state.data) return;
    var product = state.data.products.find(function (item) { return item.id === productId; });
    if (!product) return;

    var current = state.archiveShown[productId] || 0;
    var next = Math.min(current + 12, product.allEntries.length);
    var grid = document.getElementById('archive-grid-' + productId);
    var status = document.getElementById('archive-status-' + productId);
    var actions = document.getElementById('archive-actions-' + productId);
    if (!grid || !status || !actions) return;

    var slice = product.allEntries.slice(current, next).map(function (entry) {
      return renderEntryCard(entry, { fullText: true });
    }).join('');
    if (append && grid.innerHTML) {
      grid.insertAdjacentHTML('beforeend', slice);
    } else {
      grid.innerHTML = slice;
    }
    state.archiveShown[productId] = next;
    status.textContent = 'Показано ' + next + ' из ' + product.allEntries.length + ' фрагментов';

    if (next < product.allEntries.length) {
      actions.innerHTML = '<button class="btn btn--outline btn--sm" type="button" data-action="more-archive" data-product-id="' + escapeHtml(productId) + '">Показать ещё ' + Math.min(12, product.allEntries.length - next) + '</button>';
    } else {
      actions.innerHTML = '<div class="section-note">Это все найденные фрагменты по продукту.</div>';
    }
  }

  function setActiveNavFromHash() {
    var activeHash = window.location.hash || '';
    var links = dom.productNav.querySelectorAll('.product-nav-link');
    links.forEach(function (link) {
      link.classList.toggle('is-active', activeHash && link.getAttribute('href') === activeHash);
    });
  }

  function bindEvents() {
    dom.search.addEventListener('input', function (event) {
      state.search = String(event.target.value || '').trim();
      renderSummary();
      renderProducts();
    });

    dom.categoryFilters.addEventListener('click', function (event) {
      var button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.getAttribute('data-category') || 'all';
      renderFilters();
      renderSummary();
      renderProducts();
    });

    dom.familySelect.addEventListener('change', function (event) {
      state.family = String(event.target.value || 'all');
      renderSummary();
      renderProducts();
    });

    dom.generalBlock.addEventListener('click', function (event) {
      var target = event.target.closest('[data-action="load-general"]');
      if (!target) return;
      state.generalShown += 12;
      renderGeneralSection();
    });

    dom.productsBlock.addEventListener('click', function (event) {
      var openArchive = event.target.closest('[data-action="open-archive"]');
      if (openArchive) {
        var productId = openArchive.getAttribute('data-product-id');
        renderArchiveChunk(productId, false);
        openArchive.remove();
        return;
      }

      var moreArchive = event.target.closest('[data-action="more-archive"]');
      if (moreArchive) {
        renderArchiveChunk(moreArchive.getAttribute('data-product-id'), true);
      }
    });

    window.addEventListener('hashchange', setActiveNavFromHash);
  }

  function renderAll() {
    renderSummary();
    renderFilters();
    renderGeneralSection();
    renderProducts();
    setActiveNavFromHash();
  }

  function renderError(message) {
    var html =
      '<div class="error-state">' +
        '<h3>Не удалось загрузить библиотеку</h3>' +
        '<p>' + escapeHtml(message || 'Попробуй обновить страницу чуть позже.') + '</p>' +
      '</div>';
    dom.generalBlock.innerHTML = html;
    dom.productsBlock.innerHTML = html;
  }

  function fetchData() {
    fetch(DATA_URL, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        state.data = data;
        renderAll();
      })
      .catch(function (error) {
        renderError('Файл базы не найден или ещё не собран. ' + error.message);
      });
  }

  applyThemeToggle();
  bindEvents();
  fetchData();
})();
