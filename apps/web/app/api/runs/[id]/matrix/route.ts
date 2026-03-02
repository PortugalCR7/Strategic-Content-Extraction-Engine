import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generate } from "@/lib/llm";
import { z } from "zod";

const PlatformSchema = z.object({
    hook: z.string(),
    core_frame: z.string(),
    structure_outline: z.array(z.string()).min(1),
    cta: z.string(),
});

const IdeaMatrixSchema = z.object({
    matrix: z
        .array(
            z.object({
                vector_title: z.string(),
                platforms: z.object({
                    instagram_reel: PlatformSchema,
                    youtube_short: PlatformSchema,
                    linkedin_post: PlatformSchema,
                    long_form_post: PlatformSchema,
                }),
            }),
        )
        .min(1),
});

const MATRIX_SYSTEM_INSTRUCTION = [
    "You are a strategic content deployment engine.",
    "Using the provided angles JSON, generate one structured content concept per platform for each angle.",
    "",
    "Platforms:",
    "- instagram_reel",
    "- youtube_short",
    "- linkedin_post",
    "- long_form_post",
    "",
    "Rules:",
    "- Generate exactly one matrix entry per angle.",
    "- Each matrix entry must include exactly four fixed platforms.",
    "- Preserve the angle's thesis and tension.",
    "- Adjust tone to match platform norms.",
    "- Do not invent new philosophical systems.",
    "- Do not add brand overlays.",
    "- Provide structure only, not full scripts.",
    "- Do not wrap in markdown.",
    "- Do not add commentary before or after JSON.",
    "",
    "Return strict valid JSON in this exact structure:",
    "",
    "{",
    '  "matrix": [',
    "    {",
    '      "vector_title": "string",',
    '      "platforms": {',
    '        "instagram_reel": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        },",
    '        "youtube_short": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        },",
    '        "linkedin_post": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        },",
    '        "long_form_post": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        }",
    "      }",
    "    }",
    "  ]",
    "}",
].join("\n");

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

    if (run.status !== "pending_matrix") {
        return NextResponse.json({ error: `Cannot generate matrix in status: ${run.status}` }, { status: 400 });
    }

    if (!run.angles) {
        return NextResponse.json({ error: "No angles found." }, { status: 400 });
    }

    try {
        const result = await generate(JSON.stringify(run.angles), {
            systemInstruction: MATRIX_SYSTEM_INSTRUCTION,
            temperature: 0.4,
            maxOutputTokens: 4000,
        });

        const parsed = IdeaMatrixSchema.parse(JSON.parse(result.text));

        const { data, error } = await supabase
            .from("content_runs")
            .update({
                idea_matrix: parsed,
                status: "complete",
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
