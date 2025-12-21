"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, FormEvent, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Menu, listMenus } from "@/lib/menus";

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
    menu_data: Menu | null;
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

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null;
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
            ? (allowedRaw.map((x) => String(x)) as string[])
            : typeof allowedRaw === "string"
                ? allowedRaw
                : null;

        const banned: FoodValue = Array.isArray(bannedRaw)
            ? (bannedRaw.map((x) => String(x)) as string[])
            : typeof bannedRaw === "string"
                ? bannedRaw
                : null;

        return { id, schema: "products_cols", allowed, banned, notes, updatedAt };
    }

    if ("allowed" in row || "banned" in row) {
        const allowedRaw = (row as Record<string, unknown>).allowed;
        const bannedRaw = (row as Record<string, unknown>).banned;

        const allowed: FoodValue = Array.isArray(allowedRaw)
            ? (allowedRaw.map((x) => String(x)) as string[])
            : typeof allowedRaw === "string"
                ? allowedRaw
                : null;

        const banned: FoodValue = Array.isArray(bannedRaw)
            ? (bannedRaw.map((x) => String(x)) as string[])
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

export default function ClientDetailPage() {
    const params = useParams();
    const rawClientId = (params as Record<string, string | string[] | undefined>)?.clientId;
    const clientId = typeof rawClientId === "string" ? rawClientId : Array.isArray(rawClientId) ? rawClientId[0] : "";

    const [basic, setBasic] = useState<BasicProfile | null>(null);
    const [extended, setExtended] = useState<ExtendedProfile | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [journal, setJournal] = useState<JournalEntry[]>([]);
    const [menus, setMenus] = useState<Menu[]>([]);

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

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const storedMenus = await listMenus();
                if (!alive) return;
                const uniq = Array.from(
                    new Map(storedMenus.map((m) => [m.id, m])).values()
                );
                setMenus(uniq);
            } catch (e) {
                console.error(e);
                if (!alive) return;
                setMenus([]);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

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
            const { data, error } = await supabase
                .from("client_food_rules")
                .select("*")
                .eq("client_id", clientId)
                .eq("nutritionist_id", nutritionistId)
                .order("updated_at", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(1);

            if (error) {
                setFoodHint("Секция «Можно/Нельзя» не настроена (таблица client_food_rules или права/RLS).");
                setFoodDb({ id: null, schema: "unknown", allowed: null, banned: null, notes: null, updatedAt: null });
                setFoodAllowed("");
                setFoodBanned("");
                setFoodNotes("");
                return;
            }

            setFoodHint(null);
            const row = (data?.[0] ?? null) as unknown;
            const snap = pickFoodSnapshot(row);
            setFoodDb(snap);

            setFoodAllowed(foodValueToText(snap.allowed));
            setFoodBanned(foodValueToText(snap.banned));
            setFoodNotes(snap.notes ?? "");
        },
        [clientId],
    );

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

            const { data: extRows } = await supabase.from("client_profiles").select("*").eq("user_id", clientId).limit(1);
            if (extRows && extRows.length > 0) setExtended(extRows[0] as ExtendedProfile);
            else setExtended(null);

            const { data: assRows, error: assErr } = await supabase
                .from("client_menu_assignments")
                .select("*")
                .eq("client_id", clientId)
                .eq("nutritionist_id", user.id)
                .order("created_at", { ascending: false });

            if (assErr) setFatalError(assErr.message);
            else if (assRows) setAssignments(assRows as Assignment[]);

            const { data: journalRows } = await supabase
                .from("client_journal_entries")
                .select("*")
                .eq("user_id", clientId)
                .order("entry_date", { ascending: true });

            if (journalRows) setJournal(journalRows as JournalEntry[]);

            await reloadLabReports();
            await reloadFoodRules(user.id);

            setLoading(false);
        };

        load();
    }, [clientId, reloadLabReports, reloadFoodRules]);

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
            await supabase
                .from("client_menu_assignments")
                .update({ status: "archived" })
                .eq("client_id", clientId)
                .eq("nutritionist_id", user.id)
                .eq("status", "active");

            const start = new Date();
            const startIso = start.toISOString().slice(0, 10);
            const endIso =
                typeof menu.daysCount === "number" && menu.daysCount > 0
                    ? new Date(start.getTime() + (menu.daysCount - 1) * 86400000).toISOString().slice(0, 10)
                    : null;

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
                menu_data: menu,
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

            const tryLegacy = async (): Promise<string | null> => {
                const payload = {
                    client_id: clientId,
                    nutritionist_id: user.id,
                    allowed: allowedText || null,
                    banned: bannedText || null,
                    notes: notesText || null,
                    updated_at: nowIso,
                };

                if (foodDb.id) {
                    const { error: e } = await supabase.from("client_food_rules").update(payload).eq("id", foodDb.id);
                    return e ? e.message : null;
                } else {
                    const { error: e } = await supabase.from("client_food_rules").insert(payload);
                    return e ? e.message : null;
                }
            };

            const tryProductsCols = async (): Promise<string | null> => {
                const allowedArr = parseFoodTextareaToArray(allowedText);
                const bannedArr = parseFoodTextareaToArray(bannedText);

                const payload = {
                    client_id: clientId,
                    nutritionist_id: user.id,
                    allowed_products: allowedArr.length ? allowedArr : null,
                    banned_products: bannedArr.length ? bannedArr : null,
                    notes: notesText || null,
                    updated_at: nowIso,
                };

                if (foodDb.id) {
                    const { error: e } = await supabase.from("client_food_rules").update(payload).eq("id", foodDb.id);
                    return e ? e.message : null;
                } else {
                    const { error: e } = await supabase.from("client_food_rules").insert(payload);
                    return e ? e.message : null;
                }
            };

            let errMsg: string | null = null;

            if (schema === "products_cols") {
                errMsg = await tryProductsCols();
                if (errMsg) errMsg = await tryLegacy();
            } else if (schema === "legacy") {
                errMsg = await tryLegacy();
                if (errMsg) errMsg = await tryProductsCols();
            } else {
                errMsg = await tryLegacy();
                if (errMsg) errMsg = await tryProductsCols();
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
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">Клиент: {basic.full_name ?? basic.id}</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Цель → активный рацион → можно/нельзя → прогресс → дневник → анализы.</p>
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
                                    {activeAssignment.days_count ? ` · ${activeAssignment.days_count} дней` : activeAssignment.menu_data?.daysCount ? ` · ${activeAssignment.menu_data.daysCount} дней` : ""}
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
                        <h3 className="text-sm font-semibold">Назначение рациона по цели</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Слева — цель и рацион, справа — продукты «можно/нельзя» (видит клиент).</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAssignForm((v) => !v)}
                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        {showAssignForm ? "Скрыть" : "Назначить меню"}
                    </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                    {/* Цель */}
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="text-xs text-zinc-500">Цель</div>
                        <div className="mt-1 text-base font-semibold">{extended?.main_goal || "—"}</div>
                        {extended?.goal_description ? (
                            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{extended.goal_description}</div>
                        ) : (
                            <div className="mt-1 text-xs text-zinc-500">Описание цели не заполнено.</div>
                        )}
                    </div>

                    {/* Рацион */}
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="text-xs text-zinc-500">Активный рацион</div>

                        {activeAssignment ? (
                            <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium">
                                            {activeAssignment.title}
                                            <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-black">
                                                активный
                                            </span>
                                        </div>

                                        <div className="mt-1 text-[11px] text-zinc-500">
                                            {activeAssignment.start_date ? `с ${formatDate(activeAssignment.start_date)}` : `с ${formatDate(activeAssignment.created_at)}`}
                                            {activeAssignment.end_date ? ` · по ${formatDate(activeAssignment.end_date)}` : ""}
                                        </div>

                                        <div className="mt-2 flex flex-wrap items-center gap-3">
                                            {activeAssignment.menu_id ? (
                                                <Link
                                                    href={`/nutritionist/menus/${activeAssignment.menu_id}/preview`}
                                                    className="text-[11px] font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-200"
                                                >
                                                    Открыть меню
                                                </Link>
                                            ) : null}

                                            <button
                                                type="button"
                                                onClick={() => setAssignmentStatus(activeAssignment.id, "archived")}
                                                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                            >
                                                В архив
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => deleteAssignment(activeAssignment.id)}
                                                className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/30"
                                            >
                                                Удалить
                                            </button>
                                        </div>

                                        {activeAssignment.notes ? <div className="mt-2 text-[11px] text-zinc-500">{activeAssignment.notes}</div> : null}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-white/70 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
                                Активный рацион не выбран.
                            </div>
                        )}

                        <div className="mt-3 text-[11px] text-zinc-500">История ниже (по умолчанию сокращена примерно в 2 раза).</div>
                    </div>

                    {/* Можно/Нельзя */}
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
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
                                disabled={foodSaving || !!foodHint}
                                className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                                title={foodHint ? "Нужно настроить таблицу client_food_rules и RLS" : ""}
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
                </div>

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
                                                    {a.days_count ? ` · ${a.days_count} дней` : a.menu_data?.daysCount ? ` · ${a.menu_data.daysCount} дней` : null}
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
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {hiddenLegacyCount ? <div className="text-[11px] text-zinc-500">Скрыто устаревших записей (без привязки к меню): {hiddenLegacyCount}</div> : null}
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
