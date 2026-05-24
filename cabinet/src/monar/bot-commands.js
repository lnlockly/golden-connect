// Telegram bot commands for Monar. Dormant: not registered in bot.js.
// Activation: `require('./monar/bot-commands').register(bot, config)`.

const api = require('./api-client');

function register(bot, _config) {
  bot.command('lots', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    try {
      // No /lots endpoint yet — placeholder until activation.
      await ctx.reply('Список лотов появится после активации Monar.');
    } catch (e) {
      await ctx.reply('Monar dormant: ' + String((e && e.message) || e));
    }
  });

  bot.command('team', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    await ctx.reply('Команда (5 уровней) появится после активации Monar.');
  });

  bot.command('balance', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    try {
      const userId = ctx.from && ctx.from.id;
      const r = await api.getBalances(userId);
      await ctx.reply('balances: ' + JSON.stringify(r));
    } catch (e) {
      await ctx.reply('Monar dormant: ' + String((e && e.message) || e));
    }
  });
}

module.exports = { register };
