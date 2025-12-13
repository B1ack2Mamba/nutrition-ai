"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "client" | "nutritionist";

const NUTRITIONIST_INVITE_CODE =
    process.env.NEXT_PUBLIC_NUTRITIONIST_INVITE_CODE;

export default function AuthPage() {
    const router = useRouter();

    const [mode, setMode] = useState<"login" | "signup">("signup");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [role, setRole] = useState<Role>("client");
    const [inviteCode, setInviteCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (!email || !password) {
                setError("Укажи email и пароль");
                return;
            }

            if (mode === "signup") {
                // если хотят зарегистрироваться как нутрициолог — проверяем код
                if (role === "nutritionist") {
                    if (!NUTRITIONIST_INVITE_CODE) {
                        setError(
                            "Код доступа для нутрициологов не настроен. Свяжись с администратором.",
                        );
                        return;
                    }
                    if (inviteCode.trim() !== NUTRITIONIST_INVITE_CODE) {
                        setError("Неверный код доступа нутрициолога.");
                        return;
                    }
                }

                // Регистрация
                const {
                    data: { user },
                    error: signUpError,
                } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (signUpError) {
                    setError(signUpError.message);
                    return;
                }
                if (!user) {
                    setError("Не удалось создать пользователя");
                    return;
                }

                // Создать профиль с ролью
                const { error: profileError } = await supabase.from("profiles").insert({
                    id: user.id,
                    role,
                    full_name: fullName || null,
                });

                if (profileError) {
                    setError(profileError.message);
                    return;
                }

                // Редирект по роли
                if (role === "nutritionist") {
                    router.push("/nutritionist/dishes");
                } else {
                    router.push("/client/menus");
                }
            } else {
                // Логин
                const {
                    data: { user },
                    error: signInError,
                } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (signInError) {
                    setError(signInError.message);
                    return;
                }
                if (!user) {
                    setError("Не удалось войти");
                    return;
                }

                // Получаем профиль и читаем роль
                const { data: profile, error: profileError } = await supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single();

                if (profileError || !profile) {
                    setError("Профиль не найден. Обратись к администратору.");
                    return;
                }

                if (profile.role === "nutritionist") {
                    router.push("/nutritionist/dishes");
                } else {
                    router.push("/client/menus");
                }
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Nutrition AI — вход
                </h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {mode === "signup"
                        ? "Создай аккаунт и выбери роль."
                        : "Войди в свой аккаунт."}
                </p>

                <div className="mt-4 flex gap-2 rounded-full bg-zinc-100 p-1 text-xs dark:bg-zinc-900">
                    <button
                        type="button"
                        onClick={() => setMode("login")}
                        className={`flex-1 rounded-full py-1.5 ${mode === "login"
                                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                                : "text-zinc-500"
                            }`}
                    >
                        Вход
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("signup")}
                        className={`flex-1 rounded-full py-1.5 ${mode === "signup"
                                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                                : "text-zinc-500"
                            }`}
                    >
                        Регистрация
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm">
                    <label className="flex flex-col gap-1">
                        Email
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        Пароль
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="rounded-lg border border-зinc-300 bg-transparent px-3 py-2 outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                        />
                    </label>

                    {mode === "signup" && (
                        <>
                            <label className="flex flex-col gap-1">
                                Имя (опционально)
                                <input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="rounded-lg border border-зinc-300 bg-transparent px-3 py-2 outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                                />
                            </label>

                            <fieldset className="mt-2 space-y-1 rounded-lg border border-зinc-200 p-3 dark:border-зinc-700">
                                <legend className="px-1 text-xs font-medium text-зinc-500 dark:text-зinc-400">
                                    Роль
                                </legend>
                                <div className="flex flex-col gap-1 text-xs">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="role"
                                            value="client"
                                            checked={role === "client"}
                                            onChange={() => setRole("client")}
                                        />
                                        Клиент
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="role"
                                            value="nutritionist"
                                            checked={role === "nutritionist"}
                                            onChange={() => setRole("nutritionist")}
                                        />
                                        Нутрициолог (только по коду)
                                    </label>
                                </div>
                            </fieldset>

                            {role === "nutritionist" && (
                                <label className="flex flex-col gap-1">
                                    Код доступа нутрициолога
                                    <input
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value)}
                                        className="rounded-lg border border-зinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-зinc-900 dark:border-зinc-700 dark:focus:border-зinc-200"
                                        placeholder="Введи код, который выдал администратор"
                                    />
                                    <p className="mt-1 text-[11px] text-зinc-500 dark:text-зinc-500">
                                        Без корректного кода аккаунт будет создан только как
                                        клиентский.
                                    </p>
                                </label>
                            )}
                        </>
                    )}

                    {error && (
                        <p className="mt-1 text-xs text-red-500">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
                    >
                        {loading
                            ? "Обрабатываю..."
                            : mode === "signup"
                                ? "Зарегистрироваться"
                                : "Войти"}
                    </button>

        </form>
            </div>
        </main>
    );
}
