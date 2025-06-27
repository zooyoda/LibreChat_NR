FROM node:20.19-alpine AS nodebase

WORKDIR /app

# Копируем package.json для кэширования слоев
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/
COPY mcp-github-api/package*.json ./mcp-github-api/

COPY . .

RUN chown -R node:node /app
USER node

RUN npm ci --include=dev

WORKDIR /app/mcp-github-api
RUN npm install --omit=dev

WORKDIR /app

RUN npm run frontend

RUN mkdir -p /app/client/public/images /app/api/logs

COPY librechat.yaml /app/librechat.yaml

# --- MCP TELEGRAM STAGE ---
USER root
RUN apk add --no-cache python3 py3-pip py3-cryptography py3-virtualenv py3-pillow py3-curl py3-gcc py3-musl-dev py3-openssl py3-libffi py3-setuptools py3-wheel py3-numpy py3-make
RUN apk add --no-cache nodejs npm
RUN npm install -g supergateway

WORKDIR /app/tg-mcp
COPY tg-mcp/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir --upgrade "mcp[cli]>=1.9.4"

COPY tg-mcp/ .

WORKDIR /app

EXPOSE 3080
EXPOSE 8004

ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Используем pm2 для запуска нескольких процессов (node + python через supergateway)
RUN npm install -g pm2

COPY pm2.config.js /app/pm2.config.js

CMD ["pm2-runtime", "pm2.config.js"]
