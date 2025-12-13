"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Menu, loadMenusFromStorage } from "@/lib/menus";
import {
  Client,
  loadClientsFromStorage,
} from "@/lib/clients";

function formatGoal(goal?: Menu["goal"]): string {
  switch (goal) {
    case "fat_loss":
      return "Похудение";
    case "muscle_gain":
      return "Набор мышц";
    case "maintenance":
      return "Поддержание";
    case "energy":
      return "Энергия / тонус";
    default:
      return "Рацион";
  }
}

export default function ClientMenusPage() {
  const [clients] = useState<Client[]>(() =>
    loadClientsFromStorage(),
  );
  const menus: Menu[] = useMemo(
    () => loadMenusFromStorage(),
    [],
  );

  const activeClient: Client | null =
    clients.length > 0 ? clients[0] : null;

  if (!activeClient) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Мой рацион
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Пока ваш профиль не создан или вам ещё не назначили рацион.
          Обратитесь к вашему специалисту.
        </p>
      </div>
    );
  }

  const currentMenu = activeClient.currentMenuId
    ? menus.find((m) => m.id === activeClient.currentMenuId) || null
    : null;

  const clientMenus = menus.filter((m) =>
    [
      activeClient.currentMenuId,
      ...(activeClient.activeMenuIds ?? []),
    ].includes(m.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          Мой рацион
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Клиент:{" "}
          <span className="font-medium">{activeClient.name}</span>
        </p>
      </header>

      {currentMenu ? (
        <section className="space-y-3">
          <div className="rounded-2xl border border-green-300 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-950/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">
              Рекомендованный рацион
            </p>
            <p className="mt-1 text-sm font-medium text-green-900 dark:text-green-100">
              {currentMenu.title}
            </p>
            <p className="mt-1 text-xs text-green-800 dark:text-green-300">
              На {currentMenu.daysCount} дней
              {currentMenu.targetCalories
                ? ` • ~${currentMenu.targetCalories} ккал/день`
                : ""}
            </p>
            <Link
              href={`/client/menus/${currentMenu.id}`}
              className="mt-2 inline-flex text-xs font-medium text-green-800 underline underline-offset-4 dark:text-green-300"
            >
              Открыть план&nbsp;→
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Вам пока не назначен основной рацион.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Все ваши доступные рационы
        </h3>
        {clientMenus.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Нутрициолог ещё не назначил вам ни одного рациона.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {clientMenus.map((menu) => (
              <article
                key={menu.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="space-y-1">
                  <h4 className="text-base font-semibold">
                    {menu.title}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatGoal(menu.goal)} • {menu.daysCount} дней
                    {menu.targetCalories
                      ? ` • ~${menu.targetCalories} ккал/день`
                      : ""}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-зinc-500 dark:text-зinc-400">
                  <span>
                    Назначен:{" "}
                    {new Date(menu.createdAt).toLocaleDateString()}
                  </span>
                  <Link
                    href={`/client/menus/${menu.id}`}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-зinc-200 dark:hover:bg-зinc-900"
                  >
                    Открыть
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
