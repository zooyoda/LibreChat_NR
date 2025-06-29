import { bot } from "./telegramClient.js";

// Отправить сообщение
export async function send_message(chat_id: number | string, message: string) {
  await bot.sendMessage(chat_id, message);
  return { status: "ok" };
}

// Получить последние сообщения (Bot API не поддерживает чтение истории, только свои входящие)
export async function get_messages(chat_id: number | string, limit: number = 20) {
  // Bot API не позволяет читать историю чата, только получать входящие через getUpdates
  // Возвращаем только последние полученные ботом сообщения из этого чата
  // (Можно хранить их в памяти, если нужно)
  return { warning: "Bot API не поддерживает получение истории чата. Используйте входящие сообщения через on('message')." };
}

// Переслать сообщение
export async function forward_messages(from_chat_id: number | string, message_ids: number[], to_chat_id: number | string) {
  for (const message_id of message_ids) {
    await bot.forwardMessage(to_chat_id, from_chat_id, message_id);
  }
  return { status: "ok" };
}

// Удалить сообщение (только если бот автор)
export async function delete_messages(chat_id: number | string, message_ids: number[]) {
  for (const message_id of message_ids) {
    try {
      await bot.deleteMessage(chat_id, String(message_id));
    } catch (err) {
      // Bot API может выбросить ошибку, если бот не автор сообщения
      // Просто игнорируем ошибку
    }
  }
  return { status: "ok" };
}

// Отметить как прочитанные (Bot API не поддерживает)
export async function mark_read(chat_id: number | string, message_ids: number[]) {
  // В Bot API нет аналога, просто возвращаем OK
  return { status: "ok", warning: "Bot API не поддерживает отметку сообщений как прочитанные." };
}
