"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// This project doesn't use generated Supabase Database types.
// Cast to a loose client to avoid `never` inference breaking TypeScript builds.
const db = supabase as any;

type Prefs = {
  user_id: string;
  enable_training: boolean;
  enable_diary: boolean;
};

type NotifRow = {
  id: string;
  topic: "training" | "diary";
  title: string;
  body: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

async function ensureSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  const existing = await getSWRegistration();
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

async function getActiveWebPushEndpoint(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    // Do NOT await navigator.serviceWorker.ready here. It can stay pending
    // until a service worker actually controls the page (first load / dev).
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration> {
  // Ensure sw.js exists (helps diagnose 404 in dev)
  try {
    const res = await fetch("/sw.js", { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Файл /sw.js не найден (проверь public/sw.js).");
    }
  } catch (e) {
    // Ignore fetch errors here; registration attempt will surface a better error.
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function ensureServiceWorkerActive(reg: ServiceWorkerRegistration, timeoutMs = 8000): Promise<void> {
  try { await reg.update(); } catch {}
  if (reg.active) return;

  const sw = reg.installing || reg.waiting;
  if (!sw) return;

  // TypeScript doesn't always keep the non-null narrowing for captured variables in closures.
  // Bind to a new const so checks inside callbacks are clean.
  const worker: ServiceWorker = sw;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Service Worker не активировался. Обновите страницу и попробуйте ещё раз."));
    }, timeoutMs);

    const onChange = () => {
      if (worker.state === "activated") {
        clearTimeout(timer);
        worker.removeEventListener("statechange", onChange);
        resolve();
      }
    };

    worker.addEventListener("statechange", onChange);

    // In case it is already activated
    if (worker.state === "activated") {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onChange);
      resolve();
    }
  });

}

async function ensureServiceWorkerControlsPage(timeoutMs = 6000): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (navigator.serviceWorker.controller) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Service Worker установлен, но страница ещё не контролируется. Обновите страницу и нажмите «Включить push» ещё раз."));
    }, timeoutMs);

    const onChange = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onChange);
  });
}


export default function ClientNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "default";
    return Notification.permission;
  });

  const hasVapid = useMemo(() => {
    return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  }, []);

  const reload = async () => {
    setError(null);
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Нет авторизации");
        return;
      }

      // prefs
      const { data: prefRow } = await db
        .from("notification_prefs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (prefRow) setPrefs(prefRow as Prefs);
      else {
        const def: Prefs = { user_id: user.id, enable_training: true, enable_diary: true };
        await db.from("notification_prefs").upsert(def, { onConflict: "user_id" });
        setPrefs(def);
      }

      // list notifications
      const { data: notifRows } = await db
        .from("user_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      setItems((notifRows ?? []) as NotifRow[]);

      // endpoint (do NOT await serviceWorker.ready here — it can hang on first visit/dev)
      const ep = await getActiveWebPushEndpoint();
      setEndpoint(ep);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePref = async (key: "enable_training" | "enable_diary") => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    const { error } = await db
      .from("notification_prefs")
      .update({ [key]: next[key], updated_at: new Date().toISOString() })
      .eq("user_id", prefs.user_id);
    if (error) setError(error.message);
  };

  const enablePush = async () => {
    setError(null);
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setError("Уведомления не поддерживаются в этом браузере.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Push работает только на HTTPS или localhost.");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      setError("Service Worker недоступен (нужен HTTPS).");
      return;
    }
    if (!hasVapid) {
      setError("Не настроен VAPID ключ (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
      return;
    }

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") {
      setError("Разрешение на уведомления не выдано.");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Нет авторизации");
      return;
    }

    let sub: PushSubscription;
    try {
      const reg = await getOrRegisterServiceWorker();
      await ensureServiceWorkerActive(reg);
      await ensureServiceWorkerControlsPage();

      const existing = await reg.pushManager.getSubscription().catch(() => null);
      if (existing) {
        sub = existing;
      } else {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      const normalized = String(msg);

      if (normalized.includes("no active Service Worker")) {
        setError("Нет активного Service Worker. Обнови страницу и попробуй ещё раз (в dev лучше: npm run build && npm run start).");
        return;
      }
      if (normalized.includes("push service error")) {
        setError("Подписка не создалась: браузер не смог связаться с push-сервисом. Часто виноваты Brave/усиленная приватность, корпоративная сеть/прокси или блокировка Google Push. Попробуй Chrome/Edge без инкогнито, отключи блокировщики, проверь доступ к fcm.googleapis.com или включи VPN/другой интернет.");
        return;
      }

      setError(normalized);
      return;
    }

    const ep = sub.endpoint;
    const payload = sub.toJSON();

    const { error } = await db
      .from("notification_devices")
      .upsert(
        { user_id: user.id, kind: "webpush", endpoint: ep, payload, updated_at: new Date().toISOString() },
        { onConflict: "user_id,kind,endpoint" }
      );

    if (error) {
      setError(error.message);
      return;
    }

    setEndpoint(ep);
  };

  const disablePush = async () => {
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Нет авторизации");
      return;
    }

    const reg = await getSWRegistration();
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    const ep = sub?.endpoint ?? null;

    if (sub) await sub.unsubscribe().catch(() => {});

    if (ep) {
      await db
        .from("notification_devices")
        .delete()
        .eq("user_id", user.id)
        .eq("kind", "webpush")
        .eq("endpoint", ep);
    }

    setEndpoint(null);
    setPermission(typeof window !== "undefined" && ("Notification" in window) ? Notification.permission : "default");
  };

  const markAllRead = async () => {
    const unreadIds = items.filter((i) => !i.read_at).map((i) => i.id);
    if (unreadIds.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await db.from("user_notifications").update({ read_at: now }).in("id", unreadIds);
    if (error) setError(error.message);
    await reload();
  };

  const unreadCount = useMemo(() => items.filter((i) => !i.read_at).length, [items]);

  if (loading) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Загрузка…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Уведомления</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Включите пуши, чтобы получать уведомления о дневнике и тренировках. На iPhone пуши работают только если сайт
          добавлен “На экран Домой”.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold">Push (Web Push)</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-xs text-zinc-500">
            Permission: <b>{permission}</b>
          </span>
          <span className="text-xs text-zinc-500">
            Подписка: <b>{endpoint ? "активна" : "нет"}</b>
          </span>

          {!endpoint ? (
            <button
              type="button"
              onClick={enablePush}
              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
            >
              Включить push
            </button>
          ) : (
            <button
              type="button"
              onClick={disablePush}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Отключить push
            </button>
          )}

          <a href="/install" className="text-xs text-zinc-600 underline hover:text-black dark:text-zinc-300 dark:hover:text-white">
            Инструкция установки приложения
          </a>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span>Тренировки</span>
            <input type="checkbox" checked={prefs?.enable_training ?? true} onChange={() => togglePref("enable_training")} />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span>Дневник питания</span>
            <input type="checkbox" checked={prefs?.enable_diary ?? true} onChange={() => togglePref("enable_diary")} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            История уведомлений {unreadCount > 0 ? <span className="text-xs text-red-500">({unreadCount} новых)</span> : null}
          </h3>
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Пометить всё прочитанным
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-zinc-500">Пока пусто.</p>
          ) : (
            items.map((n) => (
              <a
                key={n.id}
                href={n.url ?? "/client"}
                className={`block rounded-xl border px-3 py-2 text-sm ${n.read_at ? "border-zinc-200 dark:border-zinc-800" : "border-black dark:border-zinc-100"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{n.title}</div>
                  <div className="text-xs text-zinc-500">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{n.body}</div>
              </a>
            ))
          )}
        </div>
      </section>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
