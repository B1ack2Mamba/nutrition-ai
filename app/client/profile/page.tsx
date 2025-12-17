"use client";

import { FormEvent, useEffect, useState, ChangeEvent, useCallback } from "react";
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

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-()]+/g, "_");
}

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

  // ===== Анализы (файлы) =====
  const [labReports, setLabReports] = useState<LabReport[]>([]);
  const [labHint, setLabHint] = useState<string | null>(null);
  const [labUploading, setLabUploading] = useState(false);
  const [labTitle, setLabTitle] = useState("");
  const [labTakenAt, setLabTakenAt] = useState<string>("");
  const [labFile, setLabFile] = useState<File | null>(null);

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
        }
      );

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

      {/* ✅ Анализы (перенесено сюда) */}
      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Анализы (файлы)</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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

              {labFile ? (
                <span className="text-[11px] text-zinc-500">
                  {labFile.name}
                </span>
              ) : null}
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