# v0.7.8

# Base node image
FROM node:20-alpine AS node

# Install jemalloc
RUN apk add --no-cache jemalloc
RUN apk add --no-cache python3 py3-pip uv

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.6.13 /uv /uvx /bin/
RUN uv --version

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

# Копируем только основные package.json файлы
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
# УБИРАЕМ эту строку: COPY packages/*/package*.json ./packages/*/

# Устанавливаем зависимости как root
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 15000 && \
    npm install --no-audit

# Переключаемся на пользователя node
USER node

# Копируем исходный код (включая packages)
COPY --chown=node:node . .

# Устанавливаем зависимости после копирования всего кода
RUN npm install --no-audit

RUN \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/api/logs ; \
    # React client build
    NODE_OPTIONS="--max-old-space-size=2048" npm run frontend; \
    npm cache clean --force

RUN mkdir -p /app/client/public/images /app/api/logs

# Используем порт 3080
EXPOSE 3080
ENV HOST=0.0.0.0

# Запускаем напрямую через node
CMD ["node", "api/server/index.js"]
