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
    intake_form?: any | null;
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

    // --- новые поля для обратной связи по дневнику питания ---
    nutritionist_diary_note?: string | null; // комментарий нутрициолога
    client_diary_reply?: string | null; // ответ клиента

    food_diary?: any | null;
    training_plan?: any | null;
    training_report?: any | null;
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

    // --- заметки по анализам ---
    client_note?: string | null; // обратная связь клиента
    nutritionist_note?: string | null; // ответ/комментарий специалиста

    created_at: string;
};

/* =================== Анкета клиента: отображение =================== */

const INTAKE_LABELS: Record<string, string> = {
    full_name: "ФИО",
    birth_date: "Дата рождения",
    city: "Город",
    email: "Email",
    social_link: "Соцсети",
    phone: "Телефон",
    education_level: "Уровень образования",
    education_other: "Образование (другое)",
    current_work: "Работа сейчас",
    harmful_exposure: "Вредные производства",
    goal_setting: "Постановка целей",
    expectations: "Ожидания от работы",
    desired_result: "Желаемый результат",
    food_24h: "Питание за 24 часа",
    diet_history: "История диет",
    food_preferences: "Предпочтения в еде",
    water_liters: "Вода (л/день)",
    drinking_mode: "Режим питья",
    coffee: "Кофе",
    tea: "Чай",
    sport: "Спорт",
    steps_per_day: "Шаги в день",
};

const EDUCATION_LABELS: Record<string, string> = {
    secondary_special: "Средне-специальное",
    bachelor: "Высшее бакалавриат",
    master: "Высшее магистратура",
    phd: "Ученая степень",
    other: "Другое",
};

function humanizeKey(key: string): string {
    return INTAKE_LABELS[key] ?? key;
}

function looksLikeUrl(v: string): boolean {
    return /^https?:\/\//i.test(v.trim());
}

function formatIntakeValue(key: string, value: any): string {
    if (value == null) return "—";
    if (typeof value === "boolean") return value ? "Да" : "Нет";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
    if (typeof value === "string") {
        const s = value.trim();
        if (!s) return "—";
        // Приводим дату YYYY-MM-DD к локальному формату
        if (key.endsWith("_date") && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
            const dt = new Date(s);
            return Number.isNaN(dt.getTime()) ? s : dt.toLocaleDateString();
        }
        if (key === "education_level") return EDUCATION_LABELS[s] ?? s;
        return s;
    }
    if (Array.isArray(value)) {
        const flat = value
            .map((x) => (x == null ? "" : typeof x === "string" || typeof x === "number" ? String(x) : JSON.stringify(x)))
            .map((x) => x.trim())
            .filter(Boolean);
        return flat.length ? flat.join(", ") : "—";
    }
    if (typeof value === "object") {
        try {
            const s = JSON.stringify(value);
            if (!s || s === "{}") return "—";
            // не раздуваем карточку — длинные объекты будут видны в "Все ответы" / JSON
            return s.length > 140 ? s.slice(0, 140) + "…" : s;
        } catch {
            return "[объект]";
        }
    }
    return String(value);
}

const INTAKE_SUMMARY_KEYS: string[] = [
    "full_name",
    "birth_date",
    "city",
    "phone",
    "email",
    "social_link",
    "education_level",
    "current_work",
    "goal_setting",
    "expectations",
    "desired_result",
    "water_liters",
];

function buildIntakeSummary(intake: Record<string, any> | null): Array<{ key: string; label: string; value: string; isLink: boolean }> {
    if (!intake) return [];
    const out: Array<{ key: string; label: string; value: string; isLink: boolean }> = [];
    for (const k of INTAKE_SUMMARY_KEYS) {
        const raw = (intake as any)[k];
        const v = formatIntakeValue(k, raw);
        if (!v || v === "—") continue;
        out.push({ key: k, label: humanizeKey(k), value: v, isLink: typeof raw === "string" && looksLikeUrl(raw) });
    }
    return out;
}

function listIntakeEntries(intake: Record<string, any> | null): Array<[string, any]> {
    if (!intake) return [];
    return Object.entries(intake)
        .filter(([k]) => !!k)
        .sort(([a], [b]) => humanizeKey(a).localeCompare(humanizeKey(b), "ru"));
}

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

/* =================== БАДы: план добавок (назначение клиенту) =================== */

type SupplementItem = {
    name: string;
    dose: string;
    timing: string;
    duration: string;
    purpose: string;
    cautions?: string[];
};

type SupplementPlan = {
    rationale_short?: string;
    items: SupplementItem[];
    general_notes?: string;
    disclaimer?: string;
};

type SupplementDbSnapshot = {
    id: string | null;
    plan: SupplementPlan | null;
    notes: string | null;
    updatedAt: string | null;
};

function emptySupplementItem(): SupplementItem {
    return {
        name: "",
        dose: "",
        timing: "",
        duration: "",
        purpose: "",
        cautions: [],
    };
}

function normalizeSupplementPlan(raw: any): SupplementPlan {
    const out: SupplementPlan = { items: [] };
    if (!raw || typeof raw !== "object") return out;

    if (typeof raw.rationale_short === "string") out.rationale_short = raw.rationale_short;
    if (typeof raw.general_notes === "string") out.general_notes = raw.general_notes;
    if (typeof raw.disclaimer === "string") out.disclaimer = raw.disclaimer;

    const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
    const items: SupplementItem[] = [];

    for (const it of itemsRaw) {
        if (!it || typeof it !== "object") continue;
        const r = it as any;
        const name = typeof r.name === "string" ? r.name.trim() : "";
        if (!name) continue;

        items.push({
            name,
            dose: typeof r.dose === "string" ? r.dose : "",
            timing: typeof r.timing === "string" ? r.timing : "",
            duration: typeof r.duration === "string" ? r.duration : "",
            purpose: typeof r.purpose === "string" ? r.purpose : "",
            cautions: Array.isArray(r.cautions) ? r.cautions.map((x: any) => String(x)).filter(Boolean).slice(0, 12) : [],
        });
    }

    out.items = items;
    return out;
}

function pickSupplementSnapshot(row: unknown): SupplementDbSnapshot {
    if (!isRecord(row)) return { id: null, plan: null, notes: null, updatedAt: null };

    const id = typeof row.id === "string" ? row.id : null;
    const notes = typeof row.notes === "string" ? row.notes : null;

    const updatedAt =
        (typeof row.updated_at === "string" ? row.updated_at : null) ??
        (typeof row.created_at === "string" ? row.created_at : null);

    const planRaw = (row as Record<string, unknown>).plan;
    const plan = normalizeSupplementPlan(planRaw);

    return { id, plan, notes, updatedAt };
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


/* =================== Тренировки: план + отчёт =================== */

type TrainingExercisePlan = {
    id: string;
    name: string;
    sets: string;
    reps: string;
    weight: string;
    rounds: string;
    video_url: string;
    notes: string;
};

type TrainingPlan = {
    title: string;
    warmup: string;
    general_notes: string;
    exercises: TrainingExercisePlan[];
};

type TrainingExerciseReport = {
    id: string;
    done: boolean;
    actual_sets: string;
    actual_reps: string;
    actual_weight: string;
    actual_rounds: string;
    comment: string;
};

type TrainingReport = {
    status: "done" | "partial" | "skipped";
    did_as_planned: boolean;
    general_comment: string;
    exercises: TrainingExerciseReport[];
};

function uid(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function blankPlan(): TrainingPlan {
    return { title: "", warmup: "", general_notes: "", exercises: [] };
}

function normalizePlan(x: unknown): TrainingPlan {
    if (!x || typeof x !== "object") return blankPlan();
    const o: any = x;
    const ex = Array.isArray(o.exercises) ? o.exercises : [];
    return {
        title: typeof o.title === "string" ? o.title : "",
        warmup: typeof o.warmup === "string" ? o.warmup : "",
        general_notes: typeof o.general_notes === "string" ? o.general_notes : (typeof o.generalNotes === "string" ? o.generalNotes : ""),
        exercises: ex.map((e: any) => ({
            id: typeof e?.id === "string" ? e.id : uid(),
            name: typeof e?.name === "string" ? e.name : "",
            sets: typeof e?.sets === "string" ? e.sets : "",
            reps: typeof e?.reps === "string" ? e.reps : "",
            weight: typeof e?.weight === "string" ? e.weight : "",
            rounds: typeof e?.rounds === "string" ? e.rounds : "",
            video_url: typeof e?.video_url === "string" ? e.video_url : (typeof e?.videoUrl === "string" ? e.videoUrl : ""),
            notes: typeof e?.notes === "string" ? e.notes : "",
        })).filter((e: TrainingExercisePlan) => e.name.trim() !== ""),
    };
}

function normalizeReport(x: unknown, plan: TrainingPlan): TrainingReport | null {
    if (!x || typeof x !== "object") return null;
    const o: any = x;
    const status: TrainingReport["status"] =
        o.status === "done" || o.status === "partial" || o.status === "skipped" ? o.status : "partial";
    const ex = Array.isArray(o.exercises) ? o.exercises : [];
    const map = new Map<string, TrainingExerciseReport>();
    for (const e of ex) {
        if (!e || typeof e !== "object") continue;
        const id = typeof (e as any).id === "string" ? (e as any).id : "";
        if (!id) continue;
        map.set(id, {
            id,
            done: Boolean((e as any).done),
            actual_sets: typeof (e as any).actual_sets === "string" ? (e as any).actual_sets : "",
            actual_reps: typeof (e as any).actual_reps === "string" ? (e as any).actual_reps : "",
            actual_weight: typeof (e as any).actual_weight === "string" ? (e as any).actual_weight : "",
            actual_rounds: typeof (e as any).actual_rounds === "string" ? (e as any).actual_rounds : "",
            comment: typeof (e as any).comment === "string" ? (e as any).comment : "",
        });
    }

    const ordered = (plan.exercises ?? []).map((p) => map.get(p.id) ?? ({
        id: p.id,
        done: false,
        actual_sets: "",
        actual_reps: "",
        actual_weight: "",
        actual_rounds: "",
        comment: "",
    }));

    return {
        status,
        did_as_planned: typeof o.did_as_planned === "boolean" ? o.did_as_planned : Boolean(o.didAsPlanned ?? true),
        general_comment: typeof o.general_comment === "string" ? o.general_comment : (typeof o.generalComment === "string" ? o.generalComment : ""),
        exercises: ordered,
    };
}

async function safeUpsertByUserDate(payload: any): Promise<{ ok: boolean; message?: string }> {
    const { error: upErr } = await supabase.from("client_journal_entries").upsert(payload, {
        onConflict: "user_id,entry_date",
    });

    if (!upErr) return { ok: true };

    const msg = upErr.message || "";
    if (msg.toLowerCase().includes("no unique or exclusion constraint")) {
        const existing = await supabase
            .from("client_journal_entries")
            .select("id")
            .eq("user_id", payload.user_id)
            .eq("entry_date", payload.entry_date)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existing.error) return { ok: false, message: existing.error.message };

        if (existing.data?.id) {
            const { error: updErr } = await supabase
                .from("client_journal_entries")
                .update(payload)
                .eq("id", existing.data.id);

            if (updErr) return { ok: false, message: updErr.message };
            return { ok: true };
        } else {
            const { error: insErr } = await supabase.from("client_journal_entries").insert(payload);
            if (insErr) return { ok: false, message: insErr.message };
            return { ok: true };
        }
    }

    return { ok: false, message: upErr.message };
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

    // ===== Тренировки =====
    const [trainingDate, setTrainingDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [trainingPlan, setTrainingPlan] = useState<TrainingPlan>(blankPlan());
    const [trainingSaving, setTrainingSaving] = useState(false);
    const [trainingHint, setTrainingHint] = useState<string | null>(null);
    const [trainingErr, setTrainingErr] = useState<string | null>(null);

    const [menus, setMenus] = useState<Menu[]>([]);

    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState<string | null>(null);

    const [selectedMenuId, setSelectedMenuId] = useState<string>("");
    const [newNotes, setNewNotes] = useState("");
    const [savingAssign, setSavingAssign] = useState(false);

    const [journalRange, setJournalRange] = useState<"7" | "30" | "all">("30");

    // Дневник питания: ИИ-анализ + обратная связь
    const [diaryAiByEntryId, setDiaryAiByEntryId] = useState<Record<string, any>>({});
    const [diaryAiBusyByEntryId, setDiaryAiBusyByEntryId] = useState<Record<string, boolean>>({});
    const [diaryAiErrByEntryId, setDiaryAiErrByEntryId] = useState<Record<string, string>>({});

    const [diaryNoteDraftByEntryId, setDiaryNoteDraftByEntryId] = useState<Record<string, string>>({});
    const [diaryNoteSavingByEntryId, setDiaryNoteSavingByEntryId] = useState<Record<string, boolean>>({});
    const [diaryNoteHintByEntryId, setDiaryNoteHintByEntryId] = useState<Record<string, string>>({});

    // Анализы: заметки
    const [labNoteDraftById, setLabNoteDraftById] = useState<Record<string, string>>({});
    const [labNoteSavingById, setLabNoteSavingById] = useState<Record<string, boolean>>({});
    const [labNoteHintById, setLabNoteHintById] = useState<Record<string, string>>({});

    const [showAssignForm, setShowAssignForm] = useState(false);
    const [showAllAssignments, setShowAllAssignments] = useState(false);

    // UI: вкладки на странице клиента (эргономика)
    type ClientTab = "overview" | "plan" | "diary" | "labs" | "training";
    const [tab, setTab] = useState<ClientTab>("overview");

    // Анализы (только просмотр)
    const [labReports, setLabReports] = useState<LabReport[]>([]);
    const [labHint, setLabHint] = useState<string | null>(null);

    const [labUploadOpen, setLabUploadOpen] = useState<boolean>(false);
    const [labFile, setLabFile] = useState<File | null>(null);
    const [labTitle, setLabTitle] = useState<string>("");
    const [labTakenAt, setLabTakenAt] = useState<string>("");
    const [labBusy, setLabBusy] = useState<boolean>(false);
    const [labAnalyzingId, setLabAnalyzingId] = useState<string | null>(null);
    const [labOcrLang, setLabOcrLang] = useState<string>("rus+eng");
    const [labDetail, setLabDetail] = useState<"short" | "detailed">("short");
    const [labLastOcr, setLabLastOcr] = useState<string | null>(null);

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

    // БАДы (план добавок)
    const [suppHint, setSuppHint] = useState<string | null>(null);
    const [suppDb, setSuppDb] = useState<SupplementDbSnapshot>({ id: null, plan: null, notes: null, updatedAt: null });
    const [suppMeta, setSuppMeta] = useState<{ rationale_short?: string; disclaimer?: string }>({});
    const [suppItems, setSuppItems] = useState<SupplementItem[]>([]);
    const [suppGeneralNotes, setSuppGeneralNotes] = useState<string>("");
    const [suppSaving, setSuppSaving] = useState(false);
    const [suppSavedMsg, setSuppSavedMsg] = useState<string | null>(null);
    const [suppAiBusy, setSuppAiBusy] = useState(false);
    const [suppAiHint, setSuppAiHint] = useState<string | null>(null);

    // Анкета клиента

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

    // Подгружаем тренировочный план/отчёт для выбранной даты из уже загруженного дневника
    useEffect(() => {
        const day = journal.find((e) => e.entry_date === trainingDate);
        const p = normalizePlan(day?.training_plan ?? null);
        setTrainingPlan(p.title || (p.exercises?.length ?? 0) > 0 ? p : blankPlan());
        setTrainingErr(null);
        setTrainingHint(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trainingDate, journal]);





    // ===================== ДНЕВНИК ПИТАНИЯ: AI анализ + заметка нутрициолога =====================

    const runDiaryAi = useCallback(
        async (entry: JournalEntry) => {
            const entryId = entry.id;
            const d: any = entry.food_diary ?? {};
            const rowsRaw: any[] = Array.isArray(d?.rows) ? d.rows : [];

            if (!entryId || rowsRaw.length === 0) {
                setDiaryAiErrByEntryId((p) => ({ ...p, [entryId || "__noid__"]: "Нет строк дневника питания для анализа." }));
                return;
            }

            const wake = d?.wake_time ?? d?.wakeTime ?? "";
            const bed = d?.bed_time ?? d?.bedTime ?? "";
            const waterBalance = d?.water_balance ?? d?.waterBalance ?? d?.water_liters ?? d?.waterLiters ?? "";
            const sleepNote = d?.sleep_note ?? d?.sleepNote ?? "";

            const rows = rowsRaw.slice(0, 80).map((r: any) => {
                const dish = `${r?.slot ? `${r.slot}: ` : ""}${r?.dish ?? ""}`;
                return {
                    time: String(r?.time ?? ""),
                    dish: dish,
                    amount: String(r?.amount ?? ""),
                    reason: String(r?.reason ?? r?.cause ?? ""),
                    feeling: String(r?.feeling ?? r?.sensation ?? ""),
                    supplements: String(r?.supplements ?? r?.meds ?? ""),
                };
            });

            setDiaryAiBusyByEntryId((p) => ({ ...p, [entryId]: true }));
            setDiaryAiErrByEntryId((p) => ({ ...p, [entryId]: "" }));

            try {
                const res = await fetch("/api/analyze-diary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        entry_date: entry.entry_date,
                        goal: extended?.main_goal ?? null,
                        allergies: extended?.allergies ?? null,
                        banned_foods: extended?.banned_foods ?? null,
                        preferences: extended?.preferences ?? null,
                        diary: {
                            wake_time: wake,
                            bed_time: bed,
                            water_balance: waterBalance,
                            sleep_note: sleepNote,
                            rows,
                        },
                    }),
                });

                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(String((json as any)?.error || `Ошибка AI (${res.status})`));
                }

                setDiaryAiByEntryId((p) => ({ ...p, [entryId]: json }));
            } catch (e: any) {
                setDiaryAiErrByEntryId((p) => ({ ...p, [entryId]: String(e?.message || e) }));
            } finally {
                setDiaryAiBusyByEntryId((p) => ({ ...p, [entryId]: false }));
            }
        },
        [extended],
    );

    const saveDiaryNote = useCallback(
        async (entry: JournalEntry) => {
            const entryId = entry.id;
            if (!entryId) return;

            const note = (diaryNoteDraftByEntryId[entryId] ?? entry.nutritionist_diary_note ?? "").trim();

            setDiaryNoteSavingByEntryId((p) => ({ ...p, [entryId]: true }));
            setDiaryNoteHintByEntryId((p) => ({ ...p, [entryId]: "" }));

            const { error } = await supabase
                .from("client_journal_entries")
                .update({ nutritionist_diary_note: note })
                .eq("id", entryId)
                .eq("user_id", clientId);

            if (error) {
                const msg = String(error.message || "");
                const isSchemaCache = msg.toLowerCase().includes("schema cache") && msg.includes("nutritionist_diary_note");

                setDiaryNoteHintByEntryId((p) => ({
                    ...p,
                    [entryId]: isSchemaCache
                        ? "Ошибка: колонка nutritionist_diary_note ещё не видна API (schema cache). В Supabase SQL Editor выполни: NOTIFY pgrst, 'reload schema'; затем обнови страницу."
                        : `Ошибка: ${msg}`,
                }));
                setDiaryNoteSavingByEntryId((p) => ({ ...p, [entryId]: false }));
                return;
            }

            setJournal((prev) => prev.map((x) => (x.id === entryId ? { ...x, nutritionist_diary_note: note } : x)));
            setDiaryNoteHintByEntryId((p) => ({ ...p, [entryId]: "Сохранено" }));
            setDiaryNoteSavingByEntryId((p) => ({ ...p, [entryId]: false }));
        },
        [clientId, diaryNoteDraftByEntryId],
    );

    const saveLabNote = useCallback(
        async (r: LabReport) => {
            const id = r.id;
            if (!id) return;
            const note = (labNoteDraftById[id] ?? r.nutritionist_note ?? "").trim();

            setLabNoteSavingById((p) => ({ ...p, [id]: true }));
            setLabNoteHintById((p) => ({ ...p, [id]: "" }));

            const { error } = await supabase
                .from("client_lab_reports")
                .update({ nutritionist_note: note })
                .eq("id", id)
                .eq("client_id", clientId);

            if (error) {
                setLabNoteHintById((p) => ({ ...p, [id]: `Ошибка: ${error.message}` }));
                setLabNoteSavingById((p) => ({ ...p, [id]: false }));
                return;
            }

            setLabReports((prev) => prev.map((x) => (x.id === id ? { ...x, nutritionist_note: note } : x)));
            setLabNoteHintById((p) => ({ ...p, [id]: "Сохранено" }));
            setLabNoteSavingById((p) => ({ ...p, [id]: false }));
        },
        [clientId, labNoteDraftById],
    );

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


    // ===================== LAB UPLOAD + OCR + DEEPSEEK =====================

    const safeFileName = (name: string) => (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");

    const formatLabAnalysis = (analysis: any) => {
        if (!analysis) return "Разбор недоступен.";

        // deepseekJson может вернуть объект с полем raw/error — но чаще вернёт уже JSON
        const a: any = analysis?.raw ? analysis : analysis;

        const lines: string[] = [];

        if (a.short_summary) {
            lines.push(`Коротко: ${String(a.short_summary).trim()}`);
        }

        const list = (title: string, items?: any) => {
            if (!Array.isArray(items) || items.length === 0) return;
            lines.push("");
            lines.push(title);
            for (const it of items) lines.push(`- ${String(it).trim()}`);
        };

        list("Ключевые моменты:", a.key_findings);
        list("Возможные причины (гипотезы):", a.possible_causes);
        list("Питание/образ жизни:", a.nutrition_notes);
        list("Что уточнить у врача/лаборатории:", a.questions_for_doctor);
        list("Красные флаги (повод обсудить с врачом):", a.red_flags);

        lines.push("");
        lines.push(a.disclaimer || "Важно: это информационный разбор, не диагноз и не медицинское назначение.");

        return lines.join("\n");
    };

    const analyzeLabReport = useCallback(
        async (r: LabReport) => {
            setLabHint(null);
            setLabLastOcr(null);
            setLabAnalyzingId(r.id);

            try {
                const { data: signed, error: signErr } = await supabase.storage
                    .from("lab_reports")
                    .createSignedUrl(r.file_path, 60 * 10);

                if (signErr || !signed?.signedUrl) {
                    setLabHint(
                        "Не удалось получить доступ к файлу (signed url). Проверь bucket lab_reports и права доступа."
                    );
                    return;
                }

                const resp = await fetch("/api/ai/lab-report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        signedUrl: signed.signedUrl,
                        ocrLang: labOcrLang,
                        detail: labDetail,
                    }),
                });

                const json = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    setLabHint(json?.error || "Ошибка анализа файла.");
                    return;
                }

                if (json?.ocrText) setLabLastOcr(String(json.ocrText));

                const ai_summary = formatLabAnalysis(json?.analysis);

                const { error: updErr } = await supabase
                    .from("client_lab_reports")
                    .update({ ai_summary })
                    .eq("id", r.id);

                if (updErr) {
                    setLabHint(`Разбор готов, но не удалось сохранить в базе: ${updErr.message}`);
                    return;
                }

                await reloadLabReports();
            } catch (e: any) {
                setLabHint(e?.message || "Ошибка анализа.");
            } finally {
                setLabAnalyzingId(null);
            }
        },
        [clientId, labDetail, labOcrLang, reloadLabReports],
    );

    const uploadAndAnalyzeNewLabReport = useCallback(async () => {
        setLabHint(null);
        setLabLastOcr(null);

        if (!labFile) {
            setLabHint("Выбери изображение (png/jpg/webp).");
            return;
        }

        const isImage = labFile.type?.startsWith("image/");
        if (!isImage) {
            setLabHint("Пока поддерживаются только изображения. Если анализ в PDF — сделай скриншот и загрузи как картинку.");
            return;
        }

        setLabBusy(true);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const me = auth?.user;
            if (!me) {
                setLabHint("Нужно войти как специалист.");
                return;
            }

            const path = `${clientId}/${me.id}/${Date.now()}_${safeFileName(labFile.name)}`;

            const { error: upErr } = await supabase.storage.from("lab_reports").upload(path, labFile, {
                cacheControl: "3600",
                upsert: false,
                contentType: labFile.type || "application/octet-stream",
            });

            if (upErr) {
                setLabHint(`Не удалось загрузить файл: ${upErr.message}`);
                return;
            }

            const title = (labTitle || labFile.name).trim();

            const { data: row, error: insErr } = await supabase
                .from("client_lab_reports")
                .insert({
                    client_id: clientId,
                    nutritionist_id: me.id,
                    title,
                    taken_at: labTakenAt || null,
                    file_path: path,
                    file_url: null,
                    ai_summary: null,
                })
                .select("*")
                .single();

            if (insErr || !row) {
                setLabHint(`Файл загружен, но запись в таблицу не создалась: ${insErr?.message || "unknown"}`);
                return;
            }

            await reloadLabReports();

            // Закрываем модалку — и сразу запускаем разбор
            setLabUploadOpen(false);
            setLabFile(null);
            setLabTitle("");
            setLabTakenAt("");

            await analyzeLabReport(row as LabReport);
        } catch (e: any) {
            setLabHint(e?.message || "Ошибка загрузки анализа.");
        } finally {
            setLabBusy(false);
        }
    }, [analyzeLabReport, clientId, labFile, labTakenAt, labTitle, reloadLabReports]);

    // =======================================================================


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

    const reloadSupplementPlan = useCallback(
        async (nutritionistId: string) => {
            // updated_at -> created_at, с фоллбеком если updated_at отсутствует
            const q1 = await supabase
                .from("client_supplement_plans")
                .select("*")
                .eq("client_id", clientId)
                .eq("nutritionist_id", nutritionistId)
                .order("updated_at", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(1);

            if (q1.error) {
                const msg = q1.error.message.toLowerCase();
                if (msg.includes("updated_at") && msg.includes("does not exist")) {
                    const q2 = await supabase
                        .from("client_supplement_plans")
                        .select("*")
                        .eq("client_id", clientId)
                        .eq("nutritionist_id", nutritionistId)
                        .order("created_at", { ascending: false })
                        .limit(1);

                    if (q2.error) {
                        setSuppHint("Секция БАДов не настроена (таблица client_supplement_plans или права/RLS).");
                        setSuppDb({ id: null, plan: null, notes: null, updatedAt: null });
                        setSuppItems([]);
                        setSuppGeneralNotes("");
                        return;
                    }

                    setSuppHint(null);
                    const row2 = (q2.data?.[0] ?? null) as unknown;
                    const snap2 = pickSupplementSnapshot(row2);
                    setSuppDb(snap2);
                    setSuppMeta({ rationale_short: snap2.plan?.rationale_short, disclaimer: snap2.plan?.disclaimer });
                    setSuppItems(snap2.plan?.items ?? []);
                    setSuppGeneralNotes(snap2.plan?.general_notes ?? "");
                    return;
                }

                setSuppHint("Секция БАДов не настроена (таблица client_supplement_plans или права/RLS).");
                setSuppDb({ id: null, plan: null, notes: null, updatedAt: null });
                setSuppItems([]);
                setSuppGeneralNotes("");
                return;
            }

            setSuppHint(null);
            const row = (q1.data?.[0] ?? null) as unknown;
            const snap = pickSupplementSnapshot(row);
            setSuppDb(snap);
            setSuppMeta({ rationale_short: snap.plan?.rationale_short, disclaimer: snap.plan?.disclaimer });
            setSuppItems(snap.plan?.items ?? []);
            setSuppGeneralNotes(snap.plan?.general_notes ?? "");
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
            await reloadSupplementPlan(user.id);

            setLoading(false);
        };

        load();
    }, [clientId, reloadLabReports, reloadFoodRules, reloadSupplementPlan]);

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

    const saveSupplementPlan = async () => {
        setSuppSaving(true);
        setSuppSavedMsg(null);
        setSuppAiHint(null);
        setSuppHint(null);

        const { data, error } = await supabase.auth.getUser();
        if (error) {
            setSuppHint(error.message);
            setSuppSaving(false);
            return;
        }

        const user = data.user;
        if (!user) {
            setSuppHint("Нет авторизации");
            setSuppSaving(false);
            return;
        }

        try {
            const nowIso = new Date().toISOString();

            const cleanItems = (suppItems || [])
                .map((it) => ({
                    name: (it.name || "").trim(),
                    dose: (it.dose || "").trim(),
                    timing: (it.timing || "").trim(),
                    duration: (it.duration || "").trim(),
                    purpose: (it.purpose || "").trim(),
                    cautions: Array.isArray(it.cautions) ? it.cautions.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [],
                }))
                .filter((it) => !!it.name);

            const plan: SupplementPlan = {
                items: cleanItems,
                general_notes: suppGeneralNotes.trim() || undefined,
                rationale_short: suppMeta.rationale_short,
                disclaimer: suppMeta.disclaimer,
            };

            const payload = {
                client_id: clientId,
                nutritionist_id: user.id,
                plan,
                notes: null,
                updated_at: nowIso,
            } as any;

            let errMsg: string | null = null;
            if (suppDb.id) {
                const { error: e } = await supabase.from("client_supplement_plans").update(payload).eq("id", suppDb.id);
                errMsg = e ? e.message : null;
            } else {
                const { error: e } = await supabase.from("client_supplement_plans").insert(payload);
                errMsg = e ? e.message : null;
            }

            if (errMsg) {
                setSuppHint(errMsg);
                return;
            }

            await reloadSupplementPlan(user.id);
            setSuppSavedMsg("✅ Сохранено. Клиент увидит это у себя.");
            window.setTimeout(() => setSuppSavedMsg(null), 2500);
        } finally {
            setSuppSaving(false);
        }
    };

    const generateSupplementsWithAI = useCallback(async () => {
        setSuppAiBusy(true);
        setSuppAiHint(null);
        setSuppHint(null);

        try {
            // сводка по дневнику (для контекста)
            const weights = journal.map((j) => (typeof j.weight_kg === "number" ? j.weight_kg : null)).filter((x): x is number => typeof x === "number");
            const startWeight = weights.length ? weights[0] : null;
            const lastWeight = weights.length ? weights[weights.length - 1] : null;
            const deltaWeight = typeof startWeight === "number" && typeof lastWeight === "number" ? lastWeight - startWeight : null;

            const energies = journal.map((j) => (typeof j.energy_level === "number" ? j.energy_level : null)).filter((x): x is number => typeof x === "number");
            const moods = journal.map((j) => (typeof j.mood === "number" ? j.mood : null)).filter((x): x is number => typeof x === "number");
            const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

            const labSummaries = (labReports || [])
                .map((r) => (typeof r.ai_summary === "string" ? r.ai_summary.trim() : ""))
                .filter(Boolean)
                .slice(0, 3);

            const allowed = parseFoodTextareaToArray(foodAllowed);
            const banned = parseFoodTextareaToArray(foodBanned);

            const resp = await fetch("/api/ai/supplement-plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client: {
                        main_goal: extended?.main_goal ?? null,
                        goal_description: extended?.goal_description ?? null,
                        allergies: extended?.allergies ?? null,
                        banned_foods: extended?.banned_foods ?? null,
                        preferences: extended?.preferences ?? null,
                        monthly_budget: extended?.monthly_budget ?? null,
                    },
                    intake_form: (extended as any)?.intake_form ?? null,
                    lab_summaries: labSummaries,
                    food_rules: { allowed, banned, notes: foodNotes || null },
                    journal_summary: {
                        startWeight,
                        lastWeight,
                        deltaWeight,
                        avgEnergy: avg(energies),
                        avgMood: avg(moods),
                        entriesCount: journal.length,
                    },
                }),
            });

            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                setSuppAiHint(json?.error || json?.details || "Ошибка ИИ-подбора.");
                return;
            }

            const plan = normalizeSupplementPlan(json);
            setSuppMeta({ rationale_short: plan.rationale_short, disclaimer: plan.disclaimer });
            setSuppItems(plan.items || []);
            setSuppGeneralNotes(plan.general_notes ?? "");
            setSuppAiHint("Готово: проверь и при необходимости поправь — затем «Сохранить». ");
        } catch (e: any) {
            setSuppAiHint(e?.message || "Ошибка ИИ-подбора.");
        } finally {
            setSuppAiBusy(false);
        }
    }, [extended, foodAllowed, foodBanned, foodNotes, journal, labReports]);

    const updateSuppItem = useCallback((idx: number, patch: Partial<SupplementItem>) => {
        setSuppItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    }, []);

    const removeSuppItem = useCallback((idx: number) => {
        setSuppItems((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    const addSuppItem = useCallback(() => {
        setSuppItems((prev) => [...prev, emptySupplementItem()]);
    }, []);

    
    // Количество отметок тренировок в дневнике (для бейджа вкладки)
    const trainingBadge = (journal ?? []).filter((e: any) => e?.training_report != null).length;

    const TabBtn = ({ id, label, badge }: { id: ClientTab; label: string; badge?: number }) => (
        <button
            type="button"
            onClick={() => setTab(id)}
            className={
                tab === id
                    ? "inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white dark:bg-zinc-100 dark:text-black"
                    : "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }
        >
            <span className="whitespace-nowrap">{label}</span>
            {typeof badge === "number" && badge > 0 ? (
                <span
                    className={
                        tab === id
                            ? "rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-black/15 dark:text-black"
                            : "rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    }
                >
                    {badge}
                </span>
            ) : null}
        </button>
    );
if (loading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю данные клиента...</p>;
    if (fatalError) return <p className="text-sm text-red-500">{fatalError}</p>;
    if (!basic) return <p className="text-sm text-red-500">Клиент не найден или нет доступа.</p>;

    const compactCount = Math.min(6, Math.max(3, Math.ceil(menuAssignments.length / 2)));
    const shownAssignments = showAllAssignments ? menuAssignments : menuAssignments.slice(0, compactCount);

    const assignedAllowedTokens = foodValueToTokens(foodDb.allowed);
    const assignedBannedTokens = foodValueToTokens(foodDb.banned);

    const intake = (extended?.intake_form ?? null) as Record<string, any> | null;
    const intakeSummary = buildIntakeSummary(intake);
    const intakeEntries = listIntakeEntries(intake);

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/nutritionist/clients"
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                            ← Клиенты
                        </Link>

                        <h2 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
                            {basic.full_name ?? basic.id}
                        </h2>

                        <span
                            className={
                                activeAssignment
                                    ? "rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-black"
                                    : "rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                            }
                        >
                            {activeAssignment ? "активный рацион" : "нет назначений"}
                        </span>
                    </div>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Обзор → план → дневник → тренировки → анализы.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setTab("plan");
                            setShowAssignForm(true);
                        }}
                        className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        Назначить
                    </button>

                    <Link
                        href={`/nutritionist/chat/${basic.id}`}
                        className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                    >
                        Чат
                    </Link>
                </div>
            </header>

            <div className="sticky top-2 z-20 -mx-2 px-2">
                <div className="rounded-2xl border border-zinc-200 bg-white/80 p-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
                    <nav className="flex gap-1 overflow-x-auto">
                        <TabBtn id="overview" label="Обзор" />
                        <TabBtn id="plan" label="План" badge={menuAssignments.length || undefined} />
                        <TabBtn id="diary" label="Дневник" badge={filteredJournal.length || undefined} />
                        <TabBtn id="training" label="Тренировки" badge={trainingBadge || undefined} />
                        <TabBtn id="labs" label="Анализы" badge={labReports.length || undefined} />
                    </nav>
                </div>
            </div>

            {tab === "overview" ? (
                <>
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

{/* ДАШБОРД */}
<section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
    <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Дашборд (последние {journalRange === "all" ? "все" : journalRange} дней)</h3>
        <button
            type="button"
            onClick={() => setTab("diary")}
            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
            Открыть дневник →
        </button>
    </div>

    <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            <div className="text-zinc-500">Записей</div>
            <div className="mt-1 text-sm font-semibold">{progress.entriesCount}</div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            <div className="text-zinc-500">Вес</div>
            <div className="mt-1 flex items-baseline gap-2">
                <div className="text-sm font-semibold">
                    {progress.lastWeight != null ? `${Math.round(progress.lastWeight * 10) / 10} кг` : "—"}
                </div>
                {progress.deltaWeight != null ? (
                    <div className={"text-[11px] font-medium " + (progress.deltaWeight > 0 ? "text-red-600" : progress.deltaWeight < 0 ? "text-emerald-600" : "text-zinc-500")}>
                        {progress.deltaWeight > 0 ? "+" : ""}
                        {Math.round(progress.deltaWeight * 10) / 10}
                    </div>
                ) : null}
            </div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            <div className="text-zinc-500">Энергия (сред.)</div>
            <div className="mt-1 text-sm font-semibold">{progress.avgEnergy ?? "—"}</div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            <div className="text-zinc-500">Настроение (сред.)</div>
            <div className="mt-1 text-sm font-semibold">{progress.avgMood ?? "—"}</div>
        </div>
    </div>

    {weightPath ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                <span>Вес (мини-график)</span>
                <span>
                    {Math.round(weightPath.minW * 10) / 10} — {Math.round(weightPath.maxW * 10) / 10} кг
                </span>
            </div>
            <svg width="100%" height="64" viewBox="0 0 260 64" preserveAspectRatio="none" className="block">
                <path d={weightPath.d} fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500" />
            </svg>
        </div>
    ) : null}

    <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            <div className="text-zinc-500">Последняя запись</div>
            <div className="mt-1 text-sm font-semibold">
                {filteredJournal[0]?.entry_date ? formatDate(filteredJournal[0].entry_date) : "—"}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
                {filteredJournal[0]?.sleep_note ? "Есть заметка про сон" : "Без заметки"}
                {" · "}
                {filteredJournal[0]?.water_balance ? "Вода заполнена" : "Вода не заполнена"}
            </div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            <div className="text-zinc-500">Анализы</div>
            <div className="mt-1 text-sm font-semibold">{labReports.length ? `${labReports.length} шт.` : "—"}</div>
            <div className="mt-1 text-[11px] text-zinc-500">
                {labReports[0]?.created_at ? `Последний: ${formatDate(labReports[0].created_at)}` : "Последнего нет"}
            </div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            <div className="text-zinc-500">План</div>
            <div className="mt-1 text-sm font-semibold">{activeAssignment ? "Активный назначен" : "Нет назначения"}</div>
            <button
                type="button"
                onClick={() => setTab("plan")}
                className="mt-2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
                Открыть план →
            </button>
        </div>
    </div>
</section>

                    {/* Анкета клиента (из профиля) */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div>
                    <h3 className="text-sm font-semibold">Анкета клиента</h3>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Заполняется клиентом в разделе профиля. Здесь можно быстро посмотреть ответы.</p>
                </div>

                {intake ? (
                    <div className="space-y-3">
                        {/* Кратко */}
                        {intakeSummary.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {intakeSummary.map((it) => (
                                    <div
                                        key={it.key}
                                        className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                                    >
                                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{it.label}</div>
                                        {it.isLink ? (
                                            <a
                                                href={it.value}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-1 block break-words text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                                            >
                                                {it.value}
                                            </a>
                                        ) : (
                                            <div className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-50">{it.value}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {/* Полный список */}
                        <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                            <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                Показать все ответы
                            </summary>
                            <div className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-white p-3 dark:bg-zinc-950">
                                <div className="divide-y divide-zinc-100 text-[12px] dark:divide-zinc-900">
                                    {intakeEntries.map(([k, v]) => (
                                        <div key={k} className="grid gap-1 py-2 sm:grid-cols-[220px,minmax(0,1fr)] sm:gap-3">
                                            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                                {humanizeKey(k)}
                                            </div>
                                            <div className="min-w-0 whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100">
                                                {formatIntakeValue(k, v)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </details>

                    </div>
                ) : (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Анкета ещё не заполнена.</div>
                )}
            </section>

                </>
            ) : null}

            {tab === "plan" ? (
                <>
                    {/* Назначение рациона + Можно/Нельзя */}
            <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">Назначение рациона по цели</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">3 блока: Назначения → Можно/нельзя → БАДы. Всё, что видит клиент, здесь.</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAssignForm((v) => !v)}
                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        {showAssignForm ? "Скрыть" : "Назначить меню"}
                    </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-3 min-w-0">
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

                    </div>

                    <div className="min-w-0">
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

                        <details className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                            <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                Редактировать
                            </summary>
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
                        </details>
                    </div>

                    {/* БАДы */}
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-xs text-zinc-500">БАДы</div>
                                <div className="mt-1 text-sm font-semibold">План добавок</div>
                                {suppDb.updatedAt ? (
                                    <div className="mt-1 text-[11px] text-zinc-500">Сейчас назначено (из БД): {formatDate(suppDb.updatedAt)}</div>
                                ) : (
                                    <div className="mt-1 text-[11px] text-zinc-500">Пока не назначено.</div>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={generateSupplementsWithAI}
                                    disabled={suppAiBusy || !!suppHint}
                                    className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                    title={suppHint ? "Нужно настроить таблицу client_supplement_plans и RLS" : ""}
                                >
                                    {suppAiBusy ? "ИИ..." : "ИИ → подобрать"}
                                </button>

                                <button
                                    type="button"
                                    onClick={saveSupplementPlan}
                                    disabled={suppSaving || !!suppHint}
                                    className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                                    title={suppHint ? "Нужно настроить таблицу client_supplement_plans и RLS" : ""}
                                >
                                    {suppSaving ? "Сохраняю..." : "Сохранить"}
                                </button>
                            </div>
                        </div>

                        {suppSavedMsg ? <div className="mt-2 text-[11px] text-green-600 dark:text-green-400">{suppSavedMsg}</div> : null}
                        {suppAiHint ? <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">{suppAiHint}</div> : null}

                        {suppHint ? (
                            <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-white/70 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
                                {suppHint}
                            </div>
                        ) : null}

                        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                            <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Сейчас назначено клиенту</div>

                            {suppDb.plan?.items?.length ? (
                                <div className="mt-2 space-y-2">
                                    {suppDb.plan.items.slice(0, 10).map((it, idx) => (
                                        <div key={`supp-assigned-${idx}-${it.name}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                                            <div className="font-semibold">{it.name}</div>
                                            <div className="mt-1 text-zinc-600 dark:text-zinc-300">
                                                {it.dose ? <span>{it.dose}</span> : null}
                                                {it.timing ? <span>{it.dose ? " · " : ""}{it.timing}</span> : null}
                                                {it.duration ? <span>{(it.dose || it.timing) ? " · " : ""}{it.duration}</span> : null}
                                            </div>
                                            {it.purpose ? <div className="mt-1 text-zinc-500">Зачем: {it.purpose}</div> : null}
                                            {it.cautions?.length ? <div className="mt-1 text-zinc-500">Осторожно: {it.cautions.join(", ")}</div> : null}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-2 text-[11px] text-zinc-500">—</div>
                            )}

                            {suppDb.plan?.disclaimer ? (
                                <div className="mt-3 text-[11px] text-zinc-500">Важно: {suppDb.plan.disclaimer}</div>
                            ) : null}
                        </div>

                        <details className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                            <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 dark:text-zinc-200">Редактировать</summary>

                            <div className="mt-3 space-y-3">
                                <label className="block text-xs">
                                    <div className="mb-1 text-zinc-500">Общие заметки (опц.)</div>
                                    <textarea
                                        rows={2}
                                        value={suppGeneralNotes}
                                        onChange={(e) => setSuppGeneralNotes(e.target.value)}
                                        placeholder="Как принимать, на что обратить внимание, что проверить…"
                                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                    />
                                </label>

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={addSuppItem}
                                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                    >
                                        + Добавить позицию
                                    </button>

                                    <div className="text-[11px] text-zinc-500">Подсказка: дозировку лучше писать безопасно: «по инструкции» / «диапазон при подтверждённом дефиците».</div>
                                </div>

                                {suppItems.length ? (
                                    <div className="space-y-2">
                                        {suppItems.map((it, idx) => (
                                            <div key={`supp-edit-${idx}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Позиция #{idx + 1}</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSuppItem(idx)}
                                                        className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/30"
                                                    >
                                                        Удалить
                                                    </button>
                                                </div>

                                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                    <label className="block">
                                                        <div className="mb-1 text-[11px] text-zinc-500">Название</div>
                                                        <input
                                                            value={it.name}
                                                            onChange={(e) => updateSuppItem(idx, { name: e.target.value })}
                                                            placeholder="Напр.: Омега-3"
                                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                                        />
                                                    </label>

                                                    <label className="block">
                                                        <div className="mb-1 text-[11px] text-zinc-500">Дозировка</div>
                                                        <input
                                                            value={it.dose}
                                                            onChange={(e) => updateSuppItem(idx, { dose: e.target.value })}
                                                            placeholder="По инструкции / 1–2 капс..."
                                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                                        />
                                                    </label>

                                                    <label className="block">
                                                        <div className="mb-1 text-[11px] text-zinc-500">Когда</div>
                                                        <input
                                                            value={it.timing}
                                                            onChange={(e) => updateSuppItem(idx, { timing: e.target.value })}
                                                            placeholder="Утро / с едой / перед сном"
                                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                                        />
                                                    </label>

                                                    <label className="block">
                                                        <div className="mb-1 text-[11px] text-zinc-500">Срок</div>
                                                        <input
                                                            value={it.duration}
                                                            onChange={(e) => updateSuppItem(idx, { duration: e.target.value })}
                                                            placeholder="4–8 недель / 2 месяца"
                                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                                        />
                                                    </label>
                                                </div>

                                                <label className="mt-2 block">
                                                    <div className="mb-1 text-[11px] text-zinc-500">Зачем</div>
                                                    <input
                                                        value={it.purpose}
                                                        onChange={(e) => updateSuppItem(idx, { purpose: e.target.value })}
                                                        placeholder="Поддержка..."
                                                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                                    />
                                                </label>

                                                <label className="mt-2 block">
                                                    <div className="mb-1 text-[11px] text-zinc-500">Осторожно (через запятую)</div>
                                                    <input
                                                        value={(it.cautions ?? []).join(", ")}
                                                        onChange={(e) => updateSuppItem(idx, { cautions: parseFoodTextareaToArray(e.target.value) })}
                                                        placeholder="Беременность, антикоагулянты, ЖКТ..."
                                                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                                    />
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-zinc-300 bg-white/70 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
                                        Пока пусто. Можно нажать «ИИ → подобрать» или добавить вручную.
                                    </div>
                                )}
                            </div>
                        </details>
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
                <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                    <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 dark:text-zinc-200">
                        История назначений ({menuAssignments.length})
                    </summary>
                    <div className="mt-3">
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
                    </div>
                </details>

            </section>

                </>
            ) : null}

            {tab === "diary" ? (
                <>
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

            

            {/* Дневник питания */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Дневник питания (таблица строк)</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Формат: время → блюда → количество → причина → ощущения → БАДы/лекарства.
                </p>

                {filteredJournal.filter((e) => e.food_diary != null).length === 0 ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Нет записей дневника питания за выбранный период.</div>
                ) : (
                    <div className="space-y-2">
                        {filteredJournal
                            .filter((e) => e.food_diary != null)
                            .map((e) => {
                                const d: any = e.food_diary ?? {};
                                const rows = Array.isArray(d?.rows) ? d.rows : [];
                                const wake = d?.wake_time ?? d?.wakeTime ?? "";
                                const bed = d?.bed_time ?? d?.bedTime ?? "";
                                const waterBalance = d?.water_balance ?? d?.waterBalance ?? d?.water_liters ?? d?.waterLiters ?? "";
                                const sleepNote = d?.sleep_note ?? d?.sleepNote ?? "";

                                return (
                                    <details
                                        key={e.id}
                                        className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                                    >
                                        <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                            {new Date(e.entry_date).toLocaleDateString()} — строк: {rows.length}
                                            {wake ? ` · подъем: ${wake}` : ""}
                                            {bed ? ` · сон: ${bed}` : ""}
                                            {waterBalance ? ` · вода: ${waterBalance}` : ""}
                                        </summary>

                                        {rows.length > 0 ? (
                                            <div className="mt-3 overflow-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                                                <table className="min-w-full border-collapse">
                                                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                                                        <tr>
                                                            <th className="px-2 py-2 text-left font-medium">Время</th>
                                                            <th className="px-2 py-2 text-left font-medium">Блюдо, продукты</th>
                                                            <th className="px-2 py-2 text-left font-medium">Количество</th>
                                                            <th className="px-2 py-2 text-left font-medium">Причина</th>
                                                            <th className="px-2 py-2 text-left font-medium">Ощущение</th>
                                                            <th className="px-2 py-2 text-left font-medium">БАДы/лекарства</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map((r: any, idx: number) => {
                                                            const time = r?.time ?? "";
                                                            const dish = `${r?.slot ? `${r.slot}: ` : ""}${r?.dish ?? ""}`;
                                                            const amount = r?.amount ?? "";
                                                            const reason = r?.reason ?? r?.cause ?? "";
                                                            const feeling = r?.feeling ?? r?.sensation ?? "";
                                                            const supplements = r?.supplements ?? r?.meds ?? "";
                                                            return (
                                                                <tr key={String(r?.id ?? idx)} className="border-t border-zinc-100 dark:border-zinc-800">
                                                                    <td className="px-2 py-2">{time}</td>
                                                                    <td className="px-2 py-2">{dish}</td>
                                                                    <td className="px-2 py-2">{amount}</td>
                                                                    <td className="px-2 py-2">{reason}</td>
                                                                    <td className="px-2 py-2">{feeling}</td>
                                                                    <td className="px-2 py-2">{supplements}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Строк нет.</div>
                                        )}

                                        {(sleepNote || wake || bed || waterBalance) ? (
                                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                                <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
                                                    <div className="text-[11px] text-zinc-500">Время подъема</div>
                                                    <div className="mt-1 text-xs">{wake || "—"}</div>
                                                </div>
                                                <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
                                                    <div className="text-[11px] text-zinc-500">Время отхода ко сну</div>
                                                    <div className="mt-1 text-xs">{bed || "—"}</div>
                                                </div>
                                                <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
                                                    <div className="text-[11px] text-zinc-500">Водный баланс</div>
                                                    <div className="mt-1 whitespace-pre-wrap text-xs">{waterBalance || "—"}</div>
                                                </div>
                                                <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-3">
                                                    <div className="text-[11px] text-zinc-500">Комментарий про сон</div>
                                                    <div className="mt-1 whitespace-pre-wrap text-xs">{sleepNote || "—"}</div>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* AI анализ дефицитов + заметки */}
                                        <div className="mt-3 grid gap-2">
                                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="font-medium">ИИ-анализ дефицитов (по дневнику)</div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => runDiaryAi(e)}
                                                            disabled={Boolean(diaryAiBusyByEntryId[e.id])}
                                                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                                        >
                                                            {diaryAiBusyByEntryId[e.id] ? "Анализирую…" : "Запустить"}
                                                        </button>

                                                        {diaryAiByEntryId[e.id]?.draft_feedback_for_client ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setDiaryNoteDraftByEntryId((p) => ({
                                                                        ...p,
                                                                        [e.id]: String(diaryAiByEntryId[e.id].draft_feedback_for_client || ""),
                                                                    }))
                                                                }
                                                                className="rounded-full bg-black px-3 py-1.5 text-[11px] text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                                                                title="Вставить AI-черновик в заметку нутрициолога"
                                                            >
                                                                Вставить в заметку
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                {diaryAiErrByEntryId[e.id] ? (
                                                    <div className="mt-2 text-[11px] text-red-600">{diaryAiErrByEntryId[e.id]}</div>
                                                ) : null}

                                                {diaryAiByEntryId[e.id] ? (
                                                    <details className="mt-2 rounded-lg bg-white p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                        <summary className="cursor-pointer select-none font-medium">Результат</summary>
                                                        <div className="mt-2 space-y-2 whitespace-pre-wrap">
                                                            <div><b>Коротко:</b> {String(diaryAiByEntryId[e.id].short_summary || "")}</div>

                                                            {Array.isArray(diaryAiByEntryId[e.id].imbalances) && diaryAiByEntryId[e.id].imbalances.length ? (
                                                                <div>
                                                                    <b>Перекосы:</b>
                                                                    <ul className="mt-1 list-disc pl-4">
                                                                        {diaryAiByEntryId[e.id].imbalances.slice(0, 12).map((x: any, i: number) => (
                                                                            <li key={i}>{String(x)}</li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            ) : null}

                                                            {Array.isArray(diaryAiByEntryId[e.id].likely_deficits) && diaryAiByEntryId[e.id].likely_deficits.length ? (
                                                                <div>
                                                                    <b>Вероятные дефициты:</b>
                                                                    <div className="mt-1 space-y-2">
                                                                        {diaryAiByEntryId[e.id].likely_deficits.slice(0, 7).map((d: any, i: number) => (
                                                                            <div key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                                                                                <div className="font-medium">{String(d?.nutrient || "")}{d?.confidence ? ` (${String(d.confidence)})` : ""}</div>
                                                                                {d?.why ? <div className="mt-1">{String(d.why)}</div> : null}
                                                                                {Array.isArray(d?.how_to_fix) && d.how_to_fix.length ? (
                                                                                    <div className="mt-1">
                                                                                        <span className="font-medium">Что делать:</span>
                                                                                        <ul className="mt-1 list-disc pl-4">
                                                                                            {d.how_to_fix.slice(0, 6).map((x: any, j: number) => (
                                                                                                <li key={j}>{String(x)}</li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </div>
                                                                                ) : null}
                                                                                {Array.isArray(d?.food_examples) && d.food_examples.length ? (
                                                                                    <div className="mt-1">
                                                                                        <span className="font-medium">Примеры продуктов:</span> {d.food_examples.slice(0, 8).map((x: any) => String(x)).join(", ")}
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : null}

                                                            {Array.isArray(diaryAiByEntryId[e.id].questions) && diaryAiByEntryId[e.id].questions.length ? (
                                                                <div>
                                                                    <b>Вопросы клиенту:</b>
                                                                    <ul className="mt-1 list-disc pl-4">
                                                                        {diaryAiByEntryId[e.id].questions.slice(0, 10).map((x: any, i: number) => (
                                                                            <li key={i}>{String(x)}</li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            ) : null}

                                                            {diaryAiByEntryId[e.id].disclaimer ? (
                                                                <div className="text-[10px] text-zinc-500">{String(diaryAiByEntryId[e.id].disclaimer)}</div>
                                                            ) : null}
                                                        </div>
                                                    </details>
                                                ) : null}
                                            </div>

                                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-medium">Заметка нутрициолога (обратная связь)</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => saveDiaryNote(e)}
                                                        disabled={Boolean(diaryNoteSavingByEntryId[e.id])}
                                                        className="rounded-full bg-black px-3 py-1.5 text-[11px] text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-black"
                                                    >
                                                        {diaryNoteSavingByEntryId[e.id] ? "Сохраняю…" : "Сохранить"}
                                                    </button>
                                                </div>

                                                <textarea
                                                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                                    rows={5}
                                                    value={diaryNoteDraftByEntryId[e.id] ?? (e.nutritionist_diary_note ?? "")}
                                                    onChange={(ev) => setDiaryNoteDraftByEntryId((p) => ({ ...p, [e.id]: ev.target.value }))}
                                                    placeholder="Напиши обратную связь по дневнику (или нажми «Вставить в заметку» после AI-анализа)…"
                                                />

                                                {diaryNoteHintByEntryId[e.id] ? (
                                                    <div className="mt-2 text-[11px] text-zinc-500">{diaryNoteHintByEntryId[e.id]}</div>
                                                ) : null}

                                                {e.client_diary_reply ? (
                                                    <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                        <div className="font-medium">Ответ клиента</div>
                                                        <div className="mt-1 whitespace-pre-wrap">{e.client_diary_reply}</div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </details>
                                );
                            })}
                    </div>
                )}
            </section>


                </>
            ) : null}

            {tab === "training" ? (
                <>
                    {/* Тренировки (информативно) */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">Тренировки</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Здесь — только отчёты клиента. Планы тренировок редактируются в отдельном разделе.
                        </p>
                    </div>

                    <Link
                        href={`/nutritionist/training/${clientId}`}
                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        Открыть планы
                    </Link>
                </div>

                {(() => {
                    const items = (journal ?? [])
                        .filter((e) => e && typeof e === "object" && (e as any).training_report)
                        .map((e) => {
                            const r: any = (e as any).training_report;
                            const status = r?.status === "done" || r?.status === "partial" || r?.status === "skipped" ? r.status : "partial";
                            const didAsPlanned = typeof r?.did_as_planned === "boolean" ? r.did_as_planned : Boolean(r?.didAsPlanned ?? true);
                            const comment = typeof r?.general_comment === "string" ? r.general_comment : (typeof r?.generalComment === "string" ? r.generalComment : "");
                            return { date: (e as any).entry_date, status, didAsPlanned, comment };
                        })
                        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                        .slice(0, 7);

                    if (items.length === 0) {
                        return <div className="text-xs text-zinc-500 dark:text-zinc-400">Клиент ещё не отмечал тренировки.</div>;
                    }

                    return (
                        <div className="space-y-2">
                            {items.map((it) => (
                                <div key={it.date} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="font-medium">{new Date(it.date).toLocaleDateString()}</div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-950">
                                                Статус: <b>{it.status}</b>
                                            </span>
                                            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-950">
                                                По плану: <b>{it.didAsPlanned ? "да" : "нет"}</b>
                                            </span>
                                        </div>
                                    </div>
                                    {it.comment ? (
                                        <div className="mt-2 whitespace-pre-wrap text-[11px] text-zinc-600 dark:text-zinc-300">
                                            <b>Комментарий:</b> {it.comment}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </section>


                </>
            ) : null}

            {tab === "labs" ? (
                <>
                    {/* Анализы */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">Анализы клиента</h3>
                        <p className="mt-1 text-xs text-zinc-500">
                            Загрузка → OCR → разбор DeepSeek → сохранение. Большинство настроек спрятаны в «Дополнительно».
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setLabHint(null);
                                setLabUploadOpen(true);
                            }}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                            + Загрузить
                        </button>
                        <button
                            type="button"
                            onClick={reloadLabReports}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                            Обновить
                        </button>
                    </div>
                </div>

                {labHint ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {labHint}
                    </div>
                ) : null}

                {labUploadOpen ? (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                        onClick={() => setLabUploadOpen(false)}
                    >
                        <div
                            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-950"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold">Новый анализ</h3>
                                    <p className="mt-1 text-xs text-zinc-500">
                                        Лучше всего — ровное фото без бликов (или скриншот).
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                    onClick={() => setLabUploadOpen(false)}
                                >
                                    Закрыть
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3">
                                <label className="grid gap-1 text-sm">
                                    <span className="text-zinc-700 dark:text-zinc-200">Файл</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="w-full rounded-md border p-2 text-sm"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0] || null;
                                            setLabFile(f);
                                            if (f && !labTitle) setLabTitle(f.name);
                                        }}
                                    />
                                </label>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="grid gap-1 text-sm">
                                        <span className="text-zinc-700 dark:text-zinc-200">Название</span>
                                        <input
                                            className="rounded-md border px-3 py-2 text-sm"
                                            value={labTitle}
                                            onChange={(e) => setLabTitle(e.target.value)}
                                            placeholder="Например: Общий анализ крови"
                                        />
                                    </label>

                                    <label className="grid gap-1 text-sm">
                                        <span className="text-zinc-700 dark:text-zinc-200">Дата (опционально)</span>
                                        <input
                                            type="date"
                                            className="rounded-md border px-3 py-2 text-sm"
                                            value={labTakenAt}
                                            onChange={(e) => setLabTakenAt(e.target.value)}
                                        />
                                    </label>
                                </div>

                                <details className="rounded-md border p-3">
                                    <summary className="cursor-pointer select-none text-sm text-zinc-700 dark:text-zinc-200">
                                        Дополнительно
                                    </summary>
                                    <div className="mt-3 grid gap-3">
                                        <label className="grid gap-1 text-sm">
                                            <span className="text-zinc-700 dark:text-zinc-200">Язык OCR</span>
                                            <input
                                                className="rounded-md border px-3 py-2 text-sm"
                                                value={labOcrLang}
                                                onChange={(e) => setLabOcrLang(e.target.value)}
                                                placeholder="rus+eng"
                                            />
                                            <span className="text-[11px] text-zinc-500">
                                                Обычно хватает: <b>rus+eng</b>
                                            </span>
                                        </label>

                                        <label className="grid gap-1 text-sm">
                                            <span className="text-zinc-700 dark:text-zinc-200">Детализация</span>
                                            <select
                                                className="rounded-md border px-3 py-2 text-sm"
                                                value={labDetail}
                                                onChange={(e) =>
                                                    setLabDetail(e.target.value as "short" | "detailed")
                                                }
                                            >
                                                <option value="short">Коротко</option>
                                                <option value="detailed">Чуть подробнее</option>
                                            </select>
                                        </label>
                                    </div>
                                </details>

                                <div className="mt-1 flex items-center justify-between gap-3">
                                    <div className="text-xs text-zinc-500">
                                        {labFile ? (
                                            <>
                                                Выбрано:{" "}
                                                <span className="text-zinc-700 dark:text-zinc-200">
                                                    {labFile.name}
                                                </span>
                                            </>
                                        ) : (
                                            "Выбери изображение."
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        disabled={labBusy || !labFile}
                                        className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                                        onClick={uploadAndAnalyzeNewLabReport}
                                    >
                                        {labBusy ? "Обрабатываю…" : "Загрузить и разобрать"}
                                    </button>
                                </div>
                            </div>

                            {labHint ? (
                                <p className="mt-3 text-sm text-red-600">{labHint}</p>
                            ) : null}

                            {labLastOcr ? (
                                <details className="mt-4 rounded-md border p-3">
                                    <summary className="cursor-pointer select-none text-sm text-zinc-700 dark:text-zinc-200">
                                        Показать OCR (для проверки)
                                    </summary>
                                    <div className="mt-2 whitespace-pre-wrap text-xs text-zinc-800 dark:text-zinc-100">
                                        {labLastOcr}
                                    </div>
                                </details>
                            ) : null}
                        </div>
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
                                            <details className="mt-2 rounded-lg bg-white p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-200">
                                                    Разбор (DeepSeek)
                                                </summary>
                                                <div className="mt-2 whitespace-pre-wrap">{r.ai_summary}</div>
                                            </details>
                                        ) : null}

                                        {r.client_note ? (
                                            <details className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                <summary className="cursor-pointer select-none font-medium">Заметка клиента (что не так / вопросы)</summary>
                                                <div className="mt-2 whitespace-pre-wrap">{r.client_note}</div>
                                            </details>
                                        ) : null}

                                        <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-medium">Заметка специалиста</div>
                                                <button
                                                    type="button"
                                                    onClick={() => saveLabNote(r)}
                                                    disabled={Boolean(labNoteSavingById[r.id])}
                                                    className="rounded-full bg-black px-3 py-1.5 text-[11px] text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-black"
                                                >
                                                    {labNoteSavingById[r.id] ? "Сохраняю…" : "Сохранить"}
                                                </button>
                                            </div>

                                            <textarea
                                                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                                rows={4}
                                                value={labNoteDraftById[r.id] ?? (r.nutritionist_note ?? "")}
                                                onChange={(ev) => setLabNoteDraftById((p) => ({ ...p, [r.id]: ev.target.value }))}
                                                placeholder="Твоя заметка по анализу (видит клиент)…"
                                            />

                                            {labNoteHintById[r.id] ? (
                                                <div className="mt-2 text-[11px] text-zinc-500">{labNoteHintById[r.id]}</div>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openLabReport(r)}
                                        disabled={labOpeningId === r.id}
                                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                    >
                                        {labOpeningId === r.id ? "Открываю..." : "Открыть файл"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => analyzeLabReport(r)}
                                        disabled={labAnalyzingId === r.id}
                                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                        title="OCR + разбор через DeepSeek"
                                    >
                                        {labAnalyzingId === r.id
                                            ? "Разбираю…"
                                            : r.ai_summary
                                              ? "Переразобрать"
                                              : "Сделать разбор"}
                                    </button>
                                </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
                </>
            ) : null}
        </div>
    );
}