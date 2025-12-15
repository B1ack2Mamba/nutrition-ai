"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

type AssignmentRow = {
    id: string;
    client_id: string;
    nutritionist_id: string | null;
    title: string | null;
    notes: string | null;
    status: "active" | "archived" | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    menu_id: string | null;
    days_count: number | null;
    // JSON из БД (Supabase вернёт object). Держим как unknown и безопасно распаковываем.
    menu_data: unknown | null;
};

type MenuDaySummary = { day: string; meals: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

const pickArray = (obj: unknown, key: string): unknown[] | null => {
    if (!isRecord(obj)) return null;
    const v = obj[key];
    return Array.isArray(v) ? v : null;
};

const asString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

const asStringArray = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    const arr = v
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
    return arr.length ? arr : null;
};

function formatDate(d: string | null | undefined): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
}

function splitTokens(s: string | null | undefined): string[] {
    if (!s) return [];
    return s
        .split(/[,;\n]/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 20);
}

function getMenuDays(menu: unknown): unknown[] {
    return (
        pickArray(menu, "days") ??
        pickArray(menu, "plan") ??
        pickArray(menu, "items") ??
        []
    );
}

function pickDayLabel(dayObj: unknown, i: number): string {
    if (!isRecord(dayObj)) return `Day ${i + 1}`;
    return (
        asString(dayObj.day) ||
        asString(dayObj.label) ||
        asString(dayObj.title) ||
        asString(dayObj.name) ||
        `Day ${i + 1}`
    );
}

function pickMealsLabel(dayObj: unknown): string {
    if (!isRecord(dayObj)) return "—";

    const raw =
        dayObj.meals ??
        dayObj.meal_types ??
        dayObj.slots ??
        dayObj.items ??
        dayObj.plan;

    // массив строк ["breakfast","lunch"]
    const arr = asStringArray(raw);
    if (arr) return arr.join(", ");

    // объект { breakfast: [...], lunch: [...] } → ключи
    if (isRecord(raw)) {
        const keys = Object.keys(raw).filter(Boolean);
        if (keys.length) return keys.join(", ");
    }

    return "—";
}

function buildMenuDaySummary(menu: unknown): MenuDaySummary[] {
    const days = getMenuDays(menu);
    return days.slice(0, 50).map((d, i) => ({
        day: pickDayLabel(d, i),
        meals: pickMealsLabel(d),
    }));
}

// --- Детальная распаковка блюд/рецептов (если они реально лежат в menu_data) ---

type DishView = {
    title: string;
    ingredients: string[];
    instructions: string;
    notes: string;
};

type MealView = {
    mealName: string;
    dishes: DishView[];
};

type DayView = {
    dayLabel: string;
    meals: MealView[];
};

function normalizeIngredients(v: unknown): string[] {
    if (!v) return [];
    if (typeof v === "string") {
        return v
            .split(/\n|,|;/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 50);
    }
    if (Array.isArray(v)) {
        const out: string[] = [];
        for (const it of v) {
            if (typeof it === "string") {
                const s = it.trim();
                if (s) out.push(s);
            } else if (isRecord(it)) {
                const n = asString(it.name) || asString(it.title);
                if (n) out.push(n);
            }
            if (out.length >= 50) break;
        }
        return out;
    }
    return [];
}

function normalizeInstructions(v: unknown): string {
    if (!v) return "";
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) {
        const steps = v
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean);
        return steps.join("\n");
    }
    return "";
}

function dishFromUnknown(x: unknown): DishView | null {
    // строка = просто название блюда
    if (typeof x === "string" && x.trim()) {
        return { title: x.trim(), ingredients: [], instructions: "", notes: "" };
    }

    if (!isRecord(x)) return null;

    const title =
        asString(x.title) ||
        asString(x.name) ||
        asString(x.dish_title) ||
        asString(x.dishName) ||
        asString(x.label);

    if (!title) return null;

    const ingredients =
        normalizeIngredients(x.ingredients) ||
        normalizeIngredients(x.products) ||
        normalizeIngredients(x.ing);

    const instructions =
        normalizeInstructions(x.instructions) ||
        normalizeInstructions(x.recipe) ||
        normalizeInstructions(x.how_to_cook) ||
        normalizeInstructions(x.steps);

    const notes = asString(x.notes) || asString(x.comment) || "";

    return { title, ingredients, instructions, notes };
}

function mealsFromDay(dayObj: unknown): MealView[] {
    if (!isRecord(dayObj)) return [];

    const raw =
        dayObj.meals ??
        dayObj.plan ??
        dayObj.items ??
        dayObj.slots ??
        dayObj.meal_types;

    // если meals — объект с ключами приёмов пищи
    if (isRecord(raw)) {
        const result: MealView[] = [];
        for (const mealName of Object.keys(raw)) {
            const v = raw[mealName];
            const dishes: DishView[] = [];

            if (Array.isArray(v)) {
                for (const it of v) {
                    const d = dishFromUnknown(it);
                    if (d) dishes.push(d);
                    if (dishes.length >= 30) break;
                }
            } else {
                // иногда одно блюдо объектом
                const d = dishFromUnknown(v);
                if (d) dishes.push(d);
            }

            result.push({
                mealName,
                dishes,
            });
        }
        return result;
    }

    // если dayObj сам по себе массив блюд (редко)
    if (Array.isArray(raw)) {
        const dishes: DishView[] = [];
        for (const it of raw) {
            const d = dishFromUnknown(it);
            if (d) dishes.push(d);
            if (dishes.length >= 30) break;
        }
        return dishes.length ? [{ mealName: "meals", dishes }] : [];
    }

    return [];
}

function buildMenuDetails(menu: unknown): DayView[] {
    const days = getMenuDays(menu);
    return days.slice(0, 30).map((d, i) => ({
        dayLabel: pickDayLabel(d, i),
        meals: mealsFromDay(d),
    }));
}

export default function ClientPage() {
    const [basic, setBasic] = useState<BasicProfile | null>(null);
    const [extended, setExtended] = useState<ExtendedProfile | null>(null);
    const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState<string | null>(null);

    // раскрытие меню
    const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setFatalError(null);

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                setFatalError("Нет авторизации");
                setLoading(false);
                return;
            }

            // профиль
            const { data: prof, error: profErr } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("id", user.id)
                .single();

            if (profErr) {
                setFatalError(profErr.message);
                setLoading(false);
                return;
            }
            setBasic(prof as BasicProfile);

            // цель/анкета
            const { data: extRows } = await supabase
                .from("client_profiles")
                .select("*")
                .eq("user_id", user.id)
                .limit(1);

            if (extRows && extRows.length > 0) setExtended(extRows[0] as ExtendedProfile);
            else setExtended(null);

            // назначения меню (только клиенту)
            const { data: rows, error: assErr } = await supabase
                .from("client_menu_assignments")
                .select("*")
                .eq("client_id", user.id)
                .order("created_at", { ascending: false });

            if (assErr) {
                setFatalError(assErr.message);
                setLoading(false);
                return;
            }

            setAssignments((rows ?? []) as AssignmentRow[]);
            setLoading(false);
        };

        load();
    }, []);

    // показываем ТОЛЬКО реальные меню, а не старые “записи-цели”
    const menuAssignments = useMemo(() => {
        return assignments.filter((a) => !!a.menu_id || !!a.menu_data);
    }, [assignments]);

    const activeAssignment = useMemo(() => {
        const explicit = menuAssignments.find((a) => a.status === "active");
        return explicit ?? menuAssignments[0] ?? null;
    }, [menuAssignments]);

    const otherAssignments = useMemo(() => {
        if (!activeAssignment) return menuAssignments;
        return menuAssignments.filter((a) => a.id !== activeAssignment.id);
    }, [menuAssignments, activeAssignment]);

    const goalTokens = useMemo(() => {
        const t: { label: string; items: string[] }[] = [];
        const allergies = splitTokens(extended?.allergies);
        const banned = splitTokens(extended?.banned_foods);
        const prefs = splitTokens(extended?.preferences);

        if (allergies.length) t.push({ label: "Аллергии", items: allergies });
        if (banned.length) t.push({ label: "Запрещено", items: banned });
        if (prefs.length) t.push({ label: "Предпочтения", items: prefs });

        return t;
    }, [extended]);

    const toggleOpen = (id: string) => {
        setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    if (loading) {
        return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю...</p>;
    }

    if (fatalError) {
        return <p className="text-sm text-red-500">{fatalError}</p>;
    }

    if (!basic) {
        return <p className="text-sm text-red-500">Профиль не найден.</p>;
    }

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">Мой рацион</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Здесь отображаются рационы, которые назначил ваш специалист.
                </p>
            </header>

            {/* ЦЕЛЬ */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Моя цель</h3>

                <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Цель</div>
                    <div className="text-base font-semibold">{extended?.main_goal || "—"}</div>
                    {extended?.goal_description ? (
                        <div className="text-sm text-zinc-600 dark:text-zinc-300">
                            {extended.goal_description}
                        </div>
                    ) : (
                        <div className="text-sm text-zinc-500">Описание цели не заполнено.</div>
                    )}
                </div>

                {goalTokens.length ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                        {goalTokens.map((g) => (
                            <div key={g.label} className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
                                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                    {g.label}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {g.items.map((x) => (
                                        <span
                                            key={x}
                                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                                        >
                                            {x}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </section>

            {/* АКТИВНЫЙ РАЦИОН */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">Текущий рацион</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Показываем активный рацион (или последний, если активный не выставлен).
                        </p>
                    </div>
                </div>

                {!activeAssignment ? (
                    <p className="text-xs text-zinc-500">Пока вам не назначили меню.</p>
                ) : (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-base font-semibold">
                                    {activeAssignment.title ?? "Меню"}
                                    <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-black">
                                        активный
                                    </span>
                                </div>

                                <div className="mt-1 text-xs text-zinc-500">
                                    Назначен{" "}
                                    {activeAssignment.start_date
                                        ? formatDate(activeAssignment.start_date)
                                        : formatDate(activeAssignment.created_at)}
                                    {activeAssignment.end_date ? ` · до ${formatDate(activeAssignment.end_date)}` : ""}
                                </div>

                                {activeAssignment.notes ? (
                                    <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                                        Комментарий специалиста: {activeAssignment.notes}
                                    </div>
                                ) : null}
                            </div>

                            <button
                                type="button"
                                onClick={() => toggleOpen(activeAssignment.id)}
                                className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                                {openIds[activeAssignment.id] ? "Скрыть меню" : "Открыть меню"}
                            </button>
                        </div>

                        {/* краткое summary */}
                        <div className="mt-3 rounded-xl bg-white p-3 text-xs dark:bg-zinc-950">
                            <div className="mb-2 text-[11px] text-zinc-500">Краткая структура по дням:</div>
                            <div className="max-h-44 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                                <table className="min-w-full border-collapse">
                                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                                        <tr>
                                            <th className="px-2 py-1 text-left font-medium">День</th>
                                            <th className="px-2 py-1 text-left font-medium">Кратко по приёмам пищи</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {buildMenuDaySummary(activeAssignment.menu_data ?? {}).map((r, idx) => (
                                            <tr key={idx} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-2 py-1">{r.day}</td>
                                                <td className="px-2 py-1">{r.meals}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* детали (если есть) */}
                        {openIds[activeAssignment.id] ? (
                            <div className="mt-3 space-y-3">
                                {(() => {
                                    const details = buildMenuDetails(activeAssignment.menu_data ?? {});
                                    const hasAnyRecipes = details.some((d) =>
                                        d.meals.some((m) => m.dishes.some((x) => x.ingredients.length || x.instructions))
                                    );

                                    if (!details.length) {
                                        return (
                                            <div className="rounded-xl border border-dashed border-zinc-300 bg-white/70 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
                                                В этом меню нет детальных данных по блюдам (в menu_data пришла только структура).
                                            </div>
                                        );
                                    }

                                    return (
                                        <>
                                            {!hasAnyRecipes ? (
                                                <div className="rounded-xl border border-dashed border-zinc-300 bg-white/70 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
                                                    Данные меню открылись, но рецептов/ингредиентов внутри не найдено — скорее всего меню хранит
                                                    только названия блюд.
                                                </div>
                                            ) : null}

                                            {details.map((day) => (
                                                <div
                                                    key={day.dayLabel}
                                                    className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                                                >
                                                    <div className="text-sm font-semibold">{day.dayLabel}</div>

                                                    {day.meals.length === 0 ? (
                                                        <div className="mt-2 text-[11px] text-zinc-500">Нет данных по приёмам пищи.</div>
                                                    ) : (
                                                        <div className="mt-2 space-y-3">
                                                            {day.meals.map((meal) => (
                                                                <div key={meal.mealName} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                                                                    <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                                                                        {meal.mealName}
                                                                    </div>

                                                                    {meal.dishes.length === 0 ? (
                                                                        <div className="mt-2 text-[11px] text-zinc-500">Блюда не указаны.</div>
                                                                    ) : (
                                                                        <div className="mt-2 space-y-2">
                                                                            {meal.dishes.map((dish, i) => (
                                                                                <div
                                                                                    key={`${dish.title}-${i}`}
                                                                                    className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
                                                                                >
                                                                                    <div className="text-[12px] font-semibold">{dish.title}</div>

                                                                                    {dish.notes ? (
                                                                                        <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                                                                                            {dish.notes}
                                                                                        </div>
                                                                                    ) : null}

                                                                                    {dish.ingredients.length ? (
                                                                                        <div className="mt-2">
                                                                                            <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                                                                                                Ингредиенты
                                                                                            </div>
                                                                                            <ul className="mt-1 list-disc pl-5 text-[11px] text-zinc-600 dark:text-zinc-300">
                                                                                                {dish.ingredients.map((ing) => (
                                                                                                    <li key={ing}>{ing}</li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    ) : null}

                                                                                    {dish.instructions ? (
                                                                                        <div className="mt-2">
                                                                                            <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                                                                                                Как готовить
                                                                                            </div>
                                                                                            <pre className="mt-1 whitespace-pre-wrap text-[11px] text-zinc-600 dark:text-zinc-300">
                                                                                                {dish.instructions}
                                                                                            </pre>
                                                                                        </div>
                                                                                    ) : null}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
                        ) : null}
                    </div>
                )}
            </section>

            {/* ИСТОРИЯ */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">История назначений</h3>

                {otherAssignments.length === 0 ? (
                    <p className="text-xs text-zinc-500">Других назначенных меню нет.</p>
                ) : (
                    <div className="space-y-2">
                        {otherAssignments.map((a) => (
                            <div
                                key={a.id}
                                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-base font-semibold">{a.title ?? "Меню"}</div>
                                        <div className="mt-1 text-xs text-zinc-500">
                                            Назначен{" "}
                                            {a.start_date ? formatDate(a.start_date) : formatDate(a.created_at)}
                                            {a.end_date ? ` · до ${formatDate(a.end_date)}` : ""}
                                        </div>
                                        {a.notes ? (
                                            <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                                                Комментарий специалиста: {a.notes}
                                            </div>
                                        ) : null}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => toggleOpen(a.id)}
                                        className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                    >
                                        {openIds[a.id] ? "Скрыть меню" : "Открыть меню"}
                                    </button>
                                </div>

                                <div className="mt-3 rounded-xl bg-white p-3 text-xs dark:bg-zinc-950">
                                    <div className="mb-2 text-[11px] text-zinc-500">Краткая структура по дням:</div>
                                    <div className="max-h-44 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                                        <table className="min-w-full border-collapse">
                                            <thead className="bg-zinc-50 dark:bg-zinc-900">
                                                <tr>
                                                    <th className="px-2 py-1 text-left font-medium">День</th>
                                                    <th className="px-2 py-1 text-left font-medium">Кратко по приёмам пищи</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {buildMenuDaySummary(a.menu_data ?? {}).map((r, idx) => (
                                                    <tr key={idx} className="border-t border-zinc-100 dark:border-zinc-800">
                                                        <td className="px-2 py-1">{r.day}</td>
                                                        <td className="px-2 py-1">{r.meals}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {openIds[a.id] ? (
                                    <div className="mt-3 space-y-2">
                                        {buildMenuDetails(a.menu_data ?? {}).map((day) => (
                                            <div
                                                key={day.dayLabel}
                                                className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                                            >
                                                <div className="text-sm font-semibold">{day.dayLabel}</div>
                                                {day.meals.length === 0 ? (
                                                    <div className="mt-2 text-[11px] text-zinc-500">Нет данных по приёмам пищи.</div>
                                                ) : (
                                                    <div className="mt-2 space-y-2">
                                                        {day.meals.map((meal) => (
                                                            <div key={meal.mealName} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                                                                <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                                                                    {meal.mealName}
                                                                </div>
                                                                {meal.dishes.length === 0 ? (
                                                                    <div className="mt-2 text-[11px] text-zinc-500">Блюда не указаны.</div>
                                                                ) : (
                                                                    <ul className="mt-2 list-disc pl-5 text-[11px] text-zinc-600 dark:text-zinc-300">
                                                                        {meal.dishes.map((d, i) => (
                                                                            <li key={`${d.title}-${i}`}>{d.title}</li>
                                                                        ))}
                                                                    </ul>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
