FROM node:20.19-alpine

WORKDIR /app

# Установка дополнительных системных зависимостей (добавлен file)
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++ \
    file \
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
COPY mcp-google-workspace/package*.json ./mcp-google-workspace/

# Копируем исходный код
COPY . .

# Устанавливаем права на docker-entrypoint.sh ДО переключения на USER node
RUN chmod +x /app/mcp-google-workspace/docker-entrypoint.sh

# Создаем необходимые директории с правильными правами
RUN mkdir -p /app/config /app/logs /app/workspace \
    && mkdir -p /app/client/public/images /app/api/logs

# Выставляем права и переключаемся на пользователя node
RUN chown -R node:node /app
USER node

# Устанавливаем dev-зависимости для сборки всего проекта
RUN npm ci --include=dev

# MCP-GITHUB-API
WORKDIR /app/mcp-github-api
RUN echo "=== Building MCP-GITHUB-API ===" \
    && npm install --omit=dev \
    && echo "✅ MCP-GITHUB-API ready"

# MCP-TELEGRAM
WORKDIR /app/mcp-telegram
RUN echo "=== Building MCP-TELEGRAM ===" \
    && npm install \
    && npm run build \
    && echo "✅ MCP-TELEGRAM built successfully"

# MCP-SEQUENTIALTHINKING
WORKDIR /app/sequentialthinking-mcp
RUN echo "=== Building MCP-SEQUENTIALTHINKING ===" \
    && npm install \
    && npm run build \
    && npm prune --omit=dev \
    && echo "✅ MCP-SEQUENTIALTHINKING built successfully"

# MCP-CONTEXT7
WORKDIR /app/mcp-context7
RUN echo "=== Building MCP-CONTEXT7 ===" \
    && npm install \
    && npm run build \
    && npm prune --omit=dev \
    && echo "✅ MCP-CONTEXT7 built successfully"

# MCP-FETCH
WORKDIR /app/mcp-fetch
RUN echo "=== Building MCP-FETCH ===" \
    && npm install \
    && npm run build \
    && npm prune --omit=dev \
    && echo "✅ MCP-FETCH built successfully"

# MCP-GOOGLE-WORKSPACE: ИСПРАВЛЕННАЯ ВЕРСИЯ
WORKDIR /app/mcp-google-workspace

# Этап 1: Диагностика начального состояния
RUN echo "=== Google Workspace MCP: Diagnostic Phase ===" \
    && echo "Current working directory: $(pwd)" \
    && echo "Node.js version: $(node --version)" \
    && echo "NPM version: $(npm --version)"

RUN echo "=== Checking project structure ===" \
    && ls -la package.json || echo "❌ package.json missing" \
    && ls -la tsconfig.json || echo "❌ tsconfig.json missing" \
    && ls -la docker-entrypoint.sh || echo "❌ docker-entrypoint.sh missing"

RUN echo "=== Checking source files ===" \
    && ls -la src/ || echo "❌ src/ directory missing" \
    && find src -name "*.ts" | head -5 || echo "❌ No TypeScript files found"

# Этап 2: Установка зависимостей
RUN echo "=== Installing dependencies (including dev) ===" \
    && npm install \
    && echo "✅ Dependencies installed"

# Этап 3: Проверка TypeScript
RUN echo "=== Verifying TypeScript installation ===" \
    && npx tsc --version \
    && ls -la node_modules/.bin/tsc \
    && echo "✅ TypeScript verified"

# Этап 4: TypeScript компиляция с детальной диагностикой
RUN echo "=== Running TypeScript compilation ===" \
    && cat tsconfig.json \
    && npm run build \
    && echo "✅ TypeScript compilation completed"

# Этап 5: Проверка результатов сборки
RUN echo "=== Verifying build results ===" \
    && ls -la build/ \
    && ls -la build/index.js \
    && echo "Build directory contents:" \
    && find build -type f -name "*.js" | head -10

# Этап 6: Проверка исполняемости
RUN echo "=== Testing compiled code ===" \
    && node -e "console.log('Node.js execution test: ✅')" \
    && node -e "require.resolve('./build/index.js'); console.log('Module resolution test: ✅')" \
    && head -10 build/index.js \
    && echo "✅ Compiled code verified"

# Этап 7: Установка переменных окружения для Google Workspace MCP
ENV WORKSPACE_MCP_PORT=8081
ENV OAUTH_SERVER_HOST=0.0.0.0
ENV OAUTH_SERVER_PORT=8081
ENV MCP_MODE=true
ENV NODE_ENV=production

# Этап 8: Создание конфигурационных файлов
RUN echo "=== Creating configuration templates ===" \
    && mkdir -p /app/config \
    && echo '{"accounts":[]}' > /app/config/accounts.json \
    && echo "✅ Configuration templates created"

# Этап 9: Очистка dev-зависимостей
RUN echo "=== Cleaning dev dependencies ===" \
    && npm prune --omit=dev \
    && echo "✅ Dev dependencies cleaned"

# Этап 10: ИСПРАВЛЕННАЯ финальная проверка
RUN echo "=== Final verification ===" \
    && ls -la build/index.js \
    && stat build/index.js \
    && echo "=== File content preview ===" \
    && head -5 build/index.js \
    && echo "=== Node.js syntax check ===" \
    && node -c build/index.js \
    && echo "✅ Google Workspace MCP build completed successfully"

# Возвращаемся в корневой каталог
WORKDIR /app

# Финальная проверка всех MCP серверов
RUN echo "=== Final MCP servers verification ===" \
    && ls -la mcp-google-workspace/build/index.js \
    && ls -la sequentialthinking-mcp/dist/index.js \
    && ls -la mcp-context7/dist/index.js \
    && ls -la mcp-fetch/dist/index.js \
    && ls -la mcp-github-api/index.js \
    && echo "✅ All MCP servers verified"

# Сборка основного приложения LibreChat
RUN echo "=== Building LibreChat frontend ===" \
    && npm run frontend \
    && echo "✅ Frontend built successfully"

# Копирование конфигурации
COPY librechat.yaml /app/librechat.yaml

# Установка переменных окружения для production
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3080

# Настройки для Google Workspace MCP
ENV WORKSPACE_BASE_PATH=/app/workspace
ENV LOG_MODE=strict
ENV OAUTH_CALLBACK_PORT=8081

# Создание финальной структуры директорий
RUN mkdir -p /app/uploads /app/images /app/meilis_data

# Проверка здоровья контейнера
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3080/api/health || exit 1

# Экспорт портов
EXPOSE 3080 8081

# Точка входа с улучшенным логированием
CMD echo "=== Starting LibreChat ===" && \
    echo "Environment: $NODE_ENV" && \
    echo "Host: $HOST" && \
    echo "Port: $PORT" && \
    echo "Google Workspace MCP Port: $OAUTH_CALLBACK_PORT" && \
    echo "Starting server..." && \
    node api/server/index.js
