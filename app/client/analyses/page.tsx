"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ClientAnalysesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Анализы переехали в "Профиль и анкета"
    router.replace("/client/profile");
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Анализы</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Этот раздел теперь находится во вкладке <b>«Профиль и анкета»</b>.
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
