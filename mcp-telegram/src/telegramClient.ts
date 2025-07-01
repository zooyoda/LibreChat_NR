import TelegramBot from "node-telegram-bot-api";
import * as dotenv from "dotenv";

dotenv.config();

console.log("Env variables:", Object.keys(process.env));
console.log("TELEGRAM_WEBHOOK_URL:", process.env.TELEGRAM_WEBHOOK_URL);

const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Явно задаём webhookUrl: используем переменную окружения или дефолт для Amvera
const webhookUrl =
  process.env.TELEGRAM_WEBHOOK_URL ||
  "https://nrlibre-neuralrunner.amvera.io/telegram-webhook";

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
  console.log("Webhook set to:", webhookUrl);
  return bot;
})();

export { botReady };
