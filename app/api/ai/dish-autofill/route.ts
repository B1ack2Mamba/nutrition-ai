// app/api/ai/dish-autofill/route.ts
import { NextResponse } from "next/server";
import { deepseekJson, type DeepSeekMessage } from "@/lib/deepseek";

export const runtime = "nodejs";

type RequestBody = {
    title?: string;
    name?: string; // alias на всякий случай
    category?: "breakfast" | "lunch" | "dinner" | "snack" | string;
    notes?: string; // любые пожелания/ограничения
};

type AiIngredient = {
    name: string;
    amount: string; // "200 г", "1 шт", "1 ст.л."
};

type AiOut = {
    title?: string;
    timeMinutes?: number | null;
    ingredients: AiIngredient[];
    instructions: string;
    comment?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function asString(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function asNumberOrNull(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(req: Request) {
    const body = (await req.json().catch(() => null)) as RequestBody | null;

    const title = (body?.title ?? body?.name ?? "").trim();
    if (!title) {
        return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const category = (body?.category ?? "").toString().trim();
    const notes = (body?.notes ?? "").toString().trim();

    const system =
        "Ты опытный нутрициолог и повар. Отвечай СТРОГО на русском. " +
        "Сгенерируй реалистичные ингредиенты с граммовками/штуками и краткую инструкцию приготовления. " +
        "Верни ТОЛЬКО валидный JSON без markdown и без лишнего текста.";

    const schema = `{
  "timeMinutes": number|null,
  "ingredients": [
    { "name": string, "amount": string }
  ],
  "instructions": string,
  "comment": string
}`;

    const userPrompt = `
Собери черновик блюда по названию.

Требования:
- ingredients: 3-10 позиций
- amount: обязательно с единицами ("г", "мл", "шт", "ст.л.", "ч.л.")
- instructions: 4-8 коротких шагов (можно списком через "\\n")
- timeMinutes: примерное время готовки
- comment: 1-2 строки допущений (если были)

Название блюда: ${title}
Категория (если указана): ${category || "не указана"}
Пожелания/ограничения (если есть): ${notes || "нет"}
Формат JSON (пример): ${schema}
`.trim();

    try {
        const messages: DeepSeekMessage[] = [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
        ];

        const out = await deepseekJson<AiOut>(messages);

        const ingredientsRaw = Array.isArray(out?.ingredients) ? out.ingredients : [];
        const ingredients: AiIngredient[] = ingredientsRaw
            .map((x: unknown) => {
                if (!isRecord(x)) return null;
                const name = asString(x.name).trim();
                const amount = asString(x.amount).trim();
                if (!name || !amount) return null;
                return { name, amount };
            })
            .filter((x): x is AiIngredient => x !== null)
            .slice(0, 20);

        const instructions = asString(out?.instructions).trim();
        const timeMinutes = asNumberOrNull(out?.timeMinutes);
        const comment = asString(out?.comment).trim();

        if (ingredients.length === 0 || !instructions) {
            return NextResponse.json(
                { error: "Model returned empty draft", raw: { ingredients, instructions } },
                { status: 500 },
            );
        }

        return NextResponse.json({
            title,
            category,
            timeMinutes,
            ingredients,
            instructions,
            comment,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
