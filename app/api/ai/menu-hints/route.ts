import { NextResponse } from "next/server";
import { deepseekChat } from "@/lib/deepseek";
import { Menu } from "@/lib/menus";

type RequestBody = {
  menu: Menu;
  clientProfile?: {
    main_goal?: string | null;
    allergies?: string | null;
    banned_foods?: string | null;
    monthly_budget?: number | null;
  };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const { menu, clientProfile } = body;

    const system =
      "Ты профессиональный нутрициолог. Анализируешь недельные рационы, " +
      "подсказываешь, что улучшить. Пиши коротко и по делу.";

    const userPrompt = `
Вот рацион (структура в JSON). Дай рекомендации:

1) Насколько он соответствует цели (если указана).
2) Достаточно ли белка, овощей, разнообразия.
3) Что можно улучшить (конкретные рекомендации).
4) Возможные предупреждения (слишком мало/много калорий, опасные сочетания и т.п.).

Рацион (Menu JSON):
${JSON.stringify(menu, null, 2)}

Профиль клиента (если есть):
${JSON.stringify(clientProfile ?? {}, null, 2)}
    `.trim();

    const content = await deepseekChat([
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ]);

    return NextResponse.json({ text: content });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    console.error("menu-hints error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
