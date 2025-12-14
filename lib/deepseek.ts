// lib/deepseek.ts
// DeepSeek API is OpenAI-compatible: POST /chat/completions with model deepseek-chat / deepseek-reasoner. :contentReference[oaicite:0]{index=0}

export type DeepSeekRole = "system" | "user" | "assistant";
export type DeepSeekMessage = { role: DeepSeekRole; content: string };

type DeepSeekChatCompletionResponse = {
    choices?: Array<{ message?: { content?: string | null } | null }>;
    error?: { message?: string };
};

function env(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function normalizeBaseUrl(raw: string): string {
    return raw.replace(/\/+$/, "");
}

async function deepseekRequest(opts: {
    messages: DeepSeekMessage[];
    json?: boolean;
    temperature?: number;
    max_tokens?: number;
}) {
    const baseUrl = normalizeBaseUrl(
        process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    );
    const apiKey = env("DEEPSEEK_API_KEY");
    const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: opts.messages,
            temperature: opts.temperature ?? (opts.json ? 0.2 : 0.7),
            max_tokens: opts.max_tokens ?? 900,
            // JSON Output mode: response_format.type = "json_object". :contentReference[oaicite:1]{index=1}
            response_format: opts.json ? { type: "json_object" } : { type: "text" },
        }),
    });

    const data = (await res.json().catch(() => null)) as
        | DeepSeekChatCompletionResponse
        | null;

    if (!res.ok) {
        const msg =
            data?.error?.message ||
            `DeepSeek error: HTTP ${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    if (!data?.choices?.[0]?.message?.content) {
        throw new Error("DeepSeek returned empty content");
    }
    return data.choices[0].message.content;
}

function stripCodeFences(s: string): string {
    const t = s.trim();
    if (t.startsWith("```")) {
        return t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
    }
    return t;
}

// If model still returns extra text, try to extract the first JSON object.
function extractJsonObject(s: string): string {
    const t = stripCodeFences(s);
    const first = t.indexOf("{");
    const last = t.lastIndexOf("}");
    if (first >= 0 && last > first) return t.slice(first, last + 1);
    return t;
}

export async function deepseekChat(
    prompt: string,
    system?: string,
): Promise<string> {
    const messages: DeepSeekMessage[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    return deepseekRequest({ messages, json: false });
}

// удобный алиас (у тебя TS уже подсказывал deepseek)
export const deepseek = deepseekChat;

export async function deepseekJson<T>(
    prompt: string,
    schemaHint?: string,
    system?: string,
): Promise<T> {
    const sys =
        system ??
        "Отвечай СТРОГО на русском языке. Верни ТОЛЬКО валидный JSON. Без markdown. Без лишнего текста.";

    const hint = schemaHint
        ? `\n\nJSON schema/shape (follow exactly):\n${schemaHint}\n`
        : "";

    const content = await deepseekRequest({
        messages: [
            { role: "system", content: sys + hint },
            { role: "user", content: prompt },
        ],
        json: true,
        temperature: 0.2,
        max_tokens: 1200,
    });

    const jsonText = extractJsonObject(content);
    try {
        return JSON.parse(jsonText) as T;
    } catch (e) {
        throw new Error(
            `Failed to parse JSON from DeepSeek. Raw:\n${content}\n---\nExtracted:\n${jsonText}`,
        );
    }
}
