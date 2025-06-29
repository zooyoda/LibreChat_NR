import { bot } from "./telegramClient.js";
import * as tools from "./mcpTools.js";

// Объявление инструментов для LibreChat MCP
const capabilities = {
  tools: {
    send_message: {
      description: "Отправить сообщение в чат/канал Telegram от имени бота",
      params: [
        { name: "chat_id", type: "string|number", required: true, description: "ID или username чата/канала" },
        { name: "message", type: "string", required: true, description: "Текст сообщения" }
      ]
    },
    get_messages: {
      description: "Получить последние входящие сообщения для бота (ограничение Bot API)",
      params: [
        { name: "chat_id", type: "string|number", required: true },
        { name: "limit", type: "number", required: false }
      ]
    },
    forward_messages: {
      description: "Переслать сообщения в другой чат/канал",
      params: [
        { name: "from_chat_id", type: "string|number", required: true },
        { name: "message_ids", type: "array", required: true },
        { name: "to_chat_id", type: "string|number", required: true }
      ]
    },
    delete_messages: {
      description: "Удалить сообщения (только если бот автор)",
      params: [
        { name: "chat_id", type: "string|number", required: true },
        { name: "message_ids", type: "array", required: true }
      ]
    },
    mark_read: {
      description: "Отметить сообщения как прочитанные (не поддерживается Bot API, возвращает OK)",
      params: [
        { name: "chat_id", type: "string|number", required: true },
        { name: "message_ids", type: "array", required: true }
      ]
    }
  }
};

// MCP stdio loop
async function main() {
  // Объявляем инструменты (tools/capabilities) — сигнал LibreChat о готовности MCP
  process.stdout.write(JSON.stringify(capabilities) + "\n");

  // Подписка на входящие сообщения
  bot.on("message", (msg) => {
    // Отправляем событие в LibreChat
    const payload = {
      event: "new_message",
      data: {
        message_id: msg.message_id,
        chat: msg.chat,
        from: msg.from,
        date: msg.date,
        text: msg.text,
        // Можно добавить другие поля по необходимости
      }
    };
    process.stdout.write(JSON.stringify(payload) + "\n");
  });

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
