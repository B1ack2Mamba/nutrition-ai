// lib/menus.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DishSnapshot } from "@/lib/dishes";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type MenuGoal = "fat_loss" | "muscle_gain" | "maintenance" | "energy";

export type MenuDay = {
    index: number;
    label: string;
    meals: {
        breakfast?: string | null; // dishId
        lunch?: string | null;
        dinner?: string | null;
        snack?: string | null;
    };
    note?: string;
};

export type Menu = {
    id: string;
    nutritionistId: string;
    title: string;
    goal?: MenuGoal;
    daysCount: number;
    targetCalories?: number;
    description?: string;
    days: MenuDay[];
    createdAt: string;
    updatedAt: string;
};

export type MenuSnapshot = Menu & {
    // ключ: dishId → данные блюда (чтобы клиент видел рецепты без доступа к таблице блюд)
    dishIndex?: Record<string, DishSnapshot>;
};

type MenuRow = {
    id: string;
    nutritionist_id: string;
    title: string;
    goal: MenuGoal | null;
    days_count: number;
    target_calories: number | null;
    description: string | null;
    days: unknown;
    created_at: string;
    updated_at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toString(v: unknown): string | undefined {
    if (typeof v === "string") {
        const t = v.trim();
        return t ? t : undefined;
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return undefined;
}

function parseDays(v: unknown, fallbackDaysCount: number): MenuDay[] {
    if (!v) return [];
    const arr = Array.isArray(v) ? v : isRecord(v) ? Object.values(v) : [];
    const days = arr
        .map((x, i) => {
            if (!isRecord(x)) return null;

            const index = typeof x.index === "number" ? x.index : i;
            const label = toString(x.label ?? x.title ?? x.day ?? x.name) ?? `Day ${i + 1}`;

            const mealsRaw = isRecord(x.meals) ? x.meals : x;
            const meals = {
                breakfast: (toString(mealsRaw.breakfast) ?? null) as string | null,
                lunch: (toString(mealsRaw.lunch) ?? null) as string | null,
                dinner: (toString(mealsRaw.dinner) ?? null) as string | null,
                snack: (toString(mealsRaw.snack ?? mealsRaw.snacks) ?? null) as string | null,
            };

            const note = toString(x.note);

            const day: MenuDay = { index, label, meals };
            if (note) day.note = note;
            return day;
        })
        .filter((x): x is MenuDay => x !== null)
        .slice(0, Math.max(1, fallbackDaysCount || 0) || 60);

    return days;
}

function rowToMenu(r: MenuRow): Menu {
    const days = parseDays(r.days, r.days_count);
    return {
        id: r.id,
        nutritionistId: r.nutritionist_id,
        title: r.title,
        goal: r.goal ?? undefined,
        daysCount: r.days_count ?? days.length ?? 0,
        targetCalories: r.target_calories ?? undefined,
        description: r.description ?? undefined,
        days,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}

function menuToUpsertPayload(nutritionistId: string, m: Partial<Menu> & { id?: string }) {
    return {
        id: m.id,
        nutritionist_id: nutritionistId,
        title: m.title ?? "",
        goal: (m.goal ?? null) as MenuGoal | null,
        days_count: typeof m.daysCount === "number" ? m.daysCount : (m.days?.length ?? 0),
        target_calories: typeof m.targetCalories === "number" ? m.targetCalories : null,
        description: m.description ?? null,
        days: Array.isArray(m.days) ? m.days : [],
        updated_at: new Date().toISOString(),
    };
}

/* ===================== DB API ===================== */

export async function fetchMenusByNutritionist(
    supabase: SupabaseClient,
    nutritionistId: string,
): Promise<{ data: Menu[]; error: string | null }> {
    const { data, error } = await supabase
        .from("nutritionist_menus")
        .select("*")
        .eq("nutritionist_id", nutritionistId)
        .order("updated_at", { ascending: false });

    if (error) return { data: [], error: error.message };
    const rows = (data ?? []) as MenuRow[];
    return { data: rows.map(rowToMenu), error: null };
}

export async function getMenuById(
    supabase: SupabaseClient,
    menuId: string,
): Promise<{ data: Menu | null; error: string | null }> {
    const { data, error } = await supabase.from("nutritionist_menus").select("*").eq("id", menuId).single();
    if (error) return { data: null, error: error.message };
    return { data: rowToMenu(data as MenuRow), error: null };
}

export async function upsertMenu(
    supabase: SupabaseClient,
    nutritionistId: string,
    menu: Partial<Menu> & { id?: string },
): Promise<{ data: Menu | null; error: string | null }> {
    const payload = menuToUpsertPayload(nutritionistId, menu);
    const { data, error } = await supabase.from("nutritionist_menus").upsert(payload).select("*").single();
    if (error) return { data: null, error: error.message };
    return { data: rowToMenu(data as MenuRow), error: null };
}

export async function deleteMenuById(
    supabase: SupabaseClient,
    menuId: string,
): Promise<{ ok: boolean; error: string | null }> {
    const { error } = await supabase.from("nutritionist_menus").delete().eq("id", menuId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
}

/* ===================== Compatibility stubs (чтобы сборка не падала) ===================== */
/** @deprecated localStorage больше не используем */
export function loadMenusFromStorage(): Menu[] {
    return [];
}
/** @deprecated localStorage больше не используем */
export function saveMenusToStorage(_: Menu[]): void {
    // noop
}
/** @deprecated localStorage больше не используем */
export function addMenu(_: Menu): void {
    // noop
}
/** @deprecated localStorage больше не используем */
export function deleteMenu(_: string): void {
    // noop
}
/** @deprecated localStorage больше не используем */
export function updateMenu(_: Menu): void {
    // noop
}
/** @deprecated localStorage больше не используем */
export function getMenuByIdFromStorage(_: string): Menu | undefined {
    return undefined;
}
