import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generate } from "@/lib/llm";

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

    if (run.status !== "pending_theme") {
        return NextResponse.json({ error: `Cannot extract themes in status: ${run.status}` }, { status: 400 });
    }

    if (!run.cleaned_transcript) {
        return NextResponse.json({ error: "No cleaned transcript found." }, { status: 400 });
    }

    try {
        const result = await generate(run.cleaned_transcript as string, {
            systemInstruction: [
                "You are a voice-grounded thematic extraction engine.",
                "",
                "Extract core themes strictly from the speaker's language.",
                "",
                "Rules:",
                "- Identify 3–7 themes.",
                "- Each theme must include:",
                "  - title (concise but grounded in transcript language)",
                "  - summary (1–2 sentences, staying semantically faithful)",
                "  - quotes (1–3 direct quotes from transcript, ≤ 25 words each)",
                "- Do NOT introduce abstract frameworks.",
                "- Do NOT add psychological interpretation.",
                "- Do NOT generalize beyond what the speaker explicitly implies.",
                "- Use the speaker's diction wherever possible.",
                "- Themes must feel discovered, not imposed.",
                "",
                "Return ONLY valid JSON matching this exact schema:",
                "",
                "{",
                '  "themes": [',
                "    {",
                '      "title": "string",',
                '      "summary": "string",',
                '      "quotes": ["string"]',
                "    }",
                "  ]",
                "}",
                "",
                "Return strict valid JSON only.",
                "No commentary.",
            ].join("\n"),
            temperature: 0.3,
            maxOutputTokens: 2000,
        });

        const themes: unknown = JSON.parse(result.text);

        const { data, error } = await supabase
            .from("content_runs")
            .update({
                theme_map: themes,
                status: "pending_ideas",
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(err);

        await supabase
            .from("content_runs")
            .update({ status: "error", error_message: message })
            .eq("id", id);

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
