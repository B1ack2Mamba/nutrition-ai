"use client";

import Link from "next/link";

export default function HomePage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black px-6">
            <div className="w-full max-w-md space-y-8 text-center">
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Nutrition AI
                </h1>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                    Выберите режим работы
                </p>

                <div className="grid gap-4">
                    <Link
                        href="/nutritionist/dishes"
                        className="block rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                            Я нутрициолог
                        </h2>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Управление блюдами и создание рационов
                        </p>
                    </Link>

                    <Link
                        href="/client/menus"
                        className="block rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-зinc-900 dark:hover:bg-zinc-800"
                    >
                        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                            Я клиент
                        </h2>
                        <p className="mt-1 text-sm text-зinc-600 dark:text-зinc-400">
                            Просмотр ваших назначенных рационов
                        </p>
                    </Link>
                </div>
            </div>
        </main>
    );
}
