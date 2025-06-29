import { bot } from "./telegramClient.js";

// Отправить сообщение
export async function send_message(chat_id: number | string, message: string) {
  // chat_id может быть числом (ID) или строкой (username, например "@channel")
  await bot.sendMessage(chat_id, message);
  return { status: "ok" };
}

// Получить последние сообщения (Bot API не поддерживает чтение истории, только свои входящие)
export async function get_messages(chat_id: number | string, limit: number = 20) {
  // Bot API не позволяет читать историю чата, только получать входящие через getUpdates
  // Возвращаем только предупреждение
  return { warning: "Bot API не поддерживает получение истории чата. Используйте входящие сообщения через on('message')." };
}

// Переслать сообщения
export async function forward_messages(
  from_chat_id: number | string,
  message_ids: (number | string)[],
  to_chat_id: number | string
) {
  for (const message_id of message_ids) {
    // forwardMessage требует числовой ID сообщения
    const msgIdNum = typeof message_id === "string" ? parseInt(message_id, 10) : message_id;
    await bot.forwardMessage(to_chat_id, from_chat_id, msgIdNum);
  }
  return { status: "ok" };
}

// Удалить сообщения (только если бот автор)
export async function delete_messages(chat_id: number | string, message_ids: (number | string)[]) {
  for (const message_id of message_ids) {
    try {
      // deleteMessage требует chat_id (string|number) и message_id (string)
      await bot.deleteMessage(chat_id, String(message_id));
    } catch (err) {
      // Bot API выбрасывает ошибку, если бот не автор сообщения — игнорируем
    }
  }
  return { status: "ok" };
}

// Отметить как прочитанные (Bot API не поддерживает)
export async function mark_read(chat_id: number | string, message_ids: (number | string)[]) {
  // В Bot API нет аналога, просто возвращаем OK
  return { status: "ok", warning: "Bot API не поддерживает отметку сообщений как прочитанные." };
}
