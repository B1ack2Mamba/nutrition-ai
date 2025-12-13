// lib/menus.ts
import type { Dish } from "./dishes";

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

const STORAGE_KEY = "nutritionist_menus_v1";

export function loadMenusFromStorage(): Menu[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Menu[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMenusToStorage(menus: Menu[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(menus));
}

export function addMenu(menu: Menu): void {
  const menus = loadMenusFromStorage();
  saveMenusToStorage([...menus, menu]);
}

export function deleteMenu(id: string): void {
  const menus = loadMenusFromStorage();
  const next = menus.filter((m) => m.id !== id);
  saveMenusToStorage(next);
}

export function getMenuById(id: string): Menu | undefined {
  const menus = loadMenusFromStorage();
  return menus.find((m) => m.id === id);
}

export function updateMenu(updated: Menu): void {
  const menus = loadMenusFromStorage();
  const next = menus.map((m) => (m.id === updated.id ? updated : m));
  saveMenusToStorage(next);
}
