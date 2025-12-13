"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
    Dish,
    DishCategory,
    DishTag,
    Ingredient,
    Macros,
    getDishById,
    updateDish,
} from "@/lib/dishes";

const ALL_TAGS: { value: DishTag; label: string }[] = [
    { value: "vegan", label: "Веган" },
    { value: "vegetarian", label: "Вегетарианское" },
    { value: "gluten_free", label: "Без глютена" },
    { value: "lactose_free", label: "Без лактозы" },
    { value: "no_added_sugar", label: "Без добавленного сахара" },
    { value: "halal", label: "Халяль" },
    { value: "kosher", label: "Кошер" },
    { value: "diabetic_friendly", label: "Подходит при СД" },
];

function cloneIngredient(ing: Ingredient): Ingredient {
    return { ...ing };
}

export default function EditDishPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const dishId = params.id;

    const [loaded, setLoaded] = useState(false);
    const [dish, setDish] = useState<Dish | null>(null);

    const [title, setTitle] = useState("");
    const [category, setCategory] = useState<DishCategory>("breakfast");
    const [timeMinutes, setTimeMinutes] = useState<number | undefined>(undefined);
    const [macros, setMacros] = useState<Macros>({});
    const [tags, setTags] = useState<DishTag[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [instructions, setInstructions] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);

    // загрузка блюда с клиента
    useEffect(() => {
        const existing = getDishById(dishId);
        if (!existing) {
            setLoaded(true);
            setDish(null);
            return;
        }
        setDish(existing);
        setTitle(existing.title);
        setCategory(existing.category);
        setTimeMinutes(existing.timeMinutes);
        setMacros(existing.macros ?? {});
        setTags(existing.tags ?? []);
        setIngredients(
            (existing.ingredients ?? []).map((ing) => cloneIngredient(ing)),
        );
        setInstructions(existing.instructions ?? "");
        setNotes(existing.notes ?? "");
        setLoaded(true);
    }, [dishId]);

    const toggleTag = (tag: DishTag) => {
        setTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
        );
    };

    const updateIngredient = (
        id: string,
        field: "name" | "amount" | "calories",
        value: string,
    ) => {
        setIngredients((prev) =>
            prev.map((ing) =>
                ing.id === id
                    ? {
                        ...ing,
                        [field]:
                            field === "calories" && value !== ""
                                ? Number(value)
                                : field === "calories"
                                    ? undefined
                                    : value,
                    }
                    : ing,
            ),
        );
    };

    const addIngredientRow = () => {
        setIngredients((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                name: "",
                amount: "",
            },
        ]);
    };

    const removeIngredient = (id: string) => {
        setIngredients((prev) => prev.filter((ing) => ing.id !== id));
    };

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!dish || !title.trim()) return;

        setSaving(true);

        try {
            const now = new Date().toISOString();

            const updated: Dish = {
                ...dish,
                title: title.trim(),
                category,
                timeMinutes,
                ingredients: ingredients.filter((ing) => ing.name.trim() !== ""),
                macros,
                tags,
                instructions: instructions.trim() || undefined,
                notes: notes.trim() || undefined,
                updatedAt: now,
            };

            updateDish(updated);
            router.push("/nutritionist/dishes");
        } finally {
            setSaving(false);
        }
    };

    if (!loaded) {
        return <p className="text-sm text-zinc-500">Загрузка...</p>;
    }

    if (loaded && !dish) {
        notFound();
    }

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                        Редактировать блюдо
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Обнови данные блюда — они будут использоваться в рационах и
                        рекомендациях.
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
                        Название блюда
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Категория
                        <select
                            value={category}
                            onChange={(e) =>
                                setCategory(e.target.value as DishCategory)
                            }
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        >
                            <option value="breakfast">Завтрак</option>
                            <option value="lunch">Обед</option>
                            <option value="dinner">Ужин</option>
                            <option value="snack">Перекус</option>
                        </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Время готовки (мин)
                        <input
                            type="number"
                            min={1}
                            value={timeMinutes ?? ""}
                            onChange={(e) => {
                                const value = e.target.value;
                                setTimeMinutes(
                                    value === "" ? undefined : Number(value),
                                );
                            }}
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>
                </section>

                {/* Макросы */}
                <section className="space-y-2">
                    <h3 className="text-sm font-medium">Макронутриенты (опционально)</h3>
                    <div className="grid gap-3 sm:grid-cols-5">
                        <label className="flex flex-col gap-1 text-xs">
                            Ккал
                            <input
                                type="number"
                                value={macros.calories ?? ""}
                                onChange={(e) =>
                                    setMacros((prev) => ({
                                        ...prev,
                                        calories:
                                            e.target.value === ""
                                                ? undefined
                                                : Number(e.target.value),
                                    }))
                                }
                                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                            Белки (г)
                            <input
                                type="number"
                                value={macros.protein ?? ""}
                                onChange={(e) =>
                                    setMacros((prev) => ({
                                        ...prev,
                                        protein:
                                            e.target.value === ""
                                                ? undefined
                                                : Number(e.target.value),
                                    }))
                                }
                                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-зinc-200"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                            Жиры (г)
                            <input
                                type="number"
                                value={macros.fat ?? ""}
                                onChange={(e) =>
                                    setMacros((prev) => ({
                                        ...prev,
                                        fat:
                                            e.target.value === ""
                                                ? undefined
                                                : Number(e.target.value),
                                    }))
                                }
                                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-зinc-200"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                            Углеводы (г)
                            <input
                                type="number"
                                value={macros.carbs ?? ""}
                                onChange={(e) =>
                                    setMacros((prev) => ({
                                        ...prev,
                                        carbs:
                                            e.target.value === ""
                                                ? undefined
                                                : Number(e.target.value),
                                    }))
                                }
                                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                            Клетчатка (г)
                            <input
                                type="number"
                                value={macros.fiber ?? ""}
                                onChange={(e) =>
                                    setMacros((prev) => ({
                                        ...prev,
                                        fiber:
                                            e.target.value === ""
                                                ? undefined
                                                : Number(e.target.value),
                                    }))
                                }
                                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                            />
                        </label>
                    </div>
                </section>

                {/* Теги */}
                <section className="space-y-2">
                    <h3 className="text-sm font-medium">Ограничения / особенности</h3>
                    <div className="flex flex-wrap gap-2">
                        {ALL_TAGS.map((tag) => {
                            const active = tags.includes(tag.value);
                            return (
                                <button
                                    key={tag.value}
                                    type="button"
                                    onClick={() => toggleTag(tag.value)}
                                    className={
                                        active
                                            ? "rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                                            : "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-зinc-900"
                                    }
                                >
                                    {tag.label}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Ингредиенты */}
                <section className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Ингредиенты</h3>
                        <button
                            type="button"
                            onClick={addIngredientRow}
                            className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-200"
                        >
                            + Добавить ингредиент
                        </button>
                    </div>

                    <div className="space-y-2">
                        {ingredients.map((ing, index) => (
                            <div
                                key={ing.id}
                                className="grid gap-2 rounded-lg border border-зinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">#{index + 1}</span>
                                    {ingredients.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeIngredient(ing.id)}
                                            className="text-[11px] text-red-500 hover:underline"
                                        >
                                            Удалить
                                        </button>
                                    )}
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr]">
                                    <input
                                        placeholder="Название (например, яйцо)"
                                        value={ing.name}
                                        onChange={(e) =>
                                            updateIngredient(ing.id, "name", e.target.value)
                                        }
                                        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                    <input
                                        placeholder="Кол-во (2 шт, 100 г)"
                                        value={ing.amount}
                                        onChange={(e) =>
                                            updateIngredient(ing.id, "amount", e.target.value)
                                        }
                                        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Ккал (опц.)"
                                        value={ing.calories ?? ""}
                                        onChange={(e) =>
                                            updateIngredient(ing.id, "calories", e.target.value)
                                        }
                                        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Инструкции и заметки */}
                <section className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                        Инструкция приготовления (опционально)
                        <textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            rows={4}
                            className="min-h-[80px] rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Заметки для себя (опционально)
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                            className="min-h-[80px] rounded-lg border border-зinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
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
                        disabled={saving}
                        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                    >
                        {saving ? "Сохраняю..." : "Сохранить изменения"}
                    </button>
                </div>
            </form>
        </div>
    );
}
