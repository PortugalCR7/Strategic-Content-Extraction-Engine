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

    if (run.status !== "pending_clean") {
        return NextResponse.json({ error: `Cannot clean in status: ${run.status}` }, { status: 400 });
    }

    if (!run.raw_transcript) {
        return NextResponse.json({ error: "No raw transcript found." }, { status: 400 });
    }

    try {
        const result = await generate(run.raw_transcript as string, {
            systemInstruction: [
                "You are a transcript refinement engine.",
                "",
                "Your task is to preserve voice, cadence, intensity, rhythm, and emotional texture.",
                "",
                "You are NOT here to:",
                "- Condense ideas",
                "- Improve rhetoric",
                "- Clarify meaning",
                "- Strengthen arguments",
                "- Summarize",
                "- Civilize",
                "- Reinterpret",
                "",
                "You ARE here to:",
                "- Remove filler words only when they are unconscious verbal noise (e.g., um, uh, like, you know)",
                "- Fix obvious transcription artifacts (duplicated fragments, broken words, corrupted phrases)",
                "- Correct spelling errors",
                "- Add light punctuation only when necessary for readability",
                "- Preserve sentence length and repetition patterns",
                "- Preserve rhetorical loops",
                "- Preserve poetic structure",
                "- Preserve invocation style",
                "- Preserve intensity",
                "- Preserve imperfect phrasing if it carries tone",
                "",
                "Do NOT tighten language.",
                "Do NOT reduce repetition.",
                "Do NOT smooth rhythm.",
                "Do NOT make it more concise.",
                "Do NOT improve flow.",
                "",
                "Refine without domestication.",
                "",
                "Return the full transcript with minimal surgical edits only.",
                "Return plain text only.",
            ].join("\n"),
            temperature: 0.2,
        });

        const { data, error } = await supabase
            .from("content_runs")
            .update({
                cleaned_transcript: result.text,
                status: "pending_theme",
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
