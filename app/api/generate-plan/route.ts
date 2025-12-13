import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

type PlanRequest = {
  goal: "fat_loss" | "muscle_gain" | "maintenance";
  sex: "male" | "female" | "other";
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: "low" | "medium" | "high";
  dietType: "omnivore" | "vegetarian" | "vegan";
  allergies: string[];
  dislikes: string[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PlanRequest;

    const systemPrompt = `
Ты нутрициологический ассистент.
Это не диагноз и не лечение.
Отвечай строго в JSON.
`.trim();

    const userPrompt = `
Сгенерируй план питания на 7 дней.

Данные:
${JSON.stringify(body, null, 2)}
`.trim();

    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty response" }, { status: 500 });
    }

    const plan = JSON.parse(content);
    return NextResponse.json(plan);
    } catch (err: unknown) {
        return NextResponse.json(
            {
                error: err instanceof Error ? err.message : "Internal server error",
            },
            { status: 500 }
        );
    }
}
