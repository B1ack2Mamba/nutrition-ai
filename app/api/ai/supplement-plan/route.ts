import { deepseekJson } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  client?: {
    main_goal?: string | null;
    goal_description?: string | null;
    allergies?: string | null;
    banned_foods?: string | null;
    preferences?: string | null;
    monthly_budget?: number | null;
  };
  intake_form?: any | null;
  lab_summaries?: Array<string | null>;
  food_rules?: {
    allowed?: string[];
    banned?: string[];
    notes?: string | null;
  };
  journal_summary?: {
    startWeight?: number | null;
    lastWeight?: number | null;
    deltaWeight?: number | null;
    avgEnergy?: number | null;
    avgMood?: number | null;
    entriesCount?: number | null;
  };
  extra_notes?: string | null;
};

type SupplementItem = {
  name: string;
  dose: string;
  timing: string;
  duration: string;
  purpose: string;
  cautions?: string[];
};

type Out = {
  rationale_short: string;
  items: SupplementItem[];
  general_notes?: string;
  disclaimer: string;
};

function clipText(s: string, max = 6000) {
  const t = (s || "").replace(/\u0000/g, "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

const schema = {
  type: "object",
  properties: {
    rationale_short: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dose: { type: "string" },
          timing: { type: "string" },
          duration: { type: "string" },
          purpose: { type: "string" },
          cautions: { type: "array", items: { type: "string" } },
        },
        required: ["name", "dose", "timing", "duration", "purpose"],
        additionalProperties: false,
      },
    },
    general_notes: { type: "string" },
    disclaimer: { type: "string" },
  },
  required: ["rationale_short", "items", "disclaimer"],
  additionalProperties: false,
};

function buildPrompt(body: Body) {
  const c = body.client ?? {};
  const labs = (body.lab_summaries ?? []).filter(Boolean).slice(0, 4) as string[];
  const allowed = body.food_rules?.allowed?.slice(0, 50) ?? [];
  const banned = body.food_rules?.banned?.slice(0, 50) ?? [];

  const intake = body.intake_form ? clipText(JSON.stringify(body.intake_form, null, 2), 3500) : "(нет)";
  const labText = labs.length ? labs.map((x, i) => `#${i + 1}: ${clipText(x, 1400)}`).join("\n\n") : "(нет)";

  const js = body.journal_summary ?? {};
  const journalText = JSON.stringify(js, null, 2);

  return [
    "Собери план БАДов (витамины/минералы/омега-3/пробиотики/клетчатка и т.п.) для клиента нутрициолога.",
    "Важно:",
    "- НЕ назначай лекарства.",
    "- НЕ ставь диагнозов.",
    "- Дозировки: давай либо безопасные общие диапазоны, либо 'по инструкции производителя'.",
    "- Если по данным нельзя рекомендовать (например, нужны анализы) — так и напиши и дай 0-3 максимально нейтральных пункта.",
    "- Всегда добавляй cautions (противопоказания/с чем осторожно).",
    "- Сделай 3–7 позиций максимум (если нужно меньше — меньше).",
    "- Учитывай аллергии/запреты/цель и контекст.",
    "",
    "КОНТЕКСТ КЛИЕНТА:",
    `Цель: ${c.main_goal ?? "(не указано)"}`,
    `Описание цели: ${c.goal_description ?? "(не указано)"}`,
    `Аллергии/непереносимость: ${c.allergies ?? "(не указано)"}`,
    `Запрещено (со слов клиента): ${c.banned_foods ?? "(не указано)"}`,
    `Предпочтения: ${c.preferences ?? "(не указано)"}`,
    `Бюджет/мес: ${typeof c.monthly_budget === "number" ? c.monthly_budget : "(не указано)"}`,
    "",
    "АНКЕТА (json, если есть):",
    intake,
    "",
    "ДНЕВНИК/ПРОГРЕСС (сводка):",
    journalText,
    "",
    "ТЕКУЩИЕ ПРОДУКТЫ ПО ЦЕЛИ (то, что видит клиент):",
    `Можно: ${allowed.length ? allowed.join(", ") : "(нет)"}`,
    `Нельзя: ${banned.length ? banned.join(", ") : "(нет)"}`,
    body.food_rules?.notes ? `Комментарий: ${body.food_rules.notes}` : "",
    "",
    "АНАЛИЗЫ (AI summary, если есть):",
    labText,
    "",
    body.extra_notes ? `Заметки специалиста: ${clipText(body.extra_notes, 1200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return Response.json({ error: "Body is required" }, { status: 400 });

    const prompt = buildPrompt(body);

    const out = await deepseekJson<Out>(
      prompt,
      schema,
      "Ты аккуратный нутрициолог. Пишешь безопасно. Никаких лекарств, диагнозов и агрессивных обещаний. Отвечай только JSON.",
      { temperature: 0.2, max_tokens: 900 },
    );

    // лёгкая защита от мусора
    const items = Array.isArray(out?.items) ? out.items : [];
    return Response.json({ ...out, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("supplement-plan error:", msg);
    return Response.json({ error: "Supplement plan generation failed", details: msg }, { status: 500 });
  }
}
