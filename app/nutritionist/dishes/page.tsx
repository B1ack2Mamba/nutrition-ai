// app/nutritionist/dishes/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Dish, deleteDish, listMyDishes } from "@/lib/dishes";

export default function DishesPage() {
    const [items, setItems] = useState<Dish[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);

        const res = await listMyDishes();
        if (!res.ok) {
            setError(res.error);
            setItems([]);
            setLoading(false);
            return;
        }

        setItems(res.data);
        setLoading(false);
    }, []);

    // ⚠️ чтобы не ругался ESLint "setState in effect" — грузим в следующий тик
    useEffect(() => {
        const t = setTimeout(() => void reload(), 0);
        return () => clearTimeout(t);
    }, [reload]);

    const onDelete = useCallback(async (id: string) => {
        if (!confirm("Удалить блюдо?")) return;

        const res = await deleteDish(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }

        setItems((prev) => prev.filter((x) => x.id !== id));
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Блюда</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Твоя база блюд (хранится в БД Supabase).
                    </p>
                </div>

                <Link
                    href="/nutritionist/dishes/new"
                    className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                >
                    + Создать блюдо
                </Link>
            </header>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            {loading ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю блюда...</p>
            ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                    Пока нет блюд. Нажми «Создать блюдо».
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {items.map((d) => (
                        <article
                            key={d.id}
                            className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                        >
                            <div className="space-y-1">
                                <div className="text-base font-semibold">{d.title}</div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {d.category}
                                    {typeof d.timeMinutes === "number" ? ` • ${d.timeMinutes} мин` : ""}
                                    {typeof d.macros?.calories === "number" ? ` • ~${d.macros.calories} ккал` : ""}
                                </div>
                                {d.tags?.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {d.tags.slice(0, 6).map((t) => (
                                            <span
                                                key={t}
                                                className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                                            >
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-3 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => onDelete(d.id)}
                                    className="rounded-full border border-red-200 px-3 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                                >
                                    Удалить
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
