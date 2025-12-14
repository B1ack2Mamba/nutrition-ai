"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

const MACRO_KEYS: Array<keyof Macros> = [
    "calories",
    "protein",
    "fat",
    "carbs",
    "fiber",
];

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function createIngredient(name = "", amount = ""): Ingredient {
    return {
        id: crypto.randomUUID(),
        name,
        amount,
    };
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
    const [ingredients, setIngredients] = useState<Ingredient[]>([
        createIngredient(),
    ]);
    const [instructions, setInstructions] = useState("");
    const [notes, setNotes] = useState("");

    const [saving, setSaving] = useState(false);

    const [aiBusyDraft, setAiBusyDraft] = useState(false);
    const [aiBusyMacros, setAiBusyMacros] = useState(false);
    const [aiComment, setAiComment] = useState<string>("");

    useEffect(() => {
        const existing = getDishById(dishId);
        if (!existing) {
            setLoaded(true);
            setDish(null);
            return;
        }

        setDish(existing);
        setTitle(existing.title ?? "");
        setCategory(existing.category ?? "breakfast");
        setTimeMinutes(existing.timeMinutes);
        setMacros(existing.macros ?? {});
        setTags(existing.tags ?? []);
        setIngredients(
            (existing.ingredients?.length ? existing.ingredients : [createIngredient()]).map((x) => ({
                ...x,
            })),
        );
        setInstructions(existing.instructions ?? "");
        setNotes(existing.notes ?? "");
        setLoaded(true);
    }, [dishId]);

    const toggleTag = (tag: DishTag) => {
        setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    };

    const updateIngredient = (
        id: string,
        field: "name" | "amount" | "calories",
        value: string,
    ) => {
        setIngredients((prev) =>
            prev.map((ing) => {
                if (ing.id !== id) return ing;

                if (field === "calories") {
                    return {
                        ...ing,
                        calories: value === "" ? undefined : Number(value),
                    };
                }

                return {
                    ...ing,
                    [field]: value,
                };
            }),
        );
    };

    const addIngredientRow = () => {
        setIngredients((prev) => [...prev, createIngredient()]);
    };

    const removeIngredient = (id: string) => {
        setIngredients((prev) => prev.filter((ing) => ing.id !== id));
    };

    const handleAiAutofillDish = async () => {
        if (!title.trim()) return;

        setAiBusyDraft(true);
        setAiComment("");

        try {
            const payload = {
                title: title.trim(),
                category,
                ingredients: ingredients
                    .map((x) => ({ name: x.name?.trim(), amount: x.amount?.trim() }))
                    .filter((x) => (x.name ?? "").length > 0 || (x.amount ?? "").length > 0),
                language: "ru" as const,
            };

            const r = await fetch("/api/ai/dish-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const dataU: unknown = await r.json().catch(() => ({}));
            if (!r.ok) {
                const msg =
                    isObject(dataU) && typeof dataU["error"] === "string"
                        ? dataU["error"]
                        : `HTTP ${r.status}`;
                throw new Error(msg);
            }

            if (!isObject(dataU)) return;

            // title (optional)
            if (typeof dataU["title"] === "string" && dataU["title"].trim()) {
                setTitle(dataU["title"].trim());
            }

            // ingredients
            const ingU = dataU["ingredients"];
            if (Array.isArray(ingU) && ingU.length > 0) {
                const next: Ingredient[] = ingU
                    .filter(isObject)
                    .map((it) => {
                        const name = typeof it["name"] === "string" ? it["name"].trim() : "";
                        const amount = typeof it["amount"] === "string" ? it["amount"].trim() : "";
                        const caloriesRaw = it["calories"];
                        const calories =
                            typeof caloriesRaw === "number" && Number.isFinite(caloriesRaw)
                                ? caloriesRaw
                                : undefined;

                        return {
                            id: crypto.randomUUID(),
                            name,
                            amount,
                            calories,
                        };
                    })
                    .filter((x) => x.name || x.amount);

                setIngredients(next.length ? next : [createIngredient()]);
            }

            // instructions
            if (typeof dataU["instructions"] === "string") {
                setInstructions(dataU["instructions"]);
            }

            // macros (optional)
            const macrosU = dataU["macros"];
            if (isObject(macrosU)) {
                const next: Macros = { ...macros };

                for (const k of MACRO_KEYS) {
                    const v = macrosU[k as string];
                    if (typeof v === "number" && Number.isFinite(v)) {
                        next[k] = v;
                    }
                }
                setMacros(next);
            }

            // comment
            if (typeof dataU["comment"] === "string") {
                setAiComment(dataU["comment"]);
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Ошибка автозаполнения";
            alert(msg);
        } finally {
            setAiBusyDraft(false);
        }
    };

    const handleAiRecalcMacros = async () => {
        if (!title.trim()) return;

        setAiBusyMacros(true);
        setAiComment("");

        try {
            const ingredientsText = ingredients
                .map((x) => `${x.name?.trim() || ""} ${x.amount?.trim() || ""}`.trim())
                .filter(Boolean)
                .join(", ");

            const r = await fetch("/api/ai/dish-macros", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: title.trim(),
                    ingredients: ingredientsText,
                    language: "ru",
                }),
            });

            const dataU: unknown = await r.json().catch(() => ({}));
            if (!r.ok) {
                const msg =
                    isObject(dataU) && typeof dataU["error"] === "string"
                        ? dataU["error"]
                        : `HTTP ${r.status}`;
                throw new Error(msg);
            }

            if (isObject(dataU)) {
                const m = dataU["macros"];
                if (isObject(m)) {
                    const next: Macros = { ...macros };

                    for (const k of MACRO_KEYS) {
                        const v = m[k as string];
                        if (typeof v === "number" && Number.isFinite(v)) {
                            next[k] = v;
                        }
                    }
                    setMacros(next);
                }

                const comment =
                    typeof dataU["comment"] === "string"
                        ? dataU["comment"]
                        : typeof dataU["notes"] === "string"
                            ? dataU["notes"]
                            : "";
                if (comment) setAiComment(comment);
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Ошибка пересчёта КБЖУ";
            alert(msg);
        } finally {
            setAiBusyMacros(false);
        }
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
                macros,
                tags,
                ingredients: ingredients.filter((x) => x.name.trim() !== ""),
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
        return (
            <p className="text-sm text-red-500">
                Блюдо не найдено (возможно удалено).
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                        Редактировать блюдо
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Обнови данные блюда — они будут использоваться в рационах и рекомендациях.
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
                            onChange={(e) => setCategory(e.target.value as DishCategory)}
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
                                const v = e.target.value;
                                setTimeMinutes(v === "" ? undefined : Number(v));
                            }}
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>
                </section>

                {/* Макросы */}
                <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">Макронутриенты (опционально)</h3>

                        <div className="flex items-center gap-2">
                            {/* ВАЖНО: эта кнопка НЕ ПРОПАДАЕТ */}
                            <button
                                type="button"
                                onClick={handleAiAutofillDish}
                                disabled={aiBusyDraft || !title.trim()}
                                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                                {aiBusyDraft ? "ИИ заполняет..." : "Автозаполнить блюдо с ИИ"}
                            </button>

                            <button
                                type="button"
                                onClick={handleAiRecalcMacros}
                                disabled={aiBusyMacros || !title.trim()}
                                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                                {aiBusyMacros ? "Считаю..." : "Пересчитать КБЖУ с ИИ"}
                            </button>
                        </div>
                    </div>

                    {aiComment ? (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Комментарий ИИ: {aiComment}
                        </p>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-5">
                        {MACRO_KEYS.map((k) => (
                            <label key={k} className="flex flex-col gap-1 text-xs">
                                {k === "calories" && "Ккал"}
                                {k === "protein" && "Белки (г)"}
                                {k === "fat" && "Жиры (г)"}
                                {k === "carbs" && "Углеводы (г)"}
                                {k === "fiber" && "Клетчатка (г)"}
                                <input
                                    type="number"
                                    value={macros[k] ?? ""}
                                    onChange={(e) =>
                                        setMacros((prev) => ({
                                            ...prev,
                                            [k]: e.target.value === "" ? undefined : Number(e.target.value),
                                        }))
                                    }
                                    className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                />
                            </label>
                        ))}
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
                                            : "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
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
                                className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
                                        placeholder="Название (например, семга)"
                                        value={ing.name}
                                        onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                    <input
                                        placeholder="Кол-во (200 г, 2 шт)"
                                        value={ing.amount}
                                        onChange={(e) => updateIngredient(ing.id, "amount", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Ккал (опц.)"
                                        value={ing.calories ?? ""}
                                        onChange={(e) => updateIngredient(ing.id, "calories", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
                            className="min-h-[80px] rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Заметки для себя (опционально)
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                            className="min-h-[80px] rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
