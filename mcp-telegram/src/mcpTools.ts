import { bot } from "./telegramClient.js";

// Отправить сообщение
export async function send_message(chat_id: number | string, message: string) {
  await bot.sendMessage(chat_id, message);
  return { status: "ok" };
}

// Получить последние сообщения (Bot API не поддерживает чтение истории, только свои входящие)
export async function get_messages(chat_id: number | string, limit: number = 20) {
  return { warning: "Bot API не поддерживает получение истории чата. Используйте входящие сообщения через on('message')." };
}

// Переслать сообщения
export async function forward_messages(
  from_chat_id: number | string,
  message_ids: (number | string)[],
  to_chat_id: number | string
) {
  for (const message_id of message_ids) {
    let msgIdNum: number | null = null;
    if (typeof message_id === "number") {
      msgIdNum = message_id;
    } else if (typeof message_id === "string" && /^\d+$/.test(message_id)) {
      msgIdNum = Number(message_id);
    }
    if (typeof msgIdNum === "number" && !isNaN(msgIdNum)) {
      await bot.forwardMessage(to_chat_id, from_chat_id, msgIdNum);
    }
    // Если message_id некорректный — пропускаем без ошибки
  }
  return { status: "ok" };
}

// Удалить сообщения (только если бот автор)
export async function delete_messages(chat_id: number | string, message_ids: (number | string)[]) {
  for (const message_id of message_ids) {
    let msgIdNum: number | null = null;
    if (typeof message_id === "number") {
      msgIdNum = message_id;
    } else if (typeof message_id === "string" && /^\d+$/.test(message_id)) {
      msgIdNum = Number(message_id);
    }
    if (typeof msgIdNum === "number" && !isNaN(msgIdNum)) {
      await bot.deleteMessage(chat_id, msgIdNum.toString());
    }
  }
  return { status: "ok" };
}

// Отметить как прочитанные (Bot API не поддерживает)
export async function mark_read(chat_id: number | string, message_ids: (number | string)[]) {
  return { status: "ok", warning: "Bot API не поддерживает отметку сообщений как прочитанные." };
}
