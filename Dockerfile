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
COPY mcp-fetcher/package*.json ./mcp-fetcher/

# Копируем исходный код
COPY . .

# Выставляем права
RUN chown -R node:node /app

# КРИТИЧЕСКИ ВАЖНО: Устанавливаем системные зависимости ДО переключения на node
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget \
    xvfb-run \
    # Дополнительные зависимости для Playwright
    gcompat \
    libc6-compat \
    libxcomposite \
    libxdamage \
    libxext \
    libxi \
    libxtst \
    && rm -rf /var/cache/apk/*

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

# MCP-FETCHER: Используем системный Chromium вместо Playwright
WORKDIR /app/mcp-fetcher
RUN npm install
RUN npm run build

# НЕ устанавливаем браузеры Playwright - используем системный Chromium
# УДАЛЕНО: RUN npx playwright install chromium
# УДАЛЕНО: RUN npx playwright install-deps chromium

# Вернуться в корень
WORKDIR /app
RUN npm run frontend
RUN mkdir -p /app/client/public/images /app/api/logs

# Копируем librechat.yaml
COPY librechat.yaml /app/librechat.yaml

EXPOSE 3080

ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Переменные окружения для использования системного Chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_CHROMIUM_HEADLESS=true
ENV PLAYWRIGHT_CHROMIUM_ARGS="--no-sandbox,--disable-dev-shm-usage,--disable-gpu,--disable-web-security"

CMD ["node", "api/server/index.js"]
