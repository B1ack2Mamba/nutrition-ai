import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DraftRequest = {
    title: string;
    category?: string;
    ingredients?: { name?: string; amount?: string }[];
    language?: "ru" | "en";
};

type DraftResponse = {
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

function getContentFromChatCompletions(payload: unknown): string | undefined {
    if (!isObject(payload)) return undefined;
    const choices = payload["choices"];
    if (!Array.isArray(choices) || choices.length === 0) return undefined;

    const first = choices[0];
    if (!isObject(first)) return undefined;

    const msg = first["message"];
    if (!isObject(msg)) return undefined;

    const content = msg["content"];
    return typeof content === "string" ? content : undefined;
}

function extractJson(text: string): unknown {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s === -1 || e === -1 || e <= s) return null;
    return JSON.parse(text.slice(s, e + 1));
}

function pickNumOrNull(v: unknown): number | null | undefined {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (v === null) return null;
    return undefined;
}

function normalizeIngredients(v: unknown): DraftResponse["ingredients"] {
    if (!Array.isArray(v)) return [];
    const out: DraftResponse["ingredients"] = [];

    for (const item of v) {
        if (!isObject(item)) continue;
        const name = item["name"];
        const amount = item["amount"];
        const calories = item["calories"];

        if (typeof name !== "string" || !name.trim()) continue;
        if (typeof amount !== "string" || !amount.trim()) continue;

        out.push({
            name: name.trim(),
            amount: amount.trim(),
            calories: pickNumOrNull(calories),
        });
    }

    return out;
}

function normalizeMacros(v: unknown): DraftResponse["macros"] | undefined {
    if (!isObject(v)) return undefined;

    const m: NonNullable<DraftResponse["macros"]> = {};

    const c = pickNumOrNull(v["calories"]);
    const p = pickNumOrNull(v["protein"]);
    const f = pickNumOrNull(v["fat"]);
    const cb = pickNumOrNull(v["carbs"]);
    const fb = pickNumOrNull(v["fiber"]);

    if (c !== undefined) m.calories = c;
    if (p !== undefined) m.protein = p;
    if (f !== undefined) m.fat = f;
    if (cb !== undefined) m.carbs = cb;
    if (fb !== undefined) m.fiber = fb;

    return Object.keys(m).length ? m : undefined;
}

export async function POST(req: Request) {
    try {
        const bodyU: unknown = await req.json();
        const body = isObject(bodyU) ? bodyU : {};

        const titleRaw = body["title"];
        const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
        if (!title) {
            return NextResponse.json({ error: "title is required" }, { status: 400 });
        }

        const categoryRaw = body["category"];
        const category = typeof categoryRaw === "string" ? categoryRaw.trim() : "";

        const langRaw = body["language"];
        const language: "ru" | "en" = langRaw === "en" ? "en" : "ru";

        const ingredientsRaw = body["ingredients"];
        const ingredients = Array.isArray(ingredientsRaw)
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

        const system =
            language === "ru"
                ? [
                    "Ты — помощник нутрициолога.",
                    "Отвечай СТРОГО валидным JSON без markdown и без текста вокруг.",
                    "Все строки — на русском языке.",
                    "Сгенерируй реалистичные ингредиенты и граммовки на 1 порцию.",
                    "Дай краткую инструкцию приготовления.",
                    "Если считаешь КБЖУ — делай это приблизительно по стандартным продуктам.",
                    "Если есть допущения — напиши в comment.",
                ].join("\n")
                : [
                    "You are a nutritionist assistant.",
                    "Return STRICT valid JSON, no markdown.",
                ].join("\n");

        const user = [
            `Dish: "${title}"`,
            category ? `Category: ${category}` : "",
            `Current ingredients (if any): ${ingText}`,
            "",
            "Return JSON with this shape:",
            `{
  "title": "optional",
  "ingredients": [{"name":"...", "amount":"...", "calories": null}],
  "instructions": "short cooking steps",
  "macros": {"calories": 0, "protein": 0, "fat": 0, "carbs": 0, "fiber": 0},
  "comment": "assumptions"
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

        const respU: unknown = await r.json();
        const content = getContentFromChatCompletions(respU);
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

        const out: DraftResponse = {
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
