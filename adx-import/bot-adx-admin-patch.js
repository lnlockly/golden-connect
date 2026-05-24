// patch-bot-adx-admin.js
// Adds adx_ch_approve / adx_ch_reject callback handlers to bot.js
process.chdir('/opt/arsenal-tg-bot');
const fs = require('fs');

let bot = fs.readFileSync('bot.js', 'utf8');

// Find the adx_accept handler we already added and extend it
const searchStr = "} else if (data.startsWith('adx_accept_') || data.startsWith('adx_reject_')) {";

if (!bot.includes('adx_ch_approve_')) {
  // Find insertion point - right before the adx_accept handler
  const insertBefore = searchStr;
  const insertIdx = bot.indexOf(insertBefore);

  if (insertIdx < 0) {
    console.log('❌ Could not find adx_accept handler insertion point');
    process.exit(1);
  }

  const adminHandlers = `} else if (data.startsWith('adx_ch_approve_') || data.startsWith('adx_ch_reject_')) {
      // Admin: approve/reject channel for ad network
      const parts = data.split('_');
      const action = parts[2]; // 'approve' or 'reject'
      const channelId = parts[3];

      // Find admin user by chat_id
      const adminUser = db.prepare('SELECT id, is_admin, auth_token FROM users WHERE tg_chat_id=? AND is_admin=1').get(String(chatId));
      if (!adminUser) {
        bot.sendMessage(chatId, '❌ Нет прав администратора').catch(() => {});
        return;
      }

      try {
        const resp = await fetch(\`http://localhost:3001/api/adx/admin/channels/\${channelId}/\${action}\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + adminUser.auth_token
          },
          body: JSON.stringify({ note: action === 'reject' ? 'Отклонено администратором' : null })
        });
        const result = await resp.json();

        if (result.success) {
          const emoji = action === 'approve' ? '✅' : '❌';
          const text = action === 'approve'
            ? `${emoji} Канал #${channelId} одобрен и добавлен в рекламную сеть!`
            : `${emoji} Канал #${channelId} отклонён.`;

          bot.editMessageText(text, { chat_id: chatId, message_id: msg.message_id }).catch(() => {
            bot.sendMessage(chatId, text).catch(() => {});
          });
        } else {
          bot.sendMessage(chatId, '❌ Ошибка: ' + (result.error || 'unknown')).catch(() => {});
        }
      } catch(e) {
        bot.sendMessage(chatId, '❌ Ошибка сервера: ' + e.message).catch(() => {});
      }
    ${insertBefore}`;

  bot = bot.replace(insertBefore, adminHandlers);
  console.log('✅ Added adx_ch_approve/reject handlers to bot.js');
} else {
  console.log('ℹ️ adx_ch_approve already in bot.js');
}

fs.writeFileSync('bot.js', bot);

// Syntax check
const { execSync } = require('child_process');
try {
  execSync('node --check bot.js 2>&1');
  console.log('✅ bot.js syntax OK');
} catch(e) {
  const out = execSync('node --check bot.js 2>&1 || true').toString();
  console.log('❌ Syntax error:', out.substring(0, 400));
}
