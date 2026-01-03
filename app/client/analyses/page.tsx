"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type LabReport = {
  id: string;
  client_id: string;
  nutritionist_id: string | null;
  title: string | null;
  taken_at: string | null;
  file_path: string;
  file_url: string | null;
  ai_summary: string | null;

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

export default function ClientAnalysesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [labReports, setLabReports] = useState<LabReport[]>([]);
  const [labHint, setLabHint] = useState<string | null>(null);
  const [labUploading, setLabUploading] = useState(false);
  const [labTitle, setLabTitle] = useState("");
  const [labTakenAt, setLabTakenAt] = useState("");
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setLabHint("Нет авторизации");
        setLoading(false);
        return;
      }

      setUserId(user.id);
      await reloadLabReports(user.id);
      setLoading(false);
    })();
  }, [reloadLabReports]);

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

    if (r.file_url) {
      window.open(r.file_url, "_blank", "noreferrer");
      return;
    }

    const { data, error: e } = await supabase.storage.from("lab_reports").createSignedUrl(r.file_path, 60 * 10);
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

    const rm = await supabase.storage.from("lab_reports").remove([r.file_path]);
    if (rm.error) {
      setLabHint(`Не удалось удалить файл: ${rm.error.message}`);
      return;
    }

    const del = await supabase.from("client_lab_reports").delete().eq("id", r.id).eq("client_id", userId);
    if (del.error) {
      setLabHint(`Не удалось удалить запись: ${del.error.message}`);
      return;
    }

    await reloadLabReports(userId);
  };

  const saveClientLabNote = useCallback(
    async (r: LabReport) => {
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
    },
    [labClientNoteDraftById, reloadLabReports, userId]
  );

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю…</p>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Анализы</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Загружай PDF или фото. Специалист увидит это в твоей карточке.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Файлы открываются через signed URL (если bucket приватный).
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
          <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {labHint}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900 sm:grid-cols-3">
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
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold">История</h3>

        {labReports.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Пока нет загруженных анализов.</p>
        ) : (
          <div className="mt-3 space-y-2">
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
      </section>
    </div>
  );
}
