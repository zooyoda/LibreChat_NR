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
# Переключаемся на root для системных зависимостей
USER root

# Установка Python и системных зависимостей
RUN apk update && apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    libffi-dev \
    openssl-dev \
    curl

# Копируем исходный код telegram-mcp
COPY tg-mcp /app/tg-mcp

# Работа с виртуальным окружением Python
WORKDIR /app/tg-mcp
RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

# Установка Python-зависимостей
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir --upgrade "mcp[cli]>=1.9.4"

# Возвращаем права пользователю node
RUN chown -R node:node /app/tg-mcp

# -- Финальная настройка --
WORKDIR /app
USER node

# Экспонируем порты
EXPOSE 3080
EXPOSE 8004

# Установка переменных окружения
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Установка pm2 без глобального флага
RUN npm install pm2

# Копируем pm2-конфиг
COPY pm2.config.js /app/pm2.config.js

# Стартуем сервисы
CMD ["./node_modules/.bin/pm2-runtime", "pm2.config.js"]
