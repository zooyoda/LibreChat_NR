FROM node:20.19-alpine

WORKDIR /app

# Копируем package.json файлы для кэширования слоев
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/

# Копируем исходный код (все файлы проекта)
COPY . .

# ВАЖНО: выставляем права на папку /app и её содержимое
RUN chown -R node:node /app

# Переключаемся на пользователя node
USER node

# Устанавливаем ВСЕ зависимости (включая dev) для сборки
RUN npm ci --include=dev

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
