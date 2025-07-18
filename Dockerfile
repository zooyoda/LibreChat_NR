FROM node:20.19-alpine

WORKDIR /app

# ✅ Установка системных зависимостей включая curl для health checks
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
    iputils \
    && rm -rf /var/cache/apk/*

# ✅ Настройка DNS для улучшения соединения с Google APIs
RUN echo "nameserver 1.1.1.1" > /etc/resolv.conf && \
    echo "nameserver 8.8.8.8" >> /etc/resolv.conf && \
    echo "nameserver 8.8.4.4" >> /etc/resolv.conf

# ✅ ИСПРАВЛЕНО: Создание ТОЛЬКО persistent директорий для данных (БЕЗ /data/config)
RUN mkdir -p /data/workspace_tokens \
    && mkdir -p /data/uploads \
    && mkdir -p /data/images \
    && mkdir -p /data/logs \
    && mkdir -p /data/meilis_data

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

# Создаем рабочие директории
RUN mkdir -p /app/config /app/logs /app/workspace \
    && mkdir -p /app/client/public/images /app/api/logs

# ✅ Настройка прав
RUN chown -R node:node /app \
    && chown -R node:node /data

USER node

# Установка зависимостей
RUN npm ci --include=dev

# Установка Google APIs
RUN npm install googleapis google-auth-library || \
    (echo "Retrying googleapis installation..." && sleep 5 && npm install googleapis google-auth-library)

# ===== СБОРКА MCP СЕРВЕРОВ =====

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

# GOOGLE WORKSPACE
WORKDIR /app/mcp-google-workspace
RUN npm install
RUN npm run build
RUN npm prune --omit=dev

# Возвращаемся в корневой каталог
WORKDIR /app

# Проверка MCP серверов
RUN echo "=== MCP servers verification ===" \
    && ls -la sequentialthinking-mcp/dist/index.js \
    && ls -la mcp-context7/dist/index.js \
    && ls -la mcp-fetch/dist/index.js \
    && ls -la mcp-github-api/index.js \
    && echo "✅ All MCP servers verified"

# Сборка frontend
RUN npm run frontend \
    && echo "✅ Frontend built successfully"

# ✅ ИСПРАВЛЕНО: Копирование librechat.yaml в СТАНДАРТНОЕ место
COPY librechat.yaml /app/librechat.yaml

# ✅ ИСПРАВЛЕНО: Переменные окружения БЕЗ проблемной CONFIG_PATH
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3080
ENV WORKSPACE_BASE_PATH=/app/workspace
ENV LOG_MODE=strict

# ✅ ТОЛЬКО специфичные переменные для persistent storage (БЕЗ CONFIG_PATH)
ENV PERSISTENT_DATA_PATH=/data
ENV GOOGLE_TOKENS_PATH=/data/workspace_tokens
ENV UPLOADS_PATH=/data/uploads
ENV IMAGES_PATH=/data/images
ENV LOGS_PATH=/data/logs

# ✅ Сетевые настройки для Amvera
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV GOOGLE_OAUTH_TIMEOUT=60000
ENV HTTP_TIMEOUT=60000
ENV HTTPS_TIMEOUT=60000
ENV NODE_OPTIONS="--max-old-space-size=2048 --dns-result-order=ipv4first"

# ✅ Настройки для обхода proxy ограничений
ENV HTTP_PROXY=""
ENV HTTPS_PROXY=""
ENV NO_PROXY="localhost,127.0.0.1,oauth2.googleapis.com,*.googleapis.com"

# ✅ ИСПРАВЛЕНО: Правильное разделение RUN команд
RUN ln -sf /data/uploads /app/uploads \
    && ln -sf /data/images /app/images \
    && ln -sf /data/workspace_tokens /app/workspace_tokens

# ✅ ИСПРАВЛЕНО: Отдельная команда для network tests
RUN echo "=== Network connectivity test ===" \
    && curl -I --connect-timeout 10 --max-time 30 https://www.google.com || echo "Google unreachable during build" \
    && curl -I --connect-timeout 10 --max-time 30 https://registry.npmjs.org || echo "NPM registry unreachable during build"

# ✅ Health check с корректным curl
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:3080/api/health || \
        (echo "Health check failed" && curl -f http://localhost:3080/ || exit 1)

EXPOSE 3080

# ✅ ИСПРАВЛЕНО: Упрощенная CMD команда
CMD echo "=== Starting LibreChat ===" && \
    echo "Environment: $NODE_ENV" && \
    echo "Host: $HOST" && \
    echo "Port: $PORT" && \
    echo "Config file: /app/librechat.yaml" && \
    echo "Persistent data: $PERSISTENT_DATA_PATH" && \
    echo "Google tokens: $GOOGLE_TOKENS_PATH" && \
    ls -la /data/ && \
    echo "=== Starting server ===" && \
    node api/server/index.js
