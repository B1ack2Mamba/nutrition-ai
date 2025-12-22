"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ChatRoom from "@/components/ChatRoom";

type ProfileRow = {
  id: string;
  full_name: string | null;
};

export default function NutritionistChatWithClientPage() {
  const router = useRouter();
  const params = useParams<{ clientId: string }>();

  const clientId = useMemo(() => {
    const raw = params?.clientId;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("Клиент");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!clientId) {
        setErr("Не указан clientId.");
        setLoading(false);
        return;
      }

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

      const pr = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", clientId)
        .single();

      if (!alive) return;
      if (!pr.error && pr.data) {
        const p = pr.data as ProfileRow;
        setClientName(p.full_name ?? "Клиент");
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [clientId, router]);

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
          href="/nutritionist/clients"
          className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Назад
        </Link>
      </div>
    );
  }

  if (!myId) return null;

  return (
    <ChatRoom
      title={`Чат с ${clientName}`}
      subtitle="Сообщения сохраняются в Supabase. Лайв-обновления работают если включён Realtime."
      backHref={`/nutritionist/clients/${clientId}`}
      clientId={clientId}
      nutritionistId={myId}
      myUserId={myId}
    />
  );
}
