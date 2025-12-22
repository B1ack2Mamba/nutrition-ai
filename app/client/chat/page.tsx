"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ChatRoom from "@/components/ChatRoom";

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type ClientProfileRow = {
  user_id: string;
  selected_nutritionist_id: string | null;
};

export default function ClientChatPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [nutritionistId, setNutritionistId] = useState<string | null>(null);
  const [nutritionistName, setNutritionistName] = useState("Специалист");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) {
        router.push("/auth");
        return;
      }

      const uid = auth.data.user.id;
      if (!alive) return;
      setMyId(uid);

      const cp = await supabase
        .from("client_profiles")
        .select("user_id, selected_nutritionist_id")
        .eq("user_id", uid)
        .single();

      if (!alive) return;

      if (cp.error) {
        setErr(cp.error.message);
        setLoading(false);
        return;
      }

      const selected =
        (cp.data as ClientProfileRow | null)?.selected_nutritionist_id ?? null;
      setNutritionistId(selected);

      if (!selected) {
        setLoading(false);
        return;
      }

      const pr = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", selected)
        .single();

      if (!alive) return;

      if (!pr.error && pr.data) {
        const p = pr.data as ProfileRow;
        setNutritionistName(p.full_name ?? "Специалист");
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Открываю чат…</p>
    );
  }

  if (err) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-500">{err}</p>
        <Link
          href="/client"
          className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Назад
        </Link>
      </div>
    );
  }

  if (!myId) return null;

  if (!nutritionistId) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Чат</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          У тебя пока не выбран основной специалист. Сначала выбери его на
          странице «Мои специалисты».
        </p>
        <Link
          href="/client/specialists"
          className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
        >
          Перейти к выбору специалиста
        </Link>
      </div>
    );
  }

  return (
    <ChatRoom
      title={`Чат с ${nutritionistName}`}
      subtitle="Сообщения сохраняются в Supabase. Лайв-обновления работают, если включён Realtime."
      backHref="/client/specialists"
      clientId={myId}
      nutritionistId={nutritionistId}
      myUserId={myId}
    />
  );
}
