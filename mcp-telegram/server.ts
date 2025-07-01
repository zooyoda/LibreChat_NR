import express from "express";
import bodyParser from "body-parser";
import { botReady } from "./telegramClient.js";

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

const PORT = process.env.PORT || 3080;
app.listen(PORT, () => {
  console.log(`Telegram MCP webhook server listening on port ${PORT}`);
});
