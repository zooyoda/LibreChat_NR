FROM node:20.19-alpine

WORKDIR /app

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

# Выставляем права и переключаемся на пользователя node
RUN chown -R node:node /app
USER node

# Устанавливаем dev-зависимости для сборки всего проекта
RUN npm ci --include=dev

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

# MCP-GOOGLE-WORKSPACE: ИСПРАВЛЕННАЯ ВЕРСИЯ С ОТЛАДКОЙ
WORKDIR /app/mcp-google-workspace

# Отладочная информация - проверяем начальное состояние
RUN echo "=== Google Workspace MCP: Initial state ==="
RUN pwd
RUN echo "=== Checking package.json ==="
RUN ls -la package.json
RUN echo "=== Checking source files ==="
RUN ls -la src/
RUN echo "=== Checking for TypeScript config ==="
RUN ls -la tsconfig.json
RUN echo "=== Checking for docker-entrypoint.sh ==="
RUN ls -la docker-entrypoint.sh

# Устанавливаем зависимости включая dev (нужен typescript для сборки)
RUN echo "=== Installing dependencies ==="
RUN npm install

# Проверяем установку TypeScript
RUN echo "=== Checking TypeScript installation ==="
RUN npx tsc --version || echo "TypeScript not found in local node_modules"
RUN ls -la node_modules/.bin/tsc || echo "tsc binary not found"

# Компилируем TypeScript с подробным выводом
RUN echo "=== Running TypeScript compilation ==="
RUN npm run build

# Детальная проверка результата сборки
RUN echo "=== Checking build results ==="
RUN ls -la build/ || echo "Build directory not found"
RUN echo "=== Checking for main index.js ==="
RUN ls -la build/index.js || echo "index.js not found in build/"
RUN echo "=== Checking build directory structure ==="
RUN find build -type f -name "*.js" 2>/dev/null | head -10 || echo "No JS files found in build/"

# Проверяем содержимое скомпилированного файла
RUN echo "=== Checking compiled index.js content ==="
RUN head -20 build/index.js 2>/dev/null || echo "Cannot read index.js"

# Проверяем права доступа
RUN echo "=== Checking file permissions ==="
RUN ls -la build/index.js 2>/dev/null || echo "Cannot check permissions for index.js"

# Тест запуска Node.js
RUN echo "=== Testing Node.js execution ==="
RUN node --version
RUN echo "=== Testing if index.js can be loaded ==="
RUN node -e "console.log('Node.js test successful')"

# Очищаем dev-зависимости
RUN echo "=== Cleaning dev dependencies ==="
RUN npm prune --omit=dev

# Финальная проверка из корневого каталога
WORKDIR /app
RUN echo "=== Final verification from root ==="
RUN ls -la mcp-google-workspace/build/index.js || echo "Final check failed"

# Создаем необходимые директории
RUN mkdir -p /app/config /app/logs /app/workspace

# Продолжаем сборку основного приложения
RUN npm run frontend
RUN mkdir -p /app/client/public/images /app/api/logs

# Копируем librechat.yaml
COPY librechat.yaml /app/librechat.yaml

EXPOSE 3080

ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "api/server/index.js"]
