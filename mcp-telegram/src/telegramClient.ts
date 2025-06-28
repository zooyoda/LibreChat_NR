import { StringSession } from "telegram/sessions";
import { TelegramClient } from "telegram";
import { NewMessage } from "telegram/events";
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
  await client.start({
    phoneNumber: async () => "",
    password: async () => "",
    phoneCode: async () => "",
    onError: (err) => console.error("TelegramClient error", err)
  });
}

export { client, Api, NewMessage };
