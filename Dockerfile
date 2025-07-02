FROM node:20.19-alpine

WORKDIR /app

# Копируем package.json для всех подпроектов
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/
COPY mcp-telegram/package*.json ./mcp-telegram/
COPY sequentialthinking-mcp/package*.json ./sequentialthinking-mcp/

# Копируем исходный код
COPY . .

# Выставляем права
RUN chown -R node:node /app

USER node

# Устанавливаем dev-зависимости для сборки всего проекта
RUN npm ci --include=dev

# MCP-GITHUB-API: если нужен только рантайм, можно оставить --omit=dev
WORKDIR /app/mcp-github-api
RUN npm install --omit=dev

# MCP-TELEGRAM: для сборки нужны dev-зависимости!
WORKDIR /app/mcp-telegram
RUN npm install
RUN npm run build

# MCP-SEQUENTIALTHINKING: сборка и установка production-зависимостей
WORKDIR /app/sequentialthinking-mcp
RUN npm install # dev-зависимости нужны для сборки
RUN npm run build
RUN npm prune --omit=dev

# Вернуться в корень, собрать фронтенд и подготовить окружение LibreChat
WORKDIR /app
RUN npm run frontend
RUN mkdir -p /app/client/public/images /app/api/logs

# Копируем librechat.yaml
COPY librechat.yaml /app/librechat.yaml

EXPOSE 3080

ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "api/server/index.js"]
