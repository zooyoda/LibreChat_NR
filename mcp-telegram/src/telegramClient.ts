import { StringSession } from "telegram/sessions/index.js";
import { TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { Api } from "telegram";
import * as dotenv from "dotenv";

dotenv.config();

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION_STRING;

if (!apiId || !apiHash || !sessionString) {
  throw new Error("TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_STRING must be set in environment");
}

const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
  connectionRetries: 5,
});

export async function startClient() {
  if (!client.connected) {
    await client.connect();
    console.log("✅ Telegram client connected!");
  }
}

export { client, Api, NewMessage };
