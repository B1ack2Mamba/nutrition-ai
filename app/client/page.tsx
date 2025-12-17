"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

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
    menu_data: unknown | null;
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

function pickFirstNonEmpty<T>(...lists: T[][]): T[] {
    for (const l of lists) {
        if (Array.isArray(l) && l.length) return l;
    }
    return [];
}

/**
 * Принимает что угодно:
 * - string
 * - string[]
 * - jsonb массив
 * - null
 * - number/bool
 * И возвращает список токенов.
 */
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
    };

    add(value);
    return Array.from(new Set(out.map((x) => x.trim()).filter(Boolean))).slice(0, 60);
}

type DishView = {
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
        "dish" in r ||
        "recipe_name" in r
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

function toList(value: unknown, opts?: { treatRecordAsSingleIfLooksLike?: (r: Record<string, unknown>) => boolean }): unknown[] {
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
        if (opts?.treatRecordAsSingleIfLooksLike && opts.treatRecordAsSingleIfLooksLike(value)) return [value];
        return Object.values(value);
    }
    return [];
}

function extractDays(menu: unknown): unknown[] {
    const m = asRecord(menu);
    // days / plan / items / weeks и т.п.
    const candidates = [m.days, m.plan, m.items, m.weeks, m.week, m.schedule];
    for (const c of candidates) {
        const list = toList(c);
        if (list.length) return list;
    }
    return [];
}

function normalizeMeals(day: unknown): unknown[] {
    const d = asRecord(day);
    const meals = d.meals ?? d.meal ?? d.menu ?? d.ration;

    if (Array.isArray(meals)) return meals;

    if (isRecord(meals)) {
        // если это реально один meal-объект
        if (recordLooksLikeMeal(meals)) return [meals];

        // иначе это словарь типа { lunch: {...}, dinner: {...} }
        return Object.entries(meals).map(([k, v]) => ({
            name: k,
            ...(isRecord(v) ? v : { value: v }),
        }));
    }

    // fallback: иногда meals лежат прямо в day как ключи breakfast/lunch/dinner
    const maybeMealKeys = ["breakfast", "lunch", "dinner", "snack", "snacks", "supper"];
    const out: unknown[] = [];
    for (const key of maybeMealKeys) {
        if (key in d) out.push({ name: key, value: d[key] }); // ✅ без any
    }
    return out;
}

function normalizeDishes(meal: unknown): unknown[] {
    const m = asRecord(meal);

    const candidates = [m.dishes, m.items, m.recipes, m.recipe, m.meals, m.value, m.products, m.components];
    for (const c of candidates) {
        const list = toList(c, { treatRecordAsSingleIfLooksLike: recordLooksLikeDish });
        if (list.length) return list;
    }

    // глубже: если кто-то запихнул dishes внутрь nested-объекта
    for (const v of Object.values(m)) {
        const list = toList(v, { treatRecordAsSingleIfLooksLike: recordLooksLikeDish });
        if (list.length) return list;

        if (isRecord(v)) {
            const list2 = toList(v.dishes ?? v.items ?? v.recipes ?? v.recipe ?? v.value ?? v.products, {
                treatRecordAsSingleIfLooksLike: recordLooksLikeDish,
            });
            if (list2.length) return list2;
        }
    }

    return [];
}

function normalizeSteps(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) {
        return v
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean)
            .slice(0, 25);
    }
    if (typeof v === "string") {
        return v
            .split(/\n+/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 25);
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
                    const n = getString(x.name) || getString(x.title) || getString(x.product);
                    const g = getString(x.grams) || getString(x.amount) || getString(x.qty);
                    return [n, g].filter(Boolean).join(" ");
                }
                return "";
            })
            .filter(Boolean)
            .slice(0, 50);
    }
    if (typeof v === "string") {
        return v
            .split(/[,;\n]/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 50);
    }
    if (isRecord(v)) {
        return normalizeIngredients(Object.values(v));
    }
    return [];
}

function buildMenuView(menu: unknown): DayView[] {
    const days = extractDays(menu).slice(0, 60);

    return days.map((day, dayIndex) => {
        const d = asRecord(day);
        const label = getString(d.day) || getString(d.title) || getString(d.name) || `Day ${dayIndex + 1}`;

        const meals = normalizeMeals(day)
            .slice(0, 30)
            .map((meal, mealIndex) => {
                const m = asRecord(meal);
                const mealName = getString(m.name) || getString(m.title) || getString(m.type) || `Meal ${mealIndex + 1}`;

                const dishes = normalizeDishes(meal)
                    .slice(0, 120)
                    .map((dish) => {
                        if (typeof dish === "string") {
                            return { name: dish.trim() || "Блюдо" } as DishView;
                        }

                        const di = asRecord(dish);

                        const name =
                            getString(di.name) ||
                            getString(di.title) ||
                            getString(di.dish) ||
                            getString(di.recipe_name) ||
                            "Блюдо";

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
                            name,
                            details: details || undefined,
                            ingredients: ingredients.length ? ingredients : undefined,
                            steps: steps.length ? steps : undefined,
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

export default function ClientPage() {
    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState<string | null>(null);

    const [basic, setBasic] = useState<BasicProfile | null>(null);
    const [extended, setExtended] = useState<ExtendedProfile | null>(null);

    const [assignments, setAssignments] = useState<MenuAssignment[]>([]);
    const [currentFood, setCurrentFood] = useState<FoodRulesRow | null>(null);
    const [foodHint, setFoodHint] = useState<string | null>(null);

    const reloadFood = useCallback(async (clientId: string) => {
        // Сначала updated_at -> затем created_at (и фоллбек если колонки нет)
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
        const load = async () => {
            setLoading(true);
            setFatalError(null);

            try {
                const { data, error } = await supabase.auth.getUser();
                if (error) {
                    if (isAuthRefreshTokenErrorMessage(error.message)) {
                        await supabase.auth.signOut();
                        setFatalError("Сессия истекла. Войдите снова.");
                        setLoading(false);
                        return;
                    }
                    setFatalError(error.message);
                    setLoading(false);
                    return;
                }

                const user = data.user;
                if (!user) {
                    setFatalError("Нет авторизации");
                    setLoading(false);
                    return;
                }

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

                const { data: extRows } = await supabase
                    .from("client_profiles")
                    .select("user_id, main_goal, goal_description")
                    .eq("user_id", user.id)
                    .limit(1);

                if (extRows && extRows.length > 0) setExtended(extRows[0] as ExtendedProfile);
                else setExtended(null);

                const { data: assRows, error: assErr } = await supabase
                    .from("client_menu_assignments")
                    .select("*")
                    .eq("client_id", user.id)
                    .order("created_at", { ascending: false });

                if (assErr) {
                    setFatalError(assErr.message);
                    setLoading(false);
                    return;
                }
                setAssignments((assRows ?? []) as MenuAssignment[]);

                await reloadFood(user.id);

                setLoading(false);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setFatalError(msg);
                setLoading(false);
            }
        };

        load();
    }, [reloadFood]);

    const menuAssignments = useMemo(() => {
        return assignments.filter((a) => !!a.menu_id || !!a.menu_data);
    }, [assignments]);

    const activeAssignment = useMemo(() => {
        const explicit = menuAssignments.find((a) => a.status === "active");
        return explicit ?? menuAssignments[0] ?? null;
    }, [menuAssignments]);

    const menuData = activeAssignment?.menu_data ?? null;

    const menuView = useMemo(() => {
        return menuData ? buildMenuView(menuData) : [];
    }, [menuData]);

    // ✅ поддержка обоих вариантов колонок
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

    if (loading) return <p className="text-sm text-zinc-500">Загружаю…</p>;
    if (fatalError) return <p className="text-sm text-red-500">{fatalError}</p>;

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-2xl font-semibold">Мой рацион</h2>
                <p className="mt-1 text-sm text-zinc-500">
                    Здесь отображаются текущий назначенный рацион и текущие рекомендации.
                </p>
            </header>

            {/* цель */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="text-xs text-zinc-500">Цель</div>
                <div className="mt-1 text-base font-semibold">{extended?.main_goal || "—"}</div>
                {extended?.goal_description ? (
                    <div className="mt-1 text-sm text-zinc-600">{extended.goal_description}</div>
                ) : null}
            </section>

            {/* текущий активный рацион */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold">Текущий активный рацион</h3>

                {!activeAssignment ? (
                    <p className="mt-2 text-xs text-zinc-500">Пока нет назначенного рациона.</p>
                ) : (
                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold">{activeAssignment.title}</div>
                                <div className="mt-1 text-xs text-zinc-500">
                                    {activeAssignment.start_date
                                        ? `Назначен ${formatDate(activeAssignment.start_date)}`
                                        : `Назначен ${formatDate(activeAssignment.created_at)}`}
                                    {activeAssignment.end_date ? ` · до ${formatDate(activeAssignment.end_date)}` : ""}
                                </div>
                                {activeAssignment.notes ? (
                                    <div className="mt-2 text-xs text-zinc-600">
                                        <span className="text-zinc-500">Комментарий:</span> {activeAssignment.notes}
                                    </div>
                                ) : null}
                            </div>
                            <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white">
                                активный
                            </span>
                        </div>

                        <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-zinc-700 underline underline-offset-4">
                                Открыть меню (блюда и готовка)
                            </summary>

                            {!activeAssignment.menu_data ? (
                                <div className="mt-2 text-xs text-zinc-500">В этом назначении нет данных меню.</div>
                            ) : (
                                <div className="mt-3 max-h-[520px] overflow-auto rounded-xl border border-zinc-200 bg-white p-3">
                                    <div className="space-y-3">
                                        {menuView.length === 0 ? (
                                            <div className="text-xs text-zinc-500">
                                                Меню есть, но структура нестандартная — парсер не нашёл дни/приёмы пищи.
                                            </div>
                                        ) : (
                                            menuView.map((day, di) => (
                                                <details
                                                    key={`${day.label}-${di}`}
                                                    className="rounded-lg border border-zinc-200 p-3"
                                                >
                                                    <summary className="cursor-pointer text-sm font-semibold">{day.label}</summary>

                                                    <div className="mt-3 space-y-3">
                                                        {day.meals.map((meal, mi) => (
                                                            <details
                                                                key={`${meal.name}-${mi}`}
                                                                className="rounded-lg bg-zinc-50 p-3"
                                                            >
                                                                <summary className="cursor-pointer text-xs font-semibold">{meal.name}</summary>

                                                                <div className="mt-2 space-y-2">
                                                                    {meal.dishes.length === 0 ? (
                                                                        <div className="text-xs text-zinc-500">Блюда не указаны.</div>
                                                                    ) : (
                                                                        meal.dishes.map((dish, xi) => (
                                                                            <div
                                                                                key={`${dish.name}-${xi}`}
                                                                                className="rounded-lg border border-zinc-200 bg-white p-3"
                                                                            >
                                                                                <div className="text-sm font-semibold">{dish.name}</div>
                                                                                {dish.details ? (
                                                                                    <div className="mt-1 text-xs text-zinc-500">{dish.details}</div>
                                                                                ) : null}

                                                                                {dish.ingredients?.length ? (
                                                                                    <div className="mt-2">
                                                                                        <div className="text-xs font-semibold text-zinc-700">Ингредиенты</div>
                                                                                        <ul className="mt-1 list-disc pl-5 text-xs text-zinc-600">
                                                                                            {dish.ingredients.map((ing) => (
                                                                                                <li key={ing}>{ing}</li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </div>
                                                                                ) : null}

                                                                                {dish.steps?.length ? (
                                                                                    <div className="mt-2">
                                                                                        <div className="text-xs font-semibold text-zinc-700">Приготовление</div>
                                                                                        <ol className="mt-1 list-decimal pl-5 text-xs text-zinc-600">
                                                                                            {dish.steps.map((st, si) => (
                                                                                                <li key={`${si}-${st}`}>{st}</li>
                                                                                            ))}
                                                                                        </ol>
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>
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
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">Разрешённые и запрещённые продукты</h3>

                    {basic?.id ? (
                        <button
                            type="button"
                            onClick={() => reloadFood(basic.id)}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                        >
                            Обновить
                        </button>
                    ) : null}
                </div>

                {foodHint ? (
                    <p className="mt-2 text-xs text-zinc-500">{foodHint}</p>
                ) : !currentFood ? (
                    <p className="mt-2 text-xs text-zinc-500">Пока нет рекомендаций.</p>
                ) : (
                    <>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-zinc-50 p-3">
                                <div className="text-xs font-semibold text-zinc-700">Можно</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {allowedTokens.length ? (
                                        allowedTokens.map((x) => (
                                            <span key={x} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs">
                                                {x}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-zinc-500">—</span>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-50 p-3">
                                <div className="text-xs font-semibold text-zinc-700">Нельзя</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {bannedTokens.length ? (
                                        bannedTokens.map((x) => (
                                            <span key={x} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs">
                                                {x}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-zinc-500">—</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {currentFood.notes ? (
                            <div className="mt-3 text-xs text-zinc-600">
                                <span className="text-zinc-500">Комментарий:</span> {currentFood.notes}
                            </div>
                        ) : null}

                        <div className="mt-2 text-[11px] text-zinc-500">
                            Обновлено: {formatDate(foodUpdatedAt)}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}