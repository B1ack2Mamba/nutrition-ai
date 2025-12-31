"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // В dev очень часто мешает старый SW (кэширует и кажется, что "не обновляется").
    // Поэтому в development мы снимаем регистрации и чистим кэши.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => undefined);

      // чистим Cache Storage (если есть)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyWin: any = window as any;
      if (anyWin?.caches?.keys) {
        anyWin.caches
          .keys()
          .then((keys: string[]) => Promise.all(keys.map((k) => anyWin.caches.delete(k))))
          .catch(() => undefined);
      }

      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // ignore (user might have blocked it, or SW may fail on some hosts)
      }
    };

    register();
  }, []);

  return null;
}
