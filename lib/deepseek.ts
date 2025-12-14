// lib/deepseek.ts
export type DeepSeekRole = "system" | "user" | "assistant";

export type DeepSeekMessage = {
    role: DeepSeekRole;
    content: string;
};

type ChatCompletionChoice = {
    message?: {
        role?: string;
        content?: string;
    };
};

type ChatCompletionResponse = {
    choices?: ChatCompletionChoice[];
    error?: { message?: string };
};

export type DeepSeekChatOptions = {
    model?: string;
    temperature?: number;
    max_tokens?: number;
};

function getEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function normalizeMessages(input: string | DeepSeekMessage[]): DeepSeekMessage[] {
    if (typeof input === "string") return [{ role: "user", content: input }];
    return input;
}

/**
 * Универсальный чат: принимает либо string, либо messages[]
 * Возвращает текст ответа модели.
 */
export async function deepseekChat(
    input: string | DeepSeekMessage[],
    opts: DeepSeekChatOptions = {},
): Promise<string> {
    const apiKey = getEnv("DEEPSEEK_API_KEY");
    const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
    const model = opts.model ?? (process.env.DEEPSEEK_MODEL ?? "deepseek-chat");

    const messages = normalizeMessages(input);

    const r = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: opts.temperature ?? 0.2,
            max_tokens: opts.max_tokens ?? 800,
        }),
    });

    if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`DeepSeek HTTP ${r.status}: ${text || r.statusText}`);
    }

    const data = (await r.json()) as ChatCompletionResponse;

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        const errMsg = data.error?.message ?? "No model content";
        throw new Error(errMsg);
    }

    return content.trim();
}

// ----- JSON utils -----

function stripCodeFences(s: string): string {
    const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return (m?.[1] ?? s).trim();
}

function extractLikelyJson(s: string): string {
    const t = stripCodeFences(s);

    // попытка найти первый JSON-объект/массив в тексте
    const objStart = t.indexOf("{");
    const arrStart = t.indexOf("[");
    const start =
        objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);

    if (start === -1) return t;

    // грубо ищем последнюю закрывающую скобку
    const endObj = t.lastIndexOf("}");
    const endArr = t.lastIndexOf("]");
    const end = Math.max(endObj, endArr);

    if (end === -1 || end <= start) return t;
    return t.slice(start, end + 1).trim();
}

function schemaHint(schema?: unknown): string {
    if (!schema) {
        return "Ответь СТРОГО валидным JSON без markdown, без пояснений и без текста вокруг.";
    }
    return (
        "Ответь СТРОГО валидным JSON без markdown, без пояснений и без текста вокруг.\n" +
        "Схема/формат, которого нужно придерживаться:\n" +
        JSON.stringify(schema, null, 2)
    );
}

/**
 * deepseekJson — 2 режима:
 * 1) deepseekJson(messages[], opts?)
 * 2) deepseekJson(prompt, schema?, system?, opts?)
 */
export async function deepseekJson<T>(
    messages: DeepSeekMessage[],
    opts?: DeepSeekChatOptions,
): Promise<T>;
export async function deepseekJson<T>(
    prompt: string,
    schema?: unknown,
    system?: string,
    opts?: DeepSeekChatOptions,
): Promise<T>;
export async function deepseekJson<T>(
    arg1: DeepSeekMessage[] | string,
    arg2?: DeepSeekChatOptions | unknown,
    arg3?: string,
    arg4?: DeepSeekChatOptions,
): Promise<T> {
    let messages: DeepSeekMessage[];
    let opts: DeepSeekChatOptions | undefined;

    if (typeof arg1 === "string") {
        const prompt = arg1;
        const schema = arg2; // неизвестный формат подсказки
        const system = arg3;
        opts = arg4;

        const sysMsg: DeepSeekMessage = {
            role: "system",
            content: system ? `${system}\n\n${schemaHint(schema)}` : schemaHint(schema),
        };

        messages = [sysMsg, { role: "user", content: prompt }];
    } else {
        // старый режим: deepseekJson(messages, opts)
        messages = [
            {
                role: "system",
                content: schemaHint(undefined),
            },
            ...arg1,
        ];
        opts = arg2 as DeepSeekChatOptions | undefined;
    }

    const content = await deepseekChat(messages, {
        ...(opts ?? {}),
        temperature: opts?.temperature ?? 0,
    });

    const jsonText = extractLikelyJson(content);

    try {
        return JSON.parse(jsonText) as T;
    } catch {
        throw new Error(
            `Model did not return valid JSON. Got: ${jsonText.slice(0, 600)}`,
        );
    }
}

// Backward-compatible alias (чтобы старые роуты не падали)
export const deepseek: typeof deepseekChat = deepseekChat;
