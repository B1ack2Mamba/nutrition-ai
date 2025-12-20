"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ===================== Types ===================== */

type BasicProfile = {
    id: string;
    full_name: string | null;
};

type ExtendedProfile = {
    user_id: string;
    main_goal: string | null;
    goal_description: string | null;
};

type MenuAssignment = {
    id: string;
    client_id: string;
    nutritionist_id: string;
    title: string;
    notes: string | null;
    status: "active" | "archived" | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    menu_id: string | null;
    days_count: number | null;
    menu_data: unknown | null; // jsonb
};

type FoodRulesRow = {
    id: string;
    client_id: string;
    nutritionist_id: string | null;

    // NEW schema
    allowed_products?: unknown;
    banned_products?: unknown;

    // LEGACY schema
    allowed?: unknown;
    banned?: unknown;

    notes: string | null;
    created_at: string;
    updated_at?: string | null;
};

type DishView = {
    id?: string;
    name: string;
    details?: string;
    ingredients?: string[];
    steps?: string[];
};

type MealView = {
    name: string;
    dishes: DishView[];
};

type DayView = {
    label: string;
    meals: MealView[];
};

/* ===================== Helpers ===================== */

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidString(v: unknown): v is string {
    return typeof v === "string" && UUID_RE.test(v.trim());
}

function formatDate(d: string | null | undefined): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> {
    return isRecord(v) ? v : {};
}

function getString(v: unknown): string | null {
    if (typeof v === "string") {
        const t = v.trim();
        return t ? t : null;
    }
    if (typeof v === "number") return String(v);
    return null;
}

/** string | string[] | jsonb array | object -> string[] */
function splitList(value: unknown): string[] {
    const out: string[] = [];

    const add = (v: unknown) => {
        if (v == null) return;

        if (Array.isArray(v)) {
            for (const item of v) add(item);
            return;
        }

        if (typeof v === "string") {
            for (const part of v.split(/[,;\n]/g)) {
                const t = part.trim();
                if (t) out.push(t);
            }
            return;
        }

        if (typeof v === "number" || typeof v === "boolean") {
            out.push(String(v));
            return;
        }

        if (isRecord(v)) {
            add(Object.values(v));
            return;
        }
    };

    add(value);
    return Array.from(new Set(out.map((x) => x.trim()).filter(Boolean))).slice(0, 80);
}

function pickFirstNonEmpty<T>(...lists: T[][]): T[] {
    for (const l of lists) {
        if (Array.isArray(l) && l.length) return l;
    }
    return [];
}

function normalizeSteps(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) {
        return v
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean)
            .slice(0, 40);
    }
    if (typeof v === "string") {
        return v
            .split(/\n+/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 40);
    }
    return [];
}

function normalizeIngredients(v: unknown): string[] {
    if (!v) return [];

    if (Array.isArray(v)) {
        return v
            .map((x) => {
                if (typeof x === "string") return x.trim();
                if (isRecord(x)) {
                    const n =
                        getString(x.name) ||
                        getString(x.title) ||
                        getString(x.product) ||
                        getString(x.item);
                    const g = getString(x.grams) || getString(x.amount) || getString(x.qty);
                    return [n, g].filter(Boolean).join(" ");
                }
                return "";
            })
            .filter(Boolean)
            .slice(0, 80);
    }

    if (typeof v === "string") {
        return v
            .split(/[,;\n]/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 80);
    }

    if (isRecord(v)) {
        return normalizeIngredients(Object.values(v));
    }

    return [];
}

function recordLooksLikeDish(r: Record<string, unknown>): boolean {
    return (
        "ingredients" in r ||
        "products" in r ||
        "steps" in r ||
        "instructions" in r ||
        "cooking" in r ||
        "kcal" in r ||
        "calories" in r ||
        "energy" in r ||
        "recipe_name" in r ||
        "dish" in r
    );
}

function recordLooksLikeMeal(r: Record<string, unknown>): boolean {
    return (
        "dishes" in r ||
        "items" in r ||
        "recipes" in r ||
        "recipe" in r ||
        "value" in r ||
        "products" in r
    );
}

function toList(
    value: unknown,
    opts?: { treatRecordAsSingleIfLooksLike?: (r: Record<string, unknown>) => boolean },
): unknown[] {
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
        if (opts?.treatRecordAsSingleIfLooksLike && opts.treatRecordAsSingleIfLooksLike(value)) {
            return [value];
        }
        return Object.values(value);
    }
    return [];
}

function extractDays(menu: unknown): unknown[] {
    const m = asRecord(menu);
    const candidates = [m.days, m.plan, m.items, m.weeks, m.week, m.schedule];
    for (const c of candidates) {
        const list = toList(c);
        if (list.length) return list;
    }
    return [];
}

function prettyMealName(raw: string): string {
    const k = raw.toLowerCase().trim();
    if (k === "breakfast") return "breakfast";
    if (k === "lunch") return "lunch";
    if (k === "dinner") return "dinner";
    if (k === "snack" || k === "snacks") return "snack";
    return raw;
}

function normalizeMeals(day: unknown): unknown[] {
    const d = asRecord(day);
    const meals = d.meals ?? d.meal ?? d.menu ?? d.ration;

    if (Array.isArray(meals)) return meals;

    if (isRecord(meals)) {
        // если это реально один meal-объект
        if (recordLooksLikeMeal(meals)) return [meals];

        // иначе это словарь типа { lunch: "...dishId...", dinner: "...dishId..." }
        return Object.entries(meals).map(([k, v]) => ({
            name: prettyMealName(k),
            ...(isRecord(v) ? v : { value: v }),
        }));
    }

    // fallback: иногда meals лежат прямо в day как ключи breakfast/lunch/dinner
    const maybeMealKeys = ["breakfast", "lunch", "dinner", "snack", "snacks", "supper"];
    const out: unknown[] = [];
    for (const key of maybeMealKeys) {
        if (key in d) out.push({ name: prettyMealName(key), value: d[key] });
    }
    return out;
}

function normalizeDishes(meal: unknown): unknown[] {
    // если meal сам по себе строка (dishId) — это блюдо
    if (typeof meal === "string" || typeof meal === "number") return [meal];

    const m = asRecord(meal);

    // если положили прямо в value / dishId
    const direct = m.value ?? m.dishId ?? m.dish_id;
    if (typeof direct === "string" || typeof direct === "number") return [direct];

    const candidates = [
        m.dishes,
        m.items,
        m.recipes,
        m.recipe,
        m.meals,
        m.products,
        m.components,
    ];

    for (const c of candidates) {
        const list = toList(c, { treatRecordAsSingleIfLooksLike: recordLooksLikeDish });
        if (list.length) return list;
    }

    // глубже: если кто-то запихнул dishes внутрь nested-объекта
    for (const v of Object.values(m)) {
        const list = toList(v, { treatRecordAsSingleIfLooksLike: recordLooksLikeDish });
        if (list.length) return list;

        if (isRecord(v)) {
            const list2 = toList(
                v.dishes ?? v.items ?? v.recipes ?? v.recipe ?? v.value ?? v.products,
                { treatRecordAsSingleIfLooksLike: recordLooksLikeDish },
            );
            if (list2.length) return list2;
        }
    }

    return [];
}

/* ===================== Dish lookup (no any) ===================== */

function collectDishIdsFromMenu(menu: unknown): string[] {
    const out = new Set<string>();
    const days = extractDays(menu);

    for (const day of days) {
        for (const meal of normalizeMeals(day)) {
            for (const dish of normalizeDishes(meal)) {
                if (typeof dish === "string") {
                    const t = dish.trim();
                    if (isUuidString(t)) out.add(t);
                } else if (isRecord(dish)) {
                    const maybe = dish.id ?? dish.dish_id ?? dish.dishId;
                    if (isUuidString(maybe)) out.add(maybe.trim());
                }
            }
        }
    }

    return Array.from(out);
}

async function fetchDishIndexByIds(ids: string[]): Promise<{
    index: Record<string, Record<string, unknown>>;
    source?: string;
    error?: string;
}> {
    if (!ids.length) return { index: {} };

    // подстрой под свои реальные таблицы (если знаешь точную — оставь одну)
    const TABLES = ["nutritionist_dishes", "dishes", "recipes", "dish_recipes", "nutritionist_recipes"];
    const COLS = ["id", "dish_id", "dishId"] as const;

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

    for (const table of TABLES) {
        for (const col of COLS) {
            const out: Record<string, Record<string, unknown>> = {};

            for (const ch of chunks) {
                const { data, error } = await supabase.from(table).select("*").in(col, ch);
                if (error) {
                    // если нет прав/таблицы — просто пробуем дальше
                    continue;
                }

                for (const rowUnknown of (data ?? [])) {
                    if (!isRecord(rowUnknown)) continue;

                    const ridRaw = rowUnknown.id ?? rowUnknown.dish_id ?? rowUnknown.dishId;
                    const rid =
                        typeof ridRaw === "string" || typeof ridRaw === "number" ? String(ridRaw) : "";

                    if (isUuidString(rid)) out[rid] = rowUnknown;
                }
            }

            if (Object.keys(out).length) {
                return { index: out, source: `${table}.${col}` };
            }
        }
    }

    return {
        index: {},
        error: "Не удалось подгрузить рецепты по dishId (скорее всего нет прав/RLS или таблица другая).",
    };
}

function dishFromRecord(di: Record<string, unknown>, fallbackId?: string): DishView {
    const name =
        getString(di.name) ||
        getString(di.title) ||
        getString(di.dish) ||
        getString(di.recipe_name) ||
        (fallbackId ? "Блюдо" : "Блюдо");

    const grams = getString(di.grams) || getString(di.amount) || getString(di.portion);
    const kcal = getString(di.kcal) || getString(di.calories) || getString(di.energy);

    const details = [grams ? `порция: ${grams}` : null, kcal ? `ккал: ${kcal}` : null]
        .filter(Boolean)
        .join(" · ");

    const ingredients = pickFirstNonEmpty(
        normalizeIngredients(di.ingredients),
        normalizeIngredients(di.products),
        normalizeIngredients(di.items),
        normalizeIngredients(di.components),
    );

    const steps = pickFirstNonEmpty(
        normalizeSteps(di.steps),
        normalizeSteps(di.instructions),
        normalizeSteps(di.cooking),
        normalizeSteps(di.recipe),
    );

    return {
        id: fallbackId,
        name,
        details: details || undefined,
        ingredients: ingredients.length ? ingredients : undefined,
        steps: steps.length ? steps : undefined,
    };
}

function buildMenuView(menu: unknown, dishIndex: Record<string, Record<string, unknown>>): DayView[] {
    const days = extractDays(menu).slice(0, 60);

    return days.map((day, dayIndex) => {
        const d = asRecord(day);
        const label =
            getString(d.day) ||
            getString(d.label) ||
            getString(d.title) ||
            getString(d.name) ||
            `Day ${dayIndex + 1}`;

        const meals: MealView[] = normalizeMeals(day)
            .slice(0, 30)
            .map((meal, mealIndex) => {
                const m = asRecord(meal);
                const mealName =
                    getString(m.name) ||
                    getString(m.title) ||
                    getString(m.type) ||
                    `Meal ${mealIndex + 1}`;

                const dishes: DishView[] = normalizeDishes(meal)
                    .slice(0, 200)
                    .map((dish) => {
                        // 1) строка: или UUID (dishId), или уже имя
                        if (typeof dish === "string") {
                            const t = dish.trim();

                            if (isUuidString(t)) {
                                const rec = dishIndex[t];
                                if (rec) return dishFromRecord(rec, t);
                                return {
                                    id: t,
                                    name: "Блюдо",
                                    details: "рецепт не передан в меню / нет доступа к базе блюд",
                                };
                            }

                            return { name: t || "Блюдо" };
                        }

                        // 2) объект блюда
                        const di = asRecord(dish);

                        const ridRaw = di.id ?? di.dish_id ?? di.dishId;
                        const rid = isUuidString(ridRaw) ? ridRaw.trim() : undefined;

                        // если объект уже содержит всё — используем его
                        if (recordLooksLikeDish(di)) {
                            return dishFromRecord(di, rid);
                        }

                        // если объект пустой, но есть rid и он есть в индексе — берём из индекса
                        if (rid && dishIndex[rid]) {
                            return dishFromRecord(dishIndex[rid], rid);
                        }

                        // fallback
                        return {
                            id: rid,
                            name: getString(di.name) || getString(di.title) || "Блюдо",
                        };
                    });

                return { name: mealName, dishes };
            });

        return { label, meals };
    });
}

function isAuthRefreshTokenErrorMessage(msg: string) {
    const m = msg.toLowerCase();
    return m.includes("refresh token") || m.includes("invalid refresh token");
}

/* ===================== Page ===================== */

export default function ClientPage() {
    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState<string | null>(null);

    const [basic, setBasic] = useState<BasicProfile | null>(null);
    const [extended, setExtended] = useState<ExtendedProfile | null>(null);

    const [assignments, setAssignments] = useState<MenuAssignment[]>([]);
    const [currentFood, setCurrentFood] = useState<FoodRulesRow | null>(null);
    const [foodHint, setFoodHint] = useState<string | null>(null);

    // рецепты/блюда по UUID
    const [dishIndex, setDishIndex] = useState<Record<string, Record<string, unknown>>>({});
    const [dishHint, setDishHint] = useState<string | null>(null);

    const reloadFood = useCallback(async (clientId: string) => {
        const q1 = await supabase
            .from("client_food_rules")
            .select("*")
            .eq("client_id", clientId)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1);

        if (q1.error) {
            const msg = q1.error.message.toLowerCase();
            if (msg.includes("updated_at") && msg.includes("does not exist")) {
                const q2 = await supabase
                    .from("client_food_rules")
                    .select("*")
                    .eq("client_id", clientId)
                    .order("created_at", { ascending: false })
                    .limit(1);

                if (q2.error) {
                    setFoodHint("Рекомендации по продуктам недоступны (таблица/права/RLS).");
                    setCurrentFood(null);
                    return;
                }

                setFoodHint(null);
                setCurrentFood((q2.data?.[0] as FoodRulesRow | undefined) ?? null);
                return;
            }

            setFoodHint("Рекомендации по продуктам недоступны (таблица/права/RLS).");
            setCurrentFood(null);
            return;
        }

        setFoodHint(null);
        setCurrentFood((q1.data?.[0] as FoodRulesRow | undefined) ?? null);
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { data, error } = await supabase.auth.getUser();

                if (error) {
                    if (isAuthRefreshTokenErrorMessage(error.message)) {
                        await supabase.auth.signOut();
                        if (!cancelled) {
                            setFatalError("Сессия истекла. Войдите снова.");
                            setLoading(false);
                        }
                        return;
                    }
                    if (!cancelled) {
                        setFatalError(error.message);
                        setLoading(false);
                    }
                    return;
                }

                const user = data.user;
                if (!user) {
                    if (!cancelled) {
                        setFatalError("Нет авторизации");
                        setLoading(false);
                    }
                    return;
                }

                const { data: prof, error: profErr } = await supabase
                    .from("profiles")
                    .select("id, full_name")
                    .eq("id", user.id)
                    .single();

                if (profErr) {
                    if (!cancelled) {
                        setFatalError(profErr.message);
                        setLoading(false);
                    }
                    return;
                }

                const { data: extRows } = await supabase
                    .from("client_profiles")
                    .select("user_id, main_goal, goal_description")
                    .eq("user_id", user.id)
                    .limit(1);

                const { data: assRows, error: assErr } = await supabase
                    .from("client_menu_assignments")
                    .select("*")
                    .eq("client_id", user.id)
                    .order("created_at", { ascending: false });

                if (assErr) {
                    if (!cancelled) {
                        setFatalError(assErr.message);
                        setLoading(false);
                    }
                    return;
                }

                await reloadFood(user.id);

                if (!cancelled) {
                    setBasic(prof as BasicProfile);
                    setExtended(extRows && extRows.length ? (extRows[0] as ExtendedProfile) : null);
                    setAssignments((assRows ?? []) as MenuAssignment[]);
                    setFatalError(null);
                    setLoading(false);
                }
            } catch (e) {
                if (!cancelled) {
                    setFatalError(e instanceof Error ? e.message : String(e));
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [reloadFood]);

    const menuAssignments = useMemo(
        () => assignments.filter((a) => !!a.menu_id || !!a.menu_data),
        [assignments],
    );

    const activeAssignment = useMemo(() => {
        const explicit = menuAssignments.find((a) => a.status === "active");
        return explicit ?? menuAssignments[0] ?? null;
    }, [menuAssignments]);

    const menuData = activeAssignment?.menu_data ?? null;

    // подгружаем блюда по UUID из меню
    useEffect(() => {
        let cancelled = false;

        (async () => {
            // чтобы не триггерить “синхронный setState внутри effect” — делаем await в любом случае
            await Promise.resolve();

            const ids = menuData ? collectDishIdsFromMenu(menuData) : [];
            if (!ids.length) {
                if (!cancelled) {
                    setDishIndex({});
                    setDishHint(null);
                }
                return;
            }

            const res = await fetchDishIndexByIds(ids);

            if (!cancelled) {
                setDishIndex(res.index);
                setDishHint(res.error ? res.error : res.source ? `Рецепты: ${res.source}` : null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [menuData]);

    const menuView = useMemo(() => {
        return menuData ? buildMenuView(menuData, dishIndex) : [];
    }, [menuData, dishIndex]);

    const allowedTokens = useMemo(
        () => splitList(currentFood?.allowed_products ?? currentFood?.allowed),
        [currentFood],
    );
    const bannedTokens = useMemo(
        () => splitList(currentFood?.banned_products ?? currentFood?.banned),
        [currentFood],
    );

    const foodUpdatedAt = useMemo(() => {
        if (!currentFood) return null;
        return currentFood.updated_at ?? currentFood.created_at;
    }, [currentFood]);

    if (loading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю…</p>;
    if (fatalError) return <p className="text-sm text-red-500">{fatalError}</p>;

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-2xl font-semibold">Мой рацион</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Здесь отображаются текущий назначенный рацион и текущие рекомендации.
                </p>
            </header>

            {/* цель */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Цель</div>
                <div className="mt-1 text-base font-semibold">{extended?.main_goal || "—"}</div>
                {extended?.goal_description ? (
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{extended.goal_description}</div>
                ) : null}
            </section>

            {/* текущий активный рацион */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Текущий активный рацион</h3>

                {!activeAssignment ? (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Пока нет назначенного рациона.</p>
                ) : (
                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold">{activeAssignment.title}</div>
                                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    {activeAssignment.start_date
                                        ? `Назначен ${formatDate(activeAssignment.start_date)}`
                                        : `Назначен ${formatDate(activeAssignment.created_at)}`}
                                    {activeAssignment.end_date ? ` · до ${formatDate(activeAssignment.end_date)}` : ""}
                                </div>

                                {activeAssignment.notes ? (
                                    <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                                        <span className="text-zinc-500 dark:text-zinc-400">Комментарий:</span> {activeAssignment.notes}
                                    </div>
                                ) : null}

                                {dishHint ? (
                                    <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">{dishHint}</div>
                                ) : null}
                            </div>

                            <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-black">
                                активный
                            </span>
                        </div>

                        <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-200">
                                Открыть меню (блюда и готовка)
                            </summary>

                            {!activeAssignment.menu_data ? (
                                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">В этом назначении нет данных меню.</div>
                            ) : (
                                <div className="mt-3 max-h-[520px] overflow-auto rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                                    <div className="space-y-3">
                                        {menuView.length === 0 ? (
                                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                                Меню есть, но структура нестандартная — парсер не нашёл дни/приёмы пищи.
                                            </div>
                                        ) : (
                                            menuView.map((day, di) => (
                                                <details key={`${day.label}-${di}`} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                                                    <summary className="cursor-pointer text-sm font-semibold">{day.label}</summary>

                                                    <div className="mt-3 space-y-3">
                                                        {day.meals.map((meal, mi) => (
                                                            <details key={`${meal.name}-${mi}`} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                                                                <summary className="cursor-pointer text-xs font-semibold">{meal.name}</summary>

                                                                <div className="mt-2 space-y-2">
                                                                    {meal.dishes.length === 0 ? (
                                                                        <div className="text-xs text-zinc-500 dark:text-zinc-400">Блюда не указаны.</div>
                                                                    ) : (
                                                                        meal.dishes.map((dish, xi) => (
                                                                            <details
                                                                                key={`${dish.id ?? dish.name}-${xi}`}
                                                                                className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                                                                            >
                                                                                <summary className="cursor-pointer text-sm font-semibold">
                                                                                    {dish.name}
                                                                                </summary>

                                                                                {dish.id ? (
                                                                                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                                                                        ID блюда: {dish.id}
                                                                                    </div>
                                                                                ) : null}

                                                                                {dish.details ? (
                                                                                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{dish.details}</div>
                                                                                ) : null}

                                                                                {dish.ingredients?.length ? (
                                                                                    <div className="mt-3">
                                                                                        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                                                                                            Ингредиенты
                                                                                        </div>
                                                                                        <ul className="mt-1 list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-300">
                                                                                            {dish.ingredients.map((ing) => (
                                                                                                <li key={ing}>{ing}</li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </div>
                                                                                ) : null}

                                                                                {dish.steps?.length ? (
                                                                                    <div className="mt-3">
                                                                                        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                                                                                            Приготовление
                                                                                        </div>
                                                                                        <ol className="mt-1 list-decimal pl-5 text-xs text-zinc-600 dark:text-zinc-300">
                                                                                            {dish.steps.map((st, si) => (
                                                                                                <li key={`${si}-${st}`}>{st}</li>
                                                                                            ))}
                                                                                        </ol>
                                                                                    </div>
                                                                                ) : null}

                                                                                {!dish.ingredients?.length && !dish.steps?.length ? (
                                                                                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                                                                        Рецепт не передан (или нет доступа к базе блюд).
                                                                                    </div>
                                                                                ) : null}
                                                                            </details>
                                                                        ))
                                                                    )}
                                                                </div>
                                                            </details>
                                                        ))}
                                                    </div>
                                                </details>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </details>
                    </div>
                )}
            </section>

            {/* продукты */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">Разрешённые и запрещённые продукты</h3>

                    {basic?.id ? (
                        <button
                            type="button"
                            onClick={() => reloadFood(basic.id)}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                            Обновить
                        </button>
                    ) : null}
                </div>

                {foodHint ? (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{foodHint}</p>
                ) : !currentFood ? (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Пока нет рекомендаций.</p>
                ) : (
                    <>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Можно</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {allowedTokens.length ? (
                                        allowedTokens.map((x) => (
                                            <span
                                                key={x}
                                                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                                            >
                                                {x}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Нельзя</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {bannedTokens.length ? (
                                        bannedTokens.map((x) => (
                                            <span
                                                key={x}
                                                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                                            >
                                                {x}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {currentFood.notes ? (
                            <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                                <span className="text-zinc-500 dark:text-zinc-400">Комментарий:</span> {currentFood.notes}
                            </div>
                        ) : null}

                        <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                            Обновлено: {formatDate(foodUpdatedAt)}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
