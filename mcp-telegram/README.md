# MCP Telegram (Bot API)

TypeScript MCP-модуль для интеграции Telegram Bot API с LibreChat_NR.

## Переменные окружения

- TELEGRAM_BOT_TOKEN — токен вашего Telegram-бота

## Особенности

- MCP работает только с Bot API, без User API.
- Бот не может читать все сообщения в группах, если не является админом.
- Бот не может читать личные сообщения других пользователей, только свои входящие.
- Удалять можно только свои сообщения.

## MCP команды

- send_message(chat_id, message)
- get_messages(chat_id, limit) — только входящие для бота
- forward_messages(from_chat_id, message_ids, to_chat_id)
- delete_messages(chat_id, message_ids)
- mark_read(chat_id, message_ids) — всегда OK

## События

- new_message — приходит в stdout при новых входящих сообщениях.

