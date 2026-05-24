'use strict';

// One-shot sample-data seed for fresh golden-connect-cabinet deploys.
// Wrapped in an IIFE so require() from server.js is safe — no process.exit,
// errors are logged but never fatal.

(function seedSampleData() {
  try {
    const config = require('../src/config');
    const { createStorage } = require('../src/storage');
    const storage = createStorage(config);

    const existing = storage.listUpcomingEvents(20);
    if (existing.length > 0) {
      console.log('[seed] skip — already', existing.length, 'upcoming events');
      return;
    }

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(15, 0, 0, 0); // 18:00 MSK

    const sample = {
      title: 'Старт Golden Connect — открытая презентация',
      description:
        'Расскажем, как устроена платформа: 4 тарифа (FREE / LAUNCH / BOOST / ROCKET), бизнес-места, 10-уровневая партнёрская программа, Matching Bonus и Лидерский пул. Ответим на вопросы.',
      speakerName: 'Команда Golden Connect',
      speakers: ['Команда Golden Connect'],
      topic: 'Запуск',
      startsAt: tomorrow.toISOString(),
      durationMinutes: 45,
      timezone: 'Europe/Moscow',
      joinUrl: 'https://t.me/Golden Connect_bizbot',
      coverImage: '/img/golden-connect-logo.jpg',
      visibility: 'public',
      isPublished: true,
      tags: ['старт', 'демо', 'тарифы'],
    };

    const created = storage.upsertEvent(sample);
    console.log('[seed] created sample event', created && created.id, 'at', sample.startsAt);
  } catch (e) {
    console.error('[seed] failed:', e && e.message ? e.message : e);
  }
})();
