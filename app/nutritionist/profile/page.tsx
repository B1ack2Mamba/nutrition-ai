"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type BasicProfile = {
    id: string;
    full_name: string | null;
};

type NProfile = {
    user_id: string;
    headline: string | null;
    badges: string | null;
    about: string | null;
    regalia: string | null;
    education: string | null;
    experience: string | null;
    services: string | null;
    contacts: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

type StorageItem = {
    name: string;
    path: string;
    updated_at?: string | null;
    created_at?: string | null;
    size?: number | null;
    mimetype?: string | null;
};

type DocKind = "certificate" | "diploma" | "other";
type FolderKind = "certificates" | "diplomas" | "other" | "portfolio" | "root";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeFileName(name: string): string {
    return name.replace(/[^\w.\-()]+/g, "_");
}

function formatDateTime(d: string | null | undefined): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleString();
}

function isAuthRefreshTokenErrorMessage(msg: string) {
    const m = msg.toLowerCase();
    return m.includes("refresh token") || m.includes("invalid refresh token");
}

function splitBadges(text: string | null | undefined): string[] {
    if (!text) return [];
    return text
        .split(/[,;\n]/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
}

function extOf(name: string): string {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isImageByName(name: string): boolean {
    const e = extOf(name);
    return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(e);
}

function isPdfByName(name: string): boolean {
    return extOf(name) === "pdf";
}

function publicUrl(bucket: string, path: string): string {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
}

async function listFolder(bucket: string, folderPath: string, limit = 200): Promise<StorageItem[]> {
    const { data, error } = await supabase.storage.from(bucket).list(folderPath, {
        limit,
        offset: 0,
        sortBy: { column: "updated_at", order: "desc" },
    });

    if (error) return [];

    return (data ?? [])
        .filter((x) => !!x?.name && x.name !== ".emptyFolderPlaceholder")
        .map((x) => {
            const meta = isRecord(x.metadata) ? x.metadata : {};
            const size = typeof meta.size === "number" ? meta.size : null;
            const mimetype = typeof meta.mimetype === "string" ? meta.mimetype : null;

            return {
                name: x.name,
                path: folderPath ? `${folderPath}/${x.name}` : x.name,
                updated_at: typeof x.updated_at === "string" ? x.updated_at : null,
                created_at: typeof x.created_at === "string" ? x.created_at : null,
                size,
                mimetype,
            };
        });
}

async function removeAllInFolder(bucket: string, folderPath: string) {
    const items = await listFolder(bucket, folderPath, 200);
    if (!items.length) return;
    const paths = items.map((i) => i.path);
    await supabase.storage.from(bucket).remove(paths);
}

function bytesToHuman(n: number | null | undefined): string {
    if (!n || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${Math.round(v * 10) / 10} ${units[i]}`;
}

function hasText(v: string | null | undefined) {
    return !!v && v.trim().length > 0;
}

export default function NutritionistProfilePage() {
    const BUCKET_BG = "nutritionist_backgrounds";
    const BUCKET_DOCS = "nutritionist_documents";

    const [loading, setLoading] = useState(true);
    const [fatal, setFatal] = useState<string | null>(null);

    const [userId, setUserId] = useState<string | null>(null);
    const [basic, setBasic] = useState<BasicProfile | null>(null);

    // cover + avatar
    const [cover, setCover] = useState<StorageItem | null>(null);
    const [avatar, setAvatar] = useState<StorageItem | null>(null);

    // docs + portfolio
    const [docsRaw, setDocsRaw] = useState<StorageItem[]>([]);
    const [portfolioRaw, setPortfolioRaw] = useState<StorageItem[]>([]);
    const [docsHint, setDocsHint] = useState<string | null>(null);

    // uploads (hidden in modal)
    const coverInputRef = useRef<HTMLInputElement | null>(null);
    const avatarInputRef = useRef<HTMLInputElement | null>(null);
    const docInputRef = useRef<HTMLInputElement | null>(null);
    const portfolioInputRef = useRef<HTMLInputElement | null>(null);

    const [uploadKind, setUploadKind] = useState<DocKind>("certificate");
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const [portfolioFile, setPortfolioFile] = useState<File | null>(null);
    const [portfolioUploading, setPortfolioUploading] = useState(false);

    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // text profile
    const [nprof, setNprof] = useState<NProfile | null>(null);
    const [editNprof, setEditNprof] = useState(false);
    const [savingNprof, setSavingNprof] = useState(false);
    const [nprofHint, setNprofHint] = useState<string | null>(null);

    // manage modal
    const [manageOpen, setManageOpen] = useState(false);

    const badgeTokens = useMemo(() => splitBadges(nprof?.badges), [nprof?.badges]);

    const reloadAll = useCallback(async (uid: string) => {
        // cover/avatar: берём самый свежий файл в папке
        const [covers, avatars] = await Promise.all([
            listFolder(BUCKET_BG, `${uid}/cover`, 20),
            listFolder(BUCKET_BG, `${uid}/avatar`, 20),
        ]);
        setCover(covers[0] ?? null);
        setAvatar(avatars[0] ?? null);

        // документы: старые файлы могли лежать прямо в `${uid}/...` (без подпапок) — покажем в "Другое"
        const [certs, diplomas, other, root] = await Promise.all([
            listFolder(BUCKET_DOCS, `${uid}/certificates`, 200),
            listFolder(BUCKET_DOCS, `${uid}/diplomas`, 200),
            listFolder(BUCKET_DOCS, `${uid}/other`, 200),
            listFolder(BUCKET_DOCS, `${uid}`, 200),
        ]);

        const rootFiles = root.filter((x) => extOf(x.name).length > 0);
        const knownPaths = new Set<string>([...certs, ...diplomas, ...other].map((x) => x.path));
        const rootFiltered = rootFiles.filter((x) => !knownPaths.has(x.path));

        setDocsRaw([...certs, ...diplomas, ...other, ...rootFiltered]);

        // portfolio
        const portfolio = await listFolder(BUCKET_DOCS, `${uid}/portfolio`, 500);
        setPortfolioRaw(portfolio);

        setDocsHint(null);
    }, []);

    const reloadTextProfile = useCallback(async (uid: string) => {
        setNprofHint(null);
        const { data, error } = await supabase
            .from("nutritionist_profiles")
            .select("*")
            .eq("user_id", uid)
            .limit(1);

        if (error) {
            setNprofHint(`Не удалось загрузить текст профиля: ${error.message}`);
            setNprof({
                user_id: uid,
                headline: "",
                badges: "",
                about: "",
                regalia: "",
                education: "",
                experience: "",
                services: "",
                contacts: "",
            });
            return;
        }

        const row = (data?.[0] ?? null) as NProfile | null;
        setNprof(
            row ?? {
                user_id: uid,
                headline: "",
                badges: "",
                about: "",
                regalia: "",
                education: "",
                experience: "",
                services: "",
                contacts: "",
            }
        );
    }, []);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setFatal(null);

            try {
                const { data, error } = await supabase.auth.getUser();
                if (error) {
                    if (isAuthRefreshTokenErrorMessage(error.message)) {
                        await supabase.auth.signOut();
                        setFatal("Сессия истекла. Войдите снова.");
                        setLoading(false);
                        return;
                    }
                    setFatal(error.message);
                    setLoading(false);
                    return;
                }

                const user = data.user;
                if (!user) {
                    setFatal("Нет авторизации");
                    setLoading(false);
                    return;
                }

                setUserId(user.id);

                const { data: prof, error: profErr } = await supabase
                    .from("profiles")
                    .select("id, full_name")
                    .eq("id", user.id)
                    .single();

                if (!profErr && prof) setBasic(prof as BasicProfile);

                await Promise.all([reloadAll(user.id), reloadTextProfile(user.id)]);
                setLoading(false);
            } catch (e) {
                setFatal(e instanceof Error ? e.message : String(e));
                setLoading(false);
            }
        };

        load();
    }, [reloadAll, reloadTextProfile]);

    const groupedDocs = useMemo(() => {
        const by: Record<FolderKind, StorageItem[]> = {
            certificates: [],
            diplomas: [],
            other: [],
            portfolio: [],
            root: [],
        };

        for (const d of docsRaw) {
            const parts = d.path.split("/");
            const folder = (parts[1] ?? "root") as FolderKind;

            if (folder === "certificates") by.certificates.push(d);
            else if (folder === "diplomas") by.diplomas.push(d);
            else if (folder === "other") by.other.push(d);
            else by.other.push(d);
        }

        return by;
    }, [docsRaw]);

    const certImages = useMemo(
        () => groupedDocs.certificates.filter((x) => isImageByName(x.name)),
        [groupedDocs.certificates]
    );
    const certFiles = useMemo(
        () => groupedDocs.certificates.filter((x) => !isImageByName(x.name)),
        [groupedDocs.certificates]
    );

    const diplomaImages = useMemo(
        () => groupedDocs.diplomas.filter((x) => isImageByName(x.name)),
        [groupedDocs.diplomas]
    );
    const diplomaFiles = useMemo(
        () => groupedDocs.diplomas.filter((x) => !isImageByName(x.name)),
        [groupedDocs.diplomas]
    );

    const pickUploadFolder = (k: DocKind): string => {
        if (!userId) return "";
        if (k === "certificate") return `${userId}/certificates`;
        if (k === "diploma") return `${userId}/diplomas`;
        return `${userId}/other`;
    };

    const onPickUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        setUploadFile(f);
    };

    const onPickPortfolioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        setPortfolioFile(f);
    };

    const uploadDoc = async () => {
        if (!userId) return;
        if (!uploadFile) {
            setDocsHint("Выбери файл");
            return;
        }

        setUploading(true);
        setDocsHint(null);

        try {
            const folder = pickUploadFolder(uploadKind);
            const baseName = uploadTitle.trim()
                ? safeFileName(uploadTitle.trim())
                : safeFileName(uploadFile.name.replace(/\.[^.]+$/, ""));
            const ext = extOf(uploadFile.name);
            const finalName = ext ? `${baseName}.${ext}` : baseName;

            const path = `${folder}/${Date.now()}_${finalName}`;

            const up = await supabase.storage.from(BUCKET_DOCS).upload(path, uploadFile, {
                cacheControl: "3600",
                upsert: false,
                contentType: uploadFile.type || undefined,
            });

            if (up.error) {
                setDocsHint(`Не удалось загрузить файл: ${up.error.message}`);
                return;
            }

            setUploadTitle("");
            setUploadFile(null);
            if (docInputRef.current) docInputRef.current.value = "";
            await reloadAll(userId);
        } finally {
            setUploading(false);
        }
    };

    const uploadPortfolio = async () => {
        if (!userId) return;
        if (!portfolioFile) return;

        setPortfolioUploading(true);
        setDocsHint(null);

        try {
            const folder = `${userId}/portfolio`;
            const base = safeFileName(portfolioFile.name);
            const path = `${folder}/${Date.now()}_${base}`;

            const up = await supabase.storage.from(BUCKET_DOCS).upload(path, portfolioFile, {
                cacheControl: "3600",
                upsert: false,
                contentType: portfolioFile.type || undefined,
            });

            if (up.error) {
                setDocsHint(`Не удалось загрузить фото в портфолио: ${up.error.message}`);
                return;
            }

            setPortfolioFile(null);
            if (portfolioInputRef.current) portfolioInputRef.current.value = "";
            await reloadAll(userId);
        } finally {
            setPortfolioUploading(false);
        }
    };

    const removeItem = async (bucket: string, item: StorageItem) => {
        if (!userId) return;
        const ok = confirm("Удалить файл?");
        if (!ok) return;

        const rm = await supabase.storage.from(bucket).remove([item.path]);
        if (rm.error) {
            setDocsHint(`Не удалось удалить: ${rm.error.message}`);
            return;
        }

        await reloadAll(userId);
    };

    const openItem = (bucket: string, item: StorageItem) => {
        const url = publicUrl(bucket, item.path);
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const uploadCover = async (file: File) => {
        if (!userId) return;
        setDocsHint(null);

        const folder = `${userId}/cover`;
        await removeAllInFolder(BUCKET_BG, folder);

        const path = `${folder}/${Date.now()}_${safeFileName(file.name)}`;
        const up = await supabase.storage.from(BUCKET_BG).upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
        });

        if (up.error) {
            setDocsHint(`Не удалось загрузить фон: ${up.error.message}`);
            return;
        }

        await reloadAll(userId);
    };

    const uploadAvatar = async (file: File) => {
        if (!userId) return;
        setDocsHint(null);

        const folder = `${userId}/avatar`;
        await removeAllInFolder(BUCKET_BG, folder);

        const path = `${folder}/${Date.now()}_${safeFileName(file.name)}`;
        const up = await supabase.storage.from(BUCKET_BG).upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
        });

        if (up.error) {
            setDocsHint(`Не удалось загрузить аватар: ${up.error.message}`);
            return;
        }

        await reloadAll(userId);
    };

    const saveNprof = async () => {
        if (!userId || !nprof) return;

        setSavingNprof(true);
        setNprofHint(null);

        try {
            const payload: NProfile = {
                ...nprof,
                user_id: userId,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase.from("nutritionist_profiles").upsert(payload, { onConflict: "user_id" });
            if (error) {
                setNprofHint(error.message);
                return;
            }

            setEditNprof(false);
            await reloadTextProfile(userId);
        } finally {
            setSavingNprof(false);
        }
    };

    if (loading) return <div className="text-sm text-zinc-500">Загружаю…</div>;
    if (fatal) return <div className="text-sm text-red-500">{fatal}</div>;

    const coverUrl = cover ? publicUrl(BUCKET_BG, cover.path) : null;
    const avatarUrl = avatar ? publicUrl(BUCKET_BG, avatar.path) : null;

    const hasAnyPersonal =
        hasText(nprof?.about) ||
        hasText(nprof?.regalia) ||
        hasText(nprof?.education) ||
        hasText(nprof?.experience) ||
        hasText(nprof?.services) ||
        hasText(nprof?.contacts);

    return (
        <div className="space-y-6">
            {/* marquee keyframes */}
            <style jsx>{`
        @keyframes marquee-right {
          from {
            transform: translateX(-50%);
          }
          to {
            transform: translateX(0%);
          }
        }
      `}</style>

            {/* lightbox */}
            {lightboxUrl ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                    onClick={() => setLightboxUrl(null)}
                    role="button"
                    tabIndex={0}
                >
                    <img src={lightboxUrl} alt="preview" className="max-h-[90vh] max-w-[92vw] rounded-xl bg-white" />
                </div>
            ) : null}

            {/* manage modal (all add functions hidden here) */}
            {manageOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                            <div>
                                <div className="text-sm font-semibold">Управление профилем</div>
                                <div className="mt-0.5 text-xs text-zinc-500">Здесь спрятаны все загрузки: фон/аватар/доки/портфолио.</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setManageOpen(false)}
                                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                            >
                                Закрыть
                            </button>
                        </div>

                        <div className="grid gap-4 p-5 lg:grid-cols-2">
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                                    <div className="text-sm font-semibold">Фон и аватар</div>

                                    <div className="mt-3 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-xs text-zinc-600">Фон (cover)</div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    ref={coverInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0] ?? null;
                                                        if (f) void uploadCover(f);
                                                        e.currentTarget.value = "";
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => coverInputRef.current?.click()}
                                                    className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                                                >
                                                    Загрузить
                                                </button>
                                                {cover ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void removeItem(BUCKET_BG, cover)}
                                                        className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                                    >
                                                        Удалить
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-xs text-zinc-600">Аватар</div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    ref={avatarInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0] ?? null;
                                                        if (f) void uploadAvatar(f);
                                                        e.currentTarget.value = "";
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => avatarInputRef.current?.click()}
                                                    className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                                                >
                                                    Загрузить
                                                </button>
                                                {avatar ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void removeItem(BUCKET_BG, avatar)}
                                                        className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                                    >
                                                        Удалить
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>

                                        {docsHint ? (
                                            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3 text-xs text-zinc-700">
                                                {docsHint}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                                    <div className="text-sm font-semibold">Добавить документ</div>

                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <label className="text-xs">
                                            Название (опц.)
                                            <input
                                                value={uploadTitle}
                                                onChange={(e) => setUploadTitle(e.target.value)}
                                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                                                placeholder="Сертификат 2024"
                                            />
                                        </label>

                                        <label className="text-xs">
                                            Тип
                                            <select
                                                value={uploadKind}
                                                onChange={(e) => setUploadKind(e.target.value as DocKind)}
                                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                                            >
                                                <option value="certificate">Сертификат</option>
                                                <option value="diploma">Диплом</option>
                                                <option value="other">Другое</option>
                                            </select>
                                        </label>
                                    </div>

                                    <div className="mt-3 flex items-center gap-2">
                                        <input
                                            ref={docInputRef}
                                            type="file"
                                            accept=".pdf,image/*"
                                            onChange={onPickUploadFile}
                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => void uploadDoc()}
                                            disabled={!uploadFile || uploading}
                                            className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                                        >
                                            {uploading ? "..." : "Добавить"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                                    <div className="text-sm font-semibold">Добавить фото в портфолио</div>
                                    <div className="mt-3 flex items-center gap-2">
                                        <input
                                            ref={portfolioInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={onPickPortfolioFile}
                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => void uploadPortfolio()}
                                            disabled={!portfolioFile || portfolioUploading}
                                            className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                                        >
                                            {portfolioUploading ? "..." : "Добавить"}
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold">Личная информация</div>
                                            <div className="mt-1 text-xs text-zinc-500">
                                                Редактирование текста — кнопка «Редактировать» на карточке профиля.
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setEditNprof(true)}
                                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                                        >
                                            Открыть редактор
                                        </button>
                                    </div>

                                    {nprofHint ? (
                                        <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-white p-3 text-xs text-zinc-700">
                                            {nprofHint}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-zinc-200 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setManageOpen(false);
                                    if (userId) void reloadAll(userId);
                                }}
                                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                            >
                                Готово
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* COVER */}
            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="relative h-44 w-full bg-zinc-100">
                    {coverUrl ? (
                        <img src={coverUrl} alt="cover" className="h-full w-full object-cover" />
                    ) : (
                        <div className="h-full w-full bg-gradient-to-r from-zinc-200 to-zinc-100" />
                    )}

                    {/* one button in the corner */}
                    <div className="absolute right-3 top-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setManageOpen(true)}
                            className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                            title="Управление"
                        >
                            ⚙ Управление
                        </button>
                    </div>
                </div>

                {/* AVATAR + RIGHT PANEL */}
                <div className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                        <div className="relative -mt-14 shrink-0">
                            <div className="h-28 w-28 overflow-hidden rounded-2xl border-4 border-white bg-zinc-200 shadow-sm">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-zinc-600">
                                        {(basic?.full_name?.[0] ?? "N").toUpperCase()}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="truncate text-xl font-semibold">{basic?.full_name ?? userId ?? "Профиль"}</div>

                                    {nprof?.headline?.trim() ? (
                                        <div className="mt-1 text-sm text-zinc-600">{nprof.headline}</div>
                                    ) : (
                                        <div className="mt-1 text-sm text-zinc-400">Добавь заголовок: кто ты и чем полезен.</div>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setEditNprof((v) => !v)}
                                    className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                                >
                                    {editNprof ? "Скрыть" : "Редактировать"}
                                </button>
                            </div>

                            {badgeTokens.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {badgeTokens.map((t) => (
                                        <span
                                            key={t}
                                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            ) : null}

                            {docsHint ? (
                                <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-700">
                                    {docsHint}
                                </div>
                            ) : null}

                            {nprofHint ? (
                                <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-700">
                                    {nprofHint}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </section>

            {/* EDIT TEXT PROFILE */}
            {editNprof && nprof ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold">Личная информация</div>
                            <div className="mt-1 text-xs text-zinc-500">
                                Бейджи — через запятую или новую строку (они будут рядом с именем).
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => void saveNprof()}
                            disabled={savingNprof}
                            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                        >
                            {savingNprof ? "Сохраняю..." : "Сохранить"}
                        </button>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <label className="text-xs">
                            Заголовок (под именем)
                            <input
                                value={nprof.headline ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, headline: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                                placeholder="Нутрициолог · коррекция веса · ЖКТ · спортпит"
                            />
                        </label>

                        <label className="text-xs">
                            Бейджи
                            <textarea
                                rows={2}
                                value={nprof.badges ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, badges: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                                placeholder={"7 лет практики, Клинический нутрициолог\nЧлен ассоциации ..."}
                            />
                        </label>

                        <label className="text-xs">
                            Обо мне
                            <textarea
                                rows={5}
                                value={nprof.about ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, about: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                            />
                        </label>

                        <label className="text-xs">
                            Регалии
                            <textarea
                                rows={5}
                                value={nprof.regalia ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, regalia: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                                placeholder={"— Сертификат ...\n— Лицензия ...\n— Премия ..."}
                            />
                        </label>

                        <label className="text-xs">
                            Образование
                            <textarea
                                rows={4}
                                value={nprof.education ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, education: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                            />
                        </label>

                        <label className="text-xs">
                            Опыт
                            <textarea
                                rows={4}
                                value={nprof.experience ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, experience: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                            />
                        </label>

                        <label className="text-xs">
                            Чем помогаю (услуги)
                            <textarea
                                rows={4}
                                value={nprof.services ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, services: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                            />
                        </label>

                        <label className="text-xs">
                            Контакты
                            <textarea
                                rows={4}
                                value={nprof.contacts ?? ""}
                                onChange={(e) => setNprof((p) => (p ? { ...p, contacts: e.target.value } : p))}
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                                placeholder={"Telegram: @...\nInstagram: ...\nСайт: ..."}
                            />
                        </label>
                    </div>
                </section>
            ) : null}

            {/* PERSONAL VIEW: показываем только если есть хоть что-то, иначе ничего (чтобы не было пустого окна) */}
            {hasAnyPersonal ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <div className="grid gap-4 lg:grid-cols-2">
                        {hasText(nprof?.about) ? (
                            <div>
                                <div className="text-xs font-semibold text-zinc-700">Обо мне</div>
                                <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{nprof?.about}</div>
                            </div>
                        ) : null}

                        <div className="space-y-4">
                            {hasText(nprof?.regalia) ? (
                                <div>
                                    <div className="text-xs font-semibold text-zinc-700">Регалии</div>
                                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{nprof?.regalia}</div>
                                </div>
                            ) : null}

                            {hasText(nprof?.education) ? (
                                <div>
                                    <div className="text-xs font-semibold text-zinc-700">Образование</div>
                                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{nprof?.education}</div>
                                </div>
                            ) : null}

                            {hasText(nprof?.experience) ? (
                                <div>
                                    <div className="text-xs font-semibold text-zinc-700">Опыт</div>
                                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{nprof?.experience}</div>
                                </div>
                            ) : null}

                            {hasText(nprof?.services) ? (
                                <div>
                                    <div className="text-xs font-semibold text-zinc-700">Чем помогаю</div>
                                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{nprof?.services}</div>
                                </div>
                            ) : null}

                            {hasText(nprof?.contacts) ? (
                                <div>
                                    <div className="text-xs font-semibold text-zinc-700">Контакты</div>
                                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{nprof?.contacts}</div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </section>
            ) : null}

            {/* CERTS + DIPLOMAS as slow-moving images, no titles */}
            {(certImages.length > 0 || diplomaImages.length > 0 || certFiles.length > 0 || diplomaFiles.length > 0) ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <div className="text-sm font-semibold">Сертификаты и дипломы</div>
                    <div className="mt-1 text-xs text-zinc-500">
                        Только фото, без названий. Двигаются автоматически слева → направо.
                    </div>

                    <div className="mt-4 space-y-4">
                        <MarqueeImages
                            title="Сертификаты"
                            items={certImages}
                            bucket={BUCKET_DOCS}
                            onPreview={(u) => setLightboxUrl(u)}
                            onDelete={(i) => void removeItem(BUCKET_DOCS, i)}
                        />

                        <MarqueeImages
                            title="Дипломы"
                            items={diplomaImages}
                            bucket={BUCKET_DOCS}
                            onPreview={(u) => setLightboxUrl(u)}
                            onDelete={(i) => void removeItem(BUCKET_DOCS, i)}
                        />

                        {(certFiles.length > 0 || diplomaFiles.length > 0) ? (
                            <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                                <summary className="cursor-pointer select-none text-sm font-semibold">
                                    Файлы (PDF/прочее)
                                    <span className="ml-2 text-xs font-normal text-zinc-500">
                                        (редко нужно — спрятано)
                                    </span>
                                </summary>
                                <div className="mt-4 space-y-3">
                                    {certFiles.length ? (
                                        <DocSection
                                            title="Сертификаты (файлы)"
                                            items={certFiles}
                                            bucket={BUCKET_DOCS}
                                            onOpen={openItem}
                                            onDelete={(i) => void removeItem(BUCKET_DOCS, i)}
                                            onPreview={(url) => setLightboxUrl(url)}
                                            showNames
                                        />
                                    ) : null}

                                    {diplomaFiles.length ? (
                                        <DocSection
                                            title="Дипломы (файлы)"
                                            items={diplomaFiles}
                                            bucket={BUCKET_DOCS}
                                            onOpen={openItem}
                                            onDelete={(i) => void removeItem(BUCKET_DOCS, i)}
                                            onPreview={(url) => setLightboxUrl(url)}
                                            showNames
                                        />
                                    ) : null}
                                </div>
                            </details>
                        ) : null}
                    </div>
                </section>
            ) : null}

            {/* PORTFOLIO GRID */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold">Портфолио</div>
                        <div className="mt-1 text-xs text-zinc-500">Сетка как Instagram (клик → просмотр). Добавление — через ⚙.</div>
                    </div>
                </div>

                {portfolioRaw.length === 0 ? (
                    <div className="mt-3 text-xs text-zinc-500">Пока пусто.</div>
                ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {portfolioRaw.map((p) => {
                            const url = publicUrl(BUCKET_DOCS, p.path);
                            const isImg = isImageByName(p.name);
                            return (
                                <div key={p.path} className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                                    <button
                                        type="button"
                                        className="block w-full"
                                        onClick={() => (isImg ? setLightboxUrl(url) : openItem(BUCKET_DOCS, p))}
                                        title="Открыть"
                                    >
                                        <div className="aspect-square w-full">
                                            {isImg ? (
                                                <img src={url} alt={p.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                                                    {isPdfByName(p.name) ? "PDF" : "FILE"}
                                                </div>
                                            )}
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => void removeItem(BUCKET_DOCS, p)}
                                        className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] text-red-600 opacity-0 shadow-sm transition group-hover:opacity-100"
                                        title="Удалить"
                                    >
                                        Удалить
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* OTHER DOCS LIST (names ok) */}
            {groupedDocs.other.length ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold">Документы</div>
                            <div className="mt-1 text-xs text-zinc-500">Остальные файлы. Добавление — через ⚙.</div>
                        </div>

                        {userId ? (
                            <button
                                type="button"
                                onClick={() => void reloadAll(userId)}
                                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                            >
                                Обновить
                            </button>
                        ) : null}
                    </div>

                    <div className="mt-5 space-y-4">
                        <DocSection
                            title="Другое"
                            items={groupedDocs.other}
                            bucket={BUCKET_DOCS}
                            onOpen={openItem}
                            onDelete={(i) => void removeItem(BUCKET_DOCS, i)}
                            onPreview={(url) => setLightboxUrl(url)}
                            showNames
                        />
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function MarqueeImages(props: {
    title: string;
    items: StorageItem[];
    bucket: string;
    onPreview: (url: string) => void;
    onDelete: (item: StorageItem) => void;
}) {
    const { title, items, bucket, onPreview, onDelete } = props;

    if (!items.length) return null;

    // двойная лента для бесконечного скролла
    const doubled = [...items, ...items];

    return (
        <div>
            <div className="text-xs font-semibold text-zinc-700">{title}</div>

            <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                <div
                    className="flex w-max items-center gap-3 p-3"
                    style={{
                        animation: "marquee-right 70s linear infinite",
                    }}
                >
                    {doubled.map((d, idx) => {
                        const url = publicUrl(bucket, d.path);
                        return (
                            <div
                                key={`${d.path}-${idx}`}
                                className="group relative h-28 w-44 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white p-2"
                                title=""
                            >
                                <button
                                    type="button"
                                    onClick={() => onPreview(url)}
                                    className="block h-full w-full"
                                    aria-label="Открыть"
                                >
                                    <img src={url} alt="" className="h-full w-full object-contain" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => onDelete(d)}
                                    className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] text-red-600 opacity-0 shadow-sm transition group-hover:opacity-100"
                                    title="Удалить"
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function DocSection(props: {
    title: string;
    items: StorageItem[];
    bucket: string;
    onOpen: (bucket: string, item: StorageItem) => void;
    onDelete: (item: StorageItem) => void;
    onPreview: (url: string) => void;
    showNames?: boolean;
}) {
    const { title, items, bucket, onOpen, onDelete, onPreview, showNames } = props;

    return (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold">{title}</div>

            {items.length === 0 ? (
                <div className="mt-2 text-xs text-zinc-500">Пусто.</div>
            ) : (
                <div className="mt-3 space-y-2">
                    {items.map((d) => {
                        const url = publicUrl(bucket, d.path);
                        const isImg = isImageByName(d.name);

                        return (
                            <div
                                key={d.path}
                                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="h-12 w-12 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                                        {isImg ? (
                                            <button type="button" onClick={() => onPreview(url)} className="block h-full w-full">
                                                <img src={url} alt="" className="h-full w-full object-cover" />
                                            </button>
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[11px] text-zinc-600">
                                                {isPdfByName(d.name) ? "PDF" : "FILE"}
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        {showNames ? (
                                            <div className="truncate text-sm font-semibold">{d.name}</div>
                                        ) : null}
                                        <div className="mt-1 text-[11px] text-zinc-500">
                                            {d.mimetype ?? "—"} · {bytesToHuman(d.size)} · {formatDateTime(d.updated_at ?? d.created_at ?? null)}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(bucket, d)}
                                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                                    >
                                        Открыть
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onDelete(d)}
                                        className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
