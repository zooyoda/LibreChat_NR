FROM node:20.19-alpine

WORKDIR /app

# Копируем package.json файлы для кэширования слоев
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/
COPY mcp-telegram/package*.json ./mcp-telegram/

# Копируем исходный код (все файлы проекта)
COPY . .

# ВАЖНО: выставляем права на папку /app и её содержимое
RUN chown -R node:node /app

# Переключаемся на пользователя node
USER node

# Устанавливаем ВСЕ зависимости (включая dev) для сборки во всех подпроектах
RUN npm ci --include=dev

# MCP-GITHUB-API: если нужен только рантайм, можно оставить --omit=dev
WORKDIR /app/mcp-github-api
RUN npm install --omit=dev

# MCP-TELEGRAM: для сборки нужны dev-зависимости!
WORKDIR /app/mcp-telegram
RUN npm install # <--- без --omit=dev
RUN npm run build
# (опционально после сборки: RUN npm prune --production)

# Возвращаемся в корень
WORKDIR /app

# Собираем фронтенд
RUN npm run frontend

# Создаем необходимые директории (права уже будут корректные)
RUN mkdir -p /app/client/public/images /app/api/logs

# копируем librechat.yaml (если нужно — уже в правильного пользователя)
COPY librechat.yaml /app/librechat.yaml

EXPOSE 3080

ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "api/server/index.js"]
