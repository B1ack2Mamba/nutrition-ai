import { deepseekJson } from "@/lib/deepseek";
import { Buffer } from "buffer";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_OCR_CHARS = 9000;

type Body = {
  signedUrl: string;
  ocrLang?: string; // e.g. "rus+eng"
  detail?: "short" | "detailed";
};

function clip(text: string, max = MAX_OCR_CHARS) {
  const t = (text || "").replace(/\u0000/g, "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function buildPrompt(ocrText: string, detail: Body["detail"]) {
  const style =
    detail === "detailed"
      ? "Чуть подробнее, но всё равно без воды."
      : "Очень коротко и по делу (как заметка в айфоне).";

  return [
    "Ты — помощник нутрициолога. Тебе дали распознанный текст лабораторного анализа (OCR).",
    "Твоя задача: сделать краткий разбор результатов и практичные рекомендации питания/образа жизни.",
    "Важно:",
    "- НЕ ставь диагнозов, не назначай лекарства и дозировки.",
    "- Если в тексте нет референсов или единиц, так и скажи.",
    "- Отмечай возможные тревожные признаки только как повод обсудить с врачом/лабораторией.",
    style,
    "",
    "OCR-ТЕКСТ:",
    ocrText,
  ].join("\n");
}

const schema = {
  type: "object",
  properties: {
    short_summary: { type: "string" },
    key_findings: { type: "array", items: { type: "string" } },
    possible_causes: { type: "array", items: { type: "string" } },
    nutrition_notes: { type: "array", items: { type: "string" } },
    questions_for_doctor: { type: "array", items: { type: "string" } },
    red_flags: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
  },
  required: ["short_summary", "key_findings", "disclaimer"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const signedUrl = body.signedUrl;
    const ocrLang = (body.ocrLang && String(body.ocrLang)) || "rus+eng";
    const detail = body.detail === "detailed" ? "detailed" : "short";

    if (!signedUrl || typeof signedUrl !== "string") {
      return Response.json({ error: "signedUrl is required" }, { status: 400 });
    }

    const fileRes = await fetch(signedUrl);
    if (!fileRes.ok) {
      return Response.json(
        { error: "Не удалось скачать файл по подписанной ссылке." },
        { status: 400 },
      );
    }

    const contentType = fileRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return Response.json(
        {
          error:
            "Сейчас поддерживаются только изображения (png/jpg/webp). Если анализ в PDF — сделай скриншот страницы и загрузи картинкой.",
          contentType,
        },
        { status: 400 },
      );
    }

    const ab = await fileRes.arrayBuffer();
    const buf = Buffer.from(ab);

    // OCR
    const { recognize } = await import("tesseract.js");
    const ocr = await recognize(buf, ocrLang, {
      logger: () => {
        /* silence */
      },
    });

    const ocrText = clip(ocr?.data?.text || "");
    if (!ocrText) {
      return Response.json(
        {
          error:
            "Текст не распознан. Попробуй более четкое фото (без бликов, ближе, ровно, хорошее освещение).",
        },
        { status: 200 },
      );
    }

    // DeepSeek analysis (JSON)
    const prompt = buildPrompt(ocrText, detail);
    const analysis = await deepseekJson(
      prompt,
      schema,
      "Ты аккуратный помощник нутрициолога. Ты объясняешь понятно и безопасно. Не даёшь медицинских назначений.",
      { temperature: 0.2, max_tokens: 900 },
    );
return Response.json({
      ocrText,
      analysis,
      meta: { ocrLang, detail, contentType },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "Lab report analyze failed", details: msg },
      { status: 500 },
    );
  }
}
