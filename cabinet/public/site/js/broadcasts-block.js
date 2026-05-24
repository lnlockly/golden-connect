// Единый компонент "Эфиры X-Health" — используется на главной и в кабинете.
// Использование:
//   XHBroadcasts.mount(containerEl, { refCode: 'xh2c241', inCabinet: false });

(function () {
  'use strict';

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatMsk(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' МСК';
    } catch (e) {
      return '';
    }
  }

  function formatShortDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
      });
    } catch (e) {
      return '';
    }
  }

  function diffParts(fromMs) {
    var ms = Math.max(0, fromMs);
    var sec = Math.floor(ms / 1000) % 60;
    var min = Math.floor(ms / 60000) % 60;
    var h = Math.floor(ms / 3600000) % 24;
    var d = Math.floor(ms / 86400000);
    return { d: d, h: h, m: min, s: sec };
  }

  function cuCellHtml(value, label, unit) {
    return (
      '<div class="xhb-cu" data-unit="' + unit + '">' +
        '<div class="xhb-cu-card">' +
          '<div class="xhb-cu-card-glow"></div>' +
          '<span class="xhb-cu-val">' + value + '</span>' +
        '</div>' +
        '<div class="xhb-cu-lbl">' + label + '</div>' +
      '</div>'
    );
  }

  function renderCountdownHtml(iso) {
    if (!iso) return '';
    var parts = diffParts(new Date(iso).getTime() - Date.now());
    return (
      '<div class="xhb-countdown-scene" data-xhb-countdown="' + esc(iso) + '">' +
        '<div class="xhb-countdown-glow"></div>' +
        '<div class="xhb-countdown-title">' +
          '<span class="xhb-countdown-pulse" aria-hidden="true"></span>' +
          '<span>До старта эфира осталось</span>' +
        '</div>' +
        '<div class="xhb-countdown-3d">' +
          cuCellHtml(parts.d, 'дней', 'd') +
          '<div class="xhb-cu-sep">:</div>' +
          cuCellHtml(pad(parts.h), 'часов', 'h') +
          '<div class="xhb-cu-sep">:</div>' +
          cuCellHtml(pad(parts.m), 'минут', 'm') +
          '<div class="xhb-cu-sep">:</div>' +
          cuCellHtml(pad(parts.s), 'секунд', 's') +
        '</div>' +
      '</div>'
    );
  }

  function ctaRegister(refCode, inCabinet, eventId) {
    if (inCabinet) {
      return '<button class="xhb-btn xhb-btn-primary" data-xhb-subscribe="' + esc(eventId || '') + '">Записаться на эфир</button>';
    }
    var url = '/register' + (refCode ? '?ref=' + encodeURIComponent(refCode) : '');
    return '<a class="xhb-btn xhb-btn-primary" href="' + esc(url) + '">Записаться на эфир</a>';
  }

  // Build deep-link to bot for "remind me" — opens bot which subscribes user
  // to the event and sets up 5-phase reminder schedule (D-2/D-1/D-0/H-1/H-0).
  function botReminderUrl(refCode, eventId) {
    var base = 'https://t.me/x_health_probot';
    if (!eventId) return refCode ? (base + '?start=ref_' + encodeURIComponent(refCode)) : base;
    var payload = 'remind_' + eventId;
    if (refCode) payload += '_ref_' + refCode;
    return base + '?start=' + encodeURIComponent(payload);
  }

  function ctaBotReminder(refCode, eventId, label) {
    var url = botReminderUrl(refCode, eventId);
    var text = label || '🔔 Включить напоминания';
    return '<a class="xhb-btn xhb-btn-bot" href="' + esc(url) + '" target="_blank" rel="noopener">' + text + '</a>';
  }

  function buildShareUrl(event, refCode) {
    try {
      var u = new URL(location.origin + '/');
      if (refCode) u.searchParams.set('ref', refCode);
      u.searchParams.set('event', event.id);
      return u.toString();
    } catch (e) {
      return location.origin + '/';
    }
  }

  function speakersLine(event) {
    var name = String(event.speakerName || '').trim();
    var arr = Array.isArray(event.speakers) ? event.speakers.filter(Boolean) : [];
    if (name && arr.indexOf(name) < 0) arr.unshift(name);
    return arr.join(', ');
  }

  function truncateText(str, max) {
    var text = String(str || '').trim();
    if (text.length <= max) return text;
    // cut at word boundary
    var cut = text.slice(0, max);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
    return cut.trim() + '…';
  }

  function descriptionWithBreaks(str, maxChars) {
    var short = truncateText(str, maxChars);
    // convert \n to <br> while escaping
    return short.split('\n').map(function(line){ return esc(line); }).join('<br>');
  }

  function renderHero(event, refCode, inCabinet) {
    if (!event) {
      return (
        '<div class="xhb-hero xhb-hero-empty">' +
        '<div class="xhb-eyebrow">Эфиры X-Health</div>' +
        '<h2 class="xhb-hero-title">Следите за анонсами</h2>' +
        '<p class="xhb-hero-sub">Ближайший эфир скоро появится здесь. Подпишитесь в Telegram, чтобы узнать первыми.</p>' +
        '<div class="xhb-hero-actions"><a class="xhb-btn xhb-btn-primary" href="' + esc(botReminderUrl(refCode, null)) + '" target="_blank" rel="noopener">Открыть Telegram-бот</a></div>' +
        '</div>'
      );
    }
    var speakers = speakersLine(event);
    var shareUrl = buildShareUrl(event, refCode);
    var cover = String(event.coverImage || '').trim();
    var hasCover = !!cover;
    var descRaw = String(event.description || '').trim();
    var descShort = descriptionWithBreaks(descRaw, 240);
    var descFull = descRaw.split('\n').map(function(line){ return esc(line); }).join('<br>');
    var hasMore = descRaw.length > 240;
    var descBlock = '';
    if (descRaw) {
      descBlock = '<div class="xhb-hero-sub">' +
        '<div class="xhb-desc-short">' + descShort + '</div>' +
        (hasMore
          ? '<div class="xhb-desc-full" hidden>' + descFull + '</div>' +
            '<button type="button" class="xhb-desc-toggle" data-xhb-desc-toggle>Читать полностью</button>'
          : '') +
        '</div>';
    }
    var body =
      '<div class="xhb-hero-body">' +
      '<div class="xhb-eyebrow">Ближайший эфир</div>' +
      (event.topic ? '<div class="xhb-topic">' + esc(event.topic) + '</div>' : '') +
      '<h2 class="xhb-hero-title">' + esc(truncateText(event.title, 120)) + '</h2>' +
      (speakers ? '<div class="xhb-hero-speaker">' + esc(speakers) + '</div>' : '') +
      '<div class="xhb-hero-date">' + esc(formatMsk(event.startsAt)) + '</div>' +
      descBlock +
      renderCountdownHtml(event.startsAt) +
      '<div class="xhb-hero-actions">' +
      ctaRegister(refCode, inCabinet, event.id) +
      ctaBotReminder(refCode, event.id) +
      '<button class="xhb-btn xhb-btn-ghost" data-xhb-share="' + esc(shareUrl) + '">Поделиться</button>' +
      '</div>' +
      '</div>';
    if (hasCover) {
      return (
        '<div class="xhb-hero xhb-hero-with-cover">' +
        '<div class="xhb-hero-media" style="background-image:url(' + JSON.stringify(cover) + ')"></div>' +
        body +
        '</div>'
      );
    }
    return (
      '<div class="xhb-hero xhb-hero-no-cover">' +
      body +
      '</div>'
    );
  }

  function renderUpcomingList(items, refCode, inCabinet) {
    if (!items || !items.length) return '';
    var cards = items.map(function (ev) {
      var speakers = speakersLine(ev);
      return (
        '<article class="xhb-card xhb-card-upcoming" data-xhb-event="' + esc(ev.id) + '">' +
        '<div class="xhb-card-date">' + esc(formatShortDate(ev.startsAt)) + '</div>' +
        '<div class="xhb-card-main">' +
        (ev.topic ? '<div class="xhb-card-topic">' + esc(ev.topic) + '</div>' : '') +
        '<div class="xhb-card-title">' + esc(ev.title) + '</div>' +
        (speakers ? '<div class="xhb-card-speaker">' + esc(speakers) + '</div>' : '') +
        '<div class="xhb-card-time">' + esc(formatMsk(ev.startsAt)) + '</div>' +
        '</div>' +
        '<div class="xhb-card-actions">' +
        ctaRegister(refCode, inCabinet, ev.id) +
        ctaBotReminder(refCode, ev.id, '🔔 Напомнить') +
        '</div>' +
        '</article>'
      );
    }).join('');
    return (
      '<section class="xhb-section">' +
      '<div class="xhb-section-head"><h3>Предстоящие эфиры</h3></div>' +
      '<div class="xhb-upcoming-list">' + cards + '</div>' +
      '</section>'
    );
  }

  function renderPastList(items, refCode) {
    if (!items || !items.length) return '';
    var cards = items.map(function (ev) {
      var rec = ev.recordingUrl || (ev.recordingVideoId
        ? '/media?' + (refCode ? 'ref=' + encodeURIComponent(refCode) + '&' : '') + 'src=video&video=' + encodeURIComponent(ev.recordingVideoId)
        : '');
      var btn = rec
        ? '<a class="xhb-btn xhb-btn-soft" href="' + esc(rec) + '" target="_blank" rel="noopener">Смотреть запись</a>'
        : '<span class="xhb-badge xhb-badge-muted">Запись скоро</span>';
      return (
        '<article class="xhb-card xhb-card-past">' +
        '<div class="xhb-card-date">' + esc(formatShortDate(ev.startsAt)) + '</div>' +
        '<div class="xhb-card-main">' +
        (ev.topic ? '<div class="xhb-card-topic">' + esc(ev.topic) + '</div>' : '') +
        '<div class="xhb-card-title">' + esc(ev.title) + '</div>' +
        (ev.speakerName ? '<div class="xhb-card-speaker">' + esc(ev.speakerName) + '</div>' : '') +
        '</div>' +
        '<div class="xhb-card-actions">' + btn + '</div>' +
        '</article>'
      );
    }).join('');
    var mediaUrl = '/media' + (refCode ? '?ref=' + encodeURIComponent(refCode) : '');
    return (
      '<section class="xhb-section">' +
      '<div class="xhb-section-head">' +
      '<h3>Прошедшие эфиры</h3>' +
      '<a class="xhb-link" href="' + esc(mediaUrl) + '">Все в медиатеке →</a>' +
      '</div>' +
      '<div class="xhb-past-list">' + cards + '</div>' +
      '</section>'
    );
  }

  var countdownTimer = null;
  function startCountdown(root) {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    var nodes = root.querySelectorAll('[data-xhb-countdown]');
    if (!nodes.length) return;
    function setCell(node, unit, value) {
      var el = node.querySelector('[data-unit="' + unit + '"] .xhb-cu-val');
      if (!el) return;
      var current = el.textContent || '';
      if (current === value) return;
      var card = el.parentNode;
      if (card && card.classList) {
        card.classList.remove('xhb-tick');
        // force reflow so animation re-triggers
        void card.offsetWidth;
        card.classList.add('xhb-tick');
      }
      el.textContent = value;
    }
    function tick() {
      nodes.forEach(function (node) {
        var iso = node.getAttribute('data-xhb-countdown');
        if (!iso) return;
        var parts = diffParts(new Date(iso).getTime() - Date.now());
        setCell(node, 'd', String(parts.d));
        setCell(node, 'h', pad(parts.h));
        setCell(node, 'm', pad(parts.m));
        setCell(node, 's', pad(parts.s));
      });
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function attachHandlers(root, opts) {
    root.addEventListener('click', function (ev) {
      var descToggle = ev.target.closest && ev.target.closest('[data-xhb-desc-toggle]');
      if (descToggle) {
        var wrap = descToggle.parentElement;
        if (!wrap) return;
        var shortEl = wrap.querySelector('.xhb-desc-short');
        var fullEl = wrap.querySelector('.xhb-desc-full');
        if (!fullEl) return;
        var expanded = !fullEl.hasAttribute('hidden');
        if (expanded) {
          fullEl.setAttribute('hidden', '');
          if (shortEl) shortEl.style.display = '';
          descToggle.textContent = 'Читать полностью';
        } else {
          fullEl.removeAttribute('hidden');
          if (shortEl) shortEl.style.display = 'none';
          descToggle.textContent = 'Свернуть';
        }
        return;
      }
      var shareBtn = ev.target.closest && ev.target.closest('[data-xhb-share]');
      if (shareBtn) {
        var url = shareBtn.getAttribute('data-xhb-share') || location.href;
        if (navigator.share) {
          navigator.share({ title: 'Эфир X-Health', url: url }).catch(function () {});
        } else {
          (navigator.clipboard && navigator.clipboard.writeText(url).catch(function () {})) || null;
          shareBtn.textContent = 'Ссылка скопирована';
          setTimeout(function () { shareBtn.textContent = 'Поделиться'; }, 1800);
        }
        return;
      }
      var subBtn = ev.target.closest && ev.target.closest('[data-xhb-subscribe]');
      if (subBtn && opts.inCabinet) {
        ev.preventDefault();
        var eventId = subBtn.getAttribute('data-xhb-subscribe');
        if (!eventId) return;
        subBtn.disabled = true;
        fetch('/api/events/' + encodeURIComponent(eventId) + '/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.ok) {
              subBtn.textContent = '✓ Вы записаны';
              subBtn.classList.add('xhb-btn-soft');
              subBtn.classList.remove('xhb-btn-primary');
            } else {
              subBtn.disabled = false;
              subBtn.textContent = 'Попробовать снова';
            }
          })
          .catch(function () {
            subBtn.disabled = false;
            subBtn.textContent = 'Ошибка, попробовать снова';
          });
      }
    });
  }

  function mount(container, opts) {
    if (!container) return Promise.resolve();
    var options = opts || {};
    var refCode = String(options.refCode || '').trim();
    var inCabinet = Boolean(options.inCabinet);
    var skipHero = Boolean(options.skipHero);
    container.classList.add('xhb-root');
    container.innerHTML = '<div class="xhb-loading">Загрузка эфиров…</div>';

    var query = refCode ? '?ref=' + encodeURIComponent(refCode) : '';
    var tasks = [
      fetch('/api/events/upcoming' + (query ? query + '&limit=6' : '?limit=6')).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; }),
      fetch('/api/events/past' + (query ? query + '&limit=6' : '?limit=6')).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; }),
    ];
    if (!skipHero) {
      tasks.unshift(
        fetch('/api/events/next' + query).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; })
      );
    }
    return Promise.all(tasks).then(function (results) {
      var next = null;
      var upcomingRes, pastRes;
      if (skipHero) {
        upcomingRes = results[0];
        pastRes = results[1];
      } else {
        next = results[0] && results[0].event;
        upcomingRes = results[1];
        pastRes = results[2];
      }
      var upcomingAll = (upcomingRes && upcomingRes.items) || [];
      var upcoming = next ? upcomingAll.filter(function (e) { return e.id !== next.id; }) : upcomingAll;
      var past = (pastRes && pastRes.items) || [];
      var html = '';
      if (!skipHero) html += renderHero(next, refCode, inCabinet);
      html += renderUpcomingList(upcoming, refCode, inCabinet);
      html += renderPastList(past, refCode);
      container.innerHTML = html || '<div class="xhb-loading">Пока нет запланированных эфиров.</div>';
      startCountdown(container);
      attachHandlers(container, { inCabinet: inCabinet });
    });
  }

  window.XHBroadcasts = { mount: mount };
})();
