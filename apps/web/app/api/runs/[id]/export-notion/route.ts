import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { exportRunToNotion } from "@/lib/notionExport";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized. Please connect Notion." }, { status: 401 });
    }

    const { data: run, error: fetchError } = await supabase
        .from("content_runs")
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !run) {
        return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    if (run.status !== "complete") {
        return NextResponse.json({ error: `Cannot export in status: ${run.status}` }, { status: 400 });
    }

    try {
        const { notionPageUrl } = await exportRunToNotion(run, session);

        const { data, error } = await supabase
            .from("content_runs")
            .update({
                notion_url: notionPageUrl,
                status: "ready_for_output",
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

        if (message === "container_not_selected") {
            return NextResponse.json({ error: message }, { status: 400 });
        }

        await supabase
            .from("content_runs")
            .update({ status: "error", error_message: message })
            .eq("id", id);

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
