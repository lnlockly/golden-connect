// One-shot: импортирует статичный nextBroadcast из site-content.js в webEvents (state.json)
// Запуск: node scripts/migrate-static-events.js

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const config = require('../src/config');
const { createStorage } = require('../src/storage');
const { buildSiteContent } = require('../src/site-content');

const storage = createStorage(config);
const siteContent = buildSiteContent(config);

const nb = siteContent && siteContent.nextBroadcast;
if (!nb || !nb.date) {
  console.log('[migrate] no nextBroadcast in site-content.js, nothing to do');
  process.exit(0);
}

const existing = storage.listEvents({
  upcoming: false,
  includeCanceled: true,
  includeUnpublished: true,
});
const already = existing.find(
  (e) => e.title === nb.title && e.startsAt === nb.date,
);
if (already) {
  console.log(`[migrate] already imported (id=${already.id})`);
  process.exit(0);
}

const record = storage.upsertEvent({
  title: nb.title,
  description: nb.description || '',
  speakerName: nb.speaker || '',
  speakers: nb.speaker ? [nb.speaker] : [],
  topic: nb.topic || '',
  startsAt: nb.date,
  durationMinutes: 90,
  timezone: 'Europe/Moscow',
  joinUrl: '',
  coverImage: '',
  tags: Array.isArray(nb.directions) ? nb.directions : [],
  visibility: 'public',
  isPublished: true,
  createdBy: 'system:migration',
  updatedBy: 'system:migration',
});

console.log('[migrate] imported event:', record.id, '-', record.title);
console.log('[migrate] starts at:', record.startsAt);
process.exit(0);
