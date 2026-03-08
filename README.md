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

## Хранение прав (entitlements) в Firebase

Чтобы данные о покупках (кофе, премиум) не терялись при перезапуске сервера, настройте **Firebase Realtime Database** (тот же проект, что и для аналитики):

1. В [Firebase Console](https://console.firebase.google.com) → ваш проект → **Project settings** → **Service accounts** → **Generate new private key**. Скачайте JSON.
2. В Render (или в `.env` локально) добавьте переменные:
   - **FIREBASE_DATABASE_URL** — URL вашей Realtime Database, например:  
     `https://plant-doctor-ai-a383c-default-rtdb.firebaseio.com`
   - **FIREBASE_SERVICE_ACCOUNT_JSON** — содержимое скачанного JSON-файла **как одна строка** (в Render: вставить в Secret / Environment).
3. Перезапустите сервис. В логах должно появиться: `Firebase Realtime Database connected for entitlements.`

Данные пишутся в путь `entitlements/{anonymousId}`. Личные данные не хранятся, только флаги покупок и даты.

Если переменные не заданы, сервер работает с **in-memory** хранилищем (данные теряются при рестарте).
