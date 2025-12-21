// lib/menus.ts

import { supabase } from "@/lib/supabaseClient";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type MenuGoal =
  | "fat_loss"
  | "muscle_gain"
  | "maintenance"
  | "energy";

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
  title: string;
  goal?: MenuGoal;
  daysCount: number;
  targetCalories?: number;
  description?: string;
  days: MenuDay[];
  createdAt: string;
  updatedAt: string;
};

export type MenuCreateInput = Omit<Menu, "id" | "createdAt" | "updatedAt">;
export type MenuUpdateInput = Partial<Omit<Menu, "id" | "createdAt" | "updatedAt">>;

type MenuDbRow = {
  id: string;
  nutritionist_id: string;
  title: string;
  goal: string | null;
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

function menuFromRow(row: MenuDbRow): Menu {
  const days = Array.isArray(row.days) ? (row.days as MenuDay[]) : [];
  return {
    id: row.id,
    title: row.title,
    goal: (row.goal as MenuGoal) ?? undefined,
    daysCount: row.days_count,
    targetCalories: row.target_calories ?? undefined,
    description: row.description ?? undefined,
    days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export async function listMenus(): Promise<Menu[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("nutritionist_menus")
    .select("*")
    .eq("nutritionist_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((r) => menuFromRow(r as MenuDbRow));
}

export async function getMenuById(id: string): Promise<Menu | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("nutritionist_menus")
    .select("*")
    .eq("id", id)
    .eq("nutritionist_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? menuFromRow(data as MenuDbRow) : null;
}

export async function createMenu(input: MenuCreateInput): Promise<Menu> {
  const userId = await requireUserId();
  const payload = {
    nutritionist_id: userId,
    title: input.title,
    goal: input.goal ?? null,
    days_count: input.daysCount,
    target_calories: input.targetCalories ?? null,
    description: input.description ?? null,
    days: input.days ?? [],
  };

  const { data, error } = await supabase
    .from("nutritionist_menus")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return menuFromRow(data as MenuDbRow);
}

export async function updateMenu(id: string, patch: MenuUpdateInput): Promise<Menu> {
  const userId = await requireUserId();
  const payload: Record<string, unknown> = {
    title: patch.title ?? undefined,
    goal: patch.goal === undefined ? undefined : patch.goal ?? null,
    days_count: patch.daysCount ?? undefined,
    target_calories: patch.targetCalories === undefined ? undefined : patch.targetCalories ?? null,
    description: patch.description === undefined ? undefined : patch.description ?? null,
    days: patch.days ?? undefined,
    updated_at: new Date().toISOString(),
  };

  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const { data, error } = await supabase
    .from("nutritionist_menus")
    .update(payload)
    .eq("id", id)
    .eq("nutritionist_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return menuFromRow(data as MenuDbRow);
}

export async function deleteMenu(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("nutritionist_menus")
    .delete()
    .eq("id", id)
    .eq("nutritionist_id", userId);
  if (error) throw error;
}
