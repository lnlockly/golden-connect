const https = require('https');
const fs = require('fs');
const path = require('path');
const { InlineKeyboard } = require('grammy');
const db = require('../db/database');
const { escapeHtml, todayStr, formatDateRu, localToUtc } = require('../utils/helpers');
const { hasGroqKeys, requestGroqJson } = require('../../utils/groq-rotator');
// Ленивый require чтобы избежать циклических зависимостей
let _aiModule = null;
function getAiModule() {
  if (!_aiModule) _aiModule = require('./ai-assistant');
  return _aiModule;
}

const WHISPER_MODEL = 'whisper-large-v3';

// Скачать файл по URL
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : require('http');
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

// Транскрибация через Groq Whisper
async function transcribeAudio(filePath, groqConfig) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const fileData = fs.readFileSync(filePath);

  const parts = [];

  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="voice.ogg"\r\n` +
    `Content-Type: audio/ogg\r\n\r\n`
  ));
  parts.push(fileData);
  parts.push(Buffer.from('\r\n'));

  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `${WHISPER_MODEL}\r\n`
  ));

  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `ru\r\n`
  ));

  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `json\r\n`
  ));

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);
  const parsed = await requestGroqJson({
    path: '/openai/v1/audio/transcriptions',
    groqKeys: groqConfig,
    timeoutMs: 60000,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  return parsed.text || '';
}

// Настройка обработки голосовых
function setupVoiceHandler(bot, groqConfig) {
  if (!hasGroqKeys(groqConfig)) {
    console.log('[VOICE] No GROQ keys — voice disabled');
    return;
  }

  const tmpDir = path.join(__dirname, '..', '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  bot.on('message:voice', async (ctx) => {
    await handleVoice(ctx, ctx.message.voice.file_id, groqConfig, tmpDir);
  });

  bot.on('message:audio', async (ctx) => {
    await handleVoice(ctx, ctx.message.audio.file_id, groqConfig, tmpDir);
  });

  bot.on('message:video_note', async (ctx) => {
    await handleVoice(ctx, ctx.message.video_note.file_id, groqConfig, tmpDir);
  });

  console.log('[VOICE] Voice recognition enabled (Groq Whisper)');
}

async function handleVoice(ctx, fileId, groqConfig, tmpDir) {
  const user = db.ensureUser(ctx.from);
  const thinkingMsg = await ctx.reply('🎤 Слушаю...');

  let filePath = null;
  try {
    // 1. Скачиваем файл
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    filePath = path.join(tmpDir, `voice_${ctx.from.id}_${Date.now()}.ogg`);
    await downloadFile(fileUrl, filePath);

    // 2. Транскрибация
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, '🎤 Распознаю...');
    const transcription = await transcribeAudio(filePath, groqConfig);

    if (!transcription || transcription.trim().length === 0) {
      return await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, '❌ Не удалось распознать речь. Попробуй ещё раз.');
    }

    // 3. Отправляем транскрипцию в тот же AI-секретарь что и текстовые сообщения
    //    AI сам определит — это задача, вопрос или разговор
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id,
      `🎤 <i>"${escapeHtml(transcription)}"</i>\n\n💭`,
      { parse_mode: 'HTML' }
    );

    // Сохраняем в историю
    db.addChatMessage(user.id, 'user', `[голосовое] ${transcription}`);

    // Собираем контекст + историю
    const ai = getAiModule();
    const context = ai.buildUserContext(user);
    const history = db.getChatHistory(user.id, 10);
    const messages = [
      { role: 'system', content: ai.getSystemPrompt(user) + '\n\n' + context },
    ];
    for (const msg of history.slice(0, -1)) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: transcription });

    // 4. AI обрабатывает — сам решает: задача, вопрос или разговор
    const aiResponse = await ai.callGroq(messages, groqConfig);
    const { text: replyText, actions } = ai.parseAndExecuteCommands(aiResponse, user);

    // Сохраняем ответ
    db.addChatMessage(user.id, 'assistant', replyText);

    // 5. Формируем ответ
    let reply = `🎤 <i>"${escapeHtml(transcription)}"</i>\n\n${replyText}`;

    // Добавляем инфо о действиях
    if (actions.length > 0) {
      const actionLines = [];
      for (const a of actions) {
        if (a.type === 'created') actionLines.push(`✅ <b>${escapeHtml(a.task.title)}</b> 📅${formatDateRu(a.task.due_date)}${a.task.due_time ? ' ⏰' + a.task.due_time : ''}`);
        if (a.type === 'done') actionLines.push(`✅ Готово: ${escapeHtml(a.task.title)}`);
        if (a.type === 'moved') actionLines.push(`📅 Перенесено: ${escapeHtml(a.task.title)} → ${formatDateRu(a.date)}`);
        if (a.type === 'deleted') actionLines.push(`🗑 Удалено: ${escapeHtml(a.task.title)}`);
        if (a.type === 'habit') actionLines.push(`📊 Привычка: ${a.habit.emoji} ${escapeHtml(a.habit.title)}`);
        if (a.type === 'habit_done') actionLines.push(`✅ ${a.habit.emoji} ${escapeHtml(a.habit.title)} — отмечено!`);
      }
      if (actionLines.length > 0) reply += '\n\n' + actionLines.join('\n');
    }

    // Строим inline кнопки
    const kb = new InlineKeyboard();
    const createdTasks = actions.filter(a => a.type === 'created');
    const showAction = actions.find(a => a.type === 'show_tasks');
    const showHabitsAct = actions.find(a => a.type === 'show_habits');
    const showStatsAct = actions.find(a => a.type === 'show_stats');

    // Кнопки на каждую созданную задачу
    createdTasks.forEach(({ task: t }) => {
      const short = t.title.length > 20 ? t.title.slice(0, 20) + '…' : t.title;
      kb.text(`✅ ${short}`, `done_${t.id}`)
        .text('⏰', `task_remind_${t.id}`)
        .text('📅', `task_reschedule_${t.id}`)
        .text('🗑', `task_delete_${t.id}`).row();
    });

    if (showAction) {
      const modeLabels = { today: '📋 Сегодня', tomorrow: '📅 Завтра', week: '📆 Неделя', all: '📋 Все', overdue: '⚠️ Просроченные' };
      kb.text(modeLabels[showAction.mode] || '📋 Задачи', `show_${showAction.mode}`).row();
    }
    if (showHabitsAct) kb.text('📊 Привычки', 'habits').row();
    if (showStatsAct) kb.text('☀️ Итог дня', 'stats_today').row();

    // Навигационные кнопки — всегда
    if (!showAction) kb.text('📋 Сегодня', 'today').text('📅 Завтра', 'show_tomorrow');

    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, reply, {
      parse_mode: 'HTML',
      reply_markup: kb.inline_keyboard.flat().length ? kb : undefined,
    });

  } catch (e) {
    console.error('[VOICE] Error:', e.message);
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id,
      `❌ Ошибка: ${escapeHtml(e.message)}`,
      { parse_mode: 'HTML' }
    );
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  }
}

module.exports = { setupVoiceHandler };
