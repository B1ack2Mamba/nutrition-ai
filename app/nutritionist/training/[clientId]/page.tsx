"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type BasicProfile = {
  id: string;
  full_name: string | null;
};

type ClientProfile = {
  user_id: string;
  main_goal: string | null;
};

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
  id: string; // matches plan exercise id
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

type Entry = {
  id: string;
  entry_date: string;
  training_plan: TrainingPlan | null;
  training_report: TrainingReport | null;
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
  const base: TrainingPlan = blankPlan();
  if (!x || typeof x !== "object") return base;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any = x;
  const ex = Array.isArray(o.exercises) ? o.exercises : [];
  return {
    title: typeof o.title === "string" ? o.title : "",
    warmup: typeof o.warmup === "string" ? o.warmup : "",
    general_notes:
      typeof o.general_notes === "string"
        ? o.general_notes
        : typeof o.generalNotes === "string"
          ? o.generalNotes
          : "",
    exercises: ex
      .map((e: any) => ({
        id: typeof e?.id === "string" ? e.id : uid(),
        name: typeof e?.name === "string" ? e.name : "",
        sets: typeof e?.sets === "string" ? e.sets : "",
        reps: typeof e?.reps === "string" ? e.reps : "",
        weight: typeof e?.weight === "string" ? e.weight : "",
        rounds: typeof e?.rounds === "string" ? e.rounds : "",
        video_url:
          typeof e?.video_url === "string" ? e.video_url : typeof e?.videoUrl === "string" ? e.videoUrl : "",
        notes: typeof e?.notes === "string" ? e.notes : "",
      }))
      .filter((e: TrainingExercisePlan) => e.name.trim() !== ""),
  };
}

function planToDefaultReport(plan: TrainingPlan): TrainingReport {
  return {
    status: "partial",
    did_as_planned: true,
    general_comment: "",
    exercises: (plan.exercises ?? []).map((p) => ({
      id: p.id,
      done: false,
      actual_sets: p.sets ?? "",
      actual_reps: p.reps ?? "",
      actual_weight: p.weight ?? "",
      actual_rounds: p.rounds ?? "",
      comment: "",
    })),
  };
}

function normalizeReport(x: unknown, plan: TrainingPlan | null): TrainingReport {
  const fallback: TrainingReport = plan
    ? planToDefaultReport(plan)
    : {
        status: "partial",
        did_as_planned: true,
        general_comment: "",
        exercises: [] as TrainingExerciseReport[],
    };
  if (!x || typeof x !== "object") return fallback;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any = x;
  const status: TrainingReport["status"] = o.status === "done" || o.status === "partial" || o.status === "skipped" ? o.status : fallback.status;

  const ex = Array.isArray(o.exercises) ? o.exercises : [];
  const map = new Map<string, TrainingExerciseReport>();
  for (const e of ex) {
    if (!e || typeof e !== "object") continue;
    const id = typeof (e as any).id === "string" ? (e as any).id : "";
    if (!id) continue;
    map.set(id, {
      id,
      done: Boolean((e as any).done),
      actual_sets:
        typeof (e as any).actual_sets === "string" ? (e as any).actual_sets : typeof (e as any).sets === "string" ? (e as any).sets : "",
      actual_reps:
        typeof (e as any).actual_reps === "string" ? (e as any).actual_reps : typeof (e as any).reps === "string" ? (e as any).reps : "",
      actual_weight:
        typeof (e as any).actual_weight === "string" ? (e as any).actual_weight : typeof (e as any).weight === "string" ? (e as any).weight : "",
      actual_rounds:
        typeof (e as any).actual_rounds === "string" ? (e as any).actual_rounds : typeof (e as any).rounds === "string" ? (e as any).rounds : "",
      comment: typeof (e as any).comment === "string" ? (e as any).comment : "",
    });
  }

  const finalExercises: TrainingExerciseReport[] = [];
  if (plan?.exercises?.length) {
    for (const p of plan.exercises) {
      const found = map.get(p.id);
      finalExercises.push(
        found ?? {
          id: p.id,
          done: false,
          actual_sets: p.sets ?? "",
          actual_reps: p.reps ?? "",
          actual_weight: p.weight ?? "",
          actual_rounds: p.rounds ?? "",
          comment: "",
        },
      );
    }
  } else {
    finalExercises.push(...Array.from(map.values()));
  }

  return {
    status,
    did_as_planned: typeof o.did_as_planned === "boolean" ? o.did_as_planned : Boolean(o.didAsPlanned ?? fallback.did_as_planned),
    general_comment: typeof o.general_comment === "string" ? o.general_comment : typeof o.generalComment === "string" ? o.generalComment : "",
    exercises: finalExercises,
  };
}

function toEmbedUrl(url: string): string | null {
  const u = (url || "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (!v) return null;
      return `https://www.youtube.com/embed/${v}`;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "");
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (!id) return null;
      return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function safeUpsertByUserDate(payload: any): Promise<{ ok: boolean; message?: string }> {
  const { error: upErr } = await supabase.from("client_journal_entries").upsert(payload, {
    onConflict: "user_id,entry_date",
  });

  if (!upErr) return { ok: true };

  // Если unique индекс ещё не стоит — ручной upsert.
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
      const { error: updErr } = await supabase.from("client_journal_entries").update(payload).eq("id", existing.data.id);
      if (updErr) return { ok: false, message: updErr.message };
      return { ok: true };
    }

    const { error: insErr } = await supabase.from("client_journal_entries").insert(payload);
    if (insErr) return { ok: false, message: insErr.message };
    return { ok: true };
  }

  return { ok: false, message: upErr.message };
}

export default function NutritionistTrainingClientPage() {
  const params = useParams();
  const rawClientId = (params as Record<string, string | string[] | undefined>)?.clientId;
  const clientId = typeof rawClientId === "string" ? rawClientId : Array.isArray(rawClientId) ? rawClientId[0] : "";

  const [basic, setBasic] = useState<BasicProfile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trainingDate, setTrainingDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [plan, setPlan] = useState<TrainingPlan>(blankPlan());
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

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

      if (!clientId) {
        setError("Не найден clientId");
        setLoading(false);
        return;
      }

      const { data: prof, error: profErr } = await supabase.from("profiles").select("id, full_name").eq("id", clientId).maybeSingle();
      if (profErr) {
        setError(profErr.message);
        setLoading(false);
        return;
      }
      setBasic((prof ?? null) as BasicProfile | null);

      const { data: cp, error: cpErr } = await supabase
        .from("client_profiles")
        .select("user_id, main_goal")
        .eq("user_id", clientId)
        .maybeSingle();
      if (!cpErr) setClientProfile((cp ?? null) as ClientProfile | null);

      const { data: j, error: jErr } = await supabase
        .from("client_journal_entries")
        .select("id, entry_date, training_plan, training_report")
        .eq("user_id", clientId)
        .order("entry_date", { ascending: true });

      if (jErr) {
        setError(jErr.message);
        setLoading(false);
        return;
      }

      setEntries((j ?? []) as Entry[]);
      setLoading(false);
    };

    load();
  }, [clientId]);

  // Подтягиваем план выбранного дня
  useEffect(() => {
    const day = entries.find((e) => e.entry_date === trainingDate);
    const p = normalizePlan(day?.training_plan ?? null);
    setPlan(p.title || (p.exercises?.length ?? 0) > 0 ? p : blankPlan());
    setHint(null);
  }, [trainingDate, entries]);

  const day = useMemo(() => entries.find((e) => e.entry_date === trainingDate) ?? null, [entries, trainingDate]);
  const normalizedPlan = useMemo(() => normalizePlan(day?.training_plan ?? plan), [day, plan]);
  const report = useMemo(() => normalizeReport(day?.training_report ?? null, normalizedPlan), [day, normalizedPlan]);

  return (
    <div className="space-y-6 max-w-full">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/nutritionist/training"
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            ← Назад
          </Link>
          <h2 className="text-2xl font-semibold tracking-tight">Тренировки клиента</h2>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {basic?.full_name || "Клиент"}
          {clientProfile?.main_goal ? ` • ${clientProfile.main_goal}` : ""}
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <p className="text-xs text-zinc-500">Загрузка…</p>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">
                Дата тренировки
                <input
                  type="date"
                  value={trainingDate}
                  onChange={(e) => setTrainingDate(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                />
              </label>
              <div className="ml-auto text-xs text-zinc-500">YouTube/Vimeo будут встраиваться у клиента, любой URL тоже ок.</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs">
                Название тренировки
                <input
                  value={plan.title}
                  onChange={(e) => setPlan({ ...plan, title: e.target.value })}
                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                  placeholder="Напр. Ноги/Ягодицы"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Разминка
                <input
                  value={plan.warmup}
                  onChange={(e) => setPlan({ ...plan, warmup: e.target.value })}
                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                  placeholder="5–10 мин, мобилизация..."
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Общая заметка
                <input
                  value={plan.general_notes}
                  onChange={(e) => setPlan({ ...plan, general_notes: e.target.value })}
                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                  placeholder="RPE, отдых, техника..."
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-left text-[11px] text-zinc-500">
                    <th className="py-2 pr-3">Упражнение</th>
                    <th className="py-2 pr-3">Подходы</th>
                    <th className="py-2 pr-3">Повторы</th>
                    <th className="py-2 pr-3">Рабочий вес</th>
                    <th className="py-2 pr-3">Круги</th>
                    <th className="py-2 pr-3">Видео</th>
                    <th className="py-2 pr-3">Комментарий</th>
                    <th className="py-2 pr-0"> </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.exercises.map((ex, i) => (
                    <tr key={ex.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="py-2 pr-3">
                        <input
                          value={ex.name}
                          onChange={(e) => {
                            const next = plan.exercises.slice();
                            next[i] = { ...next[i], name: e.target.value };
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="w-64 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="Присед / Жим / Тяга..."
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={ex.sets}
                          onChange={(e) => {
                            const next = plan.exercises.slice();
                            next[i] = { ...next[i], sets: e.target.value };
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="3"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={ex.reps}
                          onChange={(e) => {
                            const next = plan.exercises.slice();
                            next[i] = { ...next[i], reps: e.target.value };
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="8–12"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={ex.weight}
                          onChange={(e) => {
                            const next = plan.exercises.slice();
                            next[i] = { ...next[i], weight: e.target.value };
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="w-32 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="40 кг / резинка"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={ex.rounds}
                          onChange={(e) => {
                            const next = plan.exercises.slice();
                            next[i] = { ...next[i], rounds: e.target.value };
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="w-24 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={ex.video_url}
                          onChange={(e) => {
                            const next = plan.exercises.slice();
                            next[i] = { ...next[i], video_url: e.target.value };
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="w-80 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="https://..."
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={ex.notes}
                          onChange={(e) => {
                            const next = plan.exercises.slice();
                            next[i] = { ...next[i], notes: e.target.value };
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="w-64 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="техника / отдых / темп"
                        />
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const next = plan.exercises.slice();
                            next.splice(i, 1);
                            setPlan({ ...plan, exercises: next });
                          }}
                          className="rounded-full border border-zinc-300 px-3 py-1 text-[11px] hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}

                  {plan.exercises.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-3 text-xs text-zinc-500">
                        Упражнений пока нет — нажмите “Добавить упражнение”.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = plan.exercises.slice();
                  next.push({ id: uid(), name: "", sets: "", reps: "", weight: "", rounds: "", video_url: "", notes: "" });
                  setPlan({ ...plan, exercises: next });
                }}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                + Добавить упражнение
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setHint(null);
                  setError(null);

                  const {
                    data: { user },
                  } = await supabase.auth.getUser();

                  if (!user) {
                    setError("Нет авторизации");
                    setSaving(false);
                    return;
                  }

                  const payload = {
                    user_id: clientId,
                    entry_date: trainingDate,
                    training_plan: plan,
                    updated_at: new Date().toISOString(),
                  };

                  const res = await safeUpsertByUserDate(payload);
                  if (!res.ok) {
                    setError(res.message || "Не удалось сохранить план");
                    setSaving(false);
                    return;
                  }

                  setHint("План сохранён ✓");

                  // Notify client about updated training plan
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const token = session?.access_token;
                    if (token) {
                      await fetch("/api/notifications/emit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                          userId: clientId,
                          topic: "training",
                          title: "План тренировки обновлён",
                          body: `Специалист обновил план на ${new Date(trainingDate).toLocaleDateString()}.`,
                          url: `/client/training`,
                        }),
                      });
                    }
                  } catch {
                    // ignore
                  }


                  const { data: j } = await supabase
                    .from("client_journal_entries")
                    .select("id, entry_date, training_plan, training_report")
                    .eq("user_id", clientId)
                    .order("entry_date", { ascending: true });

                  if (j) setEntries(j as Entry[]);
                  setSaving(false);
                }}
                className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
              >
                {saving ? "Сохраняю..." : "Сохранить план"}
              </button>

              {error ? <span className="text-xs text-red-500">{error}</span> : null}
              {hint ? <span className="text-xs text-emerald-600">{hint}</span> : null}
            </div>

            <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 dark:text-zinc-200">Отчёт клиента</summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-700 dark:bg-zinc-950">
                    Статус: <b>{report.status}</b>
                  </span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-700 dark:bg-zinc-950">
                    По плану: <b>{report.did_as_planned ? "да" : "нет"}</b>
                  </span>
                </div>

                {report.general_comment ? (
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    <b>Комментарий:</b> {report.general_comment}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">Комментария нет.</div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="text-left text-[11px] text-zinc-500">
                        <th className="py-2 pr-3">Упражнение</th>
                        <th className="py-2 pr-3">Сделал</th>
                        <th className="py-2 pr-3">Факт подходы</th>
                        <th className="py-2 pr-3">Факт повторы</th>
                        <th className="py-2 pr-3">Факт вес</th>
                        <th className="py-2 pr-3">Факт круги</th>
                        <th className="py-2 pr-0">Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normalizedPlan.exercises.map((pex) => {
                        const ex = report.exercises.find((x) => x.id === pex.id);
                        return (
                          <tr key={pex.id} className="border-t border-zinc-200 dark:border-zinc-800">
                            <td className="py-2 pr-3 font-medium">{pex.name}</td>
                            <td className="py-2 pr-3">{ex?.done ? "✓" : "✕"}</td>
                            <td className="py-2 pr-3">{ex?.actual_sets || "—"}</td>
                            <td className="py-2 pr-3">{ex?.actual_reps || "—"}</td>
                            <td className="py-2 pr-3">{ex?.actual_weight || "—"}</td>
                            <td className="py-2 pr-3">{ex?.actual_rounds || "—"}</td>
                            <td className="py-2 pr-0 text-zinc-600 dark:text-zinc-300">{ex?.comment || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {normalizedPlan.exercises.some((e) => (e.video_url || "").trim() !== "") ? (
                  <details className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                    <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 dark:text-zinc-200">Видео (как увидит клиент)</summary>
                    <div className="mt-3 grid gap-3">
                      {normalizedPlan.exercises
                        .filter((e) => (e.video_url || "").trim() !== "")
                        .map((e) => {
                          const embed = toEmbedUrl(e.video_url);
                          return (
                            <div key={e.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                              <div className="text-xs font-medium">{e.name}</div>
                              <div className="mt-1 break-words text-[11px] text-zinc-500">{e.video_url}</div>
                              {embed ? (
                                <iframe
                                  className="mt-2 h-64 w-full rounded-lg"
                                  src={embed}
                                  title={e.name}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              ) : (
                                <a
                                  href={e.video_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-flex rounded-full border border-zinc-300 px-3 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  Открыть ссылку
                                </a>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </details>
                ) : null}
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}