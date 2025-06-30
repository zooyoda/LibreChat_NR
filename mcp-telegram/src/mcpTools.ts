import { bot } from "./telegramClient.js";

// Вспомогательная функция для строгой фильтрации числовых message_id
function toNumber(val: string | number): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && /^\d+$/.test(val)) return Number(val);
  return null;
}

// Получить информацию о боте
export async function get_bot_info() {
  return await bot.getMe();
}

// Отправить сообщение
export async function send_message(chat_id: number | string, message: string) {
  await bot.sendMessage(chat_id, message);
  return { status: "ok" };
}

// Получить последние сообщения (Bot API не поддерживает чтение истории)
export async function get_messages(chat_id: number | string, limit: number = 20) {
  return { warning: "Bot API не поддерживает получение истории чата. Используйте входящие сообщения через on('message')." };
}

// Переслать сообщения
export async function forward_messages(
  from_chat_id: number | string,
  message_ids: (number | string)[],
  to_chat_id: number | string
) {
  const validIds: number[] = message_ids
    .map(toNumber)
    .filter((id): id is number => typeof id === "number" && Number.isFinite(id));

  for (const msgIdNum of validIds) {
    await bot.forwardMessage(to_chat_id, from_chat_id, msgIdNum);
  }
  return { status: "ok" };
}

// Удалить сообщения (только если бот автор)
export async function delete_messages(
  chat_id: number | string,
  message_ids: (number | string)[]
) {
  const validIds: number[] = message_ids
    .map(toNumber)
    .filter((id): id is number => typeof id === "number" && Number.isFinite(id));

  for (const msgIdNum of validIds) {
    try {
      await bot.deleteMessage(chat_id, msgIdNum);
    } catch {
      // Игнорируем ошибки удаления
    }
  }
  return { status: "ok" };
}

// Отметить как прочитанные (Bot API не поддерживает)
export async function mark_read(
  chat_id: number | string,
  message_ids: (number | string)[]
) {
  return { status: "ok", warning: "Bot API не поддерживает отметку сообщений как прочитанные." };
}
