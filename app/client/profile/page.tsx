"use client";

import { FormEvent, useEffect, useState, ChangeEvent, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

type ClientProfile = {
    user_id: string;
    main_goal: string | null;
    goal_description: string | null;
    allergies: string | null;
    banned_foods: string | null;
    preferences: string | null;
    monthly_budget: number | null;
    intake_form?: Record<string, any> | null;
};

type Nutritionist = {
    id: string;
    full_name: string | null;
};

type Link = {
    id: string;
    client_id: string;
    nutritionist_id: string;
    status: "pending" | "approved" | "rejected";
    client_note: string | null;
    created_at: string;
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

    // --- заметки ---
    client_note?: string | null;
    nutritionist_note?: string | null;

    created_at: string;
};

function formatDate(d: string | null | undefined): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
}

function safeFileName(name: string): string {
    return name.replace(/[^\w.\-()]+/g, "_");
}

const FREQ5 = ["Никогда", "Очень редко", "Редко", "Периодически", "Регулярно"] as const;
type Freq5 = (typeof FREQ5)[number];

const MOOD_FREQ4 = ["Никогда", "Редко", "Иногда", "Постоянно"] as const;
type MoodFreq4 = (typeof MOOD_FREQ4)[number];

const FOOD_FREQ_ITEMS = ["Макароны", "Крупы", "Овощи", "Мясо", "Рыба", "Птица", "Фаст фуд"];
const DRINK_FREQ_ITEMS = ["Газированные напитки", "Минеральная вода", "Соки", "Молоко", "Кисломолочные напитки", "Какао"];
const MOOD_ITEMS = ["Вялость", "Апатия", "Грусть", "Агрессия", "Тревога", "Радость и эйфория", "Спокойное гармоничное состояние"];
const LIFE_SPHERES = ["Карьера", "Финансы", "Друзья", "Семья", "Здоровье", "Отдых", "Условия жизни", "Рост (развитие, достижения)"];

function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
    return (
        <details
            open={defaultOpen}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
            <summary className="cursor-pointer select-none text-sm font-semibold">{title}</summary>
            <div className="mt-4 space-y-3">{children}</div>
        </details>
    );
}

type Intake = Record<string, any>;

export default function ClientProfilePage() {
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [sendingRequest, setSendingRequest] = useState(false);

    const [profile, setProfile] = useState<ClientProfile | null>(null);
    const [nutritionists, setNutritionists] = useState<Nutritionist[]>([]);
    const [selectedNutritionistId, setSelectedNutritionistId] = useState<string>("");
    const [link, setLink] = useState<Link | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);

    // ===== Анкета (intake) =====
    const [intake, setIntake] = useState<Intake>({});
    const [showIntake, setShowIntake] = useState(false);
    const [savingIntake, setSavingIntake] = useState(false);
    const [intakeHint, setIntakeHint] = useState<string | null>(null);

    // ===== Анализы (файлы) =====
    const [labReports, setLabReports] = useState<LabReport[]>([]);
    const [labHint, setLabHint] = useState<string | null>(null);
    const [labUploading, setLabUploading] = useState(false);
    const [labTitle, setLabTitle] = useState("");
    const [labTakenAt, setLabTakenAt] = useState<string>("");
    const [labFile, setLabFile] = useState<File | null>(null);

    const [labClientNoteDraftById, setLabClientNoteDraftById] = useState<Record<string, string>>({});
    const [labClientNoteSavingId, setLabClientNoteSavingId] = useState<string | null>(null);
    const [labClientNoteHintById, setLabClientNoteHintById] = useState<Record<string, string>>({});

    const reloadLabReports = useCallback(async (uid: string) => {
        const { data, error: e } = await supabase
            .from("client_lab_reports")
            .select("*")
            .eq("client_id", uid)
            .order("taken_at", { ascending: false })
            .order("created_at", { ascending: false });

        if (e) {
            setLabHint(`Не удалось загрузить список анализов: ${e.message}`);
            setLabReports([]);
            return;
        }

        setLabHint(null);
        setLabReports((data ?? []) as LabReport[]);
    }, []);

    const saveClientLabNote = useCallback(async (r: LabReport) => {
        if (!userId) return;
        const note = String(labClientNoteDraftById[r.id] ?? r.client_note ?? "").trim();
        setLabClientNoteSavingId(r.id);
        setLabClientNoteHintById((p) => ({ ...p, [r.id]: "" }));

        const { error: updErr } = await supabase
            .from("client_lab_reports")
            .update({ client_note: note || null })
            .eq("id", r.id)
            .eq("client_id", userId);

        if (updErr) {
            setLabClientNoteHintById((p) => ({ ...p, [r.id]: `Ошибка: ${updErr.message}` }));
            setLabClientNoteSavingId(null);
            return;
        }

        await reloadLabReports(userId);
        setLabClientNoteHintById((p) => ({ ...p, [r.id]: "Сохранено" }));
        setLabClientNoteSavingId(null);
    }, [labClientNoteDraftById, reloadLabReports, userId]);


    const handlePickLabFile = (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        setLabFile(f);
    };

    const resetLabForm = () => {
        setLabFile(null);
        setLabTitle("");
        setLabTakenAt("");
        setLabHint(null);
    };

    const handleUploadLab = async () => {
        if (!userId) {
            setLabHint("Нет авторизации");
            return;
        }
        if (!labFile) {
            setLabHint("Выбери файл (PDF/JPG/PNG)");
            return;
        }

        setLabUploading(true);
        setLabHint(null);

        try {
            const path = `${userId}/${Date.now()}_${safeFileName(labFile.name)}`;

            const up = await supabase.storage.from("lab_reports").upload(path, labFile, {
                cacheControl: "3600",
                upsert: false,
                contentType: labFile.type || undefined,
            });

            if (up.error) {
                setLabHint(`Не удалось загрузить файл в storage: ${up.error.message}`);
                return;
            }

            // file_url может быть null (если bucket private). Открывать будем signed URL.
            const ins = await supabase.from("client_lab_reports").insert({
                client_id: userId,
                nutritionist_id: null,
                title: labTitle.trim() || labFile.name,
                taken_at: labTakenAt || null,
                file_path: path,
                file_url: null,
                ai_summary: null,
            });

            if (ins.error) {
                setLabHint(`Файл загрузился, но запись в БД не создалась: ${ins.error.message}`);
                return;
            }

            resetLabForm();
            await reloadLabReports(userId);
        } finally {
            setLabUploading(false);
        }
    };

    const openLabFile = async (r: LabReport) => {
        setLabHint(null);

        // если вдруг в старых записях есть public url — используем его
        if (r.file_url) {
            window.open(r.file_url, "_blank", "noreferrer");
            return;
        }

        const { data, error: e } = await supabase.storage
            .from("lab_reports")
            .createSignedUrl(r.file_path, 60 * 10);

        if (e || !data?.signedUrl) {
            setLabHint(`Не удалось открыть файл: ${e?.message ?? "signedUrl пустой"}`);
            return;
        }

        window.open(data.signedUrl, "_blank", "noreferrer");
    };

    const deleteLabReport = async (r: LabReport) => {
        if (!userId) return;
        const ok = confirm("Удалить этот анализ? (файл и запись)");
        if (!ok) return;

        setLabHint(null);

        // 1) удаляем файл
        const rm = await supabase.storage.from("lab_reports").remove([r.file_path]);
        if (rm.error) {
            setLabHint(`Не удалось удалить файл: ${rm.error.message}`);
            return;
        }

        // 2) удаляем запись
        const del = await supabase
            .from("client_lab_reports")
            .delete()
            .eq("id", r.id)
            .eq("client_id", userId);

        if (del.error) {
            setLabHint(`Файл удалён, но запись в БД не удалена: ${del.error.message}`);
            return;
        }

        await reloadLabReports(userId);
    };

    // ===== Load =====
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                setError("Не удалось получить пользователя. Попробуй войти заново.");
                setLoading(false);
                return;
            }

            setUserId(user.id);

            // 1) Профиль клиента
            const { data: profileRows } = await supabase
                .from("client_profiles")
                .select("*")
                .eq("user_id", user.id)
                .limit(1);

            const existingProfile = (profileRows?.[0] ?? null) as ClientProfile | null;
            setProfile(
                existingProfile ?? {
                    user_id: user.id,
                    main_goal: "",
                    goal_description: "",
                    allergies: "",
                    banned_foods: "",
                    preferences: "",
                    monthly_budget: null,
                    intake_form: null,
                }
            );

            setIntake((existingProfile?.intake_form ?? {}) as Intake);
            setShowIntake(!!existingProfile?.intake_form);

            // 2) Список нутрициологов
            const { data: nutrs, error: nutrsError } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("role", "nutritionist");

            if (!nutrsError && nutrs) {
                setNutritionists(nutrs as Nutritionist[]);
                if (nutrs.length > 0) setSelectedNutritionistId(nutrs[0].id);
            }

            // 3) Текущая связь клиент ↔ нутрициолог (последняя)
            const { data: linksRows } = await supabase
                .from("client_nutritionist_links")
                .select("*")
                .eq("client_id", user.id)
                .order("created_at", { ascending: false })
                .limit(1);

            const existingLink = (linksRows?.[0] ?? null) as Link | null;
            setLink(existingLink);

            // 4) Анализы
            await reloadLabReports(user.id);

            setLoading(false);
        };

        load();
    }, [reloadLabReports]);

    const handleProfileSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!userId || !profile) return;

        setSavingProfile(true);
        setError(null);
        try {
            const { error: upsertError } = await supabase
                .from("client_profiles")
                .upsert(
                    {
                        ...profile,
                        user_id: userId,
                    },
                    { onConflict: "user_id" }
                );

            if (upsertError) setError(upsertError.message);
        } finally {
            setSavingProfile(false);
        }
    };

    const handleSaveIntake = async () => {
        if (!userId) return;
        setSavingIntake(true);
        setError(null);
        setIntakeHint(null);

        try {
            const { error: upsertError } = await supabase
                .from("client_profiles")
                .upsert({ user_id: userId, intake_form: intake }, { onConflict: "user_id" });

            if (upsertError) {
                setError(upsertError.message);
                return;
            }

            setIntakeHint("Анкета сохранена.");
            setShowIntake(true);
        } finally {
            setSavingIntake(false);
        }
    };

    const handleSendRequest = async () => {
        if (!userId || !selectedNutritionistId) return;
        if (link && link.status === "pending") {
            setError("У тебя уже есть заявка в ожидании ответа нутрициолога.");
            return;
        }

        setSendingRequest(true);
        setError(null);

        try {
            const { error: insertError } = await supabase.from("client_nutritionist_links").insert({
                client_id: userId,
                nutritionist_id: selectedNutritionistId,
                client_note: null,
            });

            if (insertError) {
                setError(insertError.message);
                return;
            }

            const { data: linksRows } = await supabase
                .from("client_nutritionist_links")
                .select("*")
                .eq("client_id", userId)
                .order("created_at", { ascending: false })
                .limit(1);

            const newLink = (linksRows?.[0] ?? null) as Link | null;
            setLink(newLink);
        } finally {
            setSendingRequest(false);
        }
    };

    if (loading || !profile) {
        return <div className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю профиль...</div>;
    }

    const currentNutritionist = link && nutritionists.find((n) => n.id === link.nutritionist_id);

    const getStr = (key: string) => {
        const v = (intake ?? {})[key];
        return typeof v === "string" || typeof v === "number" ? String(v) : "";
    };

    const setStr = (key: string, value: string) => {
        setIntake((prev) => ({ ...(prev ?? {}), [key]: value }));
    };

    const getMap = (group: string): Record<string, any> => {
        const v = (intake ?? {})[group];
        return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
    };

    const setMapValue = (group: string, k: string, value: any) => {
        setIntake((prev) => ({
            ...(prev ?? {}),
            [group]: { ...(getMap(group) ?? {}), [k]: value },
        }));
    };

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">Мой профиль и цели</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Здесь ты задаёшь свои цели, ограничения и бюджет — на основе этого ИИ и нутрициолог будут собирать
                    для тебя рационы.
                </p>
            </header>

            {/* Профиль */}
            <form
                onSubmit={handleProfileSubmit}
                className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                        Главная цель
                        <input
                            value={profile.main_goal ?? ""}
                            onChange={(e) => setProfile((p) => (p ? { ...p, main_goal: e.target.value } : p))}
                            placeholder="Похудение / набор мышц / энергия..."
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Ориентировочный бюджет в месяц
                        <input
                            type="number"
                            min={0}
                            value={profile.monthly_budget ?? ""}
                            onChange={(e) =>
                                setProfile((p) =>
                                    p
                                        ? {
                                            ...p,
                                            monthly_budget: e.target.value === "" ? null : Number(e.target.value),
                                        }
                                        : p
                                )
                            }
                            placeholder="Например, 300"
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>
                </div>

                <label className="flex flex-col gap-1 text-sm">
                    Подробное описание цели
                    <textarea
                        rows={3}
                        value={profile.goal_description ?? ""}
                        onChange={(e) => setProfile((p) => (p ? { ...p, goal_description: e.target.value } : p))}
                        placeholder="Что ты хочешь изменить, в какие сроки, на что обратить внимание..."
                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                    />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                        Аллергии и непереносимости
                        <textarea
                            rows={2}
                            value={profile.allergies ?? ""}
                            onChange={(e) => setProfile((p) => (p ? { ...p, allergies: e.target.value } : p))}
                            placeholder="Например: молоко, орехи, глютен..."
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Продукты, которые точно не хочешь видеть в рационе
                        <textarea
                            rows={2}
                            value={profile.banned_foods ?? ""}
                            onChange={(e) => setProfile((p) => (p ? { ...p, banned_foods: e.target.value } : p))}
                            placeholder="Например: свинина, майонез, сахар..."
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>
                </div>

                <label className="flex flex-col gap-1 text-sm">
                    Предпочтения
                    <textarea
                        rows={2}
                        value={profile.preferences ?? ""}
                        onChange={(e) => setProfile((p) => (p ? { ...p, preferences: e.target.value } : p))}
                        placeholder="Веган, халяль, без глютена, без молочки и т.д."
                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                    />
                </label>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                    type="submit"
                    disabled={savingProfile}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                >
                    {savingProfile ? "Сохраняю..." : "Сохранить профиль"}
                </button>
            </form>

            {/* Анкета */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 className="text-sm font-semibold">Анкета клиента</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Большая анкета — свёрнутые блоки. Можно заполнять/редактировать в любой момент.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {!showIntake ? (
                            <button
                                type="button"
                                onClick={() => setShowIntake(true)}
                                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                                Открыть анкету
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowIntake(false)}
                                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                                Свернуть
                            </button>
                        )}
                    </div>
                </div>

                {!showIntake ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Анкета скрыта, чтобы не занимать место. Нажми “Открыть анкету”, чтобы заполнить.
                    </p>
                ) : (
                    <div className="space-y-3">
                        <Section title="Контактные данные" defaultOpen>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-sm">
                                    ФИО
                                    <input
                                        value={getStr("full_name")}
                                        onChange={(e) => setStr("full_name", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Дата рождения (полностью)
                                    <input
                                        type="date"
                                        value={getStr("birth_date")}
                                        onChange={(e) => setStr("birth_date", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Место жительства (город)
                                    <input
                                        value={getStr("city")}
                                        onChange={(e) => setStr("city", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Адрес электронной почты
                                    <input
                                        type="email"
                                        value={getStr("email")}
                                        onChange={(e) => setStr("email", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Ссылка на аккаунт в соц.сетях
                                    <input
                                        value={getStr("social_link")}
                                        onChange={(e) => setStr("social_link", e.target.value)}
                                        placeholder="https://..."
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Номер телефона
                                    <input
                                        value={getStr("phone")}
                                        onChange={(e) => setStr("phone", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                            </div>
                        </Section>

                        <Section title="Образование и работа">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-sm">
                                    Уровень образования
                                    <select
                                        value={getStr("education_level")}
                                        onChange={(e) => setStr("education_level", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    >
                                        <option value="">—</option>
                                        <option value="secondary_special">Средне-специальное</option>
                                        <option value="bachelor">Высшее бакалавриат</option>
                                        <option value="master">Высшее магистратура</option>
                                        <option value="phd">Ученая степень</option>
                                        <option value="other">Другое</option>
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Другое (если выбрано)
                                    <input
                                        value={getStr("education_other")}
                                        onChange={(e) => setStr("education_other", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Работаете на данный момент? Если да, то где?
                                    <textarea
                                        rows={2}
                                        value={getStr("current_work")}
                                        onChange={(e) => setStr("current_work", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Воздействие вредных производств? Если да, то когда и какой вред?
                                    <textarea
                                        rows={2}
                                        value={getStr("harmful_exposure")}
                                        onChange={(e) => setStr("harmful_exposure", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                            </div>
                        </Section>

                        <Section title="Цели и ожидания">
                            <div className="grid gap-3">
                                <label className="flex flex-col gap-1 text-sm">
                                    Постановка целей
                                    <textarea
                                        rows={2}
                                        value={getStr("goal_setting")}
                                        onChange={(e) => setStr("goal_setting", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Цели и ожидания от предстоящей работы со специалистом по питанию
                                    <textarea
                                        rows={3}
                                        value={getStr("expectations")}
                                        onChange={(e) => setStr("expectations", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Желаемый итоговый результат
                                    <textarea
                                        rows={2}
                                        value={getStr("desired_result")}
                                        onChange={(e) => setStr("desired_result", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                            </div>
                        </Section>

                        <Section title="Питание: 24 часа, диеты, предпочтения">
                            <div className="grid gap-3">
                                <label className="flex flex-col gap-1 text-sm">
                                    Подробное описание питания за последние 24 часа
                                    <span className="text-xs text-zinc-500">Время → блюдо → объём/количество</span>
                                    <textarea
                                        rows={4}
                                        value={getStr("food_24h")}
                                        onChange={(e) => setStr("food_24h", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Соблюдение диет и принципов правильного питания (когда/как долго/виды/трудности/итог)
                                    <textarea
                                        rows={3}
                                        value={getStr("diet_history")}
                                        onChange={(e) => setStr("diet_history", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Предпочтения в еде (какие продукты и как часто)
                                    <textarea
                                        rows={2}
                                        value={getStr("food_preferences")}
                                        onChange={(e) => setStr("food_preferences", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                            </div>
                        </Section>

                        <Section title="Частота продуктов (выбор)">
                            <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                                <table className="min-w-full border-collapse text-xs">
                                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                                        <tr>
                                            <th className="px-2 py-2 text-left font-medium">Продукт</th>
                                            <th className="px-2 py-2 text-left font-medium">Как часто</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {FOOD_FREQ_ITEMS.map((item) => (
                                            <tr key={item} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-2 py-2">{item}</td>
                                                <td className="px-2 py-2">
                                                    <select
                                                        value={String(getMap("food_freq")[item] ?? "")}
                                                        onChange={(e) => setMapValue("food_freq", item, e.target.value as Freq5)}
                                                        className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                                    >
                                                        <option value="">—</option>
                                                        {FREQ5.map((o) => (
                                                            <option key={o} value={o}>
                                                                {o}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        <Section title="Частота напитков (выбор)">
                            <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                                <table className="min-w-full border-collapse text-xs">
                                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                                        <tr>
                                            <th className="px-2 py-2 text-left font-medium">Напиток</th>
                                            <th className="px-2 py-2 text-left font-medium">Как часто</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DRINK_FREQ_ITEMS.map((item) => (
                                            <tr key={item} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-2 py-2">{item}</td>
                                                <td className="px-2 py-2">
                                                    <select
                                                        value={String(getMap("drink_freq")[item] ?? "")}
                                                        onChange={(e) => setMapValue("drink_freq", item, e.target.value as Freq5)}
                                                        className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                                    >
                                                        <option value="">—</option>
                                                        {FREQ5.map((o) => (
                                                            <option key={o} value={o}>
                                                                {o}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-sm">
                                    Употребляете кофе? Если да, то какой и как часто?
                                    <textarea
                                        rows={2}
                                        value={getStr("coffee")}
                                        onChange={(e) => setStr("coffee", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Употребляете чай? Если да, то какой и как часто?
                                    <textarea
                                        rows={2}
                                        value={getStr("tea")}
                                        onChange={(e) => setStr("tea", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Сколько литров воды в день вы выпиваете?
                                    <input
                                        value={getStr("water_per_day")}
                                        onChange={(e) => setStr("water_per_day", e.target.value)}
                                        placeholder="Напр. 2"
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Опишите режим питья в течение дня
                                    <textarea
                                        rows={2}
                                        value={getStr("drinking_regimen")}
                                        onChange={(e) => setStr("drinking_regimen", e.target.value)}
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>

                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    У родственников были хронические заболевания? Если да, то у кого и какие?
                                    <textarea
                                        rows={2}
                                        value={getStr("family_chronic")}
                                        onChange={(e) => setStr("family_chronic", e.target.value)}
                                        placeholder="Мама / папа / бабушки / дедушки / братья и сестры"
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                            </div>
                        </Section>

                        <Section title="Сон, режим дня">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-sm">
                                    Время подъема
                                    <input value={getStr("wake_time")} onChange={(e) => setStr("wake_time", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Время отхода ко сну
                                    <input value={getStr("bed_time")} onChange={(e) => setStr("bed_time", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Ваши действия сразу после пробуждения
                                    <textarea rows={2} value={getStr("after_wake_actions")} onChange={(e) => setStr("after_wake_actions", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Время последнего приема пищи
                                    <input value={getStr("last_meal_time")} onChange={(e) => setStr("last_meal_time", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Примерное время самого тяжелого периода дня
                                    <input value={getStr("hardest_period_time")} onChange={(e) => setStr("hardest_period_time", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Где проходит сон / кто рядом / темнота / частота просыпаний / температура / влажность / самочувствие утром
                                    <textarea
                                        rows={3}
                                        value={getStr("sleep_details")}
                                        onChange={(e) => setStr("sleep_details", e.target.value)}
                                        placeholder="Кратко опиши условия сна одним текстом"
                                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    />
                                </label>
                            </div>
                        </Section>

                        <Section title="Активность, привычки">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-sm">
                                    Занятие спортом (вид/место/кол-во тренировок в неделю)
                                    <textarea rows={2} value={getStr("sport")} onChange={(e) => setStr("sport", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Количество шагов в день
                                    <input value={getStr("steps")} onChange={(e) => setStr("steps", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Ежедневная зарядка/растяжка?
                                    <textarea rows={2} value={getStr("stretching")} onChange={(e) => setStr("stretching", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Сигареты (или альтернатива) в день
                                    <input value={getStr("cigarettes_per_day")} onChange={(e) => setStr("cigarettes_per_day", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Алкоголь за месяц (вид/кол-во/частота)
                                    <textarea rows={2} value={getStr("alcohol_month")} onChange={(e) => setStr("alcohol_month", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                            </div>
                        </Section>

                        <Section title="Жалобы, боль, настроение">
                            <div className="grid gap-3">
                                <label className="flex flex-col gap-1 text-sm">
                                    Жалобы на состояние здоровья (что беспокоит, когда началось, лечение, эффект)
                                    <textarea rows={4} value={getStr("health_complaints")} onChange={(e) => setStr("health_complaints", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Наличие болевых ощущений (где/характер/причины/длительность/интенсивность/препараты)
                                    <textarea rows={3} value={getStr("pain")} onChange={(e) => setStr("pain", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Головокружения (частота/продолжительность/интенсивность)
                                    <textarea rows={2} value={getStr("dizziness")} onChange={(e) => setStr("dizziness", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                            </div>

                            <div className="mt-2 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                                <table className="min-w-full border-collapse text-xs">
                                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                                        <tr>
                                            <th className="px-2 py-2 text-left font-medium">Состояние</th>
                                            <th className="px-2 py-2 text-left font-medium">Как часто</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {MOOD_ITEMS.map((item) => (
                                            <tr key={item} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-2 py-2">{item}</td>
                                                <td className="px-2 py-2">
                                                    <select
                                                        value={String(getMap("mood_freq")[item] ?? "")}
                                                        onChange={(e) => setMapValue("mood_freq", item, e.target.value as MoodFreq4)}
                                                        className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                                    >
                                                        <option value="">—</option>
                                                        {MOOD_FREQ4.map((o) => (
                                                            <option key={o} value={o}>
                                                                {o}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        <Section title="Антропометрия (поля)">
                            <div className="grid gap-3 sm:grid-cols-2">
                                {[
                                    ["height", "Рост"],
                                    ["weight", "Вес"],
                                    ["arm_circ", "Окружность руки (верхняя часть)"],
                                    ["chest_circ", "Окружность груди"],
                                    ["waist_circ", "Окружность талии"],
                                    ["belly_circ", "Окружность живота (пупок)"],
                                    ["hips_circ", "Окружность бедер"],
                                    ["leg_circ", "Окружность ноги (верхняя часть)"],
                                    ["fat_percent", "Содержание жира (%)"],
                                    ["fat_kg", "Вес жира (кг)"],
                                    ["lean_mass", "Тощая масса тела"],
                                    ["fat_mass_index", "Индекс массы жира"],
                                    ["bmi", "ИМТ"],
                                    ["bmr", "Величина основного обмена"],
                                    ["fat_balance", "Избыток/недостаток жировой массы"],
                                    ["muscle_balance", "Избыток/недостаток мышечной массы"],
                                    ["fluid_balance", "Внеклеточная/внутриклеточная жидкость"],
                                ].map(([k, label]) => (
                                    <label key={k} className="flex flex-col gap-1 text-sm">
                                        {label}
                                        <input
                                            value={getStr(String(k))}
                                            onChange={(e) => setStr(String(k), e.target.value)}
                                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                        />
                                    </label>
                                ))}
                            </div>
                        </Section>

                        <Section title="Системы организма (кратко)">
                            <div className="grid gap-3">
                                {[
                                    ["msk", "Опорно-двигательная система"],
                                    ["skin", "Покровная система (кожа)"],
                                    ["hair", "Состояние волос"],
                                    ["mucous", "Состояние слизистых"],
                                    ["nails", "Состояние ногтей"],
                                    ["cardio", "Сердечно-сосудистая система"],
                                    ["resp", "Дыхательная система"],
                                    ["digest", "Пищеварительная система"],
                                    ["urinary", "Мочевыделительная система"],
                                    ["immune", "Иммунная система"],
                                    ["repro", "Репродуктивная система"],
                                    ["endo", "Эндокринная система"],
                                ].map(([k, label]) => (
                                    <label key={k} className="flex flex-col gap-1 text-sm">
                                        {label}
                                        <textarea
                                            rows={2}
                                            value={getStr(String(k))}
                                            onChange={(e) => setStr(String(k), e.target.value)}
                                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                        />
                                    </label>
                                ))}
                            </div>
                        </Section>

                        <Section title="Менструальный цикл / препараты / БАДы">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-sm">
                                    Возраст начала менструаций
                                    <input value={getStr("menarche_age")} onChange={(e) => setStr("menarche_age", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Длительность цикла (5/28)
                                    <input value={getStr("cycle_length")} onChange={(e) => setStr("cycle_length", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Регулярность цикла
                                    <input value={getStr("cycle_regular")} onChange={(e) => setStr("cycle_regular", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    Обильность / болезненность
                                    <input value={getStr("cycle_flow_pain")} onChange={(e) => setStr("cycle_flow_pain", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Роды (если были): срок, как проходили, осложнения
                                    <textarea rows={2} value={getStr("childbirth")} onChange={(e) => setStr("childbirth", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                                    Принимаемые препараты и БАДы (вид/название/показания/дозировка/длительность)
                                    <textarea rows={3} value={getStr("supplements")} onChange={(e) => setStr("supplements", e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200" />
                                </label>
                            </div>
                        </Section>

                        <Section title="Колесо баланса (0–10)">
                            <p className="text-xs text-zinc-500">0–3 — минимум, 4–7 — средне, 8–10 — максимум.</p>
                            <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                                <table className="min-w-full border-collapse text-xs">
                                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                                        <tr>
                                            <th className="px-2 py-2 text-left font-medium">Сфера</th>
                                            <th className="px-2 py-2 text-left font-medium">Оценка</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {LIFE_SPHERES.map((s) => (
                                            <tr key={s} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-2 py-2">{s}</td>
                                                <td className="px-2 py-2">
                                                    <select
                                                        value={String(getMap("life_balance")[s] ?? "")}
                                                        onChange={(e) => setMapValue("life_balance", s, e.target.value)}
                                                        className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                                    >
                                                        <option value="">—</option>
                                                        {Array.from({ length: 11 }).map((_, i) => (
                                                            <option key={i} value={i}>
                                                                {i}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        {intakeHint ? <p className="text-xs text-emerald-600">{intakeHint}</p> : null}

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={handleSaveIntake}
                                disabled={savingIntake}
                                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                            >
                                {savingIntake ? "Сохраняю..." : "Сохранить анкету"}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    const ok = confirm("Очистить анкету? Данные будут удалены после сохранения.");
                                    if (!ok) return;
                                    setIntake({});
                                    setIntakeHint(null);
                                }}
                                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                                Очистить
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* ✅ Анализы (перенесено сюда) */}
            <details className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <summary className="cursor-pointer select-none text-sm font-semibold">Анализы (файлы)</summary>

                <div className="mt-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Загрузи PDF или фото. Специалист увидит это в твоей карточке.
                            </p>
                        </div>

                        {userId ? (
                            <button
                                type="button"
                                onClick={() => reloadLabReports(userId)}
                                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                                Обновить
                            </button>
                        ) : null}
                    </div>

                    {labHint ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {labHint}
                        </div>
                    ) : null}

                    <div className="grid gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900 sm:grid-cols-3">
                        <label className="flex flex-col gap-1 text-xs">
                            Название
                            <input
                                value={labTitle}
                                onChange={(e) => setLabTitle(e.target.value)}
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                                placeholder="ОАК / Биохимия / Витамин D..."
                            />
                        </label>

                        <label className="flex flex-col gap-1 text-xs">
                            Дата сдачи
                            <input
                                type="date"
                                value={labTakenAt}
                                onChange={(e) => setLabTakenAt(e.target.value)}
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                            />
                        </label>

                        <div className="flex flex-col gap-1 text-xs">
                            Файл (PDF/JPG/PNG)
                            <input
                                type="file"
                                accept=".pdf,image/*"
                                onChange={handlePickLabFile}
                                disabled={labUploading}
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
                            />

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleUploadLab}
                                    disabled={labUploading || !labFile}
                                    className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                                >
                                    {labUploading ? "Загружаю..." : "Загрузить"}
                                </button>

                                <button
                                    type="button"
                                    onClick={resetLabForm}
                                    disabled={labUploading}
                                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                >
                                    Сбросить
                                </button>

                                {labFile ? <span className="text-[11px] text-zinc-500">{labFile.name}</span> : null}
                            </div>

                            <div className="mt-2 text-[11px] text-zinc-500">
                                Если bucket <b>lab_reports</b> приватный — открываем файлы через <b>signed URL</b>.
                            </div>
                        </div>
                    </div>

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
                                            <div className="font-medium">{r.title ?? "Анализ"}</div>
                                            <div className="mt-1 text-[11px] text-zinc-500">
                                                дата: {formatDate(r.taken_at)} · загружено: {formatDate(r.created_at)}
                                            </div>
                                            {r.ai_summary ? (
                                                <div className="mt-2 rounded-lg bg-white p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                    {r.ai_summary}
                                                </div>
                                            ) : null}

                                            <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="font-medium">Моя заметка (что не так / вопросы)</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => saveClientLabNote(r)}
                                                        disabled={labClientNoteSavingId === r.id}
                                                        className="rounded-full bg-black px-3 py-1.5 text-[11px] text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-black"
                                                    >
                                                        {labClientNoteSavingId === r.id ? "Сохраняю…" : "Сохранить"}
                                                    </button>
                                                </div>

                                                <textarea
                                                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                                    rows={4}
                                                    value={labClientNoteDraftById[r.id] ?? (r.client_note ?? "")}
                                                    onChange={(ev) => setLabClientNoteDraftById((p) => ({ ...p, [r.id]: ev.target.value }))}
                                                    placeholder="Напиши сюда, что кажется неправильным, что не понравилось, вопросы по разбору…"
                                                />

                                                {labClientNoteHintById[r.id] ? (
                                                    <div className="mt-2 text-[11px] text-zinc-500">{labClientNoteHintById[r.id]}</div>
                                                ) : null}
                                            </div>

                                            {r.nutritionist_note ? (
                                                <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                                    <div className="font-medium">Комментарий специалиста</div>
                                                    <div className="mt-1 whitespace-pre-wrap">{r.nutritionist_note}</div>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openLabFile(r)}
                                                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                            >
                                                Открыть файл
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => deleteLabReport(r)}
                                                className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/30"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </details>

            {/* Мой нутрициолог */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Мой нутрициолог</h3>

                {link ? (
                    <div className="text-sm">
                        <p>
                            Текущий статус:{" "}
                            <span className="font-medium">
                                {link.status === "pending" && "заявка отправлена, ожидает ответа"}
                                {link.status === "approved" && "нутрициолог принял тебя"}
                                {link.status === "rejected" && "заявка отклонена"}
                            </span>
                        </p>
                        {currentNutritionist && (
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                Нутрициолог: {currentNutritionist.full_name ?? currentNutritionist.id}
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        {nutritionists.length === 0 ? (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Пока нет доступных нутрициологов. Покажем список, когда они появятся.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-3 text-sm">
                                <label className="flex flex-col gap-1">
                                    Выбери нутрициолога
                                    <select
                                        value={selectedNutritionistId}
                                        onChange={(e) => setSelectedNutritionistId(e.target.value)}
                                        className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                                    >
                                        {nutritionists.map((n) => (
                                            <option key={n.id} value={n.id}>
                                                {n.full_name ?? n.id}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <button
                                    type="button"
                                    onClick={handleSendRequest}
                                    disabled={sendingRequest || !selectedNutritionistId}
                                    className="self-start rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                                >
                                    {sendingRequest ? "Отправляю..." : "Отправить заявку нутрициологу"}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}