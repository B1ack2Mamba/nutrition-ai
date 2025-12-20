// lib/assignMenu.ts
import { supabase } from "@/lib/supabaseClient";
import type { Dish } from "@/lib/dishes";
import type { Menu, MenuSnapshot } from "@/lib/menus";

type DishDbRow = {
    id: string;
    title: string;
    category: string;
    time_minutes: number | null;
    difficulty: string | null;
    ingredients: unknown;
    macros: unknown;
    tags: string[] | null;
    instructions: string | null;
    notes: string | null;
    image_url: string | null;
    created_at: string;
    updated_at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeDish(row: DishDbRow): Dish {
    return {
        id: row.id,
        title: row.title,
        category: row.category as Dish["category"],
        timeMinutes: row.time_minutes ?? undefined,
        difficulty: (row.difficulty as Dish["difficulty"]) ?? undefined,
        ingredients: Array.isArray(row.ingredients) ? (row.ingredients as Dish["ingredients"]) : [],
        macros: isRecord(row.macros) ? (row.macros as Dish["macros"]) : {},
        tags: (Array.isArray(row.tags) ? row.tags : []) as Dish["tags"],
        instructions: row.instructions ?? undefined,
        notes: row.notes ?? undefined,
        imageUrl: row.image_url ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function collectDishIds(menu: Menu): string[] {
    const ids: string[] = [];
    for (const day of menu.days ?? []) {
        const m = day.meals ?? {};
        const push = (v: string | null | undefined) => {
            if (typeof v === "string" && v.trim()) ids.push(v.trim());
        };
        push(m.breakfast ?? null);
        push(m.lunch ?? null);
        push(m.dinner ?? null);
        push(m.snack ?? null);
    }
    return Array.from(new Set(ids));
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

export async function buildMenuSnapshotWithDishes(menu: Menu): Promise<{
    snapshot: MenuSnapshot;
    warning: string | null;
}> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
        return { snapshot: menu, warning: "Нет авторизации — сохраняю меню без рецептов." };
    }

    const dishIds = collectDishIds(menu);
    if (dishIds.length === 0) {
        return { snapshot: menu, warning: null };
    }

    const dishIndex: Record<string, Dish> = {};
    let hadError = false;

    for (const ch of chunk(dishIds, 100)) {
        const res = await supabase
            .from("nutritionist_dishes")
            .select("*")
            .eq("nutritionist_id", data.user.id)
            .in("id", ch);

        if (res.error) {
            hadError = true;
            continue;
        }

        const rows = (res.data ?? []) as DishDbRow[];
        for (const r of rows) {
            dishIndex[r.id] = normalizeDish(r);
        }
    }

    const snapshot: MenuSnapshot = { ...menu, dishIndex };
    return {
        snapshot,
        warning: hadError ? "Не все рецепты подтянулись (RLS/таблица/часть id не найдена). Меню сохранено, но часть блюд может быть без деталей." : null,
    };
}
