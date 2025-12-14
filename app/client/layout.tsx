"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function ClientLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "client") {
        router.replace("/auth");
        return;
      }

      setChecking(false);
    };

    check();
  }, [router, pathname]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Проверяю доступ в клиентский кабинет...
      </div>
    );
  }

    const navItems = [
        { href: "/client", label: "Мой рацион" },
        { href: "/client/profile", label: "Профиль и цели" },
        { href: "/client/journal", label: "Дневник питания" },
    ];


  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex min-h-screen max-w-5xl gap-8 px-4 py-8">
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-200 pr-6 dark:border-zinc-800">
          <h1 className="text-2xl font-semibold tracking-tight">Мой кабинет</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Ваши рационы и дневник питания
          </p>

                  <nav className="mt-6 flex flex-col gap-2 text-sm">
                      {navItems.map((item) => (
                          <Link
                              key={item.href}
                              href={item.href}
                              className={`w-full rounded-full px-4 py-2 text-left ${pathname === item.href
                                      ? "bg-black text-white dark:bg-zinc-100 dark:text-black"
                                      : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                  }`}
                          >
                              {item.label}
                          </Link>
                      ))}
                  </nav>


          <p className="mt-6 text-xs text-zinc-500">
            Это режим клиента. Для работы нутрициолога используется раздел{" "}
            <code className="text-[11px]">/nutritionist</code>.
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Выйти
          </button>
        </aside>

        {/* Основной контент */}
        <section className="flex-1">{children}</section>
      </main>
    </div>
  );
}
