FROM node:20.19-alpine

# Устанавливаем системные зависимости для Playwright в Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget \
    xvfb-run

WORKDIR /app

# Копируем package.json для всех подпроектов
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/
COPY mcp-telegram/package*.json ./mcp-telegram/
COPY sequentialthinking-mcp/package*.json ./sequentialthinking-mcp/
COPY mcp-context7/package*.json ./mcp-context7/
COPY mcp-fetcher/package*.json ./mcp-fetcher/

# Копируем исходный код
COPY . .

# Выставляем права
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

# MCP-FETCHER: КРИТИЧЕСКИ ВАЖНО - НЕ удаляем dev-зависимости!
WORKDIR /app/mcp-fetcher

# Устанавливаем зависимости
RUN npm install

# Сначала устанавливаем браузеры, потом собираем
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Теперь собираем проект
RUN npm run build

# НЕ выполняем npm prune для mcp-fetcher - Playwright нужны некоторые зависимости в runtime
# RUN npm prune --omit=dev  # ЗАКОММЕНТИРОВАНО!

# Вернуться в корень
WORKDIR /app
RUN npm run frontend
RUN mkdir -p /app/client/public/images /app/api/logs

# Копируем librechat.yaml
COPY librechat.yaml /app/librechat.yaml

EXPOSE 3080

ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Переменные окружения для Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/app/mcp-fetcher/node_modules/.cache/ms-playwright
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=false

CMD ["node", "api/server/index.js"]
