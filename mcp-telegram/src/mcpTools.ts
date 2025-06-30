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
    // Явно приводим к числу, если это строка
    const msgIdNum: number = typeof message_id === "string" ? parseInt(message_id, 10) : message_id;
    await bot.forwardMessage(to_chat_id, from_chat_id, msgIdNum);
  }
  return { status: "ok" };
}

// Удалить сообщения (только если бот автор)
export async function delete_messages(chat_id: number | string, message_ids: (number | string)[]) {
  for (const message_id of message_ids) {
    try {
      // Для deleteMessage message_id должен быть строкой, но числового значения!
      const msgIdNum: number = typeof message_id === "string" ? parseInt(message_id, 10) : message_id;
      await bot.deleteMessage(chat_id, msgIdNum.toString());
    } catch (err) {
      // Bot API выбрасывает ошибку, если бот не автор сообщения — игнорируем
    }
  }
  return { status: "ok" };
}

// Отметить как прочитанные (Bot API не поддерживает)
export async function mark_read(chat_id: number | string, message_ids: (number | string)[]) {
  return { status: "ok", warning: "Bot API не поддерживает отметку сообщений как прочитанные." };
}
