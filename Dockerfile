FROM node:20.19-alpine

WORKDIR /app

# Установка необходимых системных зависимостей
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++ \
    file \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Копируем package.json для всех подпроектов
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/
COPY mcp-telegram/package*.json ./mcp-telegram/
COPY sequentialthinking-mcp/package*.json ./sequentialthinking-mcp/
COPY mcp-context7/package*.json ./mcp-context7/
COPY mcp-fetch/package*.json ./mcp-fetch/
# Добавляем поддержку Google Workspace
COPY mcp-google-workspace/package*.json ./mcp-google-workspace/

# Копируем исходный код
COPY . .

# Создаем необходимые директории
RUN mkdir -p /app/config /app/logs /app/workspace \
    && mkdir -p /app/client/public/images /app/api/logs

# Выставляем права и переключаемся на пользователя node
RUN chown -R node:node /app
USER node

# Устанавливаем dev-зависимости для сборки всего проекта
RUN npm ci --include=dev

# Устанавливаем Google APIs в корневой проект
RUN npm install googleapis google-auth-library

# MCP-GITHUB-API
WORKDIR /app/mcp-github-api
RUN npm install --omit=dev

# MCP-TELEGRAM
WORKDIR /app/mcp-telegram
RUN npm install
RUN npm run build

# MCP-SEQUENTIALTHINKING
WORKDIR /app/sequentialthinking-mcp
RUN npm install
RUN npm run build
RUN npm prune --omit=dev

# MCP-CONTEXT7
WORKDIR /app/mcp-context7
RUN npm install
RUN npm run build
RUN npm prune --omit=dev

# MCP-FETCH
WORKDIR /app/mcp-fetch
RUN npm install
RUN npm run build
RUN npm prune --omit=dev

# GOOGLE WORKSPACE - собираем TypeScript код для возможного использования
WORKDIR /app/mcp-google-workspace
RUN npm install
RUN npm run build
RUN npm prune --omit=dev

# Возвращаемся в корневой каталог
WORKDIR /app

# Финальная проверка всех MCP серверов
RUN echo "=== Final MCP servers verification ===" \
    && ls -la sequentialthinking-mcp/dist/index.js \
    && ls -la mcp-context7/dist/index.js \
    && ls -la mcp-fetch/dist/index.js \
    && ls -la mcp-github-api/index.js \
    && ls -la mcp-google-workspace/dist/index.js \
    && echo "✅ All MCP servers verified"

# Сборка основного приложения LibreChat
RUN npm run frontend \
    && echo "✅ Frontend built successfully"

# Копирование конфигурации
COPY librechat.yaml /app/librechat.yaml

# Установка переменных окружения для production
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3080
ENV WORKSPACE_BASE_PATH=/app/workspace
ENV LOG_MODE=strict

# Создание финальной структуры директорий
RUN mkdir -p /app/uploads /app/images /app/meilis_data

# Проверка здоровья контейнера
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3080/api/health || exit 1

# Экспорт только основного порта приложения
EXPOSE 3080

# Точка входа
CMD echo "=== Starting LibreChat ===" && \
    echo "Environment: $NODE_ENV" && \
    echo "Host: $HOST" && \
    echo "Port: $PORT" && \
    echo "Starting server..." && \
    node api/server/index.js
