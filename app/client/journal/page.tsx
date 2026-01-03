"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FoodRow = {
  id: string;
  time: string; // HH:mm
  dish: string;
  amount: string;
  reason: string;
  feeling: string;
  supplements: string;
};

type FoodDiary = {
  wake_time: string; // HH:mm
  bed_time: string; // HH:mm
  water_balance: string; // free text ("1 ст + ½ ст ...")
  sleep_note: string;
  rows: FoodRow[];

  // legacy keys (we keep them for backward compatibility)
  water_liters?: string;
  sleep_hours?: string;
};

type Entry = {
  id: string;
  entry_date: string;
  weight_kg: number | null;
  energy_level: number | null;
  mood: number | null;
  notes: string | null;

  // --- новые поля для обратной связи ---
  nutritionist_diary_note?: string | null;
  client_diary_reply?: string | null;

  food_diary?: FoodDiary | null;
};

function uid(): string {
  // Safari can miss crypto.randomUUID in older builds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeDiary(x: unknown): FoodDiary {
  if (!x || typeof x !== "object") {
    return { wake_time: "", bed_time: "", water_balance: "", sleep_note: "", rows: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any = x;

  const rows: FoodRow[] = Array.isArray(o.rows)
    ? o.rows.map((r: any) => ({
        id: String(r?.id ?? uid()),
        time: String(r?.time ?? ""),
        dish: String(r?.dish ?? ""),
        amount: String(r?.amount ?? ""),
        reason: String(r?.reason ?? r?.cause ?? ""),
        feeling: String(r?.feeling ?? r?.sensation ?? ""),
        supplements: String(r?.supplements ?? r?.meds ?? ""),
      }))
    : [];

  return {
    wake_time: String(o.wake_time ?? o.wakeTime ?? ""),
    bed_time: String(o.bed_time ?? o.bedTime ?? ""),
    water_balance: String(o.water_balance ?? o.waterBalance ?? o.water_liters ?? o.waterLiters ?? ""),
    sleep_note: String(o.sleep_note ?? o.sleepNote ?? ""),
    rows,
    // legacy
    water_liters: o.water_liters != null ? String(o.water_liters) : undefined,
    sleep_hours: o.sleep_hours != null ? String(o.sleep_hours) : undefined,
  };
}

export default function ClientJournalPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [editingId, setEditingId] = useState<string | null>(null);

  const [weight, setWeight] = useState<string>("");
  const [energy, setEnergy] = useState<string>("");
  const [mood, setMood] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [clientDiaryReply, setClientDiaryReply] = useState<string>("");

  const [topTab, setTopTab] = useState<"food" | "sleep" | "wellbeing">("food");

  const [diary, setDiary] = useState<FoodDiary>({
    wake_time: "",
    bed_time: "",
    water_balance: "",
    sleep_note: "",
    rows: [],
  });

  const [saving, setSaving] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    setError(null);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
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
      setEntries([]);
    } else {
      setEntries((data ?? []) as Entry[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentEntry = useMemo(() => {
    return entries.find((e) => e.entry_date === date) ?? null;
  }, [entries, date]);

  useEffect(() => {
    if (!currentEntry) {
      setEditingId(null);
      setWeight("");
      setEnergy("");
      setMood("");
      setNotes("");
      setClientDiaryReply("");
      setDiary({ wake_time: "", bed_time: "", water_balance: "", sleep_note: "", rows: [] });
      return;
    }

    setEditingId(currentEntry.id);
    setWeight(currentEntry.weight_kg == null ? "" : String(currentEntry.weight_kg));
    setEnergy(currentEntry.energy_level == null ? "" : String(currentEntry.energy_level));
    setMood(currentEntry.mood == null ? "" : String(currentEntry.mood));
    setNotes(currentEntry.notes ?? "");
    setDiary(normalizeDiary(currentEntry.food_diary));
    setClientDiaryReply(currentEntry.client_diary_reply ?? "");

    // клиентский дневник: без AI-разбора
  }, [currentEntry]);

  const addRow = () => {
    setDiary((d) => ({
      ...d,
      rows: [...d.rows, { id: uid(), time: "", dish: "", amount: "", reason: "", feeling: "", supplements: "" }],
    }));
  };

  const updateRow = (id: string, patch: Partial<FoodRow>) => {
    setDiary((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const removeRow = (id: string) => {
    setDiary((d) => ({
      ...d,
      rows: d.rows.filter((r) => r.id !== id),
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setHint(null);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setError("Нет авторизации");
      setSaving(false);
      return;
    }

    const cleanedRows = diary.rows
      .map((r) => ({
        ...r,
        time: r.time.trim(),
        dish: r.dish.trim(),
        amount: r.amount.trim(),
        reason: r.reason.trim(),
        feeling: r.feeling.trim(),
        supplements: r.supplements.trim(),
      }))
      .filter((r) => r.time || r.dish || r.amount || r.reason || r.feeling || r.supplements);

    const payload = {
      user_id: user.id,
      entry_date: date,
      weight_kg: weight.trim() === "" ? null : Number(weight.replace(",", ".")),
      energy_level: energy.trim() === "" ? null : Number(energy),
      mood: mood.trim() === "" ? null : Number(mood),
      notes: notes.trim() || null,
      client_diary_reply: clientDiaryReply.trim() || null,
      food_diary: {
        wake_time: diary.wake_time.trim(),
        bed_time: diary.bed_time.trim(),
        water_balance: diary.water_balance.trim(),
        sleep_note: diary.sleep_note.trim(),
        rows: cleanedRows,
      } as FoodDiary,
    };

    try {
      // ✅ Идеально: 1 запись на 1 день через upsert по (user_id, entry_date).
      // Но для этого в БД должен быть UNIQUE (user_id, entry_date).
      const { error: upErr } = await supabase.from("client_journal_entries").upsert(payload, { onConflict: "user_id,entry_date" });

      if (upErr) {
        // Если в БД нет unique constraint — делаем “ручной upsert”.
        const msg = String(upErr.message ?? "").toLowerCase();
        if (msg.includes("no unique or exclusion constraint matching the on conflict specification")) {
          const existing = await supabase
            .from("client_journal_entries")
            .select("id")
            .eq("user_id", user.id)
            .eq("entry_date", date)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existing.error) {
            setError(existing.error.message);
            return;
          }

          if (existing.data?.id) {
            const { error: updErr } = await supabase
              .from("client_journal_entries")
              .update({
                weight_kg: payload.weight_kg,
                energy_level: payload.energy_level,
                mood: payload.mood,
                notes: payload.notes,
                client_diary_reply: payload.client_diary_reply,
                food_diary: payload.food_diary,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.data.id)
              .eq("user_id", user.id);

            if (updErr) {
              setError(updErr.message);
              return;
            }

            await loadEntries();
            setHint("Запись обновлена. (Рекомендуется добавить UNIQUE(user_id, entry_date) в БД.)");
            return;
          } else {
            const { error: insErr } = await supabase.from("client_journal_entries").insert(payload);
            if (insErr) {
              setError(insErr.message);
              return;
            }
            await loadEntries();
            setHint("Запись добавлена. (Рекомендуется добавить UNIQUE(user_id, entry_date) в БД.)");
            return;
          }
        }

        setError(upErr.message);
        return;
      }

      await loadEntries();
      setHint(editingId ? "Запись обновлена." : "Запись добавлена.");

      // Notify nutritionist (if linked) about diary update
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const { data: links } = await supabase
            .from("client_nutritionist_links")
            .select("nutritionist_id,status")
            .eq("client_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1);

          const link = (links?.[0] ?? null) as any;
          if (link && (link.status === "approved" || link.status === "active")) {
            await fetch("/api/notifications/emit", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                userId: link.nutritionist_id,
                topic: "diary",
                title: "Дневник питания обновлён",
                body: `Клиент обновил дневник за ${new Date(date).toLocaleDateString()}.`,
                url: `/nutritionist/clients/${user.id}`,
              }),
            });
          }
        }
      } catch {
        // ignore
      }

    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const ok = confirm("Удалить запись за этот день?");
    if (!ok) return;

    setSaving(true);
    setError(null);
    setHint(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Нет авторизации");
      setSaving(false);
      return;
    }

    try {
      const { error: delErr } = await supabase.from("client_journal_entries").delete().eq("user_id", user.id).eq("entry_date", date);

      if (delErr) {
        setError(delErr.message);
        return;
      }

      await loadEntries();
      setHint("Запись удалена.");
    } finally {
      setSaving(false);
    }
  };

  // Мини-график веса (полоски)
  const weightEntries = useMemo(() => entries.filter((e) => e.weight_kg != null), [entries]);
  const { minW, maxW } = useMemo(() => {
    if (!weightEntries.length) return { minW: 0, maxW: 1 };
    const vals = weightEntries.map((e) => Number(e.weight_kg));
    const mn = Math.min(...vals);
    let mx = Math.max(...vals);
    if (mx === mn) mx = mn + 1;
    return { minW: mn, maxW: mx };
  }, [weightEntries]);

  const getWidth = (w: number | null) => {
    if (w == null || weightEntries.length === 0) return 0;
    const k = (Number(w) - minW) / (maxW - minW);
    return 10 + k * 90;
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Дневник питания и самочувствия</h2>
        <p className="break-words text-sm text-zinc-600 dark:text-zinc-400">
          Одна запись на один день. Формат строк дневника — как в твоём PPTX: время → блюда → количество → причина → ощущения → БАДы/лекарства.
        </p>
      </header>

      {loading ? <div className="text-sm text-zinc-500">Загружаю…</div> : null}

      <form
        onSubmit={handleSubmit}
        className="grid min-w-0 gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <label className="flex flex-col gap-1">
                    Дата
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {editingId ? "Редактирование записи" : "Новая запись"}
                    </span>

                    {editingId ? (
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={saving}
                        className="rounded-full border border-red-200 bg-white px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:bg-zinc-950 dark:hover:bg-red-950/30"
                      >
                        Удалить день
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Верхние вкладки дневника */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex w-full max-w-xl items-center rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => setTopTab("food")}
                      className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition ${
                        topTab === "food"
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      Питание
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopTab("sleep")}
                      className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition ${
                        topTab === "sleep"
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      Сон / вода
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopTab("wellbeing")}
                      className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition ${
                        topTab === "wellbeing"
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      Самочувствие
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-500">
                    {topTab === "food"
                      ? `строк питания: ${diary.rows.length}`
                      : topTab === "sleep"
                        ? "сон и вода за день"
                        : "вес · энергия · настроение"}
                  </div>
                </div>

                {topTab === "wellbeing" ? (
  <section className="min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <div className="text-sm font-semibold">Самочувствие</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-4">
      <label className="flex flex-col gap-1">
        Вес (кг)
        <input
          type="number"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
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
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-4">
        Заметки
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
        />
      </label>
    </div>
  </section>
) : null}

{topTab === "sleep" ? (
  <section className="min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <div className="text-sm font-semibold">Сон и вода</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1">
        Время подъёма
        <input
          type="time"
          value={diary.wake_time}
          onChange={(e) => setDiary((d) => ({ ...d, wake_time: e.target.value }))}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
        />
      </label>

      <label className="flex flex-col gap-1">
        Время отхода ко сну
        <input
          type="time"
          value={diary.bed_time}
          onChange={(e) => setDiary((d) => ({ ...d, bed_time: e.target.value }))}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
        />
      </label>

      <label className="flex flex-col gap-1 sm:col-span-3">
        Водный баланс за день
        <textarea
          rows={2}
          value={diary.water_balance}
          onChange={(e) => setDiary((d) => ({ ...d, water_balance: e.target.value }))}
          placeholder='Напр.: "1 ст + ½ ст + 1 ст + 1 ст = 3,5 ст"'
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
        />
        <div className="text-[11px] text-zinc-500">Можно писать стаканами/кружками — как удобно.</div>
      </label>

      <label className="flex flex-col gap-1 sm:col-span-3">
        Комментарий про сон
        <textarea
          rows={3}
          value={diary.sleep_note}
          onChange={(e) => setDiary((d) => ({ ...d, sleep_note: e.target.value }))}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
        />
      </label>
    </div>
  </section>
) : null}

{topTab === "food" ? (
  <section className="min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm font-semibold">Питание</div>
      <div className="text-[11px] text-zinc-500">
        строк: <span className="font-medium text-zinc-700 dark:text-zinc-200">{diary.rows.length}</span>
      </div>
    </div>

    <p className="mt-2 text-xs text-zinc-500">
      Заполняй так, чтобы по одной строке можно было понять: когда, что, сколько, почему, что почувствовал(а), и какие БАДы/лекарства были.
    </p>

    <div className="mt-3 w-full max-w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[980px] border-collapse text-xs">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Время</th>
            <th className="px-2 py-2 text-left font-medium">Блюдо, продукты</th>
            <th className="px-2 py-2 text-left font-medium">Количество</th>
            <th className="px-2 py-2 text-left font-medium">Причина</th>
            <th className="px-2 py-2 text-left font-medium">Ощущение</th>
            <th className="px-2 py-2 text-left font-medium">БАДы/лекарства</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {diary.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-2 py-3 text-zinc-500">
                Пока нет строк. Нажми “Добавить строку”.
              </td>
            </tr>
          ) : (
            diary.rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-2 py-2 align-top">
                  <input
                    type="time"
                    value={r.time}
                    onChange={(e) => updateRow(r.id, { time: e.target.value })}
                    className="w-28 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    value={r.dish}
                    onChange={(e) => updateRow(r.id, { dish: e.target.value })}
                    placeholder="Напр. гречка + курица"
                    className="w-[18rem] rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    value={r.amount}
                    onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                    placeholder="200 г / 1 порция"
                    className="w-36 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    value={r.reason}
                    onChange={(e) => updateRow(r.id, { reason: e.target.value })}
                    placeholder="голод / привычка..."
                    className="w-44 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    value={r.feeling}
                    onChange={(e) => updateRow(r.id, { feeling: e.target.value })}
                    placeholder="сытость / тяжесть..."
                    className="w-44 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    value={r.supplements}
                    onChange={(e) => updateRow(r.id, { supplements: e.target.value })}
                    placeholder="омега-3, витамин D..."
                    className="w-44 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                  />
                </td>
                <td className="px-2 py-2 align-top text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={addRow}
        className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        Добавить строку
      </button>
    </div>

    <details className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer select-none text-xs font-semibold text-zinc-700 dark:text-zinc-200">Правила ведения дневника (памятка)</summary>

      <div className="mt-2 space-y-2 text-[12px] text-zinc-700 dark:text-zinc-200">
        <div>
          <div className="font-medium">Минимальный срок:</div>
          <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-300">
            <li>веди дневник минимум 5 дней, сохраняя обычный режим и образ жизни;</li>
            <li>записывай сразу после приёма пищи, чтобы не забыть детали.</li>
          </ul>
        </div>

        <div>
          <div className="font-medium">Что важно фиксировать:</div>
          <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-300">
            <li>время подъёма и отхода ко сну;</li>
            <li>время приёма пищи, блюдо/продукты и количество (граммы / порции / ложки / чашки и т.д.);</li>
            <li>причину приёма (голод, желание вкусного, “за компанию”, по расписанию);</li>
            <li>ощущения после еды (сытость/тяжесть/урчание/изжога/вздутие и т.п.);</li>
            <li>водный баланс: отмечай выпитую воду в течение дня и подведи итог.</li>
          </ul>
        </div>

        <div>
          <div className="font-medium">Что потом оценивает специалист:</div>
          <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-300">
            <li>качество/количество белка, жиров, углеводов;</li>
            <li>нутритивную плотность продуктов;</li>
            <li>разнообразие и сбалансированность блюд;</li>
            <li>достаточность потребления воды.</li>
          </ul>
        </div>
      </div>
        </details>
      </section>
    ) : null}

    <div className="mt-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="font-semibold text-zinc-700 dark:text-zinc-200">Обратная связь по дневнику</div>

        <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
          <div className="font-medium">Комментарий нутрициолога</div>
          <div className="mt-1 whitespace-pre-wrap">{currentEntry?.nutritionist_diary_note ? currentEntry.nutritionist_diary_note : "Пока нет комментария."}</div>
        </div>

        <label className="mt-3 flex flex-col gap-1">
          Моя заметка / что не так (видит специалист)
          <textarea
            rows={4}
            value={clientDiaryReply}
            onChange={(e) => setClientDiaryReply(e.target.value)}
            placeholder="Напиши сюда вопросы/ощущения/что было сложно или что кажется неправильным…"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
          />
          <div className="text-[11px] text-zinc-500">Заметка сохранится вместе с записью дня (кнопка «Сохранить изменения»).</div>
        </label>
      </div>
    </div>

    {error ? <p className="text-xs text-red-500">{error}</p> : null}
    {hint ? <p className="text-xs text-emerald-600">{hint}</p> : null}

    <button
      type="submit"
      disabled={saving}
      className="self-start rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
    >
      {saving ? "Сохраняю..." : editingId ? "Сохранить изменения" : "Добавить запись"}
    </button>
    </form>

      {weightEntries.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold">Динамика веса</h3>
          <p className="text-xs text-zinc-500">Чем длиннее полоска — тем больше вес. (Это простой визуальный график без сторонних библиотек.)</p>
          <div className="mt-2 space-y-1">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setDate(e.entry_date)}
                className={
                  e.entry_date === date
                    ? "w-full rounded-lg bg-zinc-50 px-2 py-1 text-left text-xs dark:bg-zinc-900"
                    : "w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }
              >
                <div className="flex items-center gap-2">
                  <div className="w-24 text-zinc-500">{new Date(e.entry_date).toLocaleDateString()}</div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" style={{ width: `${getWidth(e.weight_kg)}%` }} />
                  </div>
                  <div className="w-12 text-right">{e.weight_kg != null ? e.weight_kg : "—"}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
