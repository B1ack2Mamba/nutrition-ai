"use client";

// app/nutritionist/menus/new/page.tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dish, listMyDishes } from "@/lib/dishes";
import { supabase } from "@/lib/supabaseClient";

type MenuGoal = "fat_loss" | "muscle_gain" | "maintenance" | "energy";
type MealKey = "breakfast" | "lunch" | "dinner" | "snack";

type MenuDay = {
  day: number;
  meals: Partial<Record<MealKey, string | null>>; // хранит dishId
};

function goalLabel(g: MenuGoal) {
  switch (g) {
    case "fat_loss":
      return "Похудение";
    case "muscle_gain":
      return "Набор мышц";
    case "maintenance":
      return "Поддержание";
    case "energy":
      return "Энергия / тонус";
  }
}

function catLabel(c: Dish["category"]) {
  switch (c) {
    case "breakfast":
      return "Завтрак";
    case "lunch":
      return "Обед";
    case "dinner":
      return "Ужин";
    case "snack":
      return "Перекус";
  }
}

const MEALS: { key: MealKey; label: string }[] = [
  { key: "breakfast", label: "Завтрак" },
  { key: "lunch", label: "Обед" },
  { key: "dinner", label: "Ужин" },
  { key: "snack", label: "Перекус" },
];

function makeDays(daysCount: number): MenuDay[] {
  return Array.from({ length: daysCount }, (_, i) => ({
    day: i + 1,
    meals: { breakfast: null, lunch: null, dinner: null, snack: null },
  }));
}

export default function NewMenuPage() {
  const router = useRouter();

  const [loadingDishes, setLoadingDishes] = useState(true);
  const [dishesError, setDishesError] = useState<string | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);

  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState<MenuGoal>("fat_loss");
  const [daysCount, setDaysCount] = useState<number>(7);
  const [targetCalories, setTargetCalories] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState("");

  const [days, setDays] = useState<MenuDay[]>(() => makeDays(7));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // грузим блюда из Supabase (НЕ синхронно, без localStorage)
  useEffect(() => {
    let alive = true;

    (async () => {
      const res = await listMyDishes();
      if (!alive) return;

      if (res.ok) {
        setDishes(res.data);
        setDishesError(null);
      } else {
        setDishesError(res.error);
      }
      setLoadingDishes(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // пересобираем дни при смене daysCount
  useEffect(() => {
    setDays(makeDays(daysCount));
  }, [daysCount]);

  const dishesById = useMemo(() => {
    const m = new Map<string, Dish>();
    for (const d of dishes) m.set(d.id, d);
    return m;
  }, [dishes]);

  const setMealDish = (dayIndex: number, meal: MealKey, dishId: string) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i !== dayIndex ? d : { ...d, meals: { ...d.meals, [meal]: dishId || null } },
      ),
    );
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Укажи название рациона.");
      return;
    }

    setSaving(true);

    try {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        setError(authErr.message);
        return;
      }
      if (!data.user) {
        setError("Нет авторизации");
        return;
      }

      const nowIso = new Date().toISOString();

      const payload = {
        nutritionist_id: data.user.id,
        title: title.trim(),
        goal,
        days_count: daysCount,
        target_calories: targetCalories ?? null,
        description: description.trim() || null,
        days: days, // jsonb
        updated_at: nowIso,
      };

      const { error: insErr, data: inserted } = await supabase
        .from("nutritionist_menus")
        .insert(payload)
        .select("id")
        .single();

      if (insErr) {
        setError(insErr.message);
        return;
      }

      router.push(`/nutritionist/menus`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Новый рацион</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Собери рацион из твоих блюд (хранение в Supabase).
          </p>
        </div>

        <Link
          href="/nutritionist/menus"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          ← Назад
        </Link>
      </header>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Название рациона
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Рацион для похудения на 7 дней"
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Цель
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as MenuGoal)}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
            >
              <option value="fat_loss">{goalLabel("fat_loss")}</option>
              <option value="muscle_gain">{goalLabel("muscle_gain")}</option>
              <option value="maintenance">{goalLabel("maintenance")}</option>
              <option value="energy">{goalLabel("energy")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Длительность (дней)
            <select
              value={daysCount}
              onChange={(e) => setDaysCount(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
            >
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={21}>21</option>
              <option value={30}>30</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Цель по калориям (ккал/день, опц.)
            <input
              type="number"
              value={targetCalories ?? ""}
              onChange={(e) => setTargetCalories(e.target.value === "" ? undefined : Number(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
            />
          </label>
        </section>

        <label className="flex flex-col gap-1 text-sm">
          Описание (опционально)
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
          />
        </label>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Дни и блюда</h3>
            {loadingDishes ? (
              <span className="text-xs text-zinc-500">Загружаю блюда…</span>
            ) : dishesError ? (
              <span className="text-xs text-red-500">{dishesError}</span>
            ) : (
              <span className="text-xs text-zinc-500">Блюд: {dishes.length}</span>
            )}
          </div>

          {(!loadingDishes && dishes.length === 0) ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              У тебя нет блюд — сначала создай блюда, потом собирай рацион.
            </div>
          ) : null}

          <div className="space-y-3">
            {days.map((d, idx) => (
              <div
                key={d.day}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium">День {d.day}</div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {MEALS.map((m) => (
                    <label key={m.key} className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-300">{m.label}</span>
                      <select
                        value={d.meals[m.key] ?? ""}
                        onChange={(e) => setMealDish(idx, m.key, e.target.value)}
                        className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <option value="">— не выбрано —</option>
                        {dishes.map((dish) => (
                          <option key={dish.id} value={dish.id}>
                            {dish.title} ({catLabel(dish.category)})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                {/* мини-подсказка */}
                <div className="mt-2 text-[11px] text-zinc-500">
                  {MEALS.map((m) => {
                    const id = d.meals[m.key];
                    const dish = id ? dishesById.get(id) : null;
                    return dish ? (
                      <div key={m.key}>
                        {m.label}: {dish.title}
                        {typeof dish.macros?.calories === "number" ? ` • ${dish.macros.calories} ккал` : ""}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            ))}
          </div>
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
            {saving ? "Сохраняю..." : "Сохранить рацион"}
          </button>
        </div>
      </form>
    </div>
  );
}
