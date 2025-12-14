"use client";

// app/nutritionist/dishes/new/page.tsx
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dish,
  DishCategory,
  DishTag,
  Ingredient,
  Macros,
  saveDishesToStorage,
  loadDishesFromStorage,
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

type MacrosApiOut = {
  macros?: {
    calories?: number | null;
    protein?: number | null;
    fat?: number | null;
    carbs?: number | null;
    fiber?: number | null;
  };
  comment?: string;
};

type AutofillOut = {
  title?: string;
  category?: DishCategory;
  timeMinutes?: number;
  ingredients?: Array<{ name: string; amount?: string }>;
  instructions?: string;
  notes?: string;
  // опционально может вернуть сразу и макросы
  macros?: {
    calories?: number | null;
    protein?: number | null;
    fat?: number | null;
    carbs?: number | null;
    fiber?: number | null;
  };
  comment?: string;
};

function makeIngredient(name = "", amount = ""): Ingredient {
  return {
    id: crypto.randomUUID(),
    name,
    amount,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

function numU(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `HTTP ${r.status}`);
  }

  return (await r.json()) as T;
}

export default function NewDishPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DishCategory>("breakfast");
  const [timeMinutes, setTimeMinutes] = useState<number | undefined>(15);
  const [macros, setMacros] = useState<Macros>({});
  const [tags, setTags] = useState<DishTag[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    makeIngredient(),
  ]);
  const [instructions, setInstructions] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiMacrosBusy, setAiMacrosBusy] = useState(false);
  const [aiComment, setAiComment] = useState<string>("");

  const ingredientsText = useMemo(() => {
    const parts = ingredients
      .map((i) => {
        const n = i.name?.trim();
        if (!n) return "";
        const a = i.amount?.trim();
        return a ? `${a} ${n}` : n;
      })
      .filter(Boolean);
    return parts.join(", ");
  }, [ingredients]);

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
    setIngredients((prev) => [...prev, makeIngredient()]);
  };

  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  // === AI: автозаполнение блюда (ингредиенты/граммовки/инструкция) ===
  const handleAiAutofill = async () => {
    const dishName = title.trim();
    if (!dishName) {
      alert("Сначала укажи название блюда — по нему ИИ поймёт, что заполнять.");
      return;
    }

    setAiBusy(true);
    setAiComment("");

    try {
      const out = await postJson<AutofillOut>("/api/ai/dish-autofill", {
        name: dishName,
        category,
        timeMinutes,
        // если уже что-то накидал — можно дать контекст
        ingredients: ingredientsText || undefined,
        instructions: instructions.trim() || undefined,
      });

      if (typeof out.title === "string" && out.title.trim()) {
        setTitle(out.title.trim());
      }
      if (out.category) setCategory(out.category);
      if (typeof out.timeMinutes === "number" && Number.isFinite(out.timeMinutes)) {
        setTimeMinutes(out.timeMinutes);
      }

      if (Array.isArray(out.ingredients) && out.ingredients.length > 0) {
        setIngredients(
          out.ingredients.map((x) =>
            makeIngredient(String(x.name ?? "").trim(), String(x.amount ?? "").trim()),
          ),
        );
      }

      if (typeof out.instructions === "string") setInstructions(out.instructions);
      if (typeof out.notes === "string") setNotes(out.notes);

      if (out.macros && typeof out.macros === "object") {
        setMacros((prev) => ({
          ...prev,
          calories: out.macros?.calories ?? prev.calories,
          protein: out.macros?.protein ?? prev.protein,
          fat: out.macros?.fat ?? prev.fat,
          carbs: out.macros?.carbs ?? prev.carbs,
          fiber: out.macros?.fiber ?? prev.fiber,
        }));
      }

      if (typeof out.comment === "string") setAiComment(out.comment);
    } catch (e: unknown) {
      alert(`AI автозаполнение: ${errMsg(e)}`);
    } finally {
      setAiBusy(false);
    }
  };

  // === AI: расчёт/пересчёт КБЖУ ===
  const handleAiMacros = async () => {
    const dishName = title.trim() || "Блюдо";
    if (!ingredientsText || ingredientsText.length < 2) {
      alert("Добавь хотя бы 1 ингредиент, чтобы ИИ посчитал КБЖУ.");
      return;
    }

    setAiMacrosBusy(true);
    setAiComment("");

    try {
      const out = await postJson<MacrosApiOut>("/api/ai/dish-macros", {
        name: dishName,
        ingredients: ingredientsText,
      });

      const m = out?.macros ?? {};
      setMacros((prev) => ({
        ...prev,
        calories: numU(m.calories) ?? prev.calories,
        protein: numU(m.protein) ?? prev.protein,
        fat: numU(m.fat) ?? prev.fat,
        carbs: numU(m.carbs) ?? prev.carbs,
        fiber: numU(m.fiber) ?? prev.fiber,
      }));

      if (typeof out.comment === "string") setAiComment(out.comment);
    } catch (e: unknown) {
      alert(`AI КБЖУ: ${errMsg(e)}`);
    } finally {
      setAiMacrosBusy(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);

    try {
      const now = new Date().toISOString();

      const dish: Dish = {
        id: crypto.randomUUID(),
        title: title.trim(),
        category,
        timeMinutes,
        difficulty: undefined,
        ingredients: ingredients.filter((ing) => ing.name.trim() !== ""),
        macros,
        tags,
        instructions: instructions.trim() || undefined,
        notes: notes.trim() || undefined,
        imageUrl: undefined,
        createdAt: now,
        updatedAt: now,
      };

      const existing = loadDishesFromStorage();
      saveDishesToStorage([...existing, dish]);

      router.push("/nutritionist/dishes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Новое блюдо</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Заполни ключевые поля — остальное всегда можно дополнить позже.
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
              placeholder="Мясо с картошкой"
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
                const value = e.target.value;
                setTimeMinutes(value === "" ? undefined : Number(value));
              }}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
            />
          </label>
        </section>

        {/* Макросы */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Макронутриенты (опционально)</h3>

            <button
              type="button"
              onClick={handleAiMacros}
              disabled={aiMacrosBusy}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              title="ИИ посчитает КБЖУ по текущим ингредиентам"
            >
              {aiMacrosBusy ? "Считаю..." : "Заполнить КБЖУ с ИИ"}
            </button>
          </div>

          {aiComment ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              <span className="font-medium">Комментарий ИИ:</span> {aiComment}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs">
              Ккал
              <input
                type="number"
                value={macros.calories ?? ""}
                onChange={(e) =>
                  setMacros((prev) => ({
                    ...prev,
                    calories: e.target.value === "" ? undefined : Number(e.target.value),
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
                    protein: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
                    fat: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
                    carbs: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
                    fiber: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
              />
            </label>
          </div>

          <p className="text-xs text-zinc-500">
            Для круп/макарон важно указать <b>сырой</b> или <b>готовый</b> вес — иначе ккал могут улететь в космос.
          </p>
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
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Ингредиенты</h3>

            <div className="flex items-center gap-2">
              {/* ВОТ ОНА — кнопка, которая у тебя пропадает */}
              <button
                type="button"
                onClick={handleAiAutofill}
                disabled={aiBusy}
                className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                title="ИИ заполнит ингредиенты/граммовки/инструкцию по названию блюда"
              >
                {aiBusy ? "Заполняю..." : "Автозаполнить блюдо с ИИ"}
              </button>

              <button
                type="button"
                onClick={addIngredientRow}
                className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-200"
              >
                + Добавить ингредиент
              </button>
            </div>
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
                    placeholder="Название (например, мясо)"
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
              rows={5}
              className="min-h-[100px] rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Заметки для себя (опционально)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="min-h-[100px] rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
            {saving ? "Сохраняю..." : "Сохранить блюдо"}
          </button>
        </div>
      </form>
    </div>
  );
}
