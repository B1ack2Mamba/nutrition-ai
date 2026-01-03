"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

type BasicProfile = {
  id: string;
  full_name: string | null;
};

function SettingsCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{desc}</div>
    </Link>
  );
}

export default function ClientSettingsPage() {
  const [name, setName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const auth = await supabase.auth.getUser();
      if (!auth.data.user) return;
      const { data } = await supabase.from("profiles").select("id,full_name").eq("id", auth.data.user.id).single();
      const p = (data ?? null) as BasicProfile | null;
      setName(p?.full_name?.trim() ?? "");
    })();
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Настройки</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {name ? `${name} · управление профилем и разделами` : "Управление профилем и разделами"}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <SettingsCard href="/client/profile" title="Профиль и анкета" desc="Данные, цели, анкета клиента" />
        <SettingsCard href="/client/specialists" title="Мои специалисты" desc="Заявка нутрициологу и связь" />
        <SettingsCard href="/client/training" title="Тренировки" desc="План и заметки по тренировкам" />
        <SettingsCard href="/client/notifications" title="Уведомления" desc="Push-уведомления и события" />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="font-semibold">Где кнопка “Выйти”?</div>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Она в боковом меню слева (внизу). Мы оставили её там, чтобы всегда была под рукой.
        </div>
      </div>
    </div>
  );
}
