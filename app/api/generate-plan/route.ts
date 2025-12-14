// app/api/generate-plan/route.ts
import { NextResponse } from "next/server";
import { deepseekJson, type DeepSeekMessage } from "@/lib/deepseek";

export const runtime = "nodejs";

type Goal = "fat_loss" | "muscle_gain" | "maintenance";

type RequestBody = {
    goal: Goal;
    days?: number; // по умолчанию 7
    mealsPerDay?: 3 | 4 | 5; // по умолчанию 4
    caloriesTarget?: number | null;

    // необязательные поля — можешь передавать что есть
    allergies?: string | null;
    bannedFoods?: string | null;
    preferences?: string | null;
    budget?: number | null;
    notes?: string | null;
};

type PlanMeal = {
    title: string;
    ingredients: string[]; // кратко: "курица 200 г", "рис 80 г (сух.)", ...
    approx_macros?: {
        calories?: number | null;
        protein?: number | null;
        fat?: number | null;
        carbs?: number | null;
        fiber?: number | null;
    };
    instructions?: string; // 2-6 строк
};

type PlanDay = {
    day: number; // 1..N
    meals: {
        breakfast?: PlanMeal;
        lunch?: PlanMeal;
        dinner?: PlanMeal;
        snack?: PlanMeal;
        extra?: PlanMeal;
    };
    notes?: string;
};

type PlanOut = {
    summary: string;
    days: PlanDay[];
    shopping_list?: string[];
};

function clampInt(v: unknown, def: number, min: number, max: number): number {
    const n = typeof v === "number" ? Math.floor(v) : Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
}

export async function POST(req: Request) {
    const body = (await req.json().catch(() => null)) as RequestBody | null;

    if (!body?.goal) {
        return NextResponse.json({ error: "goal is required" }, { status: 400 });
    }

    const days = clampInt(body.days ?? 7, 7, 3, 30);
    const mealsPerDay = clampInt(body.mealsPerDay ?? 4, 4, 3, 5);
    const caloriesTarget =
        typeof body.caloriesTarget === "number" && Number.isFinite(body.caloriesTarget)
            ? body.caloriesTarget
            : null;

    const system =
        "Ты профессиональный нутрициолог. Отвечай СТРОГО на русском языке. " +
        "Верни ТОЛЬКО валидный JSON (без markdown/```), без текста вокруг. " +
        "Учитывай аллергию/запреты/бюджет. Если данных мало — делай разумные допущения и пиши их в summary.";

    // Схема-подсказка (пример структуры)
    const schema = {
        summary: "string",
        days: [
            {
                day: 1,
                meals: {
                    breakfast: {
                        title: "string",
                        ingredients: ["string"],
                        approx_macros: {
                            calories: 0,
                            protein: 0,
                            fat: 0,
                            carbs: 0,
                            fiber: 0,
                        },
                        instructions: "string",
                    },
                },
                notes: "string",
            },
        ],
        shopping_list: ["string"],
    };

    const goalText =
        body.goal === "fat_loss"
            ? "похудение"
            : body.goal === "muscle_gain"
                ? "набор мышц"
                : "поддержание веса";

    const prompt = `
Составь план питания на ${days} дней.
Цель: ${goalText}
Приёмов пищи в день: ${mealsPerDay}
Целевые калории в день (если указано): ${caloriesTarget ?? "не задано"}

Аллергии/непереносимость: ${body.allergies ?? "не указано"}
Запрещённые продукты: ${body.bannedFoods ?? "не указано"}
Предпочтения: ${body.preferences ?? "не указано"}
Бюджет (в месяц или в неделю, если клиент так сказал): ${body.budget ?? "не указано"}
Доп. заметки: ${body.notes ?? "не указано"}

Требования:
- Верни JSON по схеме.
- Для каждого дня: meals (breakfast/lunch/dinner/snack/extra по необходимости).
- ingredients — строками с граммовками/штучками.
- instructions — коротко.
- shopping_list — общий список покупок на весь период (кратко).
`.trim();

    const messages: DeepSeekMessage[] = [
        { role: "system", content: system },
        { role: "user", content: prompt },
    ];

    try {
        const out = await deepseekJson<PlanOut>(messages, { max_tokens: 1400 });

        // минимальная защита от мусора
        if (!out || !Array.isArray(out.days)) {
            return NextResponse.json({ error: "Bad AI output" }, { status: 500 });
        }

        return NextResponse.json(out);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("generate-plan error:", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
