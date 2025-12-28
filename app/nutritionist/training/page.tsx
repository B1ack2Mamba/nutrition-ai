"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type LinkRow = {
  id: string;
  client_id: string;
  nutritionist_id: string;
  status: string | null;
  created_at: string | null;
};

type BasicProfile = {
  id: string;
  full_name: string | null;
};

type ClientProfile = {
  user_id: string;
  main_goal: string | null;
};

export default function NutritionistTrainingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, BasicProfile>>({});
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile>>({});

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

      const { data: linkRows, error: linkErr } = await supabase
        .from("client_nutritionist_links")
        .select("id, client_id, nutritionist_id, status, created_at")
        .eq("nutritionist_id", user.id)
        .order("created_at", { ascending: false });

      if (linkErr) {
        setError(linkErr.message);
        setLoading(false);
        return;
      }

      const typed = (linkRows ?? []) as LinkRow[];
      setLinks(typed);

      const clientIds = Array.from(new Set(typed.map((l) => l.client_id)));
      if (clientIds.length === 0) {
        setProfiles({});
        setClientProfiles({});
        setLoading(false);
        return;
      }

      const { data: profRows, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", clientIds);

      if (profErr) {
        setError(profErr.message);
        setLoading(false);
        return;
      }

      const map: Record<string, BasicProfile> = {};
      for (const p of (profRows ?? []) as BasicProfile[]) map[p.id] = p;
      setProfiles(map);

      const { data: cpr, error: cpe } = await supabase
        .from("client_profiles")
        .select("user_id, main_goal")
        .in("user_id", clientIds);

      if (!cpe) {
        const cm: Record<string, ClientProfile> = {};
        for (const c of (cpr ?? []) as ClientProfile[]) cm[c.user_id] = c;
        setClientProfiles(cm);
      }

      setLoading(false);
    };

    load();
  }, []);

  const approvedLinks = useMemo(() => {
    return links.filter((l) => {
      const s = (l.status ?? "approved").toLowerCase();
      return s === "approved" || s === "active" || s === "ok";
    });
  }, [links]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Тренировки</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Выберите клиента — и назначайте план тренировок по датам. Клиент отметит выполнение и внесёт изменения.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <p className="text-xs text-zinc-500">Загрузка…</p>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : approvedLinks.length === 0 ? (
          <p className="text-xs text-zinc-500">Пока нет клиентов.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {approvedLinks.map((l) => {
              const p = profiles[l.client_id];
              const cp = clientProfiles[l.client_id];
              return (
                  <Link
                  key={l.id}
                  href={`/nutritionist/training/${l.client_id}`}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  <div className="font-medium">{p?.full_name || "Клиент"}</div>
                  <div className="mt-1 text-xs text-zinc-500">{cp?.main_goal || "Цель не указана"}</div>
                  <div className="mt-2 text-[11px] text-zinc-500">Открыть планы тренировок →</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
