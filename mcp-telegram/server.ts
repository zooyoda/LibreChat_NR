import express from "express";
import bodyParser from "body-parser";
import { botReady } from "./telegramClient.js";

// Явно задаём URL (используем либо из окружения, либо дефолт)
const webhookUrl =
  process.env.TELEGRAM_WEBHOOK_URL ||
  "https://nrlibre-neuralrunner.amvera.io/telegram-webhook";

const app = express();
app.use(bodyParser.json());

// Обработка POST запросов от Telegram
app.post("/telegram-webhook", async (req, res) => {
  const bot = await botReady;
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Healthcheck (по желанию)
app.get("/", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 8004;
app.listen(PORT, () => {
  console.log(`Telegram MCP webhook server listening on port ${PORT}`);
  console.log(`Webhook URL: ${webhookUrl}`);
});
