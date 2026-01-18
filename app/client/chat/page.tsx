"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ClientChatRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Чат перенесён во вкладку "Мои специалисты"
    router.replace("/client/specialists#chat");
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Чат</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Чат теперь находится во вкладке <b>«Мои специалисты»</b>.
      </p>
      <Link
        href="/client/specialists#chat"
        className="inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
      >
        Перейти к чату
      </Link>
    </div>
  );
}
