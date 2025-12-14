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

type DeepSeekChatOptions = {
    model?: string;
    temperature?: number;
    max_tokens?: number;
};

function getEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function normalizeMessages(
    input: string | DeepSeekMessage[],
): DeepSeekMessage[] {
    if (typeof input === "string") {
        return [{ role: "user", content: input }];
    }
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

/**
 * Если хочешь получать именно JSON — удобный хелпер.
 * Он попросит модель вернуть чистый JSON и распарсит его.
 */
export async function deepseekJson<T>(
    messages: DeepSeekMessage[],
    opts: DeepSeekChatOptions = {},
): Promise<T> {
    const jsonHint: DeepSeekMessage = {
        role: "system",
        content:
            "Ответь СТРОГО валидным JSON без markdown, без пояснений и без текста вокруг.",
    };

    const content = await deepseekChat([jsonHint, ...messages], {
        ...opts,
        temperature: opts.temperature ?? 0,
    });

    try {
        return JSON.parse(content) as T;
    } catch {
        throw new Error(
            `Model did not return valid JSON. Got: ${content.slice(0, 400)}`,
        );
    }
}
