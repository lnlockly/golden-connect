(function () {
  'use strict';

  var DATA_URL = '/cabinet/data/golden-connect-product-library.json';
  var entryMap = null;
  var loadingPromise = null;
  var observer = null;

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/ё/g, 'е')
      .trim()
      .toLowerCase();
  }

  function ensureStyles() {
    if (document.getElementById('product-library-readmore-styles')) return;
    var style = document.createElement('style');
    style.id = 'product-library-readmore-styles';
    style.textContent = [
      '.entry-copy-dynamic{white-space:pre-line;color:var(--text-secondary);font-size:var(--fs-sm);line-height:1.7;}',
      '.entry-copy-dynamic.is-hidden{display:none;}'
    ].join('');
    document.head.appendChild(style);
  }

  function flattenEntries(payload) {
    var entries = [];
    if (!payload || typeof payload !== 'object') return entries;

    if (Array.isArray(payload.generalEntries)) {
      entries = entries.concat(payload.generalEntries);
    }

    (payload.products || []).forEach(function (product) {
      if (Array.isArray(product.allEntries)) {
        entries = entries.concat(product.allEntries);
      }
      if (product.featured && typeof product.featured === 'object') {
        Object.keys(product.featured).forEach(function (key) {
          if (Array.isArray(product.featured[key])) {
            entries = entries.concat(product.featured[key]);
          }
        });
      }
    });

    return entries;
  }

  function loadEntryMap() {
    if (entryMap) return Promise.resolve(entryMap);
    if (loadingPromise) return loadingPromise;

    loadingPromise = fetch(DATA_URL, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        var map = new Map();
        flattenEntries(payload).forEach(function (entry) {
          var url = String(entry && entry.url || '').trim();
          if (!url) return;
          if (!map.has(url)) map.set(url, entry);
        });
        entryMap = map;
        return map;
      })
      .catch(function () {
        return new Map();
      });

    return loadingPromise;
  }

  function toggleCard(button) {
    var card = button.closest('.entry-card');
    if (!card) return;
    var shortCopy = card.querySelector('.entry-copy-dynamic--short');
    var fullCopy = card.querySelector('.entry-copy-dynamic--full');
    if (!shortCopy || !fullCopy) return;

    var expanded = button.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      shortCopy.classList.remove('is-hidden');
      fullCopy.classList.add('is-hidden');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Читать полностью';
    } else {
      shortCopy.classList.add('is-hidden');
      fullCopy.classList.remove('is-hidden');
      button.setAttribute('aria-expanded', 'true');
      button.textContent = 'Свернуть';
    }
  }

  function upgradeCard(card, map) {
    if (!card || card.dataset.readmoreReady === '1') return;
    var sourceLink = card.querySelector('.entry-actions a[href]');
    var paragraph = card.querySelector('p');
    var actions = card.querySelector('.entry-actions');
    if (!sourceLink || !paragraph || !actions) return;

    var entry = map.get(sourceLink.href) || map.get(sourceLink.getAttribute('href'));
    if (!entry || !entry.text) return;

    var shortText = paragraph.textContent || '';
    var fullText = entry.text || '';
    if (!fullText || normalizeText(shortText) === normalizeText(fullText)) {
      card.dataset.readmoreReady = '1';
      return;
    }

    ensureStyles();

    paragraph.classList.add('entry-copy-dynamic', 'entry-copy-dynamic--short');
    var fullParagraph = document.createElement('p');
    fullParagraph.className = 'entry-copy-dynamic entry-copy-dynamic--full is-hidden';
    fullParagraph.textContent = fullText;
    paragraph.insertAdjacentElement('afterend', fullParagraph);

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost btn--sm';
    button.setAttribute('data-action', 'toggle-entry-dynamic');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'Читать полностью';
    actions.insertBefore(button, actions.firstChild);

    card.dataset.readmoreReady = '1';
  }

  function upgradeVisibleCards() {
    loadEntryMap().then(function (map) {
      if (!map || !map.size) return;
      document.querySelectorAll('.entry-card').forEach(function (card) {
        upgradeCard(card, map);
      });
    });
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action="toggle-entry-dynamic"]');
      if (!button) return;
      toggleCard(button);
    });
  }

  function watchDom() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      upgradeVisibleCards();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindEvents();
      upgradeVisibleCards();
      watchDom();
    });
  } else {
    bindEvents();
    upgradeVisibleCards();
    watchDom();
  }
})();
