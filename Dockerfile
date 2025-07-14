FROM node:20.19-alpine

WORKDIR /app

# ✅ Расширенная установка системных зависимостей с поддержкой сети
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++ \
    file \
    ca-certificates \
    bind-tools \
    && rm -rf /var/cache/apk/*

# ✅ Настройка DNS для лучшего соединения с Google APIs
RUN echo "nameserver 8.8.8.8" > /etc/resolv.conf && \
    echo "nameserver 8.8.4.4" >> /etc/resolv.conf

# Копируем package.json для всех подпроектов
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/
COPY mcp-telegram/package*.json ./mcp-telegram/
COPY sequentialthinking-mcp/package*.json ./sequentialthinking-mcp/
COPY mcp-context7/package*.json ./mcp-context7/
COPY mcp-fetch/package*.json ./mcp-fetch/
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

# Финальная проверка всех MCP серверов (исключаем Google Workspace для плагинного подхода)
RUN echo "=== Final MCP servers verification ===" \
    && ls -la sequentialthinking-mcp/dist/index.js \
    && ls -la mcp-context7/dist/index.js \
    && ls -la mcp-fetch/dist/index.js \
    && ls -la mcp-github-api/index.js \
    && echo "✅ All MCP servers verified"

# Сборка основного приложения LibreChat
RUN npm run frontend \
    && echo "✅ Frontend built successfully"

# Копирование конфигурации
COPY librechat.yaml /app/librechat.yaml

# ✅ Настройки для решения сетевых timeout'ов на Amvera
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3080
ENV WORKSPACE_BASE_PATH=/app/workspace
ENV LOG_MODE=strict
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV GOOGLE_OAUTH_TIMEOUT=60000
ENV HTTP_TIMEOUT=60000
ENV HTTPS_TIMEOUT=60000
ENV NODE_OPTIONS="--max-old-space-size=2048 --dns-result-order=ipv4first"

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
    echo "Google OAuth Timeout: $GOOGLE_OAUTH_TIMEOUT" && \
    echo "Starting server..." && \
    node api/server/index.js
