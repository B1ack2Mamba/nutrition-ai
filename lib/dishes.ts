// lib/dishes.ts

import { supabase } from "@/lib/supabaseClient";

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
  calories?: number;
  basis?: IngredientBasis;
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

export type DishInput = Omit<Dish, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

type DishDbRow = {
  id: string;
  nutritionist_id: string;
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

function dishFromRow(row: DishDbRow): Dish {
  return {
    id: row.id,
    title: row.title,
    category: row.category as DishCategory,
    timeMinutes: row.time_minutes ?? undefined,
    difficulty: (row.difficulty as Difficulty) ?? undefined,
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as Ingredient[]) : [],
    macros: isRecord(row.macros) ? (row.macros as Macros) : {},
    tags: (Array.isArray(row.tags) ? row.tags : []) as DishTag[],
    instructions: row.instructions ?? undefined,
    notes: row.notes ?? undefined,
    imageUrl: row.image_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Нет авторизации. Войди в аккаунт.");
  return data.user.id;
}

// ========= Supabase CRUD =========

export async function listDishes(): Promise<Dish[]> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("nutritionist_dishes")
    .select("*")
    .eq("nutritionist_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as DishDbRow[];
  return rows.map(dishFromRow);
}

export async function getDishById(id: string): Promise<Dish | null> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("nutritionist_dishes")
    .select("*")
    .eq("id", id)
    .eq("nutritionist_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? dishFromRow(data as DishDbRow) : null;
}

export async function createDish(input: DishInput): Promise<Dish> {
  const userId = await requireUserId();
  const now = new Date().toISOString();

  const payload = {
    id: input.id,
    nutritionist_id: userId,
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
    created_at: input.createdAt ?? now,
    updated_at: input.updatedAt ?? now,
  };

  const { data, error } = await supabase
    .from("nutritionist_dishes")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return dishFromRow(data as DishDbRow);
}

export async function updateDish(id: string, patch: Partial<DishInput>): Promise<Dish> {
  const userId = await requireUserId();

  const payload: Record<string, unknown> = {
    title: patch.title,
    category: patch.category,
    time_minutes: patch.timeMinutes ?? undefined,
    difficulty: patch.difficulty ?? undefined,
    ingredients: patch.ingredients ?? undefined,
    macros: patch.macros ?? undefined,
    tags: patch.tags ?? undefined,
    instructions: patch.instructions ?? undefined,
    notes: patch.notes ?? undefined,
    image_url: patch.imageUrl ?? undefined,
    updated_at: new Date().toISOString(),
  };

  // remove undefined keys so PostgREST doesn't overwrite with null
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const { data, error } = await supabase
    .from("nutritionist_dishes")
    .update(payload)
    .eq("id", id)
    .eq("nutritionist_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return dishFromRow(data as DishDbRow);
}

export async function deleteDish(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("nutritionist_dishes")
    .delete()
    .eq("id", id)
    .eq("nutritionist_id", userId);
  if (error) throw error;
}
