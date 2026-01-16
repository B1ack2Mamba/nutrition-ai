"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

function normalizePlan(x: unknown): TrainingPlan {
  const base: TrainingPlan = { title: "", warmup: "", general_notes: "", exercises: [] };
  if (!x || typeof x !== "object") return base;
  const o = x as any;
  const ex = Array.isArray(o.exercises) ? o.exercises : [];
  return {
    title: typeof o.title === "string" ? o.title : "",
    warmup: typeof o.warmup === "string" ? o.warmup : "",
    general_notes: typeof o.general_notes === "string" ? o.general_notes : (typeof o.generalNotes === "string" ? o.generalNotes : ""),
    exercises: ex
      .map((e: any) => ({
        id: typeof e?.id === "string" ? e.id : uid(),
        name: typeof e?.name === "string" ? e.name : "",
        sets: typeof e?.sets === "string" ? e.sets : "",
        reps: typeof e?.reps === "string" ? e.reps : "",
        weight: typeof e?.weight === "string" ? e.weight : "",
        rounds: typeof e?.rounds === "string" ? e.rounds : "",
        video_url: typeof e?.video_url === "string" ? e.video_url : (typeof e?.videoUrl === "string" ? e.videoUrl : ""),
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
  const o = x as any;
  const status: TrainingReport["status"] =
    o.status === "done" || o.status === "partial" || o.status === "skipped" ? o.status : fallback.status;

  const ex = Array.isArray(o.exercises) ? o.exercises : [];
  const map = new Map<string, TrainingExerciseReport>();
  for (const e of ex) {
    if (!e || typeof e !== "object") continue;
    const id = typeof (e as any).id === "string" ? (e as any).id : "";
    if (!id) continue;
    map.set(id, {
      id,
      done: Boolean((e as any).done),
      actual_sets: typeof (e as any).actual_sets === "string" ? (e as any).actual_sets : (typeof (e as any).sets === "string" ? (e as any).sets : ""),
      actual_reps: typeof (e as any).actual_reps === "string" ? (e as any).actual_reps : (typeof (e as any).reps === "string" ? (e as any).reps : ""),
      actual_weight: typeof (e as any).actual_weight === "string" ? (e as any).actual_weight : (typeof (e as any).weight === "string" ? (e as any).weight : ""),
      actual_rounds: typeof (e as any).actual_rounds === "string" ? (e as any).actual_rounds : (typeof (e as any).rounds === "string" ? (e as any).rounds : ""),
      comment: typeof (e as any).comment === "string" ? (e as any).comment : "",
    });
  }

  // If plan exists, keep order and ensure all plan exercises exist in report.
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
    general_comment: typeof o.general_comment === "string" ? o.general_comment : (typeof o.generalComment === "string" ? o.generalComment : ""),
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

  // If unique constraint isn't installed yet, do a manual upsert.
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

export default function ClientTrainingPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [report, setReport] = useState<TrainingReport | null>(null);

  const plannedDays = useMemo(() => {
    const xs = entries
      .filter((e) => e.training_plan && (e.training_plan.exercises?.length ?? 0) > 0)
      .sort((a, b) => (a.entry_date > b.entry_date ? -1 : 1));
    return xs;
  }, [entries]);

  const loadList = async () => {
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

    const { data, error: e } = await supabase
      .from("client_journal_entries")
      .select("id, entry_date, training_plan, training_report")
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false })
      .limit(180);

    if (e) setError(e.message);
    else setEntries((data ?? []) as any);

    setLoading(false);
  };

  const loadDay = async (d: string) => {
    setError(null);
    setHint(null);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setError("Нет авторизации");
      return;
    }

    const { data, error: e } = await supabase
      .from("client_journal_entries")
      .select("id, entry_date, training_plan, training_report")
      .eq("user_id", user.id)
      .eq("entry_date", d)
      .maybeSingle();

    if (e) {
      setError(e.message);
      setPlan(null);
      setReport(null);
      return;
    }

    const rawPlan = data?.training_plan ?? null;
    const p = rawPlan ? normalizePlan(rawPlan) : null;
    setPlan(p);

    const rawReport = data?.training_report ?? null;
    const r = rawReport ? normalizeReport(rawReport, p) : (p ? planToDefaultReport(p) : null);
    setReport(r);
  };

  useEffect(() => {
    // initial load
    (async () => {
      await loadList();
      await loadDay(date);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickDate = async (d: string) => {
    setDate(d);
    await loadDay(d);
  };

  const handleSave = async (e: FormEvent) => {
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

    if (!report) {
      setError("Нет данных отчёта для сохранения");
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      entry_date: date,
      training_report: report,
      updated_at: new Date().toISOString(),
    };

    const res = await safeUpsertByUserDate(payload);
    if (!res.ok) {
      setError(res.message || "Не удалось сохранить");
      setSaving(false);
      return;
    }

    setHint("Сохранено ✓");
    await loadList();
    await loadDay(date);


    // Notify nutritionist (if linked) about training report update
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
              topic: "training",
              title: "Отчёт по тренировке",
              body: `Клиент обновил отчёт за ${new Date(date).toLocaleDateString()}.`,
              url: `/nutritionist/training/${user.id}`,
            }),
          });
        }
      }
    } catch {
      // ignore
    }

    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Тренировки</h2>
        <p className="break-words text-sm text-zinc-600 dark:text-zinc-400">
          Тут отображаются планы от специалиста. Вы отмечаете выполнение и можете указать изменения.
        </p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
        <form
          onSubmit={handleSave}
          className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="flex flex-col gap-1">
              Дата тренировки
              <input
                type="date"
                value={date}
                onChange={(e) => void handlePickDate(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
              />
            </label>

            <div className="text-xs text-zinc-500">
              {plan?.title ? <>План: <b>{plan.title}</b></> : "На эту дату плана нет"}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {/* Plan */}
            <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">План от специалиста</div>
                  <div className="mt-1 text-sm font-semibold">{plan?.title || "—"}</div>
                  {plan?.warmup ? <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300"><b>Разминка:</b> {plan.warmup}</div> : null}
                  {plan?.general_notes ? <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300"><b>Заметка:</b> {plan.general_notes}</div> : null}
                </div>
              </div>

              {plan?.exercises?.length ? (
                <>
                  <div className="mt-3 md:hidden space-y-3">
                    {plan.exercises.map((ex) => {
                      const embed = (ex.video_url || "").trim() ? toEmbedUrl(ex.video_url) : null;
                      return (
                        <div
                          key={ex.id}
                          className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{ex.name || "—"}</div>
                              <div className="mt-1 text-[11px] text-zinc-500">
                                {ex.sets || "—"} подход · {ex.reps || "—"} повт
                                {ex.weight ? ` · ${ex.weight}` : ""}
                                {ex.rounds ? ` · круги: ${ex.rounds}` : ""}
                              </div>
                            </div>
                          </div>

                          {ex.notes ? (
                            <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{ex.notes}</div>
                          ) : null}

                          {(ex.video_url || "").trim() ? (
                            <details className="mt-2">
                              <summary className="cursor-pointer select-none text-xs text-zinc-700 dark:text-zinc-200">
                                Видео
                              </summary>
                              <div className="mt-2">
                                {embed ? (
                                  <iframe
                                    className="h-48 w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
                                    src={embed}
                                    title={ex.name}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                ) : (
                                  <a
                                    href={ex.video_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex rounded-full border border-zinc-300 px-3 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                  >
                                    Открыть ссылку
                                  </a>
                                )}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 hidden md:block max-w-full overflow-x-auto">
                                      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="text-left text-[11px] text-zinc-500">
                        <th className="py-2 pr-3">Упражнение</th>
                        <th className="py-2 pr-3">Подходы</th>
                        <th className="py-2 pr-3">Повторы</th>
                        <th className="py-2 pr-3">Вес</th>
                        <th className="py-2 pr-3">Круги</th>
                        <th className="py-2 pr-3">Видео</th>
                        <th className="py-2 pr-0">Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.exercises.map((ex) => (
                        <tr key={ex.id} className="border-t border-zinc-200 dark:border-zinc-800">
                          <td className="py-2 pr-3 align-top font-medium">{ex.name || "—"}</td>
                          <td className="py-2 pr-3 align-top">{ex.sets || "—"}</td>
                          <td className="py-2 pr-3 align-top">{ex.reps || "—"}</td>
                          <td className="py-2 pr-3 align-top">{ex.weight || "—"}</td>
                          <td className="py-2 pr-3 align-top">{ex.rounds || "—"}</td>
                          <td className="py-2 pr-3 align-top">
                            {ex.video_url ? (
                              <details className="text-[11px]">
                                <summary className="cursor-pointer select-none text-zinc-700 dark:text-zinc-200">
                                  Смотреть
                                </summary>
                                <div className="mt-2">
                                  {toEmbedUrl(ex.video_url) ? (
                                    <iframe
                                      className="h-40 w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
                                      src={toEmbedUrl(ex.video_url) as string}
                                      title="training video"
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      allowFullScreen
                                    />
                                  ) : (
                                    <a
                                      href={ex.video_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline"
                                    >
                                      Открыть ссылку
                                    </a>
                                  )}
                                </div>
                              </details>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 pr-0 align-top text-zinc-600 dark:text-zinc-300">{ex.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : (
                <div className="mt-3 text-xs text-zinc-500">Упражнения не заданы.</div>
              )}
</section>

            {/* Report */}
            <section className="rounded-xl border border-zinc-200 bg-white p-4 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Отметка выполнения</div>

              {!plan ? (
                <div className="mt-2 text-xs text-zinc-500">
                  Нет плана на эту дату — отметка выполнения не нужна.
                </div>
              ) : !report ? (
                <div className="mt-2 text-xs text-zinc-500">
                  Нет данных отчёта. Нажми “Сохранить” после ввода.
                </div>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="status"
                        checked={report.status === "done"}
                        onChange={() => setReport({ ...report, status: "done" })}
                      />
                      Сделал всё
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="status"
                        checked={report.status === "partial"}
                        onChange={() => setReport({ ...report, status: "partial" })}
                      />
                      Частично
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="status"
                        checked={report.status === "skipped"}
                        onChange={() => setReport({ ...report, status: "skipped" })}
                      />
                      Пропустил
                    </label>

                    <label className="ml-auto flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={report.did_as_planned}
                        onChange={(e) => setReport({ ...report, did_as_planned: e.target.checked })}
                      />
                      По плану без изменений
                    </label>
                  </div>

                  <label className="mt-3 flex flex-col gap-1 text-xs">
                    Общий комментарий / изменения
                    <textarea
                      rows={2}
                      value={report.general_comment}
                      onChange={(e) => setReport({ ...report, general_comment: e.target.value })}
                      className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                    />
                  </label>

                  <div className="mt-3 md:hidden space-y-3">
                      {plan.exercises.map((pex) => {
                        const idx = report.exercises.findIndex((x) => x.id === pex.id);
                        const ex = idx >= 0 ? report.exercises[idx] : null;
                        if (!ex) return null;

                        const patch = (next: Partial<TrainingExerciseReport>) => {
                          const nextArr = report.exercises.slice();
                          nextArr[idx] = { ...nextArr[idx], ...next };
                          setReport({ ...report, exercises: nextArr });
                        };

                        const fillFromPlan = () => {
                          patch({
                            actual_sets: pex.sets ?? "",
                            actual_reps: pex.reps ?? "",
                            actual_weight: pex.weight ?? "",
                            actual_rounds: pex.rounds ?? "",
                          });
                        };

                        const showComment = !ex.done || (ex.comment || "").trim() !== "";

                        return (
                          <div
                            key={pex.id}
                            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold">{pex.name}</div>
                                <div className="mt-1 text-[11px] text-zinc-500">
                                  План: {pex.sets || "—"}×{pex.reps || "—"}
                                  {pex.weight ? ` · ${pex.weight}` : ""}
                                  {pex.rounds ? ` · круги: ${pex.rounds}` : ""}
                                </div>
                              </div>

                              <div className="shrink-0 inline-flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                                <button
                                  type="button"
                                  onClick={() => patch({ done: true })}
                                  className={`px-3 py-1 text-xs ${ex.done ? "bg-black text-white dark:bg-zinc-100 dark:text-black" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                                  aria-label="Сделал"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => patch({ done: false })}
                                  className={`px-3 py-1 text-xs ${!ex.done ? "bg-black text-white dark:bg-zinc-100 dark:text-black" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                                  aria-label="Не сделал"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={fillFromPlan}
                                className="rounded-full border border-zinc-300 px-3 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                Как в плане
                              </button>
                              <span className="text-[11px] text-zinc-500">Факт (можно менять)</span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                                Подходы
                                <input
                                  value={ex.actual_sets}
                                  onChange={(e) => patch({ actual_sets: e.target.value })}
                                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="напр. 3"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                                Повторы
                                <input
                                  value={ex.actual_reps}
                                  onChange={(e) => patch({ actual_reps: e.target.value })}
                                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="напр. 10"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                                Вес
                                <input
                                  value={ex.actual_weight}
                                  onChange={(e) => patch({ actual_weight: e.target.value })}
                                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="напр. 40кг"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                                Круги
                                <input
                                  value={ex.actual_rounds}
                                  onChange={(e) => patch({ actual_rounds: e.target.value })}
                                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="если круги"
                                />
                              </label>
                            </div>

                            {showComment ? (
                              <label className="mt-3 flex flex-col gap-1 text-[11px] text-zinc-500">
                                Комментарий{ex.done ? "" : " (почему не получилось)"}
                                <textarea
                                  rows={2}
                                  value={ex.comment}
                                  onChange={(e) => patch({ comment: e.target.value })}
                                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="ощущения, изменения, боль и т.п."
                                />
                              </label>
                            ) : (
                              <button
                                type="button"
                                onClick={() => patch({ comment: "" })}
                                className="mt-3 rounded-full border border-zinc-300 px-3 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                Добавить комментарий
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 hidden md:block max-w-full overflow-x-auto">
                    <table className="w-full min-w-[900px] border-separate border-spacing-0 text-xs">
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
                        {plan.exercises.map((pex) => {
                          const idx = report.exercises.findIndex((x) => x.id === pex.id);
                          const ex = idx >= 0 ? report.exercises[idx] : null;
                          if (!ex) return null;

                          const patch = (next: Partial<TrainingExerciseReport>) => {
                            const nextArr = report.exercises.slice();
                            nextArr[idx] = { ...nextArr[idx], ...next };
                            setReport({ ...report, exercises: nextArr });
                          };

                          return (
                            <tr key={pex.id} className="border-t border-zinc-200 dark:border-zinc-800">
                              <td className="py-2 pr-3 align-top font-medium">{pex.name}</td>
                              <td className="py-2 pr-3 align-top">
                                <div className="inline-flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                                  <button
                                    type="button"
                                    onClick={() => patch({ done: true })}
                                    className={`px-2 py-1 text-xs ${ex.done ? "bg-emerald-600 text-white" : "bg-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}
                                    title="Сделал"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => patch({ done: false })}
                                    className={`px-2 py-1 text-xs ${!ex.done ? "bg-red-600 text-white" : "bg-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}
                                    title="Не сделал"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 pr-3 align-top">
                                <input
                                  value={ex.actual_sets}
                                  onChange={(e) => patch({ actual_sets: e.target.value })}
                                  className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="напр. 3"
                                />
                              </td>
                              <td className="py-2 pr-3 align-top">
                                <input
                                  value={ex.actual_reps}
                                  onChange={(e) => patch({ actual_reps: e.target.value })}
                                  className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="напр. 10"
                                />
                              </td>
                              <td className="py-2 pr-3 align-top">
                                <input
                                  value={ex.actual_weight}
                                  onChange={(e) => patch({ actual_weight: e.target.value })}
                                  className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="напр. 40кг"
                                />
                              </td>
                              <td className="py-2 pr-3 align-top">
                                <input
                                  value={ex.actual_rounds}
                                  onChange={(e) => patch({ actual_rounds: e.target.value })}
                                  className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="если круги"
                                />
                              </td>
                              <td className="py-2 pr-0 align-top">
                                <input
                                  value={ex.comment}
                                  onChange={(e) => patch({ comment: e.target.value })}
                                  className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="ощущения, изменения, боль и т.п."
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  
                    </div>
                  </>
              )}
            </section>

            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            {hint ? <p className="text-xs text-emerald-600">{hint}</p> : null}

            <div className="sticky bottom-0 -mx-5 mt-4 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="submit"
                disabled={saving || !plan}
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200 md:w-auto md:rounded-full md:py-2"
              >
                {saving ? "Сохраняю..." : "Сохранить отметку"}
              </button>

              <div className="mt-2 text-[11px] text-zinc-500">
                Если вы не видите план — попросите специалиста назначить тренировку на эту дату.
              </div>
            </div>
          </div>
        </form>

        {/* Sidebar: planned days */}
        <aside className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold">Планы</div>
          <p className="mt-1 text-xs text-zinc-500">
            Быстрый переход по датам, где назначены тренировки.
          </p>

          {loading ? (
            <div className="mt-3 text-xs text-zinc-500">Загрузка…</div>
          ) : plannedDays.length === 0 ? (
            <div className="mt-3 text-xs text-zinc-500">Пока нет назначенных тренировок.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {plannedDays.slice(0, 20).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => void handlePickDate(e.entry_date)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                    e.entry_date === date
                      ? "border-black bg-zinc-50 dark:border-zinc-200 dark:bg-zinc-900"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{new Date(e.entry_date).toLocaleDateString()}</span>
                    <span className="text-[11px] text-zinc-500">
                      {(e.training_plan?.exercises?.length ?? 0)} упражн.
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-zinc-500">
                    {e.training_plan?.title || "Тренировка"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}