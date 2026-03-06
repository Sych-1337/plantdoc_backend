# Plant Doctor Backend

API для мобильного приложения Plant Doctor: анализ фото растений (OpenAI) и чат с контекстом.

## Локальный запуск

```bash
npm install
cp .env.example .env
# Отредактируйте .env: задайте OPENAI_API_KEY
npm run dev
```

Сервер слушает порт 4000 (или значение `PORT` из `.env`).

## Деплой на Render

1. Создайте новый репозиторий на GitHub/GitLab и запушьте эту папку (корень репо = корень бэкенда).
2. В [Render](https://render.com): New → Web Service, подключите репозиторий.
3. Настройки:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `node dist/index.js`
   - **Environment:** добавьте переменную `OPENAI_API_KEY` (Secret).
4. Render сам задаёт `PORT` — сервер его читает.

После деплоя URL сервиса будет вида `https://<name>.onrender.com`. Этот URL нужно подставить в мобильное приложение как production API (через dart-define или конфиг).
