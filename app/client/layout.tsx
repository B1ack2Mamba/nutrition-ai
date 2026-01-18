"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function ClientNavLink({
  href,
  label,
  onClick,
  badge,
}: {
  href: string;
  label: string;
  onClick?: () => void;
  badge?: { dot?: boolean; count?: number };
}) {
  const pathname = usePathname();
  const active =
    href === "/client"
      ? pathname === "/client"
      : pathname === href || pathname.startsWith(`${href}/`);

  const badgeCount = badge?.count ?? 0;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`w-full rounded-full px-4 py-2 text-left text-sm transition ${
        active
          ? "bg-black text-white dark:bg-zinc-100 dark:text-black"
          : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="truncate">{label}</span>
        {badgeCount > 0 ? (
          <span
            className={`min-w-[22px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${
              active
                ? "bg-white/20 text-white dark:bg-black/10 dark:text-black"
                : "bg-red-600 text-white"
            }`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : badge?.dot ? (
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-label="Есть новые сообщения" />
        ) : null}
      </span>
    </Link>
  );
}

function SidebarContent({
  navItems,
  onNavigate,
  onSignOut,
}: {
  navItems: { href: string; label: string; badge?: { dot?: boolean; count?: number } }[];
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Мой кабинет</h1>
      <p className="mt-1 text-xs text-zinc-500">Главная · Назначения · Дневник · Специалисты</p>

      <nav className="mt-6 flex flex-col gap-2">
        {navItems.map((item) => (
          <ClientNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            badge={item.badge}
            onClick={onNavigate}
          />
        ))}
      </nav>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-6 rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Выйти
      </button>
    </div>
  );
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [myId, setMyId] = useState<string | null>(null);
  const [selectedNutritionistId, setSelectedNutritionistId] = useState<string | null>(null);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const markChatRead = useCallback(async () => {
    if (!chatThreadId || !myId) return;
    try {
      await supabase
        .from("chat_threads")
        // у клиента обновляем client_last_read_at
        // (колонка появляется после supabase_chat_unread.sql)
        .update({ client_last_read_at: new Date().toISOString() } as any)
        .eq("id", chatThreadId);
    } catch {
      // ignore
    } finally {
      setChatUnread(false);
      setChatUnreadCount(0);
    }
  }, [chatThreadId, myId]);

  const navItems = useMemo(() => {
    const chatBadge = chatUnread
      ? { count: chatUnreadCount > 0 ? chatUnreadCount : undefined, dot: chatUnreadCount <= 0 }
      : undefined;

    return [
      { href: "/client", label: "Главная" },
      { href: "/client/assignments", label: "Мои назначения" },
      { href: "/client/journal", label: "Дневник" },
      { href: "/client/profile", label: "Профиль и анкета" },
      { href: "/client/specialists", label: "Мои специалисты", badge: chatBadge },
      { href: "/client/training", label: "Тренировки" },
      { href: "/client/notifications", label: "Уведомления" },
    ];
  }, [chatUnread, chatUnreadCount]);

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "client") {
        router.replace("/auth");
        return;
      }

      setMyId(user.id);
      setChecking(false);
    };

    check();
  }, [router, pathname]);

  // читаем выбранного нутрициолога (для чата)
  useEffect(() => {
    if (!myId) return;
    let alive = true;

    (async () => {
      const cp = await supabase
        .from("client_profiles")
        .select("selected_nutritionist_id")
        .eq("user_id", myId)
        .maybeSingle();

      if (!alive) return;
      const selected = (cp.data as any)?.selected_nutritionist_id ?? null;
      setSelectedNutritionistId(selected);
    })();

    return () => {
      alive = false;
    };
  }, [myId]);

  // определяем, есть ли непрочитанные сообщения (требует supabase_chat_unread.sql)
  useEffect(() => {
    if (!myId || !selectedNutritionistId) {
      setChatThreadId(null);
      setChatUnread(false);
      setChatUnreadCount(0);
      return;
    }

    let alive = true;

    (async () => {
      try {
        const th = await supabase
          .from("chat_threads")
          .select("id,last_message_at,last_message_sender_id,client_last_read_at")
          .eq("client_id", myId)
          .eq("nutritionist_id", selectedNutritionistId)
          .maybeSingle();

        if (!alive) return;

        if (th.error || !th.data) {
          // если колонок ещё нет (schema cache) — просто не показываем бейдж
          setChatThreadId(null);
          setChatUnread(false);
          setChatUnreadCount(0);
          return;
        }

        const row = th.data as any;
        const tid = row?.id as string | null;
        setChatThreadId(tid);

        const lastAt = row?.last_message_at ? new Date(row.last_message_at).getTime() : 0;
        const lastRead = row?.client_last_read_at ? new Date(row.client_last_read_at).getTime() : 0;
        const lastSender = row?.last_message_sender_id as string | null;

        const unread = Boolean(tid && lastAt && lastSender && lastSender !== myId && lastAt > lastRead);
        setChatUnread(unread);

        if (!unread) {
          setChatUnreadCount(0);
          return;
        }

        // Пытаемся получить точный счётчик (может не понадобиться, но приятно)
        try {
          const c = await supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("thread_id", tid)
            .neq("sender_id", myId)
            .gt("created_at", row?.client_last_read_at ?? "1970-01-01T00:00:00Z");

          if (!alive) return;
          setChatUnreadCount(c.count ?? 1);
        } catch {
          setChatUnreadCount(1);
        }
      } catch {
        setChatThreadId(null);
        setChatUnread(false);
        setChatUnreadCount(0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [myId, selectedNutritionistId]);

  // realtime: если прилетает сообщение — поднимаем бейдж
  useEffect(() => {
    if (!chatThreadId || !myId) return;

    const channel = supabase
      .channel(`chat_badge:${chatThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${chatThreadId}`,
        },
        async (payload) => {
          const msg = payload.new as any;
          const senderId = msg?.sender_id as string | undefined;
          if (!senderId || senderId === myId) return;

          const chatOpen = pathname === "/client/specialists" || pathname.startsWith("/client/specialists") || pathname === "/client/chat" || pathname.startsWith("/client/chat/");
          const visible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;

          if (chatOpen && visible) {
            await markChatRead();
          } else {
            setChatUnread(true);
            setChatUnreadCount((prev) => (prev > 0 ? prev + 1 : 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatThreadId, myId, pathname, markChatRead]);

  // если пользователь открыл чат — считаем прочитанным
  useEffect(() => {
    const chatOpen = pathname === "/client/specialists" || pathname.startsWith("/client/specialists") || pathname === "/client/chat" || pathname.startsWith("/client/chat/");
    if (!chatOpen) return;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    markChatRead();
  }, [pathname, markChatRead]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-black dark:text-zinc-400">
        Проверяю доступ в клиентский кабинет...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-black/80 md:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            aria-label="Открыть меню"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Мой кабинет</div>
            <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              Главная • Назначения • Дневник • Специалисты
            </div>
          </div>

          {chatUnread ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-label="Есть новые сообщения" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">новые сообщения</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 md:hidden ${sidebarOpen ? "" : "pointer-events-none"}`} aria-hidden={!sidebarOpen}>
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
          <SidebarContent navItems={navItems} onNavigate={() => setSidebarOpen(false)} onSignOut={handleLogout} />
        </aside>
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-10 md:flex md:min-h-screen md:gap-8 md:px-4 md:py-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 border-r border-zinc-200 pr-6 dark:border-zinc-800 md:block">
          <SidebarContent navItems={navItems} onSignOut={handleLogout} />
        </aside>

        {/* Основной контент */}
        <section className="min-w-0 flex-1 pt-4 md:pt-0">{children}</section>
      </main>
    </div>
  );
}
