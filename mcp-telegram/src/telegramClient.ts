import TelegramBot from "node-telegram-bot-api";
import * as dotenv from "dotenv";

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set in environment");
}

// Экспортируем промис, который резолвится после инициализации бота с polling
let bot: TelegramBot;

const botReady: Promise<TelegramBot> = new Promise((resolve) => {
  setTimeout(() => {
    bot = new TelegramBot(botToken, { polling: true });
    resolve(bot);
  }, 5000); // задержка 5 секунд
});

export { botReady, bot };
