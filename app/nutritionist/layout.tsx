"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ChatThreadRow = {
  id: string;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  nutritionist_last_read_at: string | null;
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}


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
  badgeCount,
}: {
  href: string;
  label: string;
  onClick?: () => void;
  badgeCount?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  const baseClasses = "rounded-xl px-3 py-2 text-sm font-medium transition";
  const activeClasses = "bg-emerald-200 text-slate-900 shadow-sm";
  const inactiveClasses = "text-slate-700 hover:bg-white/70 hover:text-slate-900";

  const badge = badgeCount && badgeCount > 0 ? badgeCount : 0;

  return (
    <Link
      href={href}
      className={`${baseClasses} ${active ? activeClasses : inactiveClasses}`}
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="truncate">{label}</span>
        {badge > 0 ? (
          <span
            className={`min-w-[22px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${
              active ? "bg-white/20 text-white" : "bg-red-600 text-white"
            }`}
            aria-label="Есть новые сообщения"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
    </Link>
  );
}


function SidebarContent({
  onNavigate,
  onSignOut,
  unreadChatCount,
}: {
  onNavigate?: () => void;
  onSignOut: () => void;
  unreadChatCount?: number;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Кабинет нутрициолога
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Управление базой блюд, рационов и клиентов
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        <NavItem href="/nutritionist/profile" label="Мой профиль" onClick={onNavigate} />
        <NavItem href="/nutritionist/dishes" label="Мои блюда" onClick={onNavigate} />
        <NavItem href="/nutritionist/menus" label="Рационы" onClick={onNavigate} />
        <NavItem href="/nutritionist/clients" label="Клиенты" onClick={onNavigate} badgeCount={unreadChatCount} />
        <NavItem href="/nutritionist/training" label="Тренировки" onClick={onNavigate} />
        <NavItem
          href="/nutritionist/notifications"
          label="Уведомления"
          onClick={onNavigate}
        />
      </nav>

      <p className="mt-4 text-[11px] text-slate-500">
        Клиентский режим доступен в разделе{" "}
        <span className="font-medium">/client</span>.
      </p>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 rounded-full border border-[color:var(--border)] bg-white/70 px-3 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-white"
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

  const [myId, setMyId] = useState<string | null>(null);
  const [chatUnreadThreads, setChatUnreadThreads] = useState(0);

  useEffect(() => {
    // Закрываем мобильное меню при навигации
    setSidebarOpen(false);
  }, [pathname]);


  const refreshChatUnread = useCallback(
    async (uid: string) => {
      try {
        const res = await supabase
          .from("chat_threads")
          .select("id,last_message_at,last_message_sender_id,nutritionist_last_read_at")
          .eq("nutritionist_id", uid);

        if (res.error || !res.data) {
          setChatUnreadThreads(0);
          return;
        }

        const rows = asArray<ChatThreadRow>(res.data);
        let unreadThreads = 0;

        for (const row of rows) {
          const lastAt = row?.last_message_at ? new Date(row.last_message_at).getTime() : 0;
          const lastRead = row?.nutritionist_last_read_at ? new Date(row.nutritionist_last_read_at).getTime() : 0;
          const lastSender = row?.last_message_sender_id as string | null;

          const unread = Boolean(lastAt && lastSender && lastSender !== uid && lastAt > lastRead);
          if (unread) unreadThreads += 1;
        }

        setChatUnreadThreads(unreadThreads);
      } catch {
        setChatUnreadThreads(0);
      }
    },
    []
  );

  const markThreadRead = useCallback(async (threadId: string) => {
    if (!threadId) return;
    try {
      await supabase
        .from("chat_threads")
        // у специалиста обновляем nutritionist_last_read_at
        .update({ nutritionist_last_read_at: new Date().toISOString() })
        .eq("id", threadId);
    } catch {
      // ignore
    }
  }, []);

  const activeChatClientId = useMemo(() => {
    const prefix = "/nutritionist/chat/";
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    const id = rest.split("/")[0];
    return id || null;
  }, [pathname]);

  // когда открыт чат с конкретным клиентом — считаем прочитанным
  useEffect(() => {
    if (!myId || !activeChatClientId) return;

    let alive = true;

    (async () => {
      try {
        const th = await supabase
          .from("chat_threads")
          .select("id")
          .eq("nutritionist_id", myId)
          .eq("client_id", activeChatClientId)
          .maybeSingle();

        if (!alive) return;
        const tid = (th.data as { id?: string } | null)?.id;
        if (!tid) return;

        const visible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
        if (!visible) return;

        await markThreadRead(tid);
        await refreshChatUnread(myId);
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
  }, [myId, activeChatClientId, markThreadRead, refreshChatUnread]);

  // realtime: обновление счётчика при новых сообщениях (через триггер обновляется chat_threads)
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel(`chat_threads_badge:nutritionist:${myId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_threads",
          filter: `nutritionist_id=eq.${myId}`,
        },
        async (payload) => {
          const row = (payload as { new?: unknown }).new as Partial<ChatThreadRow> | null;
          const tid = row?.id as string | undefined;
          const lastSender = row?.last_message_sender_id as string | undefined;

          const chatOpen = Boolean(activeChatClientId);
          const visible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;

          // если сейчас открыт чат и сообщение пришло от клиента — сразу помечаем прочитанным
          if (chatOpen && visible && tid && lastSender && lastSender !== myId) {
            await markThreadRead(tid);
          }
          await refreshChatUnread(myId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, activeChatClientId, markThreadRead, refreshChatUnread]);

  // initial refresh
  useEffect(() => {
    if (!myId) return;
    void refreshChatUnread(myId);
  }, [myId, refreshChatUnread]);


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

      setMyId(user.id);
      setChecking(false);
    };

    void check();
  }, [router, pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] text-sm text-slate-600">
        Проверяю доступ к кабинету нутрициолога...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-slate-900">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:var(--background)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/70 text-slate-700 shadow-sm hover:bg-white"
            aria-label="Открыть меню"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Кабинет нутрициолога</div>
            <div className="truncate text-[11px] text-slate-500">
              Управление рационом и клиентами
            </div>
          </div>

          {chatUnreadThreads > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-label="Есть новые сообщения" />
              <span className="text-[11px] text-slate-500">
                {chatUnreadThreads > 99 ? "99+" : chatUnreadThreads}
              </span>
            </div>
          ) : null}
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
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-[color:var(--border)] bg-[color:var(--background)] p-4 pt-3 shadow-xl transition-transform ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Меню</div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/70 text-slate-700 shadow-sm hover:bg-white"
              aria-label="Закрыть меню"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <SidebarContent onNavigate={() => setSidebarOpen(false)} onSignOut={signOut} unreadChatCount={chatUnreadThreads} />
        </aside>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-10 md:flex md:min-h-screen md:gap-6 md:px-8 md:py-10">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 md:block">
          <div className="sticky top-8 rounded-3xl border border-[color:var(--border)] bg-white/70 p-5 shadow-sm backdrop-blur">
            <SidebarContent onSignOut={signOut} unreadChatCount={chatUnreadThreads} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pt-4 md:pt-0">{children}</main>
      </div>
    </div>
  );
}
