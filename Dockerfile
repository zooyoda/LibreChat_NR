# --- STAGE 1: node base ---
FROM node:20.19-alpine AS nodebase
WORKDIR /app

# Кэшируем зависимости
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/

# Копируем остальной проект
COPY . .

# Устанавливаем владельца и переключаемся на non-root
RUN chown -R node:node /app
USER node

# Установка всех зависимостей (включая dev для сборки)
RUN npm ci --include=dev

# Установка зависимостей mcp-github-api без dev
WORKDIR /app/mcp-github-api
RUN npm install --omit=dev

# Сборка фронта
WORKDIR /app
RUN npm run frontend

# Создание необходимых директорий
RUN mkdir -p /app/client/public/images /app/api/logs

# Копируем конфиг
COPY librechat.yaml /app/librechat.yaml

# --- MCP TELEGRAM STAGE ---
WORKDIR /app/tg-mcp

# Создаём виртуальное окружение Python
RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

# requirements.txt сначала (для кеша pip install)
COPY tg-mcp/requirements.txt .

# Установка зависимостей python для telegram-mcp внутри venv
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir --upgrade "mcp[cli]>=1.9.4"

# Копируем остальной код telegram-mcp
COPY tg-mcp/ .

# --- Возврат в корень ---
WORKDIR /app

# Экспонируем порты для LibreChat и telegram-mcp
EXPOSE 3080
EXPOSE 8004

# Установка переменных окружения
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Устанавливаем pm2
RUN npm install -g pm2

# Копируем pm2-конфиг
COPY pm2.config.js /app/pm2.config.js

# Стартуем оба сервиса: LibreChat + telegram-mcp
CMD ["pm2-runtime", "pm2.config.js"]
