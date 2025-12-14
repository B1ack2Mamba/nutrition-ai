"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Menu, loadMenusFromStorage } from "@/lib/menus";

type BasicProfile = {
    id: string;
    full_name: string | null;
};

type ExtendedProfile = {
    user_id: string;
    main_goal: string | null;
    goal_description: string | null;
    allergies: string | null;
    banned_foods: string | null;
    preferences: string | null;
    monthly_budget: number | null;
};

type Assignment = {
    id: string;
    client_id: string;
    nutritionist_id: string;
    title: string;
    notes: string | null;
    status: "active" | "archived";
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    menu_id: string | null;
    days_count: number | null;
    menu_data: Menu | null;
};

type JournalEntry = {
    id: string;
    entry_date: string;
    weight_kg: number | null;
    energy_level: number | null;
    mood: number | null;
    notes: string | null;
};

export default function ClientDetailPage() {
    const params = useParams<{ clientId: string }>();
    const clientId = params.clientId;

    const [basic, setBasic] = useState<BasicProfile | null>(null);
    const [extended, setExtended] = useState<ExtendedProfile | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [journal, setJournal] = useState<JournalEntry[]>([]);
    const [menus, setMenus] = useState<Menu[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedMenuId, setSelectedMenuId] = useState<string>("");
    const [newNotes, setNewNotes] = useState("");
    const [savingAssign, setSavingAssign] = useState(false);

    // локальные меню нутрициолога из localStorage
    useEffect(() => {
        const storedMenus = loadMenusFromStorage();
        setMenus(storedMenus);
    }, []);

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

            // базовый профиль клиента
            const { data: prof, error: profErr } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("id", clientId)
                .single();

            if (profErr) {
                setError(profErr.message);
                setLoading(false);
                return;
            }

            setBasic(prof as BasicProfile);

            // расширенный профиль
            const { data: extRows } = await supabase
                .from("client_profiles")
                .select("*")
                .eq("user_id", clientId)
                .limit(1);

            if (extRows && extRows.length > 0) {
                setExtended(extRows[0] as ExtendedProfile);
            }

            // назначения рационов
            const { data: assRows, error: assErr } = await supabase
                .from("client_menu_assignments")
                .select("*")
                .eq("client_id", clientId)
                .eq("nutritionist_id", user.id)
                .order("created_at", { ascending: false });

            if (assErr) {
                setError(assErr.message);
            } else if (assRows) {
                setAssignments(assRows as Assignment[]);
            }

            // дневник
            const { data: journalRows, error: journalErr } = await supabase
                .from("client_journal_entries")
                .select("*")
                .eq("user_id", clientId)
                .order("entry_date", { ascending: true });

            if (journalErr) {
                console.warn(journalErr);
            } else if (journalRows) {
                setJournal(journalRows as JournalEntry[]);
            }

            setLoading(false);
        };

        if (clientId) {
            load();
        }
    }, [clientId]);

    const handleAssign = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedMenuId) return;

        setSavingAssign(true);
        setError(null);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setError("Нет авторизации");
            setSavingAssign(false);
            return;
        }

        const menu = menus.find((m) => m.id === selectedMenuId);
        if (!menu) {
            setError("Меню не найдено");
            setSavingAssign(false);
            return;
        }

        try {
            const { error: insErr } = await supabase
                .from("client_menu_assignments")
                .insert({
                    client_id: clientId,
                    nutritionist_id: user.id,
                    title: menu.title,
                    notes: newNotes.trim() || null,
                    menu_id: menu.id,
                    days_count: menu.daysCount ?? null,
                    menu_data: menu, // хранится JSON меню
                });

            if (insErr) {
                setError(insErr.message);
                return;
            }

            const { data: assRows } = await supabase
                .from("client_menu_assignments")
                .select("*")
                .eq("client_id", clientId)
                .eq("nutritionist_id", user.id)
                .order("created_at", { ascending: false });

            if (assRows) {
                setAssignments(assRows as Assignment[]);
            }

            setSelectedMenuId("");
            setNewNotes("");
        } finally {
            setSavingAssign(false);
        }
    };

    if (loading) {
        return (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Загружаю данные клиента...
            </p>
        );
    }

    if (error) {
        return <p className="text-sm text-red-500">{error}</p>;
    }

    if (!basic) {
        return (
            <p className="text-sm text-red-500">
                Клиент не найден или нет доступа.
            </p>
        );
    }

    // подготавливаем данные для "графика" веса
    const weightEntries = journal.filter((j) => j.weight_kg != null);
    let minW = 0;
    let maxW = 0;
    if (weightEntries.length > 0) {
        minW = Math.min(...weightEntries.map((e) => Number(e.weight_kg)));
        maxW = Math.max(...weightEntries.map((e) => Number(e.weight_kg)));
        if (maxW === minW) maxW = minW + 1;
    }
    const getWidth = (w: number | null) => {
        if (w == null || weightEntries.length === 0) return 0;
        const k = (Number(w) - minW) / (maxW - minW);
        return 10 + k * 90; // от 10% до 100%
    };

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">
                    Клиент: {basic.full_name ?? basic.id}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Анкета клиента, назначенные рационы и дневник.
                </p>
            </header>

            {/* Анкета клиента */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Анкета клиента</h3>
                {extended ? (
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <div className="text-xs text-zinc-500">Главная цель</div>
                            <div>{extended.main_goal || "—"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-zinc-500">
                                Бюджет в месяц
                            </div>
                            <div>
                                {extended.monthly_budget != null
                                    ? `${extended.monthly_budget}`
                                    : "—"}
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                            <div className="text-xs text-zinc-500">
                                Описание цели
                            </div>
                            <div>{extended.goal_description || "—"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-zinc-500">
                                Аллергии / непереносимость
                            </div>
                            <div>{extended.allergies || "—"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-zinc-500">
                                Запрещённые продукты
                            </div>
                            <div>{extended.banned_foods || "—"}</div>
                        </div>
                        <div className="sm:col-span-2">
                            <div className="text-xs text-zinc-500">
                                Предпочтения
                            </div>
                            <div>{extended.preferences || "—"}</div>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-zinc-500">
                        Клиент ещё не заполнил подробную анкету.
                    </p>
                )}
            </section>

            {/* Назначения рационов */}
            <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Назначенные рационы</h3>

                <form
                    onSubmit={handleAssign}
                    className="grid gap-3 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900"
                >
                    <label className="flex flex-col gap-1">
                        Меню для назначения
                        <select
                            value={selectedMenuId}
                            onChange={(e) => setSelectedMenuId(e.target.value)}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                        >
                            <option value="">— Выберите меню —</option>
                            {menus.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.title} ({m.daysCount ?? 0} дней)
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        Комментарий (опционально)
                        <textarea
                            rows={2}
                            value={newNotes}
                            onChange={(e) => setNewNotes(e.target.value)}
                            placeholder="Краткое описание, особенности, рекомендации..."
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <button
                        type="submit"
                        disabled={savingAssign || !selectedMenuId}
                        className="self-start rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                    >
                        {savingAssign ? "Назначаю..." : "Назначить рацион"}
                    </button>
                </form>

                {assignments.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Пока нет назначенных рационов.
                    </p>
                ) : (
                    <div className="space-y-2 text-sm">
                        {assignments.map((a) => (
                            <div
                                key={a.id}
                                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="font-medium">
                                        {a.title}
                                        {a.days_count
                                            ? ` · ${a.days_count} дней`
                                            : a.menu_data?.daysCount
                                                ? ` · ${a.menu_data.daysCount} дней`
                                                : null}
                                    </div>
                                    <div className="text-[11px] text-zinc-500">
                                        с{" "}
                                        {a.start_date
                                            ? new Date(a.start_date).toLocaleDateString()
                                            : new Date(a.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                {a.notes && (
                                    <p className="mt-1 text-[11px] text-zinc-500">
                                        {a.notes}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Дневник клиента */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">
                    Дневник клиента (вес / энергия / настроение)
                </h3>

                {journal.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                        Клиент ещё не вёл дневник.
                    </p>
                ) : (
                    <>
                        <div className="max-h-60 overflow-auto rounded-lg border border-zinc-200 text-xs dark:border-zinc-700">
                            <table className="min-w-full border-collapse">
                                <thead className="bg-zinc-50 dark:bg-zinc-900">
                                    <tr>
                                        <th className="px-2 py-1 text-left font-medium">
                                            Дата
                                        </th>
                                        <th className="px-2 py-1 text-left font-medium">
                                            Вес
                                        </th>
                                        <th className="px-2 py-1 text-left font-medium">
                                            Энергия
                                        </th>
                                        <th className="px-2 py-1 text-left font-medium">
                                            Настроение
                                        </th>
                                        <th className="px-2 py-1 text-left font-medium">
                                            Заметки
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {journal.map((e) => (
                                        <tr
                                            key={e.id}
                                            className="border-t border-zinc-100 dark:border-zinc-800"
                                        >
                                            <td className="px-2 py-1">
                                                {new Date(e.entry_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-2 py-1">
                                                {e.weight_kg ?? "—"}
                                            </td>
                                            <td className="px-2 py-1">
                                                {e.energy_level ?? "—"}
                                            </td>
                                            <td className="px-2 py-1">
                                                {e.mood ?? "—"}
                                            </td>
                                            <td className="px-2 py-1">
                                                {e.notes ?? ""}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {weightEntries.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs text-zinc-500">
                                    Простая визуализация веса: чем длиннее полоска, тем
                                    больше вес.
                                </p>
                                {journal.map((e) => (
                                    <div
                                        key={e.id}
                                        className="flex items-center gap-2 text-xs"
                                    >
                                        <div className="w-20 text-zinc-500">
                                            {new Date(e.entry_date).toLocaleDateString()}
                                        </div>
                                        <div className="flex-1">
                                            <div
                                                className="h-2 rounded-full bg-zinc-300 dark:bg-zinc-700"
                                                style={{
                                                    width: `${getWidth(
                                                        e.weight_kg as number | null,
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                        <div className="w-10 text-right">
                                            {e.weight_kg ?? "—"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}
