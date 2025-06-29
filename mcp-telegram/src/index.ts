import { startClient, client, NewMessage } from "./telegramClient.js";
import * as tools from "./mcpTools.js";

// MCP stdio loop
async function main() {
  await startClient();

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
