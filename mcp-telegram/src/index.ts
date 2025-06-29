import { startClient, client, NewMessage } from "./telegramClient.js";
import * as tools from "./mcpTools.js";

// Описание доступных инструментов (tools) для объявления о готовности MCP
const capabilities = {
  tools: {
    send_message: {
      description: "Отправить сообщение в чат/канал Telegram от имени пользователя",
      params: [
        { name: "chat_id", type: "string|number", required: true, description: "ID или username чата/канала" },
        { name: "message", type: "string", required: true, description: "Текст сообщения" }
      ]
    },
    get_messages: {
      description: "Получить последние сообщения из чата/канала",
      params: [
        { name: "chat_id", type: "string|number", required: true, description: "ID или username чата/канала" },
        { name: "limit", type: "number", required: false, description: "Максимальное число сообщений (по умолчанию 20)" }
      ]
    },
    forward_messages: {
      description: "Переслать сообщения в другой чат/канал",
      params: [
        { name: "from_chat_id", type: "string|number", required: true, description: "ID или username исходного чата/канала" },
        { name: "message_ids", type: "array", required: true, description: "Массив ID пересылаемых сообщений" },
        { name: "to_chat_id", type: "string|number", required: true, description: "ID или username целевого чата/канала" }
      ]
    },
    delete_messages: {
      description: "Удалить сообщения",
      params: [
        { name: "chat_id", type: "string|number", required: true, description: "ID или username чата/канала" },
        { name: "message_ids", type: "array", required: true, description: "Массив ID удаляемых сообщений" }
      ]
    },
    mark_read: {
      description: "Отметить сообщения как прочитанные",
      params: [
        { name: "chat_id", type: "string|number", required: true, description: "ID или username чата/канала" },
        { name: "message_ids", type: "array", required: true, description: "Массив ID сообщений для отметки как прочитанные" }
      ]
    }
  }
};

// MCP stdio loop
async function main() {
  await startClient();

  // Объявляем инструменты (tools/capabilities) — сигнал LibreChat о готовности MCP
  process.stdout.write(JSON.stringify(capabilities) + "\n");

  // Слушаем новые сообщения и выводим их в stdout как MCP event
  client.addEventHandler((event: any) => {
    const msg = event.message;
    const payload = {
      event: "new_message",
      data: {
        id: msg.id,
        chatId: msg.chatId,
        senderId: msg.senderId,
        message: msg.message,
        date: msg.date
      }
    };
    process.stdout.write(JSON.stringify(payload) + "\n");
  }, new NewMessage({}));

  // MCP stdio loop: получаем команды, вызываем tool, возвращаем результат
  process.stdin.on("data", async (data) => {
    try {
      const req = JSON.parse(data.toString());
      const { method, params, id } = req;
      if (method in tools && typeof (tools as any)[method] === "function") {
        const fn = (tools as Record<string, (...args: any[]) => any>)[method];
        const result = await fn(...(params || []));
        process.stdout.write(JSON.stringify({ id, result }) + "\n");
      } else {
        process.stdout.write(JSON.stringify({ id, error: "Unknown method" }) + "\n");
      }
    } catch (err: any) {
      process.stdout.write(JSON.stringify({ error: err.message }) + "\n");
    }
  });
}

main();
