"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Dish, listDishes } from "@/lib/dishes";
import { Menu, MealSlot, getMenuById } from "@/lib/menus";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
    { slot: "breakfast", label: "Завтрак" },
    { slot: "lunch", label: "Обед" },
    { slot: "dinner", label: "Ужин" },
    { slot: "snack", label: "Перекус" },
];

export default function MenuPreviewPage() {
    const router = useRouter();
    const params = useParams();

    const menuId =
        typeof params.id === "string"
            ? params.id
            : Array.isArray(params.id)
                ? params.id[0]
                : "";

    const [menu, setMenu] = useState<Menu | null>(null);
    const [dishesById, setDishesById] = useState<Map<string, Dish>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!menuId) {
            setMenu(null);
            setDishesById(new Map());
            setLoading(false);
            return;
        }

        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const [m, dishes] = await Promise.all([
                    getMenuById(menuId),
                    listDishes(),
                ]);
                if (!alive) return;
                setMenu(m);
                setDishesById(new Map(dishes.map((d) => [d.id, d])));
            } catch (e) {
                if (!alive) return;
                setError(e instanceof Error ? e.message : "Не удалось загрузить рацион");
                setMenu(null);
                setDishesById(new Map());
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [menuId]);

    const prettyError = error;

    if (loading) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-zinc-500">Загрузка…</p>
            </div>
        );
    }

    if (!menu) {
        return (
            <div className="space-y-3">
                {prettyError ? (
                    <p className="text-sm text-red-500">{prettyError}</p>
                ) : (
                    <p className="text-sm text-red-500">
                        Рацион не найден. Возможно, он был удалён.
                    </p>
                )}
                <button
                    type="button"
                    onClick={() => router.push("/nutritionist/menus")}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                    Назад к списку рационов
                </button>
            </div>
        );
    }

    return (
        <main className="space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {menu.title}
                    </h1>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        План питания на {menu.daysCount} дней.
                    </p>
                    {menu.targetCalories && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Ориентировочно ~{menu.targetCalories} ккал/день
                        </p>
                    )}
                    {menu.description && (
                        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                            {menu.description}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-2 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        Распечатать / сохранить в PDF
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            router.push(`/nutritionist/menus/${menu.id}`)
                        }
                        className="text-xs underline underline-offset-2"
                    >
                        Вернуться к редактированию
                    </button>
                </div>
            </header>

            <section className="space-y-4">
                {menu.days.map((day) => (
                    <div
                        key={day.index}
                        className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                        <h2 className="text-base font-semibold">
                            День {day.index}
                        </h2>
                        {day.note && (
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {day.note}
                            </p>
                        )}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {MEAL_SLOTS.map(({ slot, label }) => {
                                const meals = day.meals as Partial<
                                    Record<MealSlot, string | null | undefined>
                                >;
                                const dishId = meals[slot] ?? null;
                                const dish = dishId ? dishesById.get(dishId) : null;

                                return (
                                    <div
                                        key={slot}
                                        className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                                    >
                                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                            {label}
                                        </div>
                                        <div className="text-sm text-zinc-900 dark:text-zinc-100">
                                            {dish ? dish.title : "— не задано —"}
                                        </div>
                                    </div>
                                );
                            })}

                        </div>
                    </div>
                ))}
            </section>
        </main>
    );
}
