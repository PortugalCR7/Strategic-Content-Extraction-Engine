import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
        return NextResponse.json(
            { error: "File uploads are not supported. Send JSON with { transcript: string }." },
            { status: 400 }
        );
    }

    const { data: run, error: fetchError } = await supabase
        .from("content_runs")
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !run) {
        return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    if (run.status !== "pending_transcript") {
        return NextResponse.json(
            { error: `Cannot ingest in status: ${run.status}` },
            { status: 400 }
        );
    }

    let body: { transcript?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!body.transcript || body.transcript.trim().length === 0) {
        return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .from("content_runs")
            .update({
                raw_transcript: body.transcript,
                status: "pending_clean",
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : JSON.stringify(err, null, 2);

        await supabase
            .from("content_runs")
            .update({
                status: "error",
                error_message: message,
            })
            .eq("id", id);

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
