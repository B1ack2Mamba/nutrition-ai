"use client";

// app/nutritionist/menus/page.tsx

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Menu,
  listMenus,
  deleteMenu,
} from "@/lib/menus";

function formatGoal(goal?: Menu["goal"]): string {
  switch (goal) {
    case "fat_loss":
      return "Похудение";
    case "muscle_gain":
      return "Набор мышц";
    case "maintenance":
      return "Поддержание";
    case "energy":
      return "Энергия / тонус";
    default:
      return "Без цели";
  }
}

export default function MenusPage() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const items = await listMenus();
        if (!alive) return;
        setMenus(items);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Не удалось загрузить рационы");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить этот рацион?")) return;
    try {
      await deleteMenu(id);
      setMenus((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить рацион");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Рационы
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Готовые наборы на 7/14 дней, собранные из твоих блюд.
          </p>
        </div>
        <Link
          href="/nutritionist/menus/new"
          className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
        >
          + Создать рацион
        </Link>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Загрузка рационов...
        </p>
      ) : menus.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
          Пока нет ни одного рациона. Нажми «Создать рацион», выбери
          цель, длительность и заполни дни блюдами из базы.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {menus.map((menu) => (
            <article
              key={menu.id}
              className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="space-y-1">
                <h3 className="text-base font-semibold">
                  {menu.title}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatGoal(menu.goal)} • {menu.daysCount} дней
                  {menu.targetCalories
                    ? ` • ~${menu.targetCalories} ккал/день`
                    : ""}
                </p>
                {menu.description && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {menu.description}
                  </p>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  Создан:{" "}
                  {new Date(menu.createdAt).toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <Link
                    href={`/nutritionist/menus/${menu.id}`}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Открыть
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(menu.id)}
                    className="rounded-full border border-red-200 px-3 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
