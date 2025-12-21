"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dish, listDishes } from "@/lib/dishes";
import {
    MenuDay,
    MenuGoal,
    MealSlot,
    createMenu,
} from "@/lib/menus";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
    { slot: "breakfast", label: "Завтрак" },
    { slot: "lunch", label: "Обед" },
    { slot: "dinner", label: "Ужин" },
    { slot: "snack", label: "Перекус" },
];

function createEmptyDays(count: number): MenuDay[] {
    return Array.from({ length: count }, (_, i) => ({
        index: i + 1,
        label: `Day ${i + 1}`,
        meals: {},
    }));
}

export default function NewMenuPage() {
    const router = useRouter();

    const [dishes, setDishes] = useState<Dish[]>([]);
    const [dishesLoading, setDishesLoading] = useState(true);
    const [dishesError, setDishesError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setDishesLoading(true);
                setDishesError(null);
                const items = await listDishes();
                if (!alive) return;
                setDishes(items);
            } catch (e) {
                if (!alive) return;
                const msg = e instanceof Error ? e.message : "Не удалось загрузить блюда.";
                setDishesError(msg);
            } finally {
                if (alive) setDishesLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const [title, setTitle] = useState("");
    const [goal, setGoal] = useState<MenuGoal | undefined>("fat_loss");
    const [daysCount, setDaysCount] = useState<number>(7);
    const [targetCalories, setTargetCalories] = useState<number | undefined>();
    const [description, setDescription] = useState("");
    const [days, setDays] = useState<MenuDay[]>(() => createEmptyDays(7));
    const [saving, setSaving] = useState(false);

    const handleDaysCountChange = (value: string) => {
        const num = Number(value);
        setDaysCount(num);
        setDays(createEmptyDays(num));
    };

    const handleMealSelect = (
        dayIndex: number,
        slot: MealSlot,
        dishId: string,
    ) => {
        setDays((prev) =>
            prev.map((day) =>
                day.index === dayIndex
                    ? {
                        ...day,
                        meals: {
                            ...day.meals,
                            [slot]: dishId === "" ? null : dishId,
                        },
                    }
                    : day,
            ),
        );
    };

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!title.trim()) return;

        setSaving(true);
        (async () => {
            try {
                await createMenu({
                    title: title.trim(),
                    goal,
                    daysCount,
                    targetCalories,
                    description: description.trim() || undefined,
                    days,
                });
                router.push("/nutritionist/menus");
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Не удалось создать рацион.";
                alert(msg);
            } finally {
                setSaving(false);
            }
        })();
    };

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                        Новый рацион
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Задай цель, длительность и заполни дни блюдами из базы.
                    </p>
                </div>
            </header>

            <form
                onSubmit={onSubmit}
                className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
                {/* Основная информация */}
                <section className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                        Название рациона
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            placeholder="Похудение 1600 ккал (7 дней)"
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Цель
                        <select
                            value={goal ?? ""}
                            onChange={(e) =>
                                setGoal(
                                    e.target.value === ""
                                        ? undefined
                                        : (e.target.value as MenuGoal),
                                )
                            }
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        >
                            <option value="fat_loss">Похудение</option>
                            <option value="muscle_gain">Набор мышц</option>
                            <option value="maintenance">Поддержание</option>
                            <option value="energy">Энергия / тонус</option>
                        </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Длительность
                        <select
                            value={daysCount}
                            onChange={(e) => handleDaysCountChange(e.target.value)}
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-зinc-200"
                        >
                            <option value={7}>7 дней</option>
                            <option value={14}>14 дней</option>
                        </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Целевая калорийность (ккал/день, опц.)
                        <input
                            type="number"
                            min={800}
                            max={5000}
                            value={targetCalories ?? ""}
                            onChange={(e) =>
                                setTargetCalories(
                                    e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                )
                            }
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
                </section>

                <section className="space-y-2">
                    <label className="flex flex-col gap-1 text-sm">
                        Описание (опционально)
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Кому подходит, особенности, на что обратить внимание."
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
                </section>

                {/* Дни и слоты */}
                <section className="space-y-3">
                    <h3 className="text-sm font-medium">
                        Заполнение по дням и приёмам пищи
                    </h3>
                    {dishes.length === 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Сначала создай хотя бы одно блюдо в разделе «Мои блюда».
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {days.map((day) => (
                                <div
                                    key={day.index}
                                    className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">
                                            День {day.index}
                                        </span>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {MEAL_SLOTS.map((slot) => (
                                            <label
                                                key={slot.slot}
                                                className="flex flex-col gap-1 text-xs"
                                            >
                                                {slot.label}
                                                <select
                                                    value={
                                                        (day.meals[slot.slot] as string | null) ?? ""
                                                    }
                                                    onChange={(e) =>
                                                        handleMealSelect(
                                                            day.index,
                                                            slot.slot,
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                                >
                                                    <option value="">— Не выбрано —</option>
                                                    {dishes.map((dish) => (
                                                        <option key={dish.id} value={dish.id}>
                                                            {dish.title}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                        Отмена
                    </button>
                    <button
                        type="submit"
                        disabled={saving || dishes.length === 0}
                        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-зinc-200"
                    >
                        {saving ? "Сохраняю..." : "Сохранить рацион"}
                    </button>
                </div>
            </form>
        </div>
    );
}
