"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ClientSettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Настройки убраны из клиентского меню
    router.replace("/client/profile");
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Настройки больше не отдельной вкладкой. Всё важное находится в <b>«Профиль и анкета»</b>.
      </p>
      <Link
        href="/client/profile"
        className="inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
      >
        Перейти в профиль
      </Link>
    </div>
  );
}
