import OpenAI from "openai";
import { env } from "./env";

const openai = new OpenAI({
    apiKey: env.LLM_API_KEY,
});

export async function generate(
    prompt: string,
    options: {
        model?: string;
        systemInstruction?: string;
        temperature?: number;
        maxOutputTokens?: number;
        timeoutMs?: number;
    } = {}
) {
    const {
        model = "gpt-4o-mini",
        systemInstruction,
        temperature = 0.2,
        maxOutputTokens = 1500,
        timeoutMs = 60_000,
    } = options;

    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemInstruction) {
        messages.push({
            role: "system" as const,
            content: systemInstruction,
        });
    }

    messages.push({
        role: "user" as const,
        content: prompt,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const completion = await openai.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxOutputTokens,
        }, { signal: controller.signal });

        clearTimeout(timeoutId);
        const text = completion.choices[0]?.message?.content ?? "";
        return { text };
    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error("llm_timeout");
        }
        throw err;
    }
}