"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function NavItem({
    href,
    label,
}: {
    href: string;
    label: string;
}) {
    const pathname = usePathname();
    const active =
        pathname === href || pathname.startsWith(`${href}/`);

    const baseClasses =
        "rounded-lg px-3 py-2 text-sm font-medium transition";
    const activeClasses =
        "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900";
    const inactiveClasses =
        "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50";

    const className =
        baseClasses + " " + (active ? activeClasses : inactiveClasses);

    return (
        <Link href={href} className={className}>
            {label}
        </Link>
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

    if (checking) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-black dark:text-zinc-400">
                Проверяю доступ к кабинету нутрициолога...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
            <div className="mx-auto flex min-h-screen max-w-6xl gap-6 px-4 py-8 sm:px-8">
                <aside className="w-64 shrink-0 space-y-4 border-r border-zinc-200 pr-4 dark:border-zinc-800">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            Кабинет нутрициолога
                        </h1>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Управление базой блюд, рационов и клиентов
                        </p>
                    </div>

                    <nav className="flex flex-col gap-1">
                        <NavItem href="/nutritionist/profile"
                            label="Мой профиль"
                        />
                        <NavItem
                            href="/nutritionist/dishes"
                            label="Мои блюда"
                        />
                        <NavItem
                            href="/nutritionist/menus"
                            label="Рационы"
                        />
                        <NavItem
                            href="/nutritionist/clients"
                            label="Клиенты"
                        />
                       
                     
                    </nav>

                    <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-500">
                        Клиентский режим доступен в разделе{" "}
                        <span className="font-medium">/client</span>.
                    </p>

                    <button
                        type="button"
                        onClick={async () => {
                            await supabase.auth.signOut();
                            router.replace("/auth");
                        }}
                        className="mt-4 rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                        Выйти
                    </button>
                </aside>

                <main className="flex-1 pb-10">{children}</main>
            </div>
        </div>
    );
}
