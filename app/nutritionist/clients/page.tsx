"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type LinkRow = {
    id: string;
    client_id: string;
    nutritionist_id: string;
    status: "pending" | "approved" | "rejected";
    client_note: string | null;
    created_at: string;
};

type ClientProfile = {
    id: string;
    full_name: string | null;
};

export default function NutritionistClientsPage() {
    const [links, setLinks] = useState<LinkRow[]>([]);
    const [clients, setClients] = useState<Record<string, ClientProfile>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // загружаем связи + имена клиентов
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                setError("Нет авторизации");
                setLoading(false);
                return;
            }

            // все связи текущего нутрициолога
            const { data: linkRows, error: linkErr } = await supabase
                .from("client_nutritionist_links")
                .select("*")
                .eq("nutritionist_id", user.id)
                .order("created_at", { ascending: false });

            if (linkErr) {
                setError(linkErr.message);
                setLoading(false);
                return;
            }

            const typedLinks = (linkRows ?? []) as LinkRow[];
            setLinks(typedLinks);

            // id клиентов
            const clientIds = Array.from(
                new Set(typedLinks.map((l) => l.client_id)),
            );
            if (clientIds.length === 0) {
                setClients({});
                setLoading(false);
                return;
            }

            // базовый профиль клиентов
            const { data: profRows, error: profErr } = await supabase
                .from("profiles")
                .select("id, full_name")
                .in("id", clientIds);

            if (profErr) {
                setError(profErr.message);
                setLoading(false);
                return;
            }

            const map: Record<string, ClientProfile> = {};
            for (const row of profRows ?? []) {
                map[row.id] = row as ClientProfile;
            }
            setClients(map);

            setLoading(false);
        };

        load();
    }, []);

    const getClientName = (clientId: string) =>
        clients[clientId]?.full_name || clientId;

    const pending = links.filter((l) => l.status === "pending");
    const approved = links.filter((l) => l.status === "approved");

    const updateStatus = async (id: string, status: "approved" | "rejected") => {
        setError(null);
        const { error: updErr } = await supabase
            .from("client_nutritionist_links")
            .update({ status })
            .eq("id", id);

        if (updErr) {
            setError(updErr.message);
            return;
        }

        setLinks((prev) =>
            prev.map((l) => (l.id === id ? { ...l, status } : l)),
        );
    };

    if (loading) {
        return (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Загружаю список клиентов...
            </p>
        );
    }

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">
                    Клиенты
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Здесь появляются люди, которые выбрали тебя в личном кабинете
                    и отправили заявку.
                </p>
            </header>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {/* Заявки в ожидании */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Заявки в ожидании</h3>
                {pending.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Пока нет новых заявок.
                    </p>
                ) : (
                    <div className="space-y-2 text-sm">
                        {pending.map((l) => (
                            <div
                                key={l.id}
                                className="flex items-start justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            >
                                <div>
                                    <div className="font-medium">
                                        {getClientName(l.client_id)}
                                    </div>
                                    <p className="text-[11px] text-zinc-500">
                                        Заявка от{" "}
                                        {new Date(l.created_at).toLocaleDateString()}
                                    </p>
                                    {l.client_note && (
                                        <p className="mt-1 text-[11px] text-zinc-500">
                                            Сообщение: {l.client_note}
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => updateStatus(l.id, "approved")}
                                        className="rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                                    >
                                        Принять
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateStatus(l.id, "rejected")}
                                        className="rounded-full border border-red-300 px-3 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                                    >
                                        Отклонить
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Одобренные клиенты */}
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-sm font-semibold">Мои клиенты</h3>
                {approved.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Пока нет одобренных клиентов.
                    </p>
                ) : (
                    <div className="space-y-2 text-sm">
                        {approved.map((l) => (
                            <div
                                key={l.id}
                                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            >
                                <div>
                                    <Link
                                        href={`/nutritionist/clients/${l.client_id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {getClientName(l.client_id)}
                                    </Link>
                                    <p className="text-[11px] text-zinc-500">
                                        Клиент с{" "}
                                        {new Date(l.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
