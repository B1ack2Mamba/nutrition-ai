"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ClientProfile = {
    user_id: string;
    main_goal: string | null;
    goal_description: string | null;
    allergies: string | null;
    banned_foods: string | null;
    preferences: string | null;
    monthly_budget: number | null;
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

export default function ClientProfilePage() {
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [sendingRequest, setSendingRequest] = useState(false);

    const [profile, setProfile] = useState<ClientProfile | null>(null);
    const [nutritionists, setNutritionists] = useState<Nutritionist[]>([]);
    const [selectedNutritionistId, setSelectedNutritionistId] =
        useState<string>("");
    const [link, setLink] = useState<Link | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);

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

            const existingProfile = (profileRows?.[0] ?? null) as
                | ClientProfile
                | null;
            setProfile(
                existingProfile ?? {
                    user_id: user.id,
                    main_goal: "",
                    goal_description: "",
                    allergies: "",
                    banned_foods: "",
                    preferences: "",
                    monthly_budget: null,
                },
            );

            // 2) Список нутрициологов
            const { data: nutrs, error: nutrsError } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("role", "nutritionist");

            if (!nutrsError && nutrs) {
                setNutritionists(nutrs as Nutritionist[]);
                if (nutrs.length > 0) {
                    setSelectedNutritionistId(nutrs[0].id);
                }
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

            setLoading(false);
        };

        load();
    }, []);

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
                    { onConflict: "user_id" },
                );

            if (upsertError) {
                setError(upsertError.message);
            }
        } finally {
            setSavingProfile(false);
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
            const { error: insertError } = await supabase
                .from("client_nutritionist_links")
                .insert({
                    client_id: userId,
                    nutritionist_id: selectedNutritionistId,
                    client_note: null,
                });

            if (insertError) {
                setError(insertError.message);
                return;
            }

            // перезагрузим последнюю связь
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
        return (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Загружаю профиль...
            </div>
        );
    }

    const currentNutritionist =
        link && nutritionists.find((n) => n.id === link.nutritionist_id);

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">
                    Мой профиль и цели
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Здесь ты задаёшь свои цели, ограничения и бюджет — на основе этого
                    ИИ и нутрициолог будут собирать для тебя рационы.
                </p>
            </header>

            <form
                onSubmit={handleProfileSubmit}
                className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                        Главная цель
                        <input
                            value={profile.main_goal ?? ""}
                            onChange={(e) =>
                                setProfile((p) =>
                                    p ? { ...p, main_goal: e.target.value } : p,
                                )
                            }
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
                                            monthly_budget:
                                                e.target.value === ""
                                                    ? null
                                                    : Number(e.target.value),
                                        }
                                        : p,
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
                        onChange={(e) =>
                            setProfile((p) =>
                                p ? { ...p, goal_description: e.target.value } : p,
                            )
                        }
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
                            onChange={(e) =>
                                setProfile((p) =>
                                    p ? { ...p, allergies: e.target.value } : p,
                                )
                            }
                            placeholder="Например: молоко, орехи, глютен..."
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        Продукты, которые точно не хочешь видеть в рационе
                        <textarea
                            rows={2}
                            value={profile.banned_foods ?? ""}
                            onChange={(e) =>
                                setProfile((p) =>
                                    p ? { ...p, banned_foods: e.target.value } : p,
                                )
                            }
                            placeholder="Например: свинина, майонез, сахар..."
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
                </div>

                <label className="flex flex-col gap-1 text-sm">
                    Предпочтения
                    <textarea
                        rows={2}
                        value={profile.preferences ?? ""}
                        onChange={(e) =>
                            setProfile((p) =>
                                p ? { ...p, preferences: e.target.value } : p,
                            )
                        }
                        placeholder="Веган, халяль, без глютена, без молочки и т.д."
                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                    />
                </label>

                {error && (
                    <p className="text-xs text-red-500">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={savingProfile}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                >
                    {savingProfile ? "Сохраняю..." : "Сохранить профиль"}
                </button>
            </form>

            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">
                    Мой нутрициолог
                </h3>

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
                                Нутрициолог:{" "}
                                {currentNutritionist.full_name ?? currentNutritionist.id}
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        {nutritionists.length === 0 ? (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Пока нет доступных нутрициологов. Покажем список, когда они
                                появятся.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-3 text-sm">
                                <label className="flex flex-col gap-1">
                                    Выбери нутрициолога
                                    <select
                                        value={selectedNutritionistId}
                                        onChange={(e) =>
                                            setSelectedNutritionistId(e.target.value)
                                        }
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
                                    className="self-start rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-зinc-200"
                                >
                                    {sendingRequest
                                        ? "Отправляю..."
                                        : "Отправить заявку нутрициологу"}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}
