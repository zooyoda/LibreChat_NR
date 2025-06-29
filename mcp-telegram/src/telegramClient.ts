import TelegramBot from "node-telegram-bot-api";
import * as dotenv from "dotenv";

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set in environment");
}

const bot = new TelegramBot(botToken, { polling: true });

export { bot };
