module.exports = {
  apps: [
    {
      name: "librechat-api",
      script: "api/server/index.js",
      interpreter: "node",
      cwd: "/app"
    },
    {
      name: "telegram-mcp",
      script: "/venv/bin/python3",
      args: "/app/tg-mcp/main.py",
      cwd: "/app/tg-mcp",
      env: {
        TELEGRAM_API_ID: process.env.TELEGRAM_API_ID,
        TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH,
        TELEGRAM_SESSION_STRING: process.env.TELEGRAM_SESSION_STRING,
        TELEGRAM_SESSION_NAME: process.env.TELEGRAM_SESSION_NAME || "anon"
      }
    }

  ]
}
