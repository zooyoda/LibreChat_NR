FROM node:20-alpine

WORKDIR /app

# Копируем package.json файлы для кэширования слоев
COPY package*.json ./
COPY client/package*.json ./client/
COPY api/package*.json ./api/

# Устанавливаем зависимости как root (избегаем проблем с правами доступа)
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Собираем фронтенд
RUN npm run frontend

# Создаем необходимые директории
RUN mkdir -p /app/client/public/images /app/api/logs

# Открываем порт 3080
EXPOSE 3080

# Устанавливаем переменные окружения
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# КРИТИЧЕСКИ ВАЖНО: Запускаем напрямую через node
CMD ["node", "api/server/index.js"]
