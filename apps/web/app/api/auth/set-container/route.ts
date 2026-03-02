import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { Client } from "@notionhq/client";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { page_id } = body as { page_id?: string };

    if (!page_id) return NextResponse.json({ error: "page_id is required" }, { status: 400 });

    const client = new Client({ auth: session.accessToken });
    try {
        await client.pages.retrieve({ page_id });
    } catch (e) {
        return NextResponse.json({ error: "Invalid page_id or no access" }, { status: 400 });
    }

    const { error } = await supabase
        .from("user_sessions")
        .update({ root_page_id: page_id })
        .eq("id", session.id);

    if (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
