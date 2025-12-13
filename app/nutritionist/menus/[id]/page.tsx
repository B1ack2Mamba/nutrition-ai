"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Dish,
  loadDishesFromStorage,
} from "@/lib/dishes";
import {
  Menu,
  MenuDay,
  MenuGoal,
  MealSlot,
  getMenuById,
  updateMenu,
  deleteMenu,
} from "@/lib/menus";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Завтрак" },
  { slot: "lunch", label: "Обед" },
  { slot: "dinner", label: "Ужин" },
  { slot: "snack", label: "Перекус" },
];

function ensureDaysStructure(menu: Menu): MenuDay[] {
  // на всякий случай, чтобы длина массива совпадала с daysCount
  if (!Array.isArray(menu.days) || menu.days.length === 0) {
    return Array.from({ length: menu.daysCount }, (_, i) => ({
      index: i + 1,
      label: `Day ${i + 1}`,
      meals: {},
    }));
  }
  return menu.days.map((d, i) => ({
    index: d.index ?? i + 1,
    label: d.label ?? `Day ${i + 1}`,
    meals: d.meals ?? {},
    note: d.note,
  }));
}

export default function EditMenuPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const menuId = params.id;

  const dishes = useMemo<Dish[]>(() => loadDishesFromStorage(), []);

  const [loaded, setLoaded] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);

  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState<MenuGoal | undefined>();
  const [daysCount, setDaysCount] = useState<number>(7);
  const [targetCalories, setTargetCalories] = useState<number | undefined>();
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<MenuDay[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const existing = getMenuById(menuId);
    if (!existing) {
      setLoaded(true);
      setMenu(null);
      return;
    }

    const normalizedDays = ensureDaysStructure(existing);

    setMenu(existing);
    setTitle(existing.title);
    setGoal(existing.goal);
    setDaysCount(existing.daysCount);
    setTargetCalories(existing.targetCalories);
    setDescription(existing.description ?? "");
    setDays(normalizedDays);
    setLoaded(true);
  }, [menuId]);

  const handleDaysCountChange = (value: string) => {
    const num = Number(value);
    setDaysCount(num);

    setDays((prev) => {
      if (num <= prev.length) {
        return prev.slice(0, num);
      }
      const extra = Array.from(
        { length: num - prev.length },
        (_, i) => ({
          index: prev.length + i + 1,
          label: `Day ${prev.length + i + 1}`,
          meals: {},
        }),
      );
      return [...prev, ...extra];
    });
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

  const handleDeleteMenu = () => {
    if (!menu) return;
    if (!confirm("Удалить этот рацион?")) return;
    deleteMenu(menu.id);
    router.push("/nutritionist/menus");
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!menu) return;
    if (!title.trim()) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();

      const updated: Menu = {
        ...menu,
        title: title.trim(),
        goal,
        daysCount,
        targetCalories,
        description: description.trim() || undefined,
        days,
        updatedAt: now,
      };

      updateMenu(updated);
      router.push("/nutritionist/menus");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Загрузка рациона...
      </p>
    );
  }

  if (loaded && !menu) {
    return (
      <p className="text-sm text-red-500">
        Рацион не найден. Возможно, он был удалён.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Редактировать рацион
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Обнови название, цель и наполнение по дням.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDeleteMenu}
          className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
        >
          Удалить рацион
        </button>
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
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-zinc-200"
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
              Нет блюд в базе. Сначала создай блюда в разделе
              «Мои блюда».
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
            Назад
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
