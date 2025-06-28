import { client, Api } from "./telegramClient.js";

// Отправить сообщение
export async function send_message(chat_id: number | string, message: string) {
  await client.sendMessage(chat_id, { message });
  return { status: "ok" };
}

// Получить последние сообщения
export async function get_messages(chat_id: number | string, limit: number = 20) {
  const messages = await client.getMessages(chat_id, { limit });
  return messages.map((m: any) => ({
    id: m.id,
    date: m.date,
    message: m.message,
    senderId: m.senderId,
    chatId: m.chatId
  }));
}

// Переслать сообщение
export async function forward_messages(from_chat_id: number | string, message_ids: number[], to_chat_id: number | string) {
  await client.forwardMessages(to_chat_id, { messages: message_ids, fromPeer: from_chat_id });
  return { status: "ok" };
}

// Удалить сообщение
export async function delete_messages(chat_id: number | string, message_ids: number[]) {
  await client.deleteMessages(chat_id, { ids: message_ids });
  return { status: "ok" };
}

// Прочитать историю (отметить как прочитанное)
export async function mark_read(chat_id: number | string, message_ids: number[]) {
  await client.invoke(
  new Api.messages.ReadHistory({
    peer: chat_id,
    maxId: Math.max(...message_ids),
  })
);

