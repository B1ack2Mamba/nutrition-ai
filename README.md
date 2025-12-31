# Nutrition AI

Веб‑приложение (Next.js) с кабинетами клиента и специалиста по питанию.

## PWA (как приложение на телефоне)

В проект добавлен PWA-режим:
- `public/manifest.webmanifest`
- `public/sw.js` (service worker)
- `components/ServiceWorkerRegister.tsx` (авторегистрация SW)
- страница-инструкция: `/install`

### Условия
- Нужен **HTTPS** на домене (на localhost тоже ок).
- На iPhone установка делается через Safari → “На экран «Домой»”.
- На Android Chrome предложит “Установить приложение”.

## Android APK (без магазинов, по прямой ссылке)

### Идея (рекомендуется)
APK — это тонкая оболочка (WebView), которая открывает ваш сайт по HTTPS.
Плюс: обновили сайт → “приложение” обновилось сразу, без переустановки APK.

### Шаги
1) Открой `capacitor.config.json` и впиши ваш домен:
```json
server: {
  url: "https://YOUR_DOMAIN_HERE",
  cleartext: false
}
```

2) Установи зависимости и добавь Android-проект:
```bash
npm i
npx cap add android
npx cap sync android
npx cap open android
```

3) В Android Studio:
- Build → Generate Signed Bundle / APK → APK → Release
- собранный файл `.apk` положи в `public/downloads/nutrition-ai.apk`
- на сайте файл будет доступен по адресу:
  `/downloads/nutrition-ai.apk`

### Установка на Android
Пользователь скачивает APK и при первом запуске разрешает “Установка из неизвестных источников” (Install unknown apps).

## Локальная разработка
```bash
npm run dev
```

Открой: http://localhost:3000


## Уведомления (Push)

Поддерживаются **Web Push** уведомления (PWA).
На iPhone Web Push работает в iOS 16.4+ и только если сайт установлен “На экран Домой”.

### 1) Применить SQL
В Supabase SQL editor выполнить новый файл:

- `sql/05_notifications.sql`

### 2) Сгенерировать VAPID ключи
В корне проекта:

```bash
node scripts/generate-vapid.mjs
```

Скопируй переменные в окружение деплоя (Vercel/Render/сервер):

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (например `mailto:you@example.com`)
- `SUPABASE_SERVICE_ROLE_KEY` (нужен серверу, чтобы слать уведомления)

> `SUPABASE_SERVICE_ROLE_KEY` **нельзя** класть в клиент, только в server env.

### 3) Где включать
- Клиент: `/client/notifications`
- Специалист: `/nutritionist/notifications`

### Как это работает
- На странице уведомлений пользователь включает push → подписка сохраняется в `notification_devices`.
- Когда клиент сохраняет дневник/отчёт или специалист сохраняет план, сервер:
  1) пишет запись в `user_notifications`,
  2) шлёт “пинг” Web Push (может быть без payload), а контент берётся из ленты.

### APK (Capacitor)
Если вы используете APK (Capacitor WebView), **Web Push может не работать** как в браузере.
В таком случае самый надёжный путь — нативный Push через FCM (отдельная настройка).


## БАДы (план добавок)

Добавлен раздел «БАДы»:
- в кабинете специалиста: кнопка «ИИ → подобрать» + редактирование списка + сохранение клиенту
- в кабинете клиента: отображение назначенного списка в той же секции, где «Можно/Нельзя»

### Применить SQL
В Supabase SQL editor выполнить файл:

- `sql/06_supplements.sql`
