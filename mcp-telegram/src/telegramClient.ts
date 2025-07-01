import TelegramBot from "node-telegram-bot-api";
import * as dotenv from "dotenv";

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL; // задайте в окружении Amvera

if (!botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set in environment");
}
if (!webhookUrl) {
  throw new Error("TELEGRAM_WEBHOOK_URL must be set in environment");
}

const bot = new TelegramBot(botToken, {
  webHook: {
    port: Number(process.env.PORT) || 3080, // порт, который слушает Express/Amvera
  },
});

// Устанавливаем webhook при старте
const botReady = (async () => {
  await bot.setWebHook(webhookUrl);
  return bot;
})();

export { botReady };
