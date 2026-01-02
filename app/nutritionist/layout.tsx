"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function NavItem({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  const baseClasses = "rounded-lg px-3 py-2 text-sm font-medium transition";
  const activeClasses =
    "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900";
  const inactiveClasses =
    "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50";

  return (
    <Link
      href={href}
      className={`${baseClasses} ${active ? activeClasses : inactiveClasses}`}
      onClick={onClick}
    >
      {label}
    </Link>
  );
}

function SidebarContent({
  onNavigate,
  onSignOut,
}: {
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Кабинет нутрициолога
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Управление базой блюд, рационов и клиентов
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        <NavItem href="/nutritionist/profile" label="Мой профиль" onClick={onNavigate} />
        <NavItem href="/nutritionist/dishes" label="Мои блюда" onClick={onNavigate} />
        <NavItem href="/nutritionist/menus" label="Рационы" onClick={onNavigate} />
        <NavItem href="/nutritionist/clients" label="Клиенты" onClick={onNavigate} />
        <NavItem href="/nutritionist/training" label="Тренировки" onClick={onNavigate} />
        <NavItem
          href="/nutritionist/notifications"
          label="Уведомления"
          onClick={onNavigate}
        />
      </nav>

      <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-500">
        Клиентский режим доступен в разделе{" "}
        <span className="font-medium">/client</span>.
      </p>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Выйти
      </button>
    </div>
  );
}

export default function NutritionistLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Закрываем мобильное меню при навигации
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !profile || profile.role !== "nutritionist") {
        router.replace("/auth");
        return;
      }

      setChecking(false);
    };

    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-black dark:text-zinc-400">
        Проверяю доступ к кабинету нутрициолога...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-black/80 md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            aria-label="Открыть меню"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Кабинет нутрициолога</div>
            <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              Управление рационом и клиентами
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${sidebarOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!sidebarOpen}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity ${sidebarOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-4 pt-3 shadow-xl transition-transform dark:border-zinc-800 dark:bg-black ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Меню</div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              aria-label="Закрыть меню"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <SidebarContent onNavigate={() => setSidebarOpen(false)} onSignOut={signOut} />
        </aside>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-10 md:flex md:min-h-screen md:gap-6 md:px-8 md:py-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 space-y-4 border-r border-zinc-200 pr-4 dark:border-zinc-800 md:block">
          <SidebarContent onSignOut={signOut} />
        </aside>

        <main className="min-w-0 flex-1 pt-4 md:pt-0">{children}</main>
      </div>
    </div>
  );
}
