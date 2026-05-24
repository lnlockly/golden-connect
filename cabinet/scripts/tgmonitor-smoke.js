const { Bot, InlineKeyboard } = require('grammy');
const config = require('../src/config');
const { createStorage } = require('../src/storage');
const { createTelegramMonitor } = require('../src/xh/telegram-monitor');

async function main() {
  const storage = createStorage(config);
  const bot = new Bot(config.botToken);
  const monitor = createTelegramMonitor({ bot, storage, config });
  const digest = await monitor.generateDigest();
  const recipients = storage.listTelegramMonitorRecipients().filter((item) => item.isActive);
  const text = `<b>${digest.title}</b>\n\n${digest.summary}`.slice(0, 3900);
  let sent = 0;

  for (const recipient of recipients) {
    await bot.api.sendMessage(recipient.telegramUserId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: new InlineKeyboard().text('Open monitor', 'tgm_menu'),
    });
    storage.touchTelegramMonitorRecipientDelivery(recipient.telegramUserId);
    sent += 1;
  }

  storage.saveTelegramMonitorDigest(digest);
  console.log(JSON.stringify({
    sent,
    recipients: recipients.map((item) => item.telegramUserId),
    title: digest.title,
    model: digest.model,
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
