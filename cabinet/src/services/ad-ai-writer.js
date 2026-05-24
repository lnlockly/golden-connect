/**
 * Ad AI Writer — генерация и рерайт рекламных текстов через Groq
 * Telegram-совместимое форматирование
 */
const fetch = require('node-fetch');
const { getDb } = require('../database');

const GROQ_KEYS = (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '').split(',').filter(Boolean);
let groqKeyIdx = 0;

function getGroqKey(userId) {
  if (userId) {
    const db = getDb();
    const user = db.prepare('SELECT groq_key_user FROM users WHERE id=?').get(userId);
    if (user?.groq_key_user) return user.groq_key_user;
  }
  if (!GROQ_KEYS.length) return null;
  const key = GROQ_KEYS[groqKeyIdx % GROQ_KEYS.length];
  groqKeyIdx++;
  return key;
}

/**
 * Очистить текст от неподдерживаемых HTML-тегов Telegram
 * Telegram HTML поддерживает только: <b> <i> <u> <s> <code> <pre> <a> <blockquote> <tg-spoiler>
 */
function sanitizeTgHtml(text) {
  if (!text) return text;

  // 1. Заголовки → жирный + перенос
  text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, inner) =>
    '\n<b>' + stripTags(inner).trim() + '</b>\n'
  );

  // 2. <strong> / <em> → <b> / <i>
  text = text.replace(/<strong([^>]*)>([\s\S]*?)<\/strong>/gi, '<b>$2</b>');
  text = text.replace(/<em([^>]*)>([\s\S]*?)<\/em>/gi, '<i>$2</i>');

  // 3. Списки <ul>/<ol>/<li>
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) =>
    '• ' + stripTags(inner).trim() + '\n'
  );
  text = text.replace(/<\/?[uo]l[^>]*>/gi, '\n');

  // 4. Абзацы и div → двойной перенос
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');

  // 5. <br> → перенос
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 6. <hr> → разделитель
  text = text.replace(/<hr\s*\/?>/gi, '\n──────────\n');

  // 7. Блоки кода → <pre> или <code>
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) =>
    '<pre>' + inner.replace(/<[^>]+>/g, '') + '</pre>'
  );

  // 8. Удаляем все остальные теги КРОМЕ разрешённых Telegram
  const allowed = ['b', 'i', 'u', 's', 'code', 'pre', 'a', 'blockquote', 'tg-spoiler'];
  const allowedRe = new RegExp(
    `<(?!\/?(?:${allowed.join('|')})(?:\\s[^>]*)?>)[^>]+>`,
    'gi'
  );
  text = text.replace(allowedRe, '');

  // 9. Убираем &nbsp; и лишние пробелы
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

// Системный промпт для Telegram-формата (общий)
function getTgSystemPrompt(lang, toneDesc, lengthDesc) {
  return `Ты — эксперт по рекламным постам для Telegram-каналов. Пиши на ${lang} языке.

ПРАВИЛА ФОРМАТИРОВАНИЯ (строго!):
- Только Telegram-теги: <b>жирный</b>, <i>курсив</i>, <u>подчёркнутый</u>, <s>зачёркнутый</s>, <code>код</code>
- НЕ используй: <h1>, <h2>, <h3>, <p>, <div>, <ul>, <li>, <strong>, <em>, <br>, <span>, <hr> — они не работают в Telegram!
- Для заголовков используй <b>ЗАГОЛОВОК</b> с переносом строки
- Для списков используй символы: • или — или ✅ или ➡️ (НЕ теги <li>/<ul>)
- Переносы строк делай через обычный \\n
- Эмодзи — ОБЯЗАТЕЛЬНО, они делают пост живым
- Ссылки: <a href="URL">текст</a>
- В конце ВСЕГДА ставь призыв к действию (CTA)

Стиль: ${toneDesc}
Длина: ${lengthDesc}

ПРИМЕР правильного формата:
🔥 <b>Заголовок поста</b>

Вводное предложение, зацепляющее внимание.

✅ Пункт первый
✅ Пункт второй
✅ Пункт третий

<i>Дополнительная информация или отзыв</i>

👉 [Ссылка на ваш продукт]`;
}

/**
 * Генерация рекламного текста
 */
async function generateAdText({ prompt, tone, length, language, links, productInfo, transcription, userId }) {
  const key = getGroqKey(userId);
  if (!key) throw new Error('No Groq API key available');

  const toneMap = {
    professional: 'профессиональный, деловой',
    friendly: 'дружеский, неформальный',
    selling: 'продающий, с призывом к действию',
    informative: 'информативный, экспертный',
    creative: 'креативный, с юмором'
  };

  const lengthMap = {
    short: 'короткий (2-3 предложения, до 200 символов)',
    medium: 'средний (4-6 предложений, 300-600 символов)',
    long: 'длинный (7-10 предложений, 600-1000 символов)'
  };

  const lang = language === 'ru' ? 'русском' : 'английском';
  const toneDesc = toneMap[tone] || toneMap.selling;
  const lengthDesc = lengthMap[length] || lengthMap.medium;

  const systemPrompt = getTgSystemPrompt(lang, toneDesc, lengthDesc);

  let userPrompt = `Создай рекламный пост для Telegram-канала.`;

  if (productInfo) {
    userPrompt += `\n\nПродукт/услуга:\n${productInfo}`;
  }

  if (prompt) {
    userPrompt += `\n\nТекст/идея от автора:\n${prompt}`;
  }

  if (transcription) {
    userPrompt += `\n\nТранскрипция видео (возьми ключевые моменты):\n${transcription.substring(0, 2000)}`;
  }

  if (links && links.length > 0) {
    const linkTexts = links.map((l, i) => {
      const url = l.short_url || l.url;
      return `Ссылка ${i + 1}: ${url}`;
    }).join('\n');
    userPrompt += `\n\nВставь ссылки в текст или в конце:\n${linkTexts}`;
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 2000
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Groq API error');

  const rawText = data.choices?.[0]?.message?.content || '';
  let cleaned2 = sanitizeTgHtml(rawText);
  // Strip fake URLs — AI tends to generate example.com etc. Real links added by cron
  cleaned2 = cleaned2.replace(/<a\s+href="[^"]*"[^>]*>(.*?)<\/a>/gi, '$1');
  return cleaned2;
}

/**
 * Рерайт текста
 */
async function rewriteAdText({ text, language, tone, userId }) {
  const key = getGroqKey(userId);
  if (!key) throw new Error('No Groq API key available');

  const lang = language === 'ru' ? 'русском' : 'английском';

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Ты — рерайтер рекламных текстов для Telegram. Пиши на ${lang} языке.
Перепиши текст полностью, сохраняя смысл. Сделай его уникальным.

ПРАВИЛА ФОРМАТИРОВАНИЯ:
- Только: <b>жирный</b>, <i>курсив</i>, <u>подчёркнутый</u>, <s>зачёркнутый</s>
- ЗАПРЕЩЕНО использовать <a href="...">ссылки</a> — НИКАКИХ тегов <a>! Ссылки будут добавлены отдельно.
- НЕ вставляй и НЕ придумывай URL-адреса (example.com, site.com и т.д.)
- НЕ используй <h1>, <h2>, <ul>, <li>, <p>, <div>, <strong>, <em> — они НЕ работают в Telegram!
- Списки: • или ✅ или ➡️ (не теги)
- Эмодзи обязательны
- НЕ добавляй никакие URL/ссылки — они будут добавлены автоматически после твоего текста`
        },
        {
          role: 'user',
          content: `Перепиши для Telegram:\n\n${text}`
        }
      ],
      temperature: 0.9,
      max_tokens: 2000
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Groq API error');

  const rawText = data.choices?.[0]?.message?.content || text;
  let cleaned = sanitizeTgHtml(rawText);
  // Strip ALL <a href> tags from AI output — AI generates fake URLs (example.com, site.com etc.)
  // Real user links are appended by the cron script AFTER AI rewrite
  cleaned = cleaned.replace(/<a\s+href="[^"]*"[^>]*>(.*?)<\/a>/gi, '$1');
  return cleaned;
}

/**
 * Смешать транскрипцию + промт + ссылки
 */
async function mixTranscriptionWithAd({ transcription, prompt, links, language, userId }) {
  const key = getGroqKey(userId);
  if (!key) throw new Error('No Groq API key available');

  const lang = language === 'ru' ? 'русском' : 'английском';

  let linkBlock = '';
  if (links && links.length) {
    linkBlock = '\nСсылки:\n' + links.map((l, i) => `${i + 1}. ${l.short_url || l.url}`).join('\n');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Ты — эксперт по контент-маркетингу для Telegram. Пиши на ${lang} языке.
Создай рекламный пост: сначала интересная подводка из видео, затем реклама и ссылки.
Длина: до 700 символов.

ПРАВИЛА ФОРМАТИРОВАНИЯ (строго!):
- Только Telegram-теги: <b>, <i>, <u>, <s>, <code>, <a href="">
- НЕ используй: <h1>, <h2>, <p>, <div>, <ul>, <li>, <strong>, <em>
- Списки через: • ✅ ➡️ (не HTML-теги)
- Обязательно эмодзи
- Переносы строк — обычный \\n`
        },
        {
          role: 'user',
          content: `Транскрипция видео:\n${transcription.substring(0, 2000)}\n\nРекламный текст:\n${prompt || 'Смотрите видео!'}${linkBlock}`
        }
      ],
      temperature: 0.8,
      max_tokens: 1500
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Groq API error');

  const rawText = data.choices?.[0]?.message?.content || '';
  return sanitizeTgHtml(rawText);
}

module.exports = {
  generateAdText,
  rewriteAdText,
  mixTranscriptionWithAd,
  sanitizeTgHtml
};
