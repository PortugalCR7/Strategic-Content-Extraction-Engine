import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
    const session = await getSession();

    const payload = {
        connected: !!session,
        root_page_id: session?.root_page_id || null,
        notion_user_id: session?.notion_user_id || null,
        expires_at: session?.expires_at || null,
    };

    return NextResponse.json(payload);
}
