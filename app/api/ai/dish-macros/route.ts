// app/api/ai/dish-macros/route.ts
import { NextResponse } from "next/server";
import { deepseekJson } from "@/lib/deepseek";

export const runtime = "nodejs";

type RequestBody = {
  name?: string;
  ingredients?: string; // text like: "200 g chicken, 50 g rice"
};

type MacrosOut = {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber: number | null;
};

type AiOut = {
  macros: MacrosOut;
  comment: string;
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RequestBody | null;
  if (!body?.ingredients || body.ingredients.trim().length < 2) {
    return NextResponse.json(
      { error: "ingredients is required" },
      { status: 400 },
    );
  }

  const dishName = body.name?.trim() || "Dish";
  const ingredients = body.ingredients.trim();

  const schema = `{
  "macros": {
    "calories": number|null,
    "protein": number|null,
    "fat": number|null,
    "carbs": number|null,
    "fiber": number|null
  },
  "comment": string
}`;

    const system =
        "Ты профессиональный нутрициолог. Отвечай СТРОГО на русском языке. " +
        "Возвращай только JSON без markdown и без лишнего текста.";

    const prompt = `
Оцени КБЖУ для ВСЕГО блюда по ингредиентам и типичным значениям (сырая масса/обычные продукты).
Если что-то неизвестно — сделай разумные допущения и кратко объясни в comment.

Название: ${dishName}
Ингредиенты: ${ingredients}
`;

    const out = await deepseekJson<AiOut>(prompt, schema, system);

  return NextResponse.json({
    macros: {
      calories: numOrNull(out?.macros?.calories),
      protein: numOrNull(out?.macros?.protein),
      fat: numOrNull(out?.macros?.fat),
      carbs: numOrNull(out?.macros?.carbs),
      fiber: numOrNull(out?.macros?.fiber),
    },
    comment: typeof out?.comment === "string" ? out.comment : "",
  });
}
