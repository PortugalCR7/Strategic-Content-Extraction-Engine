import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generate } from "@/lib/llm";
import { z } from "zod";

const AnglesSchema = z.object({
    angles: z
        .array(
            z.object({
                vector_title: z.string(),
                core_tension: z.string(),
                speaker_language_pull: z.string(),
                expansion_direction: z.string(),
            }),
        )
        .min(3)
        .max(7),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const { data: run, error: fetchError } = await supabase
        .from("content_runs")
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !run) {
        return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    if (run.status !== "pending_ideas") {
        return NextResponse.json({ error: `Cannot generate angles in status: ${run.status}` }, { status: 400 });
    }

    if (!run.theme_map) {
        return NextResponse.json({ error: "No theme_map found." }, { status: 400 });
    }

    try {
        const result = await generate(JSON.stringify(run.theme_map), {
            systemInstruction: [
                "You are a narrative vector generator.",
                "Given the theme_map, derive narrative vectors that are grounded in the speaker's original voice and ideas.",
                "Narrative vectors are content directions that preserve the speaker's framing, tension, and intent — not repackaged intellectual frameworks.",
                "Return ONLY valid JSON matching this exact schema:",
                "",
                "{",
                '  "angles": [',
                "    {",
                '      "vector_title": "string — a sharp, voice-native content vector title",',
                '      "core_tension": "string — the core argument as the speaker would frame it",',
                '      "speaker_language_pull": "string — why this resonates, in the speaker\'s world",',
                '      "expansion_direction": "string — the underlying tension the speaker is already surfacing"',
                "    }",
                "  ]",
                "}",
                "",
                "Rules:",
                "- Generate 3-7 narrative vectors.",
                "- Each vector must have exactly 4 fields: vector_title, core_tension, speaker_language_pull, expansion_direction.",
                "- Vectors must be grounded in the theme_map. Do not invent new philosophical systems.",
                "- Use the speaker's own language and framing wherever possible.",
                "- Do not elevate, academicize, or repackage the speaker's ideas.",
                "- Do not add intellectual property, frameworks, or branded concepts.",
                "- Do not wrap in markdown code fences.",
                "- Do not add commentary before or after the JSON.",
                "- Return strict valid JSON only.",
            ].join("\n"),
            temperature: 0.4,
            maxOutputTokens: 2500,
        });

        const parsed = AnglesSchema.parse(JSON.parse(result.text));

        const { data, error } = await supabase
            .from("content_runs")
            .update({
                angles: parsed,
                status: "pending_matrix",
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : JSON.stringify(err, null, 2);
        console.error(err);

        await supabase
            .from("content_runs")
            .update({ status: "error", error_message: message })
            .eq("id", id);

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
