"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Menu } from "@/lib/menus";

type AssignmentStatus = "active" | "archived" | null;

type ClientMenuAssignmentRow = {
  id: string;
  menu_id: string | null;
  title: string;
  status: AssignmentStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  menu_data: Menu | null;
};

function formatGoal(goal?: Menu["goal"]): string {
  switch (goal) {
    case "fat_loss":
      return "Похудение";
    case "muscle_gain":
      return "Набор мышц";
    case "maintenance":
      return "Поддержание";
    case "energy":
      return "Энергия / тонус";
    default:
      return "Рацион";
  }
}

export default function ClientMenusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ClientMenuAssignmentRow[]>([]);

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
          setAssignments([]);
          setFullName(null);
          setError("Вы не авторизованы.");
          return;
        }

        // optional: show client name
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profileErr) {
          // not fatal
          console.warn(profileErr);
        }

        const { data: rows, error: rowsErr } = await supabase
          .from("client_menu_assignments")
          .select(
            "id, menu_id, title, status, start_date, end_date, created_at, menu_data"
          )
          .eq("client_id", user.id)
          .order("created_at", { ascending: false });

        if (rowsErr) throw rowsErr;

        if (!alive) return;
        setFullName((profile as any)?.full_name ?? null);
        setAssignments((rows as any) ?? []);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setError(e?.message || "Не удалось загрузить рационы");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const active = useMemo(
    () => assignments.find((a) => a.status === "active") || null,
    [assignments]
  );

  const activeMenu = active?.menu_data ?? null;

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Мой рацион</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Загрузка…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Мой рацион</h2>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!assignments.length) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Мой рацион</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Вам ещё не назначили рацион. Обратитесь к вашему специалисту.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Мой рацион</h2>
        {fullName ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Клиент: <span className="font-medium">{fullName}</span>
          </p>
        ) : null}
      </header>

      {active ? (
        <section className="space-y-3">
          <div className="rounded-2xl border border-green-300 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-950/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">
              Рекомендованный рацион
            </p>
            <p className="mt-1 text-sm font-medium text-green-900 dark:text-green-100">
              {active.title}
            </p>
            {activeMenu ? (
              <p className="mt-1 text-xs text-green-800 dark:text-green-300">
                На {activeMenu.daysCount} дней
                {activeMenu.targetCalories ? ` • ~${activeMenu.targetCalories} ккал/день` : ""}
              </p>
            ) : null}
            {active.menu_id ? (
              <Link
                href={`/client/menus/${active.menu_id}`}
                className="mt-2 inline-flex text-xs font-medium text-green-800 underline underline-offset-4 dark:text-green-300"
              >
                Открыть план&nbsp;→
              </Link>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Вам пока не назначен основной рацион.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Все ваши доступные рационы
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((a) => {
            const m = a.menu_data;
            const daysCount = m?.daysCount;
            const targetCalories = m?.targetCalories;
            const goal = m?.goal;

            return (
              <article
                key={a.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-semibold">{a.title}</h4>
                    {a.status === "active" ? (
                      <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
                        ACTIVE
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatGoal(goal)}
                    {typeof daysCount === "number" ? ` • ${daysCount} дней` : ""}
                    {targetCalories ? ` • ~${targetCalories} ккал/день` : ""}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>
                    Назначен: {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  {a.menu_id ? (
                    <Link
                      href={`/client/menus/${a.menu_id}`}
                      className="rounded-full border border-zinc-300 px-3 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Открыть
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
