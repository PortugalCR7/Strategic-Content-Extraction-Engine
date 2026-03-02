import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
    let client_id: string | undefined;
    try {
        const body = await request.json();
        client_id = body.client_id;
    } catch (e) { /* body might be empty */ }

    const { data, error } = await supabase
        .from("content_runs")
        .insert([{ client_id }])
        .select()
        .single();

    if (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
