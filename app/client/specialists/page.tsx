"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* ===================== Types ===================== */

type LinkRow = {
  id: string;
  client_id: string;
  nutritionist_id: string;
  status: "pending" | "approved" | "rejected" | string;
  client_note: string | null;
  created_at: string;
};

type NutritionistBasic = {
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

/* ===================== Helpers ===================== */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
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

/* ===================== Page ===================== */

export default function ClientSpecialistsPage() {
  const BUCKET_BG = "nutritionist_backgrounds";
  const BUCKET_DOCS = "nutritionist_documents";

  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [nutMap, setNutMap] = useState<Record<string, NutritionistBasic>>({});
  const nutMapRef = useRef<Record<string, NutritionistBasic>>({});

  const [selectedNutId, setSelectedNutId] = useState<string | null>(null);

  const [nutBasic, setNutBasic] = useState<NutritionistBasic | null>(null);
  const [nutProfile, setNutProfile] = useState<NProfile | null>(null);

  const [cover, setCover] = useState<StorageItem | null>(null);
  const [avatar, setAvatar] = useState<StorageItem | null>(null);

  const [certs, setCerts] = useState<StorageItem[]>([]);
  const [diplomas, setDiplomas] = useState<StorageItem[]>([]);
  const [portfolio, setPortfolio] = useState<StorageItem[]>([]);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const badgeTokens = useMemo(() => splitBadges(nutProfile?.badges), [nutProfile?.badges]);

  const loadNutritionistDetails = useCallback(
    async (nid: string) => {
      const fallbackName = nutMapRef.current[nid]?.full_name ?? null;

      const [basicRes, profRes, covers, avatars, certsRaw, diplomasRaw, portfolioRaw] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("id", nid).single(),
        supabase.from("nutritionist_profiles").select("*").eq("user_id", nid).limit(1),
        listFolder(BUCKET_BG, `${nid}/cover`, 10),
        listFolder(BUCKET_BG, `${nid}/avatar`, 10),
        listFolder(BUCKET_DOCS, `${nid}/certificates`, 300),
        listFolder(BUCKET_DOCS, `${nid}/diplomas`, 300),
        listFolder(BUCKET_DOCS, `${nid}/portfolio`, 500),
      ]);

      const basic =
        !basicRes.error && basicRes.data
          ? (basicRes.data as NutritionistBasic)
          : ({ id: nid, full_name: fallbackName } as NutritionistBasic);

      const npRow = (profRes.data?.[0] ?? null) as NProfile | null;

      setSelectedNutId(nid);
      setNutBasic(basic);
      setNutProfile(npRow);

      setCover(covers[0] ?? null);
      setAvatar(avatars[0] ?? null);

      setCerts((certsRaw ?? []).filter((x) => isImageByName(x.name)));
      setDiplomas((diplomasRaw ?? []).filter((x) => isImageByName(x.name)));
      setPortfolio((portfolioRaw ?? []).filter((x) => isImageByName(x.name)));
    },
    [BUCKET_BG, BUCKET_DOCS]
  );

  const loadInitial = useCallback(async () => {
    // ❗️ВАЖНО: никаких setState ДО первого await (это и убирает твой ESLint error)
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      setFatal("Нет авторизации. Войди заново.");
      setLoading(false);
      return;
    }

    const uid = data.user.id;

    const linksRes = await supabase
      .from("client_nutritionist_links")
      .select("*")
      .eq("client_id", uid)
      .order("created_at", { ascending: false });

    if (linksRes.error) {
      setFatal(linksRes.error.message);
      setLoading(false);
      return;
    }

    const rows = (linksRes.data ?? []) as LinkRow[];
    const ids = Array.from(new Set(rows.map((r) => r.nutritionist_id))).filter(Boolean);

    const map: Record<string, NutritionistBasic> = {};

    if (ids.length) {
      const { data: nrows } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      (nrows ?? []).forEach((x) => {
        const nb = x as NutritionistBasic;
        map[nb.id] = nb;
      });
    }

    setUserId(uid);
    setLinks(rows);

    setNutMap(map);
    nutMapRef.current = map;

    const firstApproved = rows.find((r) => r.status === "approved");
    const first = firstApproved ?? rows[0] ?? null;

    if (first?.nutritionist_id) {
      await loadNutritionistDetails(first.nutritionist_id);
    } else {
      setSelectedNutId(null);
      setNutBasic(null);
      setNutProfile(null);
      setCover(null);
      setAvatar(null);
      setCerts([]);
      setDiplomas([]);
      setPortfolio([]);
    }

    setFatal(null);
    setLoading(false);
  }, [loadNutritionistDetails]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadInitial();
      } catch (e) {
        if (!cancelled) {
          setFatal(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInitial]);

  const refresh = async () => {
    setLoading(true); // ✅ тут можно — это не useEffect
    await loadInitial();
  };

  if (loading) return <div className="text-sm text-zinc-500 dark:text-zinc-400">Загружаю…</div>;
  if (fatal) return <div className="text-sm text-red-500">{fatal}</div>;

  const coverUrl = cover ? publicUrl(BUCKET_BG, cover.path) : null;
  const avatarUrl = avatar ? publicUrl(BUCKET_BG, avatar.path) : null;

  return (
    <div className="space-y-6">
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

      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Мои специалисты</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Профиль, портфолио, сертификаты и дипломы.</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/client"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            ← Назад
          </Link>

          {userId ? (
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
            >
              Обновить
            </button>
          ) : null}
        </div>
      </header>

      {/* specialists list */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm font-semibold">Список</div>

        {links.length === 0 ? (
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">У тебя пока нет связей со специалистами.</div>
        ) : (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {Array.from(new Set(links.map((l) => l.nutritionist_id))).map((nid) => {
              const n = nutMap[nid];
              const active = nid === selectedNutId;
              const lastLink = links.find((x) => x.nutritionist_id === nid) ?? null;

              return (
                <button
                  key={nid}
                  type="button"
                  onClick={() => void loadNutritionistDetails(nid)}
                  className={
                    "min-w-[260px] shrink-0 rounded-2xl border p-3 text-left transition " +
                    (active
                      ? "border-black bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900")
                  }
                >
                  <div className="truncate text-sm font-semibold">{n?.full_name ?? nid}</div>
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    статус: <b>{lastLink?.status ?? "—"}</b> · {formatDateTime(lastLink?.created_at)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* selected specialist */}
      {selectedNutId ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {/* cover */}
          <div className="relative h-44 w-full bg-zinc-100 dark:bg-zinc-900">
            {coverUrl ? <img src={coverUrl} alt="cover" className="h-full w-full object-cover" /> : null}
          </div>

          <div className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              {/* avatar */}
              <div className="-mt-4 shrink-0">
                <div className="h-28 w-28 overflow-hidden rounded-2xl border-4 border-white bg-zinc-200 shadow-sm dark:border-zinc-950">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-zinc-600">
                      {(nutBasic?.full_name?.[0] ?? "N").toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              {/* right */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold">{nutBasic?.full_name ?? selectedNutId}</div>

                {nutProfile?.headline?.trim() ? (
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{nutProfile.headline}</div>
                ) : null}

                {badgeTokens.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {badgeTokens.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}

                {nutProfile?.about?.trim() ? (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Обо мне</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                      {nutProfile.about}
                    </div>
                  </div>
                ) : null}

                {nutProfile?.services?.trim() ? (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Чем помогаю</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                      {nutProfile.services}
                    </div>
                  </div>
                ) : null}

                {nutProfile?.contacts?.trim() ? (
                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Контакты</div>
                    <div className="mt-1 whitespace-pre-wrap">{nutProfile.contacts}</div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* certificates/diplomas marquee */}
            <div className="mt-5 space-y-3">
              <MarqueeImages
                title="Сертификаты"
                images={certs.map((x) => publicUrl(BUCKET_DOCS, x.path))}
                onClick={(u) => setLightboxUrl(u)}
              />
              <MarqueeImages
                title="Дипломы"
                images={diplomas.map((x) => publicUrl(BUCKET_DOCS, x.path))}
                onClick={(u) => setLightboxUrl(u)}
              />
            </div>

            {/* portfolio grid */}
            <div className="mt-6">
              <div className="text-sm font-semibold">Портфолио</div>
              {portfolio.length === 0 ? (
                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Пока пусто.</div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {portfolio.map((p) => {
                    const url = publicUrl(BUCKET_DOCS, p.path);
                    return (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => setLightboxUrl(url)}
                        className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                        title="Открыть"
                      >
                        <div className="aspect-square w-full">
                          <img src={url} alt="work" className="h-full w-full object-cover" />
                        </div>
                        <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-black/15" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ===================== Marquee ===================== */

function MarqueeImages(props: { title: string; images: string[]; onClick: (url: string) => void }) {
  const { title, images, onClick } = props;
  if (!images.length) return null;

  const items = [...images, ...images];

  return (
    <div>
      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{title}</div>

      <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="marquee flex gap-2 p-2">
          {items.map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              type="button"
              onClick={() => onClick(url)}
              className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              title="Открыть"
            >
              <img src={url} alt="doc" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .marquee {
          width: max-content;
          animation: marqueeLR 55s linear infinite;
          will-change: transform;
        }
        @keyframes marqueeLR {
          from {
            transform: translateX(-60%);
          }
          to {
            transform: translateX(0%);
          }
        }
      `}</style>
    </div>
  );
}
