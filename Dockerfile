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

# ✅ КОПИРОВАНИЕ PACKAGE.JSON ДЛЯ ВСЕХ ПОДПРОЕКТОВ
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/
COPY mcp-telegram/package*.json ./mcp-telegram/
COPY sequentialthinking-mcp/package*.json ./sequentialthinking-mcp/
COPY mcp-context7/package*.json ./mcp-context7/
COPY mcp-fetch/package*.json ./mcp-fetch/
COPY mcp-google-workspace/package*.json ./mcp-google-workspace/

# Копирование исходного кода
COPY . .

# Создание необходимых директорий
RUN mkdir -p /app/config /app/logs /app/workspace /app/workspace_tokens \
    && mkdir -p /app/client/public/images /app/api/logs

# Выставляем права и переключаемся на пользователя node
RUN chown -R node:node /app
USER node

# ✅ УСТАНОВКА ЗАВИСИМОСТЕЙ С РАСШИРЕННЫМ TIMEOUT
RUN npm ci --include=dev --timeout=300000

# ✅ УСТАНОВКА GOOGLE APIS В КОРНЕВОЙ ПРОЕКТ
RUN npm install googleapis google-auth-library --timeout=300000

# MCP-GITHUB-API
WORKDIR /app/mcp-github-api
RUN npm install --omit=dev --timeout=300000

# MCP-TELEGRAM
WORKDIR /app/mcp-telegram
RUN npm install --timeout=300000
RUN npm run build

# MCP-SEQUENTIALTHINKING
WORKDIR /app/sequentialthinking-mcp
RUN npm install --timeout=300000
RUN npm run build
RUN npm prune --omit=dev

# MCP-CONTEXT7
WORKDIR /app/mcp-context7
RUN npm install --timeout=300000
RUN npm run build
RUN npm prune --omit=dev

# MCP-FETCH
WORKDIR /app/mcp-fetch
RUN npm install --timeout=300000
RUN npm run build
RUN npm prune --omit=dev

# ✅ GOOGLE WORKSPACE - сборка TypeScript
WORKDIR /app/mcp-google-workspace
RUN npm install --timeout=300000
RUN npm run build
RUN npm prune --omit=dev

# Возвращаемся в корневой каталог
WORKDIR /app

# ✅ ПРОВЕРКА MCP СЕРВЕРОВ С ИСПРАВЛЕННЫМ ПУТЕМ
RUN echo "=== Final MCP servers verification ===" \
    && ls -la sequentialthinking-mcp/dist/index.js \
    && ls -la mcp-context7/dist/index.js \
    && ls -la mcp-fetch/dist/index.js \
    && ls -la mcp-github-api/index.js \
    && ls -la mcp-google-workspace/build/index.js \
    && echo "✅ All MCP servers verified"

# Сборка основного приложения LibreChat
RUN npm run frontend \
    && echo "✅ Frontend built successfully"

# Копирование конфигурации
COPY librechat.yaml /app/librechat.yaml

# ✅ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ДЛЯ PRODUCTION И СЕТИ
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3080
ENV WORKSPACE_BASE_PATH=/app/workspace

# ✅ СЕТЕВЫЕ НАСТРОЙКИ ДЛЯ GOOGLE API
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV GOOGLE_OAUTH_TIMEOUT=30000
ENV HTTP_TIMEOUT=30000
ENV HTTPS_TIMEOUT=30000

# ✅ НАСТРОЙКИ ЛОГИРОВАНИЯ
ENV LOG_MODE=strict
ENV DEBUG_GOOGLE_WORKSPACE=true

# Создание финальной структуры директорий
RUN mkdir -p /app/uploads /app/images /app/meilis_data /app/workspace_tokens

# ✅ ПРОВЕРКА ЗДОРОВЬЯ С РАСШИРЕННЫМ TIMEOUT
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:3080/api/health || exit 1

# Экспорт только основного порта приложения
EXPOSE 3080

# ✅ УЛУЧШЕННАЯ ТОЧКА ВХОДА С ДОПОЛНИТЕЛЬНЫМИ ПРОВЕРКАМИ
CMD echo "=== Starting LibreChat with Google Workspace Support ===" && \
    echo "Environment: $NODE_ENV" && \
    echo "Host: $HOST" && \
    echo "Port: $PORT" && \
    echo "Google Workspace Features: Enabled" && \
    echo "Network Timeout: $HTTP_TIMEOUT ms" && \
    echo "Workspace Tokens Directory: $WORKSPACE_BASE_PATH" && \
    echo "Starting server..." && \
    node api/server/index.js
