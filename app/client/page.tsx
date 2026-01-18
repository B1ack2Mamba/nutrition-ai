"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type BasicProfile = {
  id: string;
  full_name: string | null;
};

type ExtendedProfile = {
  user_id: string;
  main_goal: string | null;
  goal_description: string | null;
};

type MenuAssignment = {
  id: string;
  client_id: string;
  title: string;
  notes: string | null;
  status: "active" | "archived" | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  menu_id: string | null;
  menu_data: unknown | null;
};

type FoodRulesRow = {
  id: string;
  client_id: string;
  nutritionist_id: string | null;
  // NEW schema
  allowed_products?: unknown;
  banned_products?: unknown;
  // LEGACY schema
  allowed?: unknown;
  banned?: unknown;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
};

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

type SupplementPlanRow = {
  id: string;
  client_id: string;
  nutritionist_id: string | null;
  plan?: unknown;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type JournalEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  weight_kg: number | null;
  energy_level: number | null;
  mood: number | null;
  food_diary: unknown;
  water_balance: string | null;
  wake_time: string | null;
  bed_time: string | null;
  client_diary_reply: string | null;
  nutritionist_diary_note?: string | null;
};

type LabReport = {
  id: string;
  client_id: string;
  title: string | null;
  taken_at: string | null;
  ai_summary: string | null;
  nutritionist_note?: string | null;
  created_at: string;
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

function getString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number") return String(v);
  return null;
}

function normalizeSupplementPlan(raw: unknown): SupplementPlan {
  const r = asRecord(raw);
  const out: SupplementPlan = { items: [] };

  const rationale = getString(r.rationale_short);
  if (rationale) out.rationale_short = rationale;

  const generalNotes = getString(r.general_notes);
  if (generalNotes) out.general_notes = generalNotes;

  const disclaimer = getString(r.disclaimer);
  if (disclaimer) out.disclaimer = disclaimer;

  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items: SupplementItem[] = [];
  for (const it of itemsRaw) {
    const i = asRecord(it);
    const name = getString(i.name);
    if (!name) continue;
    items.push({
      name,
      dose: getString(i.dose) ?? "",
      timing: getString(i.timing) ?? "",
      duration: getString(i.duration) ?? "",
      purpose: getString(i.purpose) ?? "",
      cautions: Array.isArray(i.cautions)
        ? i.cautions.map((x) => String(x)).filter(Boolean).slice(0, 12)
        : [],
    });
  }
  out.items = items;
  return out;
}

function splitList(value: unknown): string[] {
  const out: string[] = [];

  const add = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const item of v) add(item);
      return;
    }
    if (typeof v === "string") {
      for (const part of v.split(/[,;\n]/g)) {
        const t = part.trim();
        if (t) out.push(t);
      }
      return;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      out.push(String(v));
    }
  };

  add(value);
  return Array.from(new Set(out.map((x) => x.trim()).filter(Boolean))).slice(0, 80);
}

function diaryRowCount(foodDiary: unknown): number {
  const r = asRecord(foodDiary);
  const rows = r.rows;
  if (Array.isArray(rows)) return rows.length;
  return 0;
}

function Card({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle ? (<div className="mt-1 text-xs text-slate-500">{subtitle}</div>) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-solid)] px-3 py-1 text-xs text-slate-700">
      {children}
    </span>
  );
}

export default function ClientDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [basic, setBasic] = useState<BasicProfile | null>(null);
  const [extended, setExtended] = useState<ExtendedProfile | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<MenuAssignment | null>(null);
  const [foodRules, setFoodRules] = useState<FoodRulesRow | null>(null);
  const [suppRow, setSuppRow] = useState<SupplementPlanRow | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [lastLab, setLastLab] = useState<LabReport | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setFatalError(null);

      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) {
        setFatalError("Нет авторизации");
        setLoading(false);
        return;
      }

      const uid = auth.data.user.id;

      const [p, cp, ma, fr, sp, je, lr] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("id", uid).single(),
        supabase
          .from("client_profiles")
          .select("user_id, main_goal, goal_description")
          .eq("user_id", uid)
          .single(),
        supabase
          .from("menu_assignments")
          .select("*")
          .eq("client_id", uid)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("client_food_rules")
          .select("*")
          .eq("client_id", uid)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("client_supplement_plans")
          .select("*")
          .eq("client_id", uid)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("client_journal_entries")
          .select(
            "id,user_id,entry_date,weight_kg,energy_level,mood,food_diary,water_balance,wake_time,bed_time,client_diary_reply,nutritionist_diary_note"
          )
          .eq("user_id", uid)
          .order("entry_date", { ascending: false })
          .limit(21),
        supabase
          .from("client_lab_reports")
          .select("id,client_id,title,taken_at,ai_summary,nutritionist_note,created_at")
          .eq("client_id", uid)
          .order("taken_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      if (!alive) return;

      if (p.error) {
        setFatalError(p.error.message);
        setLoading(false);
        return;
      }

      setBasic((p.data ?? null) as BasicProfile | null);
      setExtended((cp.data ?? null) as ExtendedProfile | null);
      setActiveAssignment((ma.data?.[0] ?? null) as MenuAssignment | null);
      setFoodRules((fr.data?.[0] ?? null) as FoodRulesRow | null);
      setSuppRow((sp.data?.[0] ?? null) as SupplementPlanRow | null);
      setJournal((je.data ?? []) as JournalEntry[]);
      setLastLab((lr.data?.[0] ?? null) as LabReport | null);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const name = useMemo(() => basic?.full_name?.trim() || "".trim(), [basic]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayEntry = useMemo(() => journal.find((e) => e.entry_date === today) ?? null, [journal, today]);

  const weightInfo = useMemo(() => {
    const w = journal.filter((e) => typeof e.weight_kg === "number");
    if (!w.length) return { last: null as number | null, delta: null as number | null };
    const last = w[0].weight_kg as number;
    const prev = w.find((x, idx) => idx > 0 && typeof x.weight_kg === "number")?.weight_kg ?? null;
    const delta = prev == null ? null : Math.round((last - prev) * 10) / 10;
    return { last, delta };
  }, [journal]);

  const avg7 = useMemo(() => {
    const last7 = journal.slice(0, 7);
    const energyVals = last7.map((e) => e.energy_level).filter((x): x is number => typeof x === "number");
    const moodVals = last7.map((e) => e.mood).filter((x): x is number => typeof x === "number");
    const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
    return { energy: avg(energyVals), mood: avg(moodVals) };
  }, [journal]);

  const allowedTokens = useMemo(() => {
    if (!foodRules) return [];
    const allowed = (foodRules.allowed_products ?? foodRules.allowed) as unknown;
    return splitList(allowed);
  }, [foodRules]);

  const bannedTokens = useMemo(() => {
    if (!foodRules) return [];
    const banned = (foodRules.banned_products ?? foodRules.banned) as unknown;
    return splitList(banned);
  }, [foodRules]);

  const supplementPlan = useMemo(() => normalizeSupplementPlan(suppRow?.plan), [suppRow]);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю…</p>;
  }

  if (fatalError) {
    return <p className="text-sm text-red-500">{fatalError}</p>;
  }

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {name ? `Привет, ${name}` : "Главная"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Всё самое важное — в одном месте.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/client/assignments"
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
            >
              Мои назначения
            </Link>
            <Link
              href="/client/journal"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Добавить запись
            </Link>
          </div>
        </div>

        {extended?.main_goal ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Цель</div>
            <div className="mt-1 font-semibold">{extended.main_goal}</div>
            {extended.goal_description ? (
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                {extended.goal_description}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title="Сегодня"
          subtitle={todayEntry ? `Запись за ${formatDate(today)}` : "Записи за сегодня пока нет"}
          action={
            <Link
              href="/client/journal"
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Открыть
            </Link>
          }
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-zinc-600 dark:text-zinc-300">Дневник питания</div>
              <div className="text-xs text-zinc-500">
                {todayEntry && diaryRowCount(todayEntry.food_diary) > 0 ? "✓ заполнен" : "—"}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-zinc-600 dark:text-zinc-300">Вода</div>
              <div className="text-xs text-zinc-500">
                {todayEntry?.water_balance ? "✓ есть" : "—"}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-zinc-600 dark:text-zinc-300">Сон</div>
              <div className="text-xs text-zinc-500">
                {todayEntry?.bed_time || todayEntry?.wake_time ? "✓ есть" : "—"}
              </div>
            </div>

            {todayEntry?.nutritionist_diary_note ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Заметка нутрициолога</div>
                <div className="mt-1 whitespace-pre-wrap">{todayEntry.nutritionist_diary_note}</div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card
          title="Состояние"
          subtitle="Последние записи"
          action={
            <Link
              href="/client/journal"
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              История
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Вес</div>
              <div className="mt-1 text-xl font-semibold">
                {weightInfo.last == null ? "—" : `${weightInfo.last}`}
                {weightInfo.delta == null ? null : (
                  <span className="ml-2 text-xs font-medium text-zinc-500">
                    {weightInfo.delta > 0 ? `+${weightInfo.delta}` : `${weightInfo.delta}`}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">кг</div>
            </div>

            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Энергия (7д)</div>
              <div className="mt-1 text-xl font-semibold">{avg7.energy ?? "—"}</div>
              <div className="mt-1 text-[11px] text-zinc-500">/ 10</div>
            </div>

            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Настроение (7д)</div>
              <div className="mt-1 text-xl font-semibold">{avg7.mood ?? "—"}</div>
              <div className="mt-1 text-[11px] text-zinc-500">/ 10</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Активное назначение"
          subtitle={activeAssignment ? "Ваш текущий план" : "Пока нет активного плана"}
          action={
            <Link
              href="/client/assignments"
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Открыть
            </Link>
          }
        >
          {!activeAssignment ? (
            <p className="text-sm text-zinc-500">Попроси нутрициолога назначить рацион.</p>
          ) : (
            <div className="space-y-2">
              <div className="text-base font-semibold">{activeAssignment.title}</div>
              <div className="text-xs text-zinc-500">
                {activeAssignment.start_date
                  ? `с ${formatDate(activeAssignment.start_date)}`
                  : `назначен ${formatDate(activeAssignment.created_at)}`}
                {activeAssignment.end_date ? ` · до ${formatDate(activeAssignment.end_date)}` : ""}
              </div>
              {activeAssignment.notes ? (
                <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  {activeAssignment.notes}
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card
          title="Можно / Нельзя"
          subtitle="Коротко по продуктам"
          action={
            <Link
              href="/client/assignments"
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Подробнее
            </Link>
          }
        >
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Можно</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {allowedTokens.length ? (
                  allowedTokens.slice(0, 8).map((x) => <Pill key={`a-${x}`}>{x}</Pill>)
                ) : (
                  <span className="text-sm text-zinc-500">—</span>
                )}
                {allowedTokens.length > 8 ? (
                  <span className="text-xs text-zinc-500">+{allowedTokens.length - 8}</span>
                ) : null}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Нельзя</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {bannedTokens.length ? (
                  bannedTokens.slice(0, 8).map((x) => <Pill key={`b-${x}`}>{x}</Pill>)
                ) : (
                  <span className="text-sm text-zinc-500">—</span>
                )}
                {bannedTokens.length > 8 ? (
                  <span className="text-xs text-zinc-500">+{bannedTokens.length - 8}</span>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="БАДы и анализы"
          subtitle="Короткий статус"
          action={
            <Link
              href="/client/profile"
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Анализы
            </Link>
          }
        >
          <div className="space-y-3">
            <div className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">БАДы</div>
              <div className="mt-1 font-semibold">
                {supplementPlan.items?.length ? `${supplementPlan.items.length} назначено` : "Пока нет"}
              </div>
              {supplementPlan.items?.length ? (
                <div className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {supplementPlan.items.slice(0, 2).map((it) => (
                    <div key={it.name} className="flex justify-between gap-2">
                      <span className="truncate">{it.name}</span>
                      <span className="shrink-0 text-zinc-500">{it.dose || it.timing || ""}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Последний анализ</div>
              <div className="mt-1 font-semibold">{lastLab ? formatDate(lastLab.taken_at ?? lastLab.created_at) : "—"}</div>
              {lastLab?.nutritionist_note ? (
                <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-3">
                  {lastLab.nutritionist_note}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/client/specialists"
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
              >
                Чат
              </Link>
</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
