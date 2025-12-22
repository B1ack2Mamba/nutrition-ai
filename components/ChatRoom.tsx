"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  ensureChatThread,
  fetchThreadMessages,
  sendThreadMessage,
  type ChatMessage,
} from "@/lib/chat";

type Props = {
  title: string;
  subtitle?: string;
  backHref: string;
  clientId: string;
  nutritionistId: string;
  myUserId: string;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ChatRoom(props: Props) {
  const { title, subtitle, backHref, clientId, nutritionistId, myUserId } = props;

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const peerLabel = useMemo(() => (myUserId === clientId ? "Специалист" : "Клиент"), [myUserId, clientId]);

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      setLoading(true);
      setErr(null);

      try {
        const { threadId } = await ensureChatThread({ clientId, nutritionistId });
        if (!alive) return;
        setThreadId(threadId);

        const initial = await fetchThreadMessages({ threadId });
        if (!alive) return;
        setMessages(initial);

        // realtime: новые сообщения
        const channel = supabase
          .channel(`chat:${threadId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
              filter: `thread_id=eq.${threadId}`,
            },
            (payload) => {
              const msg = payload.new as ChatMessage;
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
              });
            },
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
        setErr(msg);
      } finally {
        setLoading(false);
      }
    };

    const cleanupPromise = boot();

    return () => {
      alive = false;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [clientId, nutritionistId, myUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!threadId) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setErr(null);
    try {
      await sendThreadMessage({ threadId, senderId: myUserId, body: text });
      setDraft("");
      // сообщение прилетит по realtime; но если realtime не включён — подстрахуемся
      setMessages((prev) => {
        // локальный optimistic fallback только если сообщение не прилетит —
        // не делаем, чтобы не плодить дубли. Лучше просто подождать.
        return prev;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось отправить сообщение";
      setErr(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Назад
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p> : null}
            </div>
          </div>
        </div>

        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
            {peerLabel} ↔ Вы
          </span>
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="max-h-[60vh] overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Открываю чат…</p>
          ) : err ? (
            <div className="space-y-2">
              <p className="text-sm text-red-500">{err}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Подсказка: для лайв-обновлений включи Realtime для таблицы <code>chat_messages</code> в Supabase.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Пока пусто. Напиши первое сообщение — дальше будет как в нормальном мессенджере.
            </p>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => {
                const mine = m.sender_id === myUserId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        mine
                          ? "bg-black text-white dark:bg-zinc-100 dark:text-black"
                          : "border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={`mt-1 text-[10px] ${mine ? "text-white/70 dark:text-black/60" : "text-zinc-500"}`}>
                        {formatTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <form onSubmit={onSend} className="flex items-end gap-2">
            <label className="flex-1">
              <span className="sr-only">Сообщение</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Напиши сообщение…"
                className="w-full resize-none rounded-2xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
              />
            </label>

            <button
              type="submit"
              disabled={sending || !draft.trim() || !threadId}
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
            >
              {sending ? "Отправляю…" : "Отправить"}
            </button>
          </form>

          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            Только текст. Файлы/картинки добавим позже, когда решим со storage и политиками.
          </div>
        </div>
      </section>
    </div>
  );
}
