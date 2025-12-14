"use client";

import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

type Entry = {
    id: string;
    entry_date: string;
    weight_kg: number | null;
    energy_level: number | null;
    mood: number | null;
    notes: string | null;
};

export default function ClientJournalPage() {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [date, setDate] = useState<string>(() => {
        return new Date().toISOString().slice(0, 10);
    });
    const [weight, setWeight] = useState<string>("");
    const [energy, setEnergy] = useState<string>("");
    const [mood, setMood] = useState<string>("");
    const [notes, setNotes] = useState<string>("");

    const [saving, setSaving] = useState(false);

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

            const { data, error: selErr } = await supabase
                .from("client_journal_entries")
                .select("*")
                .eq("user_id", user.id)
                .order("entry_date", { ascending: true });

            if (selErr) {
                setError(selErr.message);
            } else if (data) {
                setEntries(data as Entry[]);
            }

            setLoading(false);
        };

        load();
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setError("Нет авторизации");
            setSaving(false);
            return;
        }

        try {
            const { error: insErr } = await supabase
                .from("client_journal_entries")
                .insert({
                    user_id: user.id,
                    entry_date: date,
                    weight_kg:
                        weight.trim() === "" ? null : Number(weight.replace(",", ".")),
                    energy_level:
                        energy.trim() === "" ? null : Number(energy),
                    mood: mood.trim() === "" ? null : Number(mood),
                    notes: notes.trim() || null,
                });

            if (insErr) {
                setError(insErr.message);
                return;
            }

            const { data } = await supabase
                .from("client_journal_entries")
                .select("*")
                .eq("user_id", user.id)
                .order("entry_date", { ascending: true });

            if (data) {
                setEntries(data as Entry[]);
            }

            setNotes("");
        } finally {
            setSaving(false);
        }
    };

    // Простенький "график" веса: полоски разной длины
    const weightEntries = entries.filter((e) => e.weight_kg != null);
    let minW = 0;
    let maxW = 0;
    if (weightEntries.length > 0) {
        minW = Math.min(...weightEntries.map((e) => Number(e.weight_kg)));
        maxW = Math.max(...weightEntries.map((e) => Number(e.weight_kg)));
        if (maxW === minW) maxW = minW + 1;
    }

    const getWidth = (w: number | null) => {
        if (w == null || weightEntries.length === 0) return 0;
        const k = (Number(w) - minW) / (maxW - minW);
        return 10 + k * 90; // от 10% до 100%
    };

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-semibold tracking-tight">
                    Дневник питания и самочувствия
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Записывай вес, энергию и настроение — так и ты, и специалист
                    будете видеть динамику.
                </p>
            </header>

            <form
                onSubmit={handleSubmit}
                className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
                <div className="grid gap-3 sm:grid-cols-4">
                    <label className="flex flex-col gap-1">
                        Дата
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        Вес (кг)
                        <input
                            type="number"
                            step="0.1"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        Энергия (1–10)
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={energy}
                            onChange={(e) => setEnergy(e.target.value)}
                            className="rounded-lg border border-зinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        Настроение (1–10)
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={mood}
                            onChange={(e) => setMood(e.target.value)}
                            className="rounded-lg border border-зinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                        />
                    </label>
                </div>

                <label className="flex flex-col gap-1">
                    Заметки
                    <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                    />
                </label>

                {error && (
                    <p className="text-xs text-red-500">{error}</p>
                )}

                <button
                    type="submit"
                    disabled={saving}
                    className="self-start rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-зinc-100 dark:text-black dark:hover:bg-зinc-200"
                >
                    {saving ? "Сохраняю..." : "Добавить запись"}
                </button>
            </form>

            {/* "График" веса */}
            {weightEntries.length > 0 && (
                <section className="space-y-2 rounded-2xl border border-зinc-200 bg-white p-5 text-sm shadow-sm dark:border-зinc-800 dark:bg-зinc-950">
                    <h3 className="text-sm font-semibold">Динамика веса</h3>
                    <p className="text-xs text-зinc-500">
                        Чем длиннее полоска — тем больше вес. Это простой визуальный
                        график без сторонних библиотек.
                    </p>
                    <div className="mt-2 space-y-1">
                        {entries.map((e) => (
                            <div
                                key={e.id}
                                className="flex items-center gap-2 text-xs"
                            >
                                <div className="w-20 text-зinc-500">
                                    {new Date(e.entry_date).toLocaleDateString()}
                                </div>
                                <div className="flex-1">
                                    <div
                                        className="h-2 rounded-full bg-zinc-300 dark:bg-зinc-700"
                                        style={{
                                            width: `${getWidth(
                                                e.weight_kg as number | null,
                                            )}%`,
                                        }}
                                    />
                                </div>
                                <div className="w-10 text-right">
                                    {e.weight_kg != null ? e.weight_kg : "—"}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
