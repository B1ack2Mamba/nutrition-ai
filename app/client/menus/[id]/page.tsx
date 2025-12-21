"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { MealSlot, Menu } from "@/lib/menus";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Завтрак" },
  { slot: "lunch", label: "Обед" },
  { slot: "dinner", label: "Ужин" },
  { slot: "snack", label: "Перекус" },
];

type ClientMenuAssignmentRow = {
  id: string;
  menu_id: string | null;
  title: string;
  status: "active" | "archived" | null;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  menu_data: unknown | null;
};

function renderDishValue(dishId: unknown): string {
  if (typeof dishId !== "string" || !dishId) return "—";
  // если это uuid, показываем короче (но всё равно однозначно)
  return dishId.length > 16 ? `${dishId.slice(0, 8)}…${dishId.slice(-4)}` : dishId;
}

export default function ClientMenuViewPage() {
  const router = useRouter();
  const params = useParams();

  const menuId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<ClientMenuAssignmentRow | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userRes.user;
        if (!user) {
          if (!alive) return;
          setError("Вы не авторизованы.");
          return;
        }

        const { data, error: fetchErr } = await supabase
          .from("client_menu_assignments")
          .select(
            "id, menu_id, title, status, created_at, start_date, end_date, menu_data"
          )
          .eq("client_id", user.id)
          .eq("menu_id", menuId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (!alive) return;

        if (!data) {
          setAssignment(null);
          setMenu(null);
          return;
        }

        setAssignment(data as ClientMenuAssignmentRow);
        setMenu((data.menu_data ?? null) as Menu | null);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Не удалось загрузить рацион.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [menuId]);

  const days = useMemo(() => menu?.days ?? [], [menu?.days]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-7 w-72 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Назад
        </button>
      </div>
    );
  }

  if (!assignment || !menu) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-semibold">Рацион не найден</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Возможно, он не назначен вам или уже был удалён.
        </p>
        <button
          onClick={() => router.push("/client/menus")}
          className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          К списку рационов
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{assignment.title}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {menu.goal ? `Цель: ${menu.goal}` : ""}
            {menu.targetCalories ? ` • ~${menu.targetCalories} ккал/день` : ""}
            {typeof menu.daysCount === "number" ? ` • ${menu.daysCount} дней` : ""}
          </p>
        </div>

        <button
          onClick={() => router.back()}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Назад
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {days.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            В этом рационе пока нет дней.
          </p>
        ) : (
          days.map((day) => (
            <section
              key={day.index}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="text-base font-semibold">
                День {day.index + 1}: {day.label}
              </h2>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {MEAL_SLOTS.map(({ slot, label }) => {
                  const dishId = (day.meals as any)?.[slot];

                  return (
                    <div
                      key={slot}
                      className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                    >
                      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {label}
                      </div>
                      <div className="mt-1 font-medium">
                        {renderDishValue(dishId)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
