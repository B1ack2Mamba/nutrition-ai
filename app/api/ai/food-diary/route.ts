import { deepseekJson } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

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

type Body = {
  entry_date?: string | null;
  client?: {
    main_goal?: string | null;
    goal_description?: string | null;
    allergies?: string | null;
    banned_foods?: string | null;
    preferences?: string | null;
    monthly_budget?: number | null;
  };
  intake_form?: any | null;
  food_rules?: {
    allowed?: string[];
    banned?: string[];
    notes?: string | null;
  };
  lab_summaries?: Array<string | null>;
  food_diary?: FoodDiary | null;
  extra_notes?: string | null;
};

type Deficit = {
  name: string;
  why: string;
  food_suggestions: string[];
  supplement_suggestions: string[];
  confidence: "low" | "medium" | "high";
};

type Out = {
  short_summary: string;
  potential_deficits: Deficit[];
  quick_wins: string[];
  disclaimer: string;
};

function clipText(s: string, max = 6000) {
  const t = (s || "").replace(/\u0000/g, "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

const schema = {
  type: "object",
  properties: {
    short_summary: { type: "string" },
    potential_deficits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          why: { type: "string" },
          food_suggestions: { type: "array", items: { type: "string" } },
          supplement_suggestions: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["name", "why", "food_suggestions", "supplement_suggestions", "confidence"],
        additionalProperties: false,
      },
    },
    quick_wins: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
  },
  required: ["short_summary", "potential_deficits", "quick_wins", "disclaimer"],
  additionalProperties: false,
};

function buildPrompt(body: Body) {
  const c = body.client ?? {};
  const intake = body.intake_form ? clipText(JSON.stringify(body.intake_form, null, 2), 3200) : "(нет)";
  const labs = (body.lab_summaries ?? []).filter(Boolean).slice(0, 3) as string[];
  const labText = labs.length ? labs.map((x, i) => `#${i + 1}: ${clipText(x, 1400)}`).join("\n\n") : "(нет)";

  const allowed = body.food_rules?.allowed?.slice(0, 50) ?? [];
  const banned = body.food_rules?.banned?.slice(0, 50) ?? [];

  const diary = body.food_diary ?? {};
  const rows = Array.isArray(diary.rows) ? diary.rows.slice(0, 60) : [];
  const rowsText = rows.length
    ? rows
        .map((r) => {
          const parts = [
            r.time ? `время: ${String(r.time)}` : "",
            r.dish ? `еда: ${String(r.dish)}` : "",
            r.amount ? `кол-во: ${String(r.amount)}` : "",
            r.reason ? `причина: ${String(r.reason)}` : "",
            r.feeling ? `ощущения: ${String(r.feeling)}` : "",
            r.supplements ? `БАДы/лек-ва: ${String(r.supplements)}` : "",
          ].filter(Boolean);
          return "- " + parts.join("; ");
        })
        .join("\n")
    : "(нет строк)";

  return [
    "Сделай аккуратный нутрициологический разбор дневника питания (за 1 день) с фокусом на вероятные дефициты по рациону.",
    "Важно:",
    "- Не ставь диагнозы. Не назначай лекарства.",
    "- Если данных недостаточно для уверенного вывода по микроэлементам — ставь confidence=low и так и пиши.",
    "- Предлагай в первую очередь пищевые решения. БАДы — как опциональные варианты, осторожно.",
    "- Учитывай аллергии/запреты/предпочтения и правила 'можно/нельзя'.",
    "- Верни СТРОГО JSON по схеме.",
    "",
    `ДАТА: ${body.entry_date ?? "(не указано)"}`,
    "",
    "КОНТЕКСТ КЛИЕНТА:",
    `Цель: ${c.main_goal ?? "(не указано)"}`,
    `Описание цели: ${c.goal_description ?? "(не указано)"}`,
    `Аллергии/непереносимость: ${c.allergies ?? "(не указано)"}`,
    `Запрещено (со слов клиента): ${c.banned_foods ?? "(не указано)"}`,
    `Предпочтения: ${c.preferences ?? "(не указано)"}`,
    "",
    "АНКЕТА (json, если есть):",
    intake,
    "",
    "ПРАВИЛА ПРОДУКТОВ (то, что видит клиент):",
    `Можно: ${allowed.length ? allowed.join(", ") : "(нет)"}`,
    `Нельзя: ${banned.length ? banned.join(", ") : "(нет)"}`,
    body.food_rules?.notes ? `Комментарий: ${body.food_rules.notes}` : "",
    "",
    "АНАЛИЗЫ (AI summary, если есть):",
    labText,
    "",
    "ДНЕВНИК ЗА ДЕНЬ:",
    `Подъем: ${diary.wake_time ?? ""} | Сон: ${diary.bed_time ?? ""}`,
    `Вода: ${diary.water_balance ?? ""}`,
    diary.sleep_note ? `Сон-комментарий: ${clipText(String(diary.sleep_note), 800)}` : "",
    "Строки:",
    rowsText,
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
      "Ты аккуратный нутрициолог. Пишешь безопасно и без категоричных диагнозов. Отвечай только JSON.",
      { temperature: 0.2, max_tokens: 900 },
    );

    const deficits = Array.isArray(out?.potential_deficits) ? out.potential_deficits : [];
    const quick = Array.isArray(out?.quick_wins) ? out.quick_wins : [];
    return Response.json({ ...out, potential_deficits: deficits, quick_wins: quick });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("food-diary error:", msg);
    return Response.json({ error: "Food diary analysis failed", details: msg }, { status: 500 });
  }
}
