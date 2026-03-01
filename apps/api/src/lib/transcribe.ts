import fs from "node:fs";
import OpenAI from "openai";
import { env } from "../env.js";

const openai = new OpenAI({
    apiKey: env.LLM_API_KEY,
});

export async function transcribeAudio(filePath: string): Promise<string> {
    const file = fs.createReadStream(filePath);

    const response = await openai.audio.transcriptions.create({
        model: "gpt-4o-mini-transcribe",
        file,
    });

    return response.text;
}
