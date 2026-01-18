"use client";

import { useMemo } from "react";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
}

export default function InstallPage() {
  const platform = useMemo(() => {
    if (isIOS()) return "ios";
    if (isAndroid()) return "android";
    return "other";
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Установка приложения</h1>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {platform === "ios" && (
          <ol className="list-decimal space-y-2 pl-5">
            <li>Открой сайт в <b>Safari</b>.</li>
            <li>Нажми кнопку <b>Поделиться</b> (квадрат со стрелкой вверх).</li>
            <li>Выбери <b>На экран «Домой»</b> → <b>Добавить</b>.</li>
          </ol>
        )}

        {platform === "android" && (
          <ol className="list-decimal space-y-2 pl-5">
            <li>Открой сайт в <b>Chrome</b>.</li>
            <li>Нажми меню (⋮) → <b>Установить приложение</b> / <b>Добавить на главный экран</b>.</li>
            <li>Готово: иконка появится как у обычного приложения.</li>
          </ol>
        )}

        {platform === "other" && (
          <div className="space-y-2">
            <p>Открой сайт на телефоне:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>iPhone:</b> Safari → Поделиться → На экран «Домой»</li>
              <li><b>Android:</b> Chrome → Установить приложение</li>
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">APK для Android (по ссылке)</h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Если хочешь распространять именно установочный файл, собери APK через Capacitor и положи его в <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">/public/downloads</code>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
            href="/downloads/nutrition-ai.apk"
          >
            Скачать APK (если доступно)
          </a>
        </div>
      </div>
    </div>
  );
}
