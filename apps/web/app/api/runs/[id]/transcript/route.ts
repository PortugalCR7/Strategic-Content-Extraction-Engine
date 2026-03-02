import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    let transcript: string | undefined;
    try {
        const body = await request.json();
        transcript = body.transcript;
    } catch (e) { }

    if (!transcript || transcript.trim().length === 0) {
        return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
        .from("content_runs")
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
        return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    if (existing.status !== "pending_transcript") {
        return NextResponse.json({ error: `Cannot attach transcript in status: ${existing.status}` }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("content_runs")
        .update({
            raw_transcript: transcript,
            status: "pending_clean",
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
