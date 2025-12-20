"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, FormEvent, useCallback } from "react";
import { useParams } from "next/navigation";
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
    allergies: string | null;
    banned_foods: string | null;
    preferences: string | null;
    monthly_budget: number | null;
};

type MenuGoal = "fat_loss" | "muscle_gain" | "maintenance" | "energy";
type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

type MenuDay = {
    index: number;
    label: string;
    meals: Partial<Record<MealSlot, string | null>>; // dishId
    note?: string;
};

type Menu = {
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

type Assignment = {
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
    menu_data: unknown | null; // в БД jsonb, тут держим unknown
};

type JournalEntry = {
    id: string;
    entry_date: string;
    weight_kg: number | null;
    energy_level: number | null;
    mood: number | null;
    notes: string | null;
};

type LabReport = {
    id: string;
    client_id: string;
    nutritionist_id: string | null;
    title: string | null;
    taken_at: string | null;
    file_path: string;
    file_url: string | null;
    ai_summary: string | null;
    created_at: string;
};

type FoodSchemaKind = "legacy" | "products_cols" | "unknown";
type FoodValue = string | string[] | null;

type FoodDbSnapshot = {
    id: string | null;
    schema: FoodSchemaKind;
    allowed: FoodValue;
    banned: FoodValue;
    notes: string | null;
    updatedAt: string | null;
};

/** Снапшот блюда, который попадёт к клиенту в menu_data */
type DishSnapshot = {
    id: string;
    name: string;
    kcal?: number | null;
    details?: string;
    ingredients?: string[];
    steps?: string[];
};

/** Нормализованный формат меню для клиента (чтобы твой парсер 100% увидел блюда/рецепты) */
type MenuSnapshotV2 = {
    v: 2;
    id: string;
    title: string;
    goal: MenuGoal | null;
    daysCount: number;
    targetCalories: number | null;
    description: string | null;
    days: Array<{
        label: string;
        meals: Array<{
            name: MealSlot;
            dishes: DishSnapshot[];
        }>;
    }>;
    // на всякий — индекс (удобно дебажить, но клиент может не использовать)
    dishIndex: Record<string, DishSnapshot>;
    builtAt: string;
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
    tags: unknown;
    instructions: string | null;
    notes: string | null;
    image_url: string | null;
    created_at: string;
    updated_at: string;
};

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

/* ===================== Helpers ===================== */

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

function asRecord(x: unknown): Record<string, unknown> {
    return isRecord(x) ? x : {};
}

function formatDate(d: string | null | undefined): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
}

function formatDateTime(d: string | null | undefined): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleString();
}

function splitTokens(s: string | null | undefined): string[] {
    if (!s) return [];
    return s
        .split(/[,;\n]/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 30);
}

function parseFoodTextareaToArray(text: string): string[] {
    return text
        .split(/[,;\n]/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 200);
}

function foodValueToText(v: FoodValue): string {
    if (!v) return "";
    if (Array.isArray(v)) return v.join("\n");
    if (typeof v === "string") return v;
    return "";
}

function foodValueToTokens(v: FoodValue): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 60);
    if (typeof v === "string") return parseFoodTextareaToArray(v).slice(0, 60);
    return [];
}

function pickFoodSnapshot(row: unknown): FoodDbSnapshot {
    if (!isRecord(row)) {
        return { id: null, schema: "unknown", allowed: null, banned: null, notes: null, updatedAt: null };
    }

    const id = typeof row.id === "string" ? row.id : null;
    const notes = typeof row.notes === "string" ? row.notes : null;

    const updatedAt =
        (typeof row.updated_at === "string" ? row.updated_at : null) ??
        (typeof row.created_at === "string" ? row.created_at : null);

    if ("allowed_products" in row || "banned_products" in row) {
        const allowedRaw = (row as Record<string, unknown>).allowed_products;
        const bannedRaw = (row as Record<string, unknown>).banned_products;

        const allowed: FoodValue = Array.isArray(allowedRaw)
            ? allowedRaw.map((x) => String(x))
            : typeof allowedRaw === "string"
                ? allowedRaw
                : null;

        const banned: FoodValue = Array.isArray(bannedRaw)
            ? bannedRaw.map((x) => String(x))
            : typeof bannedRaw === "string"
                ? bannedRaw
                : null;

        return { id, schema: "products_cols", allowed, banned, notes, updatedAt };
    }

    if ("allowed" in row || "banned" in row) {
        const allowedRaw = (row as Record<string, unknown>).allowed;
        const bannedRaw = (row as Record<string, unknown>).banned;

        const allowed: FoodValue = Array.isArray(allowedRaw)
            ? allowedRaw.map((x) => String(x))
            : typeof allowedRaw === "string"
                ? allowedRaw
                : null;

        const banned: FoodValue = Array.isArray(bannedRaw)
            ? bannedRaw.map((x) => String(x))
            : typeof bannedRaw === "string"
                ? bannedRaw
                : null;

        return { id, schema: "legacy", allowed, banned, notes, updatedAt };
    }

    return { id, schema: "unknown", allowed: null, banned: null, notes, updatedAt };
}

function isAuthRefreshTokenErrorMessage(msg: string) {
    const m = msg.toLowerCase();
    return m.includes("refresh token") || m.includes("invalid refresh token");
}

function normalizeMealSlot(x: string): MealSlot | null {
    const s = x.toLowerCase().trim();
    if (s === "breakfast") return "breakfast";
    if (s === "lunch") return "lunch";
    if (s === "dinner") return "dinner";
    if (s === "snack" || s === "snacks") return "snack";
    return null;
}

function safeString(x: unknown): string | null {
    if (typeof x === "string") {
        const t = x.trim();
        return t ? t : null;
    }
    if (typeof x === "number") return String(x);
    return null;
}

function parseIngredientsToStrings(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) {
        return v
            .map((it) => {
                if (typeof it === "string") return it.trim();
                if (isRecord(it)) {
                    const name = safeString(it.name) ?? safeString(it.title) ?? safeString(it.product) ?? "";
                    const amount = safeString(it.amount) ?? safeString(it.grams) ?? safeString(it.qty) ?? "";
                    const basis = safeString(it.basis);
                    const tail = [amount, basis].filter(Boolean).join(" ");
                    return [name, tail].filter(Boolean).join(" ").trim();
                }
                return "";
            })
            .filter(Boolean)
            .slice(0, 60);
    }
    if (typeof v === "string") {
        return v
            .split(/[,;\n]/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 60);
    }
    if (isRecord(v)) return parseIngredientsToStrings(Object.values(v));
    return [];
}

function parseSteps(instructions: string | null): string[] {
    if (!instructions) return [];
    return instructions
        .split(/\n+/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 40);
}

function extractCalories(macros: unknown): number | null {
    if (!macros) return null;
    if (isRecord(macros)) {
        const v = macros.calories ?? macros.kcal ?? macros.energy;
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        }
    }
    return null;
}

function parseMenuRow(row: unknown): Menu | null {
    if (!isRecord(row)) return null;

    const id = safeString(row.id);
    const title = safeString(row.title);
    const daysCountRaw = row.days_count ?? row.daysCount;
    const createdAt = safeString(row.created_at) ?? new Date().toISOString();
    const updatedAt = safeString(row.updated_at) ?? createdAt;

    if (!id || !title) return null;

    const goal = safeString(row.goal) as MenuGoal | null;
    const targetCalories =
        typeof row.target_calories === "number"
            ? row.target_calories
            : typeof row.targetCalories === "number"
                ? row.targetCalories
                : null;

    const description = safeString(row.description) ?? undefined;

    const daysRaw = row.days;
    const days: MenuDay[] = Array.isArray(daysRaw)
        ? daysRaw
            .map((d, idx) => {
                const dr = asRecord(d);
                const label = safeString(dr.label) ?? safeString(dr.name) ?? `Day ${idx + 1}`;
                const index = typeof dr.index === "number" ? dr.index : idx;

                const mealsRaw = dr.meals;
                const mealsRec: Partial<Record<MealSlot, string | null>> = {};
                if (isRecord(mealsRaw)) {
                    (Object.entries(mealsRaw) as Array<[string, unknown]>).forEach(([k, v]) => {
                        const slot = normalizeMealSlot(k);
                        if (!slot) return;
                        mealsRec[slot] = typeof v === "string" ? v : v == null ? null : String(v);
                    });
                }

                return { index, label, meals: mealsRec, note: safeString(dr.note) ?? undefined } satisfies MenuDay;
            })
            .slice(0, 60)
        : [];

    const daysCount =
        typeof daysCountRaw === "number" && Number.isFinite(daysCountRaw)
            ? Math.max(1, Math.floor(daysCountRaw))
            : Math.max(1, days.length || 7);

    return {
        id,
        title,
        goal: goal ?? undefined,
        daysCount,
        targetCalories: targetCalories ?? undefined,
        description,
        days,
        createdAt,
        updatedAt,
    };
}

function collectDishIds(menu: Menu): string[] {
    const ids = new Set<string>();
    for (const day of menu.days) {
        const m = day.meals;
        (Object.values(m) as Array<string | null | undefined>).forEach((v) => {
            if (typeof v === "string" && v.trim()) ids.add(v.trim());
        });
    }
    return Array.from(ids);
}

function dishRowToSnapshot(d: DishDbRow): DishSnapshot {
    const kcal = extractCalories(d.macros);
    const ingredients = parseIngredientsToStrings(d.ingredients);
    const steps = parseSteps(d.instructions);

    const detailsParts: string[] = [];
    if (kcal != null) detailsParts.push(`ккал: ${kcal}`);
    if (d.time_minutes != null) detailsParts.push(`${d.time_minutes} мин`);
    if (d.difficulty) detailsParts.push(d.difficulty);

    return {
        id: d.id,
        name: d.title,
        kcal,
        details: detailsParts.length ? detailsParts.join(" · ") : undefined,
        ingredients: ingredients.length ? ingredients : undefined,
        steps: steps.length ? steps : undefined,
    };
}

function buildMenuSnapshotV2(menu: Menu, dishIndex: Record<string, DishSnapshot>): MenuSnapshotV2 {
    const slots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

    const days = menu.days.map((day, i) => {
        const meals = slots.map((slot) => {
            const dishId = day.meals?.[slot] ?? null;

            if (!dishId) {
                return { name: slot, dishes: [] };
            }

            const snap = dishIndex[dishId];
            const fallback: DishSnapshot = snap ?? {
                id: dishId,
                name: "Блюдо",
                details: `ID блюда: ${dishId}`,
                ingredients: undefined,
                steps: undefined,
            };

            return { name: slot, dishes: [fallback] };
        });

        return {
            label: day.label || `Day ${i + 1}`,
            meals,
        };
    });

    return {
        v: 2,
        id: menu.id,
        title: menu.title,
        goal: menu.goal ?? null,
        daysCount: menu.daysCount,
        targetCalories: menu.targetCalories ?? null,
        description: menu.description ?? null,
        days,
        dishIndex,
        builtAt: new Date().toISOString(),
    };
}

/* ===================== Page ===================== */

export default function ClientDetailPage() {
    const params = useParams();
    const rawClientId = (params as Record<string, string | string[] | undefined>)?.clientId;
    const clientId = typeof rawClientId === "string" ? rawClientId : Array.isArray(rawClientId) ? rawClientId[0] : "";

    const [basic, setBasic] = useState<BasicProfile | null>(null);
    const [extended, setExtended] = useState<ExtendedProfile | null>(null);

    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [journal, setJournal] = useState<JournalEntry[]>([]);

    const [menus, setMenus] = useState<Menu[]>([]);
    const [menusHint, setMenusHint] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState<string | null>(null);

    const [selectedMenuId, setSelectedMenuId] = useState<string>("");
    const [newNotes, setNewNotes] = useState("");
    const [savingAssign, setSavingAssign] = useState(false);

    const [journalRange, setJournalRange] = useState<"7" | "30" | "all">("30");
    const [showAssignForm, setShowAssignForm] = useState(false);
    const [showAllAssignments, setShowAllAssignments] = useState(false);

    // Анализы (только просмотр)
    const [labReports, setLabReports] = useState<LabReport[]>([]);
    const [labHint, setLabHint] = useState<string | null>(null);
    const [labOpeningId, setLabOpeningId] = useState<string | null>(null);

    // Можно / Нельзя
    const [foodHint, setFoodHint] = useState<string | null>(null);
    const [foodDb, setFoodDb] = useState<FoodDbSnapshot>({
        id: null,
        schema: "unknown",
        allowed: null,
        banned: null,
        notes: null,
        updatedAt: null,
    });

    const [foodAllowed, setFoodAllowed] = useState("");
    const [foodBanned, setFoodBanned] = useState("");
    const [foodNotes, setFoodNotes] = useState("");
    const [foodSaving, setFoodSaving] = useState(false);
    const [foodSavedMsg, setFoodSavedMsg] = useState<string | null>(null);

    const reloadAssignments = useCallback(
        async (nutritionistId: string) => {
            const { data: assRows } = await supabase
                .from("client_menu_assignments")
                .select("*")
                .eq("client_id", clientId)
                .eq("nutritionist_id", nutritionistId)
                .order("created_at", { ascending: false });

            if (assRows) setAssignments(assRows as Assignment[]);
        },
        [clientId],
    );

    const reloadLabReports = useCallback(async () => {
        const { data, error } = await supabase
            .from("client_lab_reports")
            .select("*")
            .eq("client_id", clientId)
            .order("taken_at", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) {
            setLabHint("Секция анализов не настроена (таблица client_lab_reports и/или RLS).");
            setLabReports([]);
            return;
        }

        setLabHint(null);
        setLabReports((data ?? []) as LabReport[]);
    }, [clientId]);

    const openLabReport = useCallback(async (r: LabReport) => {
        setLabHint(null);
        setLabOpeningId(r.id);

        try {
            const { data, error } = await supabase.storage.from("lab_reports").createSignedUrl(r.file_path, 60 * 10);

            if (error || !data?.signedUrl) {
                if (r.file_url) {
                    window.open(r.file_url, "_blank", "noopener,noreferrer");
                    return;
                }
                setLabHint(`Не удалось открыть файл: ${error?.message ?? "no signedUrl"}`);
                return;
            }

            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        } finally {
            setLabOpeningId(null);
        }
    }, []);

    const reloadFoodRules = useCallback(
        async (nutritionistId: string) => {
            const tryQuery = async (withUpdatedAt: boolean) => {
                const q = supabase
                    .from("client_food_rules")
                    .select("*")
                    .eq("client_id", clientId)
                    .eq("nutritionist_id", nutritionistId);

                if (withUpdatedAt) {
                    return q.order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(1);
                }
                return q.order("created_at", { ascending: false }).limit(1);
            };

            const r1 = await tryQuery(true);

            if (r1.error) {
                const msg = r1.error.message.toLowerCase();
                if (msg.includes("updated_at") && msg.includes("does not exist")) {
                    const r2 = await tryQuery(false);
                    if (r2.error) {
                        setFoodHint("Секция «Можно/Нельзя» не настроена (таблица client_food_rules или права/RLS).");
                        setFoodDb({ id: null, schema: "unknown", allowed: null, banned: null, notes: null, updatedAt: null });
                        setFoodAllowed("");
                        setFoodBanned("");
                        setFoodNotes("");
                        return;
                    }

                    setFoodHint(null);
                    const row2 = (r2.data?.[0] ?? null) as unknown;
                    const snap2 = pickFoodSnapshot(row2);
                    setFoodDb(snap2);
                    setFoodAllowed(foodValueToText(snap2.allowed));
                    setFoodBanned(foodValueToText(snap2.banned));
                    setFoodNotes(snap2.notes ?? "");
                    return;
                }

                setFoodHint("Секция «Можно/Нельзя» не настроена (таблица client_food_rules или права/RLS).");
                setFoodDb({ id: null, schema: "unknown", allowed: null, banned: null, notes: null, updatedAt: null });
                setFoodAllowed("");
                setFoodBanned("");
                setFoodNotes("");
                return;
            }

            setFoodHint(null);
            const row = (r1.data?.[0] ?? null) as unknown;
            const snap = pickFoodSnapshot(row);
            setFoodDb(snap);

            setFoodAllowed(foodValueToText(snap.allowed));
            setFoodBanned(foodValueToText(snap.banned));
            setFoodNotes(snap.notes ?? "");
        },
        [clientId],
    );

    const loadMyMenus = useCallback(async (nutritionistId: string) => {
        setMenusHint(null);

        const { data, error } = await supabase
            .from("nutritionist_menus")
            .select("id,nutritionist_id,title,goal,days_count,target_calories,description,days,created_at,updated_at")
            .eq("nutritionist_id", nutritionistId)
            .order("updated_at", { ascending: false });

        if (error) {
            const msg = error.message.toLowerCase();
            if (msg.includes("relation") && msg.includes("nutritionist_menus") && msg.includes("does not exist")) {
                setMenusHint("Нет таблицы nutritionist_menus. Создай её (SQL ниже), иначе меню неоткуда брать.");
            } else {
                setMenusHint(error.message);
            }
            setMenus([]);
            return;
        }

        const parsed = (data ?? [])
            .map((r: MenuDbRow) => parseMenuRow(r))
            .filter((x): x is Menu => !!x);

        setMenus(parsed);

        if (!selectedMenuId && parsed.length) {
            setSelectedMenuId(parsed[0].id);
        }
    }, [selectedMenuId]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setFatalError(null);

            if (!clientId) {
                setFatalError("clientId не найден");
                setLoading(false);
                return;
            }

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

            // 1) клиент профайл
            const { data: prof, error: profErr } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("id", clientId)
                .single();

            if (profErr) {
                setFatalError(profErr.message);
                setLoading(false);
                return;
            }

            setBasic(prof as BasicProfile);

            // 2) клиент расширенный профайл
            const { data: extRows } = await supabase
                .from("client_profiles")
                .select("*")
                .eq("user_id", clientId)
                .limit(1);

            if (extRows && extRows.length > 0) setExtended(extRows[0] as ExtendedProfile);
            else setExtended(null);

            // 3) назначения меню (текущий нутрициолог)
            const { data: assRows, error: assErr } = await supabase
                .from("client_menu_assignments")
                .select("*")
                .eq("client_id", clientId)
                .eq("nutritionist_id", user.id)
                .order("created_at", { ascending: false });

            if (assErr) setFatalError(assErr.message);
            else setAssignments((assRows ?? []) as Assignment[]);

            // 4) дневник
            const { data: journalRows } = await supabase
                .from("client_journal_entries")
                .select("*")
                .eq("user_id", clientId)
                .order("entry_date", { ascending: true });

            if (journalRows) setJournal(journalRows as JournalEntry[]);

            // 5) анализы + food rules
            await reloadLabReports();
            await reloadFoodRules(user.id);

            // 6) меню нутрициолога из БД
            await loadMyMenus(user.id);

            setLoading(false);
        };

        load();
    }, [clientId, reloadLabReports, reloadFoodRules, loadMyMenus]);

    const menuAssignments = useMemo(() => assignments.filter((a) => !!a.menu_id || !!a.menu_data), [assignments]);

    const hiddenLegacyCount = useMemo(() => {
        const n = assignments.length - menuAssignments.length;
        return n > 0 ? n : 0;
    }, [assignments.length, menuAssignments.length]);

    const activeAssignment = useMemo(() => {
        const explicit = menuAssignments.find((a) => a.status === "active");
        if (explicit) return explicit;
        return menuAssignments[0] ?? null;
    }, [menuAssignments]);

    const goalTokens = useMemo(() => {
        const t: { label: string; items: string[] }[] = [];
        const allergies = splitTokens(extended?.allergies);
        const banned = splitTokens(extended?.banned_foods);
        const prefs = splitTokens(extended?.preferences);

        if (allergies.length) t.push({ label: "Аллергии", items: allergies });
        if (banned.length) t.push({ label: "Запрещено (от клиента)", items: banned });
        if (prefs.length) t.push({ label: "Предпочтения", items: prefs });

        return t;
    }, [extended]);

    const filteredJournal = useMemo(() => {
        if (journalRange === "all") return journal;
        const days = journalRange === "7" ? 7 : 30;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return journal.filter((e) => new Date(e.entry_date) >= cutoff);
    }, [journal, journalRange]);

    const weightSeries = useMemo(() => {
        return filteredJournal
            .filter((j) => j.weight_kg != null)
            .map((j) => ({ d: j.entry_date, w: Number(j.weight_kg) }))
            .filter((x) => Number.isFinite(x.w));
    }, [filteredJournal]);

    const progress = useMemo(() => {
        const start = weightSeries[0]?.w ?? null;
        const last = weightSeries.length ? weightSeries[weightSeries.length - 1].w : null;
        const delta = start != null && last != null ? last - start : null;

        const energies = filteredJournal
            .map((e) => e.energy_level)
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
        const moods = filteredJournal
            .map((e) => e.mood)
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

        const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

        return {
            startWeight: start,
            lastWeight: last,
            deltaWeight: delta,
            avgEnergy: avg(energies),
            avgMood: avg(moods),
            entriesCount: filteredJournal.length,
        };
    }, [filteredJournal, weightSeries]);

    const weightPath = useMemo(() => {
        if (weightSeries.length < 2) return null;

        const wVals = weightSeries.map((x) => x.w);
        const minW = Math.min(...wVals);
        let maxW = Math.max(...wVals);
        if (maxW === minW) maxW = minW + 1;

        const W = 260;
        const H = 64;
        const pad = 6;

        const points = weightSeries.map((p, i) => {
            const x = pad + (i / (weightSeries.length - 1)) * (W - pad * 2);
            const k = (p.w - minW) / (maxW - minW);
            const y = pad + (1 - k) * (H - pad * 2);
            return { x, y };
        });

        const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

        return { d, W, H, minW, maxW };
    }, [weightSeries]);

    const buildDishIndexForMenu = useCallback(async (nutritionistId: string, menu: Menu) => {
        const dishIds = collectDishIds(menu);
        if (!dishIds.length) return { ok: true as const, dishIndex: {} as Record<string, DishSnapshot> };

        const { data, error } = await supabase
            .from("nutritionist_dishes")
            .select("id,nutritionist_id,title,category,time_minutes,difficulty,ingredients,macros,tags,instructions,notes,image_url,created_at,updated_at")
            .eq("nutritionist_id", nutritionistId)
            .in("id", dishIds);

        if (error) {
            return { ok: false as const, error: error.message };
        }

        const index: Record<string, DishSnapshot> = {};
        (data ?? []).forEach((row) => {
            const r = row as DishDbRow;
            index[r.id] = dishRowToSnapshot(r);
        });

        return { ok: true as const, dishIndex: index };
    }, []);

    const handleAssign = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedMenuId) return;

        setSavingAssign(true);
        setFatalError(null);

        const { data, error } = await supabase.auth.getUser();
        if (error) {
            setFatalError(error.message);
            setSavingAssign(false);
            return;
        }

        const user = data.user;
        if (!user) {
            setFatalError("Нет авторизации");
            setSavingAssign(false);
            return;
        }

        const menu = menus.find((m) => m.id === selectedMenuId);
        if (!menu) {
            setFatalError("Меню не найдено");
            setSavingAssign(false);
            return;
        }

        try {
            // 1) подтягиваем блюда нутрициолога и делаем снапшот (чтобы клиенту не нужен доступ к таблице блюд)
            const di = await buildDishIndexForMenu(user.id, menu);
            if (!di.ok) {
                setFatalError(`Не удалось собрать рецепты для меню: ${di.error}`);
                return;
            }

            const snapshot: MenuSnapshotV2 = buildMenuSnapshotV2(menu, di.dishIndex);

            // 2) архивируем прошлый active
            await supabase
                .from("client_menu_assignments")
                .update({ status: "archived" })
                .eq("client_id", clientId)
                .eq("nutritionist_id", user.id)
                .eq("status", "active");

            // 3) даты
            const start = new Date();
            const startIso = start.toISOString().slice(0, 10);
            const endIso =
                typeof menu.daysCount === "number" && menu.daysCount > 0
                    ? new Date(start.getTime() + (menu.daysCount - 1) * 86400000).toISOString().slice(0, 10)
                    : null;

            // 4) вставка назначения (menu_data = снапшот)
            const { error: insErr } = await supabase.from("client_menu_assignments").insert({
                client_id: clientId,
                nutritionist_id: user.id,
                title: menu.title,
                notes: newNotes.trim() || null,
                status: "active",
                start_date: startIso,
                end_date: endIso,
                menu_id: menu.id,
                days_count: menu.daysCount ?? null,
                menu_data: snapshot,
            });

            if (insErr) {
                setFatalError(insErr.message);
                return;
            }

            await reloadAssignments(user.id);
            setSelectedMenuId("");
            setNewNotes("");
            setShowAssignForm(false);
        } finally {
            setSavingAssign(false);
        }
    };

    const setAssignmentStatus = async (id: string, status: "active" | "archived") => {
        const { data, error } = await supabase.auth.getUser();
        if (error) return;
        const user = data.user;
        if (!user) return;

        if (status === "active") {
            await supabase
                .from("client_menu_assignments")
                .update({ status: "archived" })
                .eq("client_id", clientId)
                .eq("nutritionist_id", user.id)
                .eq("status", "active");
        }

        const { error: updErr } = await supabase.from("client_menu_assignments").update({ status }).eq("id", id);
        if (!updErr) await reloadAssignments(user.id);
    };

    const deleteAssignment = async (id: string) => {
        const { data, error } = await supabase.auth.getUser();
        if (error) return;
        const user = data.user;
        if (!user) return;

        const ok = confirm("Удалить это назначение меню?");
        if (!ok) return;

        const { error: delErr } = await supabase.from("client_menu_assignments").delete().eq("id", id);
        if (!delErr) await reloadAssignments(user.id);
    };

    const saveFoodRules = async () => {
        setFoodSaving(true);
        setFoodSavedMsg(null);
        setFoodHint(null);

        const { data, error } = await supabase.auth.getUser();
        if (error) {
            setFoodHint(error.message);
            setFoodSaving(false);
            return;
        }

        const user = data.user;
        if (!user) {
            setFoodHint("Нет авторизации");
            setFoodSaving(false);
            return;
        }

        try {
            const nowIso = new Date().toISOString();

            const allowedText = foodAllowed.trim();
            const bannedText = foodBanned.trim();
            const notesText = foodNotes.trim();

            const schema = foodDb.schema;

            const tryLegacy = async (withUpdatedAt: boolean): Promise<string | null> => {
                const payload: Record<string, unknown> = {
                    client_id: clientId,
                    nutritionist_id: user.id,
                    allowed: allowedText || null,
                    banned: bannedText || null,
                    notes: notesText || null,
                };
                if (withUpdatedAt) payload.updated_at = nowIso;

                if (foodDb.id) {
                    const { error: e } = await supabase.from("client_food_rules").update(payload).eq("id", foodDb.id);
                    return e ? e.message : null;
                } else {
                    const { error: e } = await supabase.from("client_food_rules").insert(payload);
                    return e ? e.message : null;
                }
            };

            const tryProductsCols = async (withUpdatedAt: boolean): Promise<string | null> => {
                const allowedArr = parseFoodTextareaToArray(allowedText);
                const bannedArr = parseFoodTextareaToArray(bannedText);

                const payload: Record<string, unknown> = {
                    client_id: clientId,
                    nutritionist_id: user.id,
                    allowed_products: allowedArr.length ? allowedArr : null,
                    banned_products: bannedArr.length ? bannedArr : null,
                    notes: notesText || null,
                };
                if (withUpdatedAt) payload.updated_at = nowIso;

                if (foodDb.id) {
                    const { error: e } = await supabase.from("client_food_rules").update(payload).eq("id", foodDb.id);
                    return e ? e.message : null;
                } else {
                    const { error: e } = await supabase.from("client_food_rules").insert(payload);
                    return e ? e.message : null;
                }
            };

            const runWithFallbackNoUpdatedAt = async (fn: (withUpdatedAt: boolean) => Promise<string | null>) => {
                const e1 = await fn(true);
                if (!e1) return null;
                const m = e1.toLowerCase();
                if (m.includes("updated_at") && m.includes("does not exist")) {
                    return await fn(false);
                }
                return e1;
            };

            let errMsg: string | null = null;

            if (schema === "products_cols") {
                errMsg = await runWithFallbackNoUpdatedAt(tryProductsCols);
                if (errMsg) errMsg = await runWithFallbackNoUpdatedAt(tryLegacy);
            } else if (schema === "legacy") {
                errMsg = await runWithFallbackNoUpdatedAt(tryLegacy);
                if (errMsg) errMsg = await runWithFallbackNoUpdatedAt(tryProductsCols);
            } else {
                errMsg = await runWithFallbackNoUpdatedAt(tryLegacy);
                if (errMsg) errMsg = await runWithFallbackNoUpdatedAt(tryProductsCols);
            }

            if (errMsg) {
                setFoodHint(errMsg);
                return;
            }

            await reloadFoodRules(user.id);

            setFoodSavedMsg("✅ Сохранено. Ниже видно, что сейчас назначено клиенту.");
            window.setTimeout(() => setFoodSavedMsg(null), 2500);
        } finally {
            setFoodSaving(false);
        }
    };

    if (loading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю данные клиента...</p>;
    if (fatalError) return <p className="text-sm text-red-500">{fatalError}</p>;
    if (!basic) return <p className="text-sm text-red-500">Клиент не найден или нет доступа.</p>;

    const compactCount = Math.min(6, Math.max(3, Math.ceil(menuAssignments.length / 2)));
    const shownAssignments = showAllAssignments ? menuAssignments : menuAssignments.slice(0, compactCount);

    const assignedAllowedTokens = foodValueToTokens(foodDb.allowed);
    const assignedBannedTokens = foodValueToTokens(foodDb.banned);

    return (
        <div className="space-y-6">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Клиент: {basic.full_name ?? basic.id}</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Цель → активный рацион → можно/нельзя → прогресс → дневник → анализы.
                    </p>
                </div>

                <Link
                    href="/nutritionist/clients"
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                    ← Назад
                </Link>
            </header>

            {/* РЕЗЮМЕ */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                        <div className="text-xs text-zinc-500">Цель</div>
                        <div className="text-base font-semibold">{extended?.main_goal || "—"}</div>
                        {extended?.goal_description ? (
                            <div className="text-sm text-zinc-600 dark:text-zinc-300">{extended.goal_description}</div>
                        ) : null}
                    </div>

                    <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900">
                        <div className="text-xs text-zinc-500">Активный рацион</div>
                        {activeAssignment ? (
                            <div className="mt-1 space-y-1">
                                <div className="font-medium">
                                    {activeAssignment.title}
                                    {activeAssignment.days_count ? ` · ${activeAssignment.days_count} дней` : ""}
                                </div>
                                <div className="text-xs text-zinc-500">
                                    {activeAssignment.start_date ? `с ${formatDate(activeAssignment.start_date)}` : `с ${formatDate(activeAssignment.created_at)}`}
                                    {activeAssignment.end_date ? ` · по ${formatDate(activeAssignment.end_date)}` : ""}
                                </div>
                                {activeAssignment.menu_id ? (
                                    <Link
                                        href={`/nutritionist/menus/${activeAssignment.menu_id}/preview`}
                                        className="inline-flex text-xs font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-200"
                                    >
                                        Открыть меню (превью)
                                    </Link>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mt-1 text-xs text-zinc-500">Пока нет назначений.</div>
                        )}
                    </div>
                </div>

                {goalTokens.length ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                        {goalTokens.map((g) => (
                            <div key={g.label} className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
                                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{g.label}</div>
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

            {/* Назначение рациона + Можно/Нельзя */}
            <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">Назначение рациона</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            При назначении мы сохраняем в menu_data полный снапшот блюд (ингредиенты + шаги), чтобы клиент видел всё без доступа к базе блюд.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAssignForm((v) => !v)}
                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        {showAssignForm ? "Скрыть" : "Назначить меню"}
                    </button>
                </div>

                {menusHint ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                        {menusHint}
                    </div>
                ) : null}

                {/* форма назначения */}
                {showAssignForm ? (
                    <form onSubmit={handleAssign} className="grid gap-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                        <label className="flex flex-col gap-1">
                            Меню для назначения
                            <select
                                value={selectedMenuId}
                                onChange={(e) => setSelectedMenuId(e.target.value)}
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                            >
                                <option value="">— Выберите меню —</option>
                                {menus.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.title} ({m.daysCount ?? 0} дней)
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="flex flex-col gap-1">
                            Комментарий (опционально)
                            <textarea
                                rows={1}
                                value={newNotes}
                                onChange={(e) => setNewNotes(e.target.value)}
                                placeholder="Коротко: особенности, рекомендации..."
                                className="min-h-[44px] rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                            />
                        </label>

                        <div className="flex items-center gap-2">
                            <button
                                type="submit"
                                disabled={savingAssign || !selectedMenuId}
                                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                            >
                                {savingAssign ? "Назначаю..." : "Назначить"}
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowAssignForm(false)}
                                className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            >
                                Отмена
                            </button>
                        </div>
                    </form>
                ) : null}

                {/* История назначений */}
                {menuAssignments.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Пока нет назначенных рационов.</p>
                ) : (
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold">История назначений</div>
                            {menuAssignments.length > compactCount ? (
                                <button
                                    type="button"
                                    onClick={() => setShowAllAssignments((v) => !v)}
                                    className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                >
                                    {showAllAssignments ? "Свернуть" : `Показать все (${menuAssignments.length})`}
                                </button>
                            ) : null}
                        </div>

                        <div className="space-y-2">
                            {shownAssignments.map((a) => {
                                const isActive = a.status === "active" || (a.status == null && a.id === activeAssignment?.id);

                                return (
                                    <div
                                        key={a.id}
                                        className={
                                            isActive
                                                ? "rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs ring-2 ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-zinc-100/10"
                                                : "rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                                        }
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-medium">
                                                    {a.title}
                                                    {a.days_count ? ` · ${a.days_count} дней` : null}
                                                    {isActive ? (
                                                        <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-black">
                                                            активный
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="mt-1 text-[11px] text-zinc-500">
                                                    {a.start_date ? `с ${formatDate(a.start_date)}` : `с ${formatDate(a.created_at)}`}
                                                    {a.end_date ? ` · по ${formatDate(a.end_date)}` : ""}
                                                </div>

                                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                                    {a.menu_id ? (
                                                        <Link
                                                            href={`/nutritionist/menus/${a.menu_id}/preview`}
                                                            className="text-[11px] font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-200"
                                                        >
                                                            Открыть меню
                                                        </Link>
                                                    ) : null}

                                                    <button
                                                        type="button"
                                                        onClick={() => deleteAssignment(a.id)}
                                                        className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/30"
                                                    >
                                                        Удалить
                                                    </button>
                                                </div>

                                                {a.notes ? <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">{a.notes}</p> : null}
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                {!isActive ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setAssignmentStatus(a.id, "active")}
                                                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                                    >
                                                        Сделать активным
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setAssignmentStatus(a.id, "archived")}
                                                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                                    >
                                                        В архив
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {hiddenLegacyCount ? <div className="text-[11px] text-zinc-500">Скрыто устаревших записей (без привязки к меню): {hiddenLegacyCount}</div> : null}

                {/* Можно/Нельзя */}
                <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-xs text-zinc-500">Продукты по цели</div>
                            <div className="mt-1 text-sm font-semibold">Можно / Нельзя</div>
                            {foodDb.updatedAt ? (
                                <div className="mt-1 text-[11px] text-zinc-500">Сейчас назначено (из БД): {formatDate(foodDb.updatedAt)}</div>
                            ) : (
                                <div className="mt-1 text-[11px] text-zinc-500">Пока не назначено.</div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={saveFoodRules}
                            disabled={foodSaving}
                            className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                        >
                            {foodSaving ? "Сохраняю..." : "Сохранить"}
                        </button>
                    </div>

                    {foodSavedMsg ? <div className="mt-2 text-[11px] text-green-600 dark:text-green-400">{foodSavedMsg}</div> : null}

                    {foodHint ? (
                        <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-white/70 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
                            {foodHint}
                        </div>
                    ) : null}

                    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                        <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Сейчас назначено клиенту</div>

                        <div className="mt-2">
                            <div className="text-[11px] text-zinc-500">Можно</div>
                            {assignedAllowedTokens.length ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {assignedAllowedTokens.map((x) => (
                                        <span
                                            key={`a-${x}`}
                                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                                        >
                                            {x}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-1 text-[11px] text-zinc-500">—</div>
                            )}
                        </div>

                        <div className="mt-3">
                            <div className="text-[11px] text-zinc-500">Нельзя</div>
                            {assignedBannedTokens.length ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {assignedBannedTokens.map((x) => (
                                        <span
                                            key={`b-${x}`}
                                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                                        >
                                            {x}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-1 text-[11px] text-zinc-500">—</div>
                            )}
                        </div>

                        {foodDb.notes ? <div className="mt-3 text-[11px] text-zinc-500">Комментарий: {foodDb.notes}</div> : null}
                    </div>

                    <div className="mt-3 space-y-2">
                        <label className="block text-xs">
                            <div className="mb-1 text-zinc-500">Можно</div>
                            <textarea
                                rows={4}
                                value={foodAllowed}
                                onChange={(e) => setFoodAllowed(e.target.value)}
                                placeholder="Напр.: курица, рыба, овощи..."
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                            />
                        </label>

                        <label className="block text-xs">
                            <div className="mb-1 text-zinc-500">Нельзя</div>
                            <textarea
                                rows={4}
                                value={foodBanned}
                                onChange={(e) => setFoodBanned(e.target.value)}
                                placeholder="Напр.: сахар, газировка..."
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                            />
                        </label>

                        <label className="block text-xs">
                            <div className="mb-1 text-zinc-500">Комментарий (опц.)</div>
                            <input
                                value={foodNotes}
                                onChange={(e) => setFoodNotes(e.target.value)}
                                placeholder="Почему так / на какой срок / чем заменить…"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                            />
                        </label>

                        {(foodAllowed.trim() || foodBanned.trim()) && !foodHint ? (
                            <div className="pt-2 text-[11px] text-zinc-500">Подсказка: можно вводить через запятую или с новой строки.</div>
                        ) : null}
                    </div>
                </div>
            </section>

            {/* Дневник */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold">Дневник клиента (вес / энергия / настроение)</h3>

                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-500">Период:</span>
                        {(["7", "30", "all"] as const).map((k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => setJournalRange(k)}
                                className={
                                    journalRange === k
                                        ? "rounded-full bg-black px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-black"
                                        : "rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                }
                            >
                                {k === "7" ? "7 дней" : k === "30" ? "30 дней" : "всё"}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                        <div className="text-zinc-500">Записей</div>
                        <div className="mt-1 text-sm font-semibold">{progress.entriesCount}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                        <div className="text-zinc-500">Вес (Δ)</div>
                        <div className="mt-1 text-sm font-semibold">
                            {progress.deltaWeight == null ? "—" : `${progress.deltaWeight > 0 ? "+" : ""}${Math.round(progress.deltaWeight * 10) / 10} кг`}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                            {progress.startWeight != null && progress.lastWeight != null ? `${Math.round(progress.startWeight * 10) / 10} → ${Math.round(progress.lastWeight * 10) / 10}` : ""}
                        </div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                        <div className="text-zinc-500">Энергия (ср.)</div>
                        <div className="mt-1 text-sm font-semibold">{progress.avgEnergy ?? "—"}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                        <div className="text-zinc-500">Настроение (ср.)</div>
                        <div className="mt-1 text-sm font-semibold">{progress.avgMood ?? "—"}</div>
                    </div>
                </div>

                {filteredJournal.length === 0 ? (
                    <p className="text-xs text-zinc-500">За выбранный период нет записей.</p>
                ) : (
                    <>
                        {weightPath ? (
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
                                <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                                    <span>Вес (мини-график)</span>
                                    <span>
                                        {Math.round(weightPath.minW * 10) / 10} — {Math.round(weightPath.maxW * 10) / 10} кг
                                    </span>
                                </div>
                                <svg width={weightPath.W} height={weightPath.H} className="block">
                                    <path d={weightPath.d} fill="none" stroke="currentColor" strokeWidth={2} />
                                </svg>
                                <div className="mt-2 text-[11px] text-zinc-500">* простой график, чтобы нутрициолог видел динамику.</div>
                            </div>
                        ) : null}

                        <div className="max-h-64 overflow-auto rounded-lg border border-zinc-200 text-xs dark:border-zinc-700">
                            <table className="min-w-full border-collapse">
                                <thead className="bg-zinc-50 dark:bg-zinc-900">
                                    <tr>
                                        <th className="px-2 py-1 text-left font-medium">Дата</th>
                                        <th className="px-2 py-1 text-left font-medium">Вес</th>
                                        <th className="px-2 py-1 text-left font-medium">Энергия</th>
                                        <th className="px-2 py-1 text-left font-medium">Настроение</th>
                                        <th className="px-2 py-1 text-left font-medium">Заметки</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredJournal.map((e) => (
                                        <tr key={e.id} className="border-t border-zinc-100 dark:border-zinc-800">
                                            <td className="px-2 py-1">{new Date(e.entry_date).toLocaleDateString()}</td>
                                            <td className="px-2 py-1">{e.weight_kg ?? "—"}</td>
                                            <td className="px-2 py-1">{e.energy_level ?? "—"}</td>
                                            <td className="px-2 py-1">{e.mood ?? "—"}</td>
                                            <td className="px-2 py-1">{e.notes ?? ""}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            {/* Анализы (только просмотр) */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">Анализы клиента (файлы)</h3>
                        <p className="mt-1 text-xs text-zinc-500">Клиент загружает анализы у себя. Здесь — только просмотр.</p>
                    </div>

                    <button
                        type="button"
                        onClick={reloadLabReports}
                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        Обновить
                    </button>
                </div>

                {labHint ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {labHint}
                    </div>
                ) : null}

                {labReports.length === 0 ? (
                    <p className="text-xs text-zinc-500">Пока нет загруженных анализов.</p>
                ) : (
                    <div className="space-y-2">
                        {labReports.map((r) => (
                            <div
                                key={r.id}
                                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium">
                                            {r.title ?? "Анализ"}
                                            {r.nutritionist_id ? (
                                                <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-white">специалист</span>
                                            ) : (
                                                <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] text-white">клиент</span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-[11px] text-zinc-500">
                                            дата: {formatDate(r.taken_at)} · загружено: {formatDateTime(r.created_at)}
                                        </div>

                                        {r.ai_summary ? (
                                            <div className="mt-2 rounded-lg bg-white p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                {r.ai_summary}
                                            </div>
                                        ) : null}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => openLabReport(r)}
                                        disabled={labOpeningId === r.id}
                                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                    >
                                        {labOpeningId === r.id ? "Открываю..." : "Открыть файл"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
