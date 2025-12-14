import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IngredientIn = { name?: string; amount?: string };

type DishAutofillRequest = {
    title: string;
    category?: string;
    ingredients?: IngredientIn[];
    preferences?: string;
};

type DishAutofillResponse = {
    title?: string;
    ingredients: { name: string; amount: string; calories?: number | null }[];
    instructions?: string;
    macros?: {
        calories?: number | null;
        protein?: number | null;
        fat?: number | null;
        carbs?: number | null;
        fiber?: number | null;
    };
    comment?: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function extractJson(text: string): unknown {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = text.slice(start, end + 1);
    return JSON.parse(slice);
}

function getDeepseekContent(payload: unknown): string | undefined {
    if (!isObject(payload)) return undefined;

    const choices = payload["choices"];
    if (!Array.isArray(choices) || choices.length === 0) return undefined;

    const first = choices[0];
    if (!isObject(first)) return undefined;

    const message = first["message"];
    if (!isObject(message)) return undefined;

    const content = message["content"];
    return typeof content === "string" ? content : undefined;
}

function pickNumberOrNull(v: unknown): number | null | undefined {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (v === null) return null;
    return undefined;
}

function normalizeIngredients(v: unknown): DishAutofillResponse["ingredients"] {
    if (!Array.isArray(v)) return [];
    const out: DishAutofillResponse["ingredients"] = [];

    for (const item of v) {
        if (!isObject(item)) continue;
        const name = item["name"];
        const amount = item["amount"];
        const calories = item["calories"];

        if (typeof name !== "string" || !name.trim()) continue;
        if (typeof amount !== "string" || !amount.trim()) continue;

        const cal = pickNumberOrNull(calories);
        out.push({
            name: name.trim(),
            amount: amount.trim(),
            calories: cal,
        });
    }

    return out;
}

function normalizeMacros(v: unknown): DishAutofillResponse["macros"] | undefined {
    if (!isObject(v)) return undefined;

    const macros: NonNullable<DishAutofillResponse["macros"]> = {};

    const c = pickNumberOrNull(v["calories"]);
    const p = pickNumberOrNull(v["protein"]);
    const f = pickNumberOrNull(v["fat"]);
    const cb = pickNumberOrNull(v["carbs"]);
    const fb = pickNumberOrNull(v["fiber"]);

    if (c !== undefined) macros.calories = c;
    if (p !== undefined) macros.protein = p;
    if (f !== undefined) macros.fat = f;
    if (cb !== undefined) macros.carbs = cb;
    if (fb !== undefined) macros.fiber = fb;

    return Object.keys(macros).length ? macros : undefined;
}

export async function POST(req: Request) {
    try {
        const bodyUnknown: unknown = await req.json();
        const body = isObject(bodyUnknown) ? bodyUnknown : {};

        const titleRaw = body["title"];
        const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
        if (!title) {
            return NextResponse.json({ error: "title is required" }, { status: 400 });
        }

        const categoryRaw = body["category"];
        const category = typeof categoryRaw === "string" ? categoryRaw.trim() : "";

        const preferencesRaw = body["preferences"];
        const preferences =
            typeof preferencesRaw === "string" ? preferencesRaw.trim() : "";

        const ingredientsRaw = body["ingredients"];
        const ingredients: IngredientIn[] = Array.isArray(ingredientsRaw)
            ? ingredientsRaw
                .filter(isObject)
                .map((x) => ({
                    name: typeof x["name"] === "string" ? x["name"] : undefined,
                    amount: typeof x["amount"] === "string" ? x["amount"] : undefined,
                }))
            : [];

        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "DEEPSEEK_API_KEY is not set" },
                { status: 500 },
            );
        }

        const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com")
            .replace(/\/$/, "");
        const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

        const ingText =
            ingredients
                .map((x) => `${(x.name ?? "").trim()} ${(x.amount ?? "").trim()}`.trim())
                .filter(Boolean)
                .join(", ") || "—";

        const system = [
            "Ты — помощник нутрициолога.",
            "Отвечай СТРОГО валидным JSON без markdown и без текста вокруг.",
            "Язык всех строк — русский.",
            "Граммовки/штуки — реалистичные для 1 порции.",
            "КБЖУ посчитай приблизительно по стандартным продуктам.",
            "Если есть допущения — опиши их в comment.",
        ].join("\n");

        const user = [
            `Блюдо: "${title}"`,
            category ? `Категория: ${category}` : "",
            preferences ? `Пожелания/ограничения: ${preferences}` : "",
            `Текущие ингредиенты (если есть): ${ingText}`,
            "",
            "Верни JSON строго такого вида:",
            `{
  "title": "опционально",
  "ingredients": [{"name":"...", "amount":"...", "calories": null}],
  "instructions": "краткая инструкция приготовления",
  "macros": {"calories": 0, "protein": 0, "fat": 0, "carbs": 0, "fiber": 0},
  "comment": "допущения/что учтено"
}`,
        ]
            .filter(Boolean)
            .join("\n");

        const r = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                response_format: { type: "json_object" },
            }),
        });

        if (!r.ok) {
            const t = await r.text().catch(() => "");
            return NextResponse.json(
                { error: `DeepSeek error: ${r.status}`, details: t.slice(0, 2000) },
                { status: 500 },
            );
        }

        const respUnknown: unknown = await r.json();
        const content = getDeepseekContent(respUnknown);

        if (!content) {
            return NextResponse.json({ error: "No model content" }, { status: 500 });
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            parsed = extractJson(content);
        }

        if (!isObject(parsed)) {
            return NextResponse.json(
                { error: "Invalid JSON from model", raw: content.slice(0, 2000) },
                { status: 500 },
            );
        }

        const out: DishAutofillResponse = {
            title: typeof parsed["title"] === "string" ? parsed["title"] : undefined,
            ingredients: normalizeIngredients(parsed["ingredients"]),
            instructions:
                typeof parsed["instructions"] === "string"
                    ? parsed["instructions"]
                    : undefined,
            macros: normalizeMacros(parsed["macros"]),
            comment:
                typeof parsed["comment"] === "string" ? parsed["comment"] : undefined,
        };

        return NextResponse.json(out);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
