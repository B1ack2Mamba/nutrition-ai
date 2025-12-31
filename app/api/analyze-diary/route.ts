// app/api/analyze-diary/route.ts
import { NextResponse } from "next/server";
import { deepseekJson } from "@/lib/deepseek";

export const runtime = "nodejs";

type FoodRow = {
  time?: string;
  dish?: string;
  amount?: string;
  reason?: string;
  feeling?: string;
  supplements?: string;
};

type FoodDiary = {
  wake_time?: string;
  bed_time?: string;
  water_balance?: string;
  sleep_note?: string;
  rows?: FoodRow[];
};

type RequestBody = {
  entry_date?: string | null;
  goal?: string | null;
  allergies?: string | null;
  banned_foods?: string | null;
  preferences?: string | null;
  diary?: FoodDiary | null;
};

type Out = {
  short_summary: string;
  likely_deficits: Array<{
    nutrient: string;
    why: string;
    confidence: "low" | "medium" | "high";
    how_to_fix: string[];
    food_examples: string[];
  }>;
  imbalances: string[];
  hydration_sleep_notes: string[];
  questions: string[];
  draft_feedback_for_client: string;
  disclaimer: string;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function compactRows(rows: FoodRow[] | undefined): FoodRow[] {
  const out: FoodRow[] = [];
  for (const r of rows ?? []) {
    if (!r || typeof r !== "object") continue;
    const row: FoodRow = {
      time: safeStr((r as any).time),
      dish: safeStr((r as any).dish),
      amount: safeStr((r as any).amount),
      reason: safeStr((r as any).reason),
      feeling: safeStr((r as any).feeling),
      supplements: safeStr((r as any).supplements),
    };
    if (row.time || row.dish || row.amount || row.reason || row.feeling || row.supplements) out.push(row);
    if (out.length >= 80) break; // защита от слишком больших дневников
  }
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RequestBody | null;

  const diary = body?.diary ?? null;
  const rows = compactRows(diary?.rows);

  if (!diary || rows.length === 0) {
    return NextResponse.json({ error: "diary.rows is required" }, { status: 400 });
  }

  const system =
    "Ты профессиональный нутрициолог. Отвечай СТРОГО на русском языке. " +
    "Не ставь диагнозов и не давай медицинских назначений; говори в формате гипотез и рекомендаций по питанию/привычкам. " +
    "Если данных мало — честно укажи, что выводы вероятностные. " +
    "Верни ТОЛЬКО валидный JSON без markdown и без текста вокруг.";

  const prompt = `
Проанализируй дневник питания клиента и выдели вероятные нутритивные дефициты/недоборы (по продуктам) и перекосы.

Контекст клиента:
- Дата дневника: ${safeStr(body?.entry_date) || "не указано"}
- Цель: ${safeStr(body?.goal) || "не указано"}
- Аллергии/непереносимость: ${safeStr(body?.allergies) || "не указано"}
- Запрещённые продукты: ${safeStr(body?.banned_foods) || "не указано"}
- Предпочтения: ${safeStr(body?.preferences) || "не указано"}

Дневник (сон/вода):
- Подъём: ${safeStr(diary.wake_time) || "—"}
- Сон: ${safeStr(diary.bed_time) || "—"}
- Вода: ${safeStr(diary.water_balance) || "—"}
- Сон (комментарий): ${safeStr(diary.sleep_note) || "—"}

Строки дневника (время / блюдо / количество / причина / ощущения / БАДы):
${rows
  .map(
    (r) =>
      `- ${safeStr(r.time) || "—"} | ${safeStr(r.dish) || "—"} | ${safeStr(r.amount) || "—"} | ${safeStr(r.reason) || "—"} | ${safeStr(r.feeling) || "—"} | ${safeStr(r.supplements) || "—"}`,
  )
  .join("\n")}

Требования (верни JSON строго по полям, ПИШИ КОРОТКО):
- short_summary: 1-2 предложения.
- likely_deficits: не больше 5 пунктов. Пиши только то, что реально предположить из дневника.
  Для каждого: nutrient, why (1–2 предложения), confidence (low/medium/high),
  how_to_fix (1–3 коротких шага), food_examples (2–5 продуктов).
- imbalances: 3–6 пунктов (короткими фразами).
- hydration_sleep_notes: 0–3 пункта.
- questions: 3–6 вопросов.
- draft_feedback_for_client: 4–8 предложений (без воды).
- disclaimer: 1 строка.
`.trim();

  const schema = {
    short_summary: "string",
    likely_deficits: [
      {
        nutrient: "string",
        why: "string",
        confidence: "low|medium|high",
        how_to_fix: ["string"],
        food_examples: ["string"],
      },
    ],
    imbalances: ["string"],
    hydration_sleep_notes: ["string"],
    questions: ["string"],
    draft_feedback_for_client: "string",
    disclaimer: "string",
  };


  // Важно: модель иногда «обрезает» ответ, если он слишком длинный.
  // Даем чуть больше лимит и просим быть короче (см. требования в prompt).
  try {
    const out = await deepseekJson<Out>(prompt, schema, system, { max_tokens: 2200 });

    if (!out || typeof out.short_summary !== "string" || !Array.isArray(out.likely_deficits)) {
      return NextResponse.json({ error: "Bad AI output" }, { status: 500 });
    }

    return NextResponse.json(out);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("analyze-diary error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
