"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function NotificationsRoot() {
  const router = useRouter();
  const [msg, setMsg] = useState("Проверяю доступ...");

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile?.role) {
        router.replace("/auth");
        return;
      }

      if (profile.role === "client") router.replace("/client/notifications");
      else if (profile.role === "nutritionist") router.replace("/nutritionist/notifications");
      else router.replace("/auth");
    };

    run().catch(() => setMsg("Ошибка. Перезайдите в аккаунт."));
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl p-6 text-sm text-zinc-600 dark:text-zinc-300">
      {msg}
    </div>
  );
}
