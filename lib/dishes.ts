// lib/dishes.ts
"use client";

import { supabase } from "@/lib/supabaseClient";

/* ===================== Types ===================== */

export type DishCategory = "breakfast" | "lunch" | "dinner" | "snack";

export type DishTag =
    | "vegan"
    | "vegetarian"
    | "gluten_free"
    | "lactose_free"
    | "no_added_sugar"
    | "halal"
    | "kosher"
    | "diabetic_friendly";

export type Difficulty = "easy" | "medium" | "hard";
export type IngredientBasis = "raw" | "cooked";

export type Ingredient = {
    id: string;
    name: string;
    amount: string;
    calories?: number; // ккал для ингредиента (если хочешь)
    basis?: IngredientBasis; // сырой/готовый
};

export type Macros = {
    calories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
    fiber?: number;
};

export type Dish = {
    id: string;
    nutritionistId: string;

    title: string;
    category: DishCategory;
    timeMinutes?: number;
    difficulty?: Difficulty;

    ingredients: Ingredient[];
    macros: Macros;
    tags: DishTag[];

    instructions?: string;
    notes?: string;
    imageUrl?: string;

    createdAt: string;
    updatedAt: string;
};

type DishRow = {
    id: string;
    nutritionist_id: string;

    title: string;
    category: string;

    time_minutes: number | null;
    difficulty: string | null;

    ingredients: unknown; // jsonb
    macros: unknown; // jsonb
    tags: string[] | null;

    instructions: string | null;
    notes: string | null;
    image_url: string | null;

    created_at: string;
    updated_at: string;
};

/* ===================== Guards / Helpers ===================== */

function isDishCategory(x: unknown): x is DishCategory {
    return x === "breakfast" || x === "lunch" || x === "dinner" || x === "snack";
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function isIngredientBasis(v: unknown): v is IngredientBasis {
    return v === "raw" || v === "cooked";
}

function isIngredient(v: unknown): v is Ingredient {
    if (!isRecord(v)) return false;

    const id = v.id;
    const name = v.name;
    const amount = v.amount;

    if (typeof id !== "string" || id.length < 3) return false;
    if (typeof name !== "string") return false;
    if (typeof amount !== "string") return false;

    const calories = v.calories;
    if (
        calories !== undefined &&
        !(typeof calories === "number" && Number.isFinite(calories))
    ) {
        return false;
    }

    const basis = v.basis;
    if (basis !== undefined && !isIngredientBasis(basis)) {
        return false;
    }

    return true;
}

function rowToDish(r: DishRow): Dish {
    const rawIngredients: unknown[] = Array.isArray(r.ingredients) ? r.ingredients : [];
    const ingredients: Ingredient[] = rawIngredients
        .filter(isIngredient)
        .map((x) => ({
            id: x.id,
            name: x.name,
            amount: x.amount,
            calories:
                typeof x.calories === "number" && Number.isFinite(x.calories)
                    ? x.calories
                    : undefined,
            basis: isIngredientBasis(x.basis) ? x.basis : undefined,
        }));

    const macros: Macros =
        r.macros && typeof r.macros === "object" ? (r.macros as Macros) : {};

    const tags: DishTag[] = Array.isArray(r.tags)
        ? (r.tags as string[]).filter(Boolean) as DishTag[]
        : [];

    const category: DishCategory = isDishCategory(r.category)
        ? r.category
        : "breakfast";

    return {
        id: r.id,
        nutritionistId: r.nutritionist_id,

        title: r.title,
        category,
        timeMinutes: r.time_minutes ?? undefined,
        difficulty: (r.difficulty as Difficulty | null) ?? undefined,

        ingredients,
        macros,
        tags,

        instructions: r.instructions ?? undefined,
        notes: r.notes ?? undefined,
        imageUrl: r.image_url ?? undefined,

        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}

async function requireUserId(): Promise<
    { ok: true; userId: string } | { ok: false; error: string }
> {
    const { data, error } = await supabase.auth.getUser();
    if (error) return { ok: false, error: error.message };
    const user = data.user;
    if (!user) return { ok: false, error: "Нет авторизации" };
    return { ok: true, userId: user.id };
}

/* ===================== API ===================== */

export async function listMyDishes(): Promise<
    { ok: true; data: Dish[] } | { ok: false; error: string }
> {
    const u = await requireUserId();
    if (!u.ok) return u;

    const { data, error } = await supabase
        .from("nutritionist_dishes")
        .select("*")
        .eq("nutritionist_id", u.userId)
        .order("created_at", { ascending: false });

    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as DishRow[];
    return { ok: true, data: rows.map(rowToDish) };
}

export async function createDish(
    input: Omit<Dish, "nutritionistId" | "createdAt" | "updatedAt">,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const u = await requireUserId();
    if (!u.ok) return u;

    const now = new Date().toISOString();

    const payload = {
        id: input.id,
        nutritionist_id: u.userId,
        title: input.title,
        category: input.category,
        time_minutes: input.timeMinutes ?? null,
        difficulty: input.difficulty ?? null,
        ingredients: input.ingredients ?? [],
        macros: input.macros ?? {},
        tags: input.tags ?? [],
        instructions: input.instructions ?? null,
        notes: input.notes ?? null,
        image_url: input.imageUrl ?? null,
        created_at: now,
        updated_at: now,
    };

    const { error } = await supabase.from("nutritionist_dishes").insert(payload);
    if (error) return { ok: false, error: error.message };

    return { ok: true, id: input.id };
}

export async function deleteDish(
    id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const u = await requireUserId();
    if (!u.ok) return u;

    const { error } = await supabase
        .from("nutritionist_dishes")
        .delete()
        .eq("id", id)
        .eq("nutritionist_id", u.userId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
}
