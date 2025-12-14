"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Menu } from "@/lib/menus";

type Assignment = {
    id: string;
    title: string;
    notes: string | null;
    status: "active" | "archived";
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    days_count: number | null;
    menu_data: Menu | null;
};

export default function ClientMainPage() {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                setError("Нет авторизации");
                setLoading(false);
                return;
            }

            const { data, error: selErr } = await supabase
                .from("client_menu_assignments")
                .select("*")
                .eq("client_id", user.id)
                .order("created_at", { ascending: false });

            if (selErr) {
                setError(selErr.message);
            } else if (data) {
                setAssignments(data as Assignment[]);
            }

            setLoading(false);
        };

        load();
    }, []);

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">
                    Мой рацион
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Здесь отображаются рационы, которые назначил ваш специалист.
                </p>
            </header>

            {loading && (
                <p className="text-sm text-zinc-500">Загружаю...</p>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}

            {!loading && !error && assignments.length === 0 && (
                <p className="text-sm text-zinc-500">
                    Пока рацион не назначен. Обратитесь к вашему специалисту.
                </p>
            )}

            {assignments.length > 0 && (
                <div className="space-y-3">
                    {assignments.map((a) => {
                        const menu = a.menu_data;

                        return (
                            <div
                                key={a.id}
                                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="font-medium">
                                            {a.title}
                                            {a.days_count
                                                ? ` · ${a.days_count} дней`
                                                : menu?.daysCount
                                                    ? ` · ${menu.daysCount} дней`
                                                    : ""}
                                        </div>
                                        <div className="text-xs text-zinc-500">
                                            Назначен{" "}
                                            {new Date(a.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>

                                {a.notes && (
                                    <p className="mt-2 text-xs text-zinc-500">
                                        Комментарий специалиста: {a.notes}
                                    </p>
                                )}

                                {menu?.days && menu.days.length > 0 && (
                                    <div className="mt-3 space-y-1 text-xs">
                                        <p className="text-[11px] font-medium text-zinc-500">
                                            Краткая структура по дням:
                                        </p>
                                        <div className="max-h-40 overflow-auto rounded-lg border border-zinc-100 dark:border-zinc-800">
                                            <table className="min-w-full border-collapse">
                                                <thead className="bg-zinc-50 dark:bg-zinc-900">
                                                    <tr>
                                                        <th className="px-2 py-1 text-left font-medium">
                                                            День
                                                        </th>
                                                        <th className="px-2 py-1 text-left font-medium">
                                                            Кратко по приёмам пищи
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {menu.days.map((d) => (
                                                        <tr
                                                            key={d.index}
                                                            className="border-t border-zinc-100 dark:border-zinc-800"
                                                        >
                                                            <td className="px-2 py-1 align-top">
                                                                {d.label ?? `День ${d.index}`}
                                                            </td>
                                                            <td className="px-2 py-1 align-top">
                                                                {d.meals
                                                                    ? Object.entries(d.meals)
                                                                        .filter(
                                                                            ([, dishId]) =>
                                                                                dishId && dishId !== "",
                                                                        )
                                                                        .map(([slot]) => slot)
                                                                        .join(", ") || "—"
                                                                    : "—"}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
