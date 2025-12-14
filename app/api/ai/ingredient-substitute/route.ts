import { NextResponse } from "next/server";
import { deepseekChat } from "@/lib/deepseek";

type RequestBody = {
    ingredient: string;
    reason?: string; // аллергия, бюджет, веганство...
};

type Substitute = {
    name: string;
    reason: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        const { ingredient, reason } = body;

        if (!ingredient) {
            return NextResponse.json(
                { error: "ingredient required" },
                { status: 400 },
            );
        }

        const system =
            "Ты нутрициолог. Подбираешь безопасные и реалистичные замены ингредиентов. " +
            "Отвечай ТОЛЬКО JSON.";

        const userPrompt = `
Подбери 3-5 замен для ингредиента с учётом причины.

Верни JSON:

{
  "substitutes": [
    {
      "name": "замена",
      "reason": "почему это подходит"
    }
  ]
}

Ингредиент: ${ingredient}
Причина замены: ${reason || "не указана"}
    `.trim();

        const content = await deepseekChat([
            { role: "system", content: system },
            { role: "user", content: userPrompt },
        ]);

        const match = content.match(/\{[\s\S]*\}/);
        if (!match) {
            return NextResponse.json(
                { error: "PARSE_ERROR", raw: content },
                { status: 500 },
            );
        }

        const parsed = JSON.parse(match[0]) as {
            substitutes: Substitute[];
        };

        return NextResponse.json(parsed);
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "Unknown error";
        console.error("ingredient-substitute error:", message);
        return NextResponse.json(
            { error: message },
            { status: 500 },
        );
    }
}
