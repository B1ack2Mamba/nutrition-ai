"use client";

import Link from "next/link";
import { useState } from "react";
import {
    Dish,
    deleteDish,
    loadDishesFromStorage,
} from "@/lib/dishes";

export default function DishesPage() {
    // ленивый инициализатор — читаем из localStorage один раз
    const [dishes, setDishes] = useState<Dish[]>(() =>
        loadDishesFromStorage(),
    );

    const handleDelete = (id: string) => {
        if (!confirm("Удалить это блюдо?")) return;
        deleteDish(id);
        setDishes((prev) => prev.filter((d) => d.id !== id));
    };

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                        Мои блюда
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Здесь ты создаёшь базу блюд, из которых потом будут собираться
                        рационы для клиентов и для ИИ.
                    </p>
                </div>
                <Link
                    href="/nutritionist/dishes/new"
                    className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                >
                    + Добавить блюдо
                </Link>
            </header>

            {dishes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                    Пока нет ни одного блюда. Нажми «Добавить блюдо», чтобы создать
                    первое — например, твой базовый завтрак, обед или перекус.
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {dishes.map((dish) => (
                        <article
                            key={dish.id}
                            className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                        >
                            <div className="space-y-1">
                                <h3 className="text-base font-semibold">{dish.title}</h3>
                                <p className="text-xs uppercase text-zinc-500 dark:text-zinc-400">
                                    {dish.category === "breakfast" && "Завтрак"}
                                    {dish.category === "lunch" && "Обед"}
                                    {dish.category === "dinner" && "Ужин"}
                                    {dish.category === "snack" && "Перекус"}
                                    {dish.timeMinutes
                                        ? ` • ~${dish.timeMinutes} мин`
                                        : null}
                                </p>

                                {dish.macros && (
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {dish.macros.calories && (
                                            <span>Ккал: {dish.macros.calories} • </span>
                                        )}
                                        {dish.macros.protein && (
                                            <span>Б: {dish.macros.protein} г • </span>
                                        )}
                                        {dish.macros.fat && (
                                            <span>Ж: {dish.macros.fat} г • </span>
                                        )}
                                        {dish.macros.carbs && (
                                            <span>У: {dish.macros.carbs} г</span>
                                        )}
                                    </p>
                                )}

                                {dish.tags.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {dish.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                                            >
                                                {tag === "vegan" && "Веган"}
                                                {tag === "vegetarian" && "Вегетарианское"}
                                                {tag === "gluten_free" && "Без глютена"}
                                                {tag === "lactose_free" && "Без лактозы"}
                                                {tag === "no_added_sugar" && "Без сахара"}
                                                {tag === "halal" && "Халяль"}
                                                {tag === "kosher" && "Кошер"}
                                                {tag === "diabetic_friendly" && "Подходит при СД"}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {dish.ingredients.length > 0 && (
                                <ul className="mt-3 space-y-1 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                    {dish.ingredients.slice(0, 4).map((ing) => (
                                        <li key={ing.id} className="flex justify-between gap-2">
                                            <span>{ing.name}</span>
                                            <span className="text-[11px] text-zinc-500">
                                                {ing.amount}
                                            </span>
                                        </li>
                                    ))}
                                    {dish.ingredients.length > 4 && (
                                        <li className="text-[11px] text-zinc-500">
                                            + ещё {dish.ingredients.length - 4} ингредиентов
                                        </li>
                                    )}
                                </ul>
                            )}

                            <div className="mt-3 flex items-center justify-end gap-2">
                                <Link
                                    href={`/nutritionist/dishes/${dish.id}`}
                                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                >
                                    Редактировать
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(dish.id)}
                                    className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
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
