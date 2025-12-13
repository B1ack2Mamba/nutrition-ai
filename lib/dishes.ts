// lib/dishes.ts

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

export type Ingredient = {
  id: string;
  name: string;
  amount: string;
  calories?: number;
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

const STORAGE_KEY = "nutritionist_dishes_v1";

export function loadDishesFromStorage(): Dish[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Dish[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDishesToStorage(dishes: Dish[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dishes));
}

// Получить одно блюдо по id
export function getDishById(id: string): Dish | undefined {
  const dishes = loadDishesFromStorage();
  return dishes.find((d) => d.id === id);
}

// Обновить существующее блюдо
export function updateDish(updated: Dish): void {
  const dishes = loadDishesFromStorage();
  const next = dishes.map((d) => (d.id === updated.id ? updated : d));
  saveDishesToStorage(next);
}

// Удалить блюдо
export function deleteDish(id: string): void {
  const dishes = loadDishesFromStorage();
  const next = dishes.filter((d) => d.id !== id);
  saveDishesToStorage(next);
}
