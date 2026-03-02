import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
    const notionAuthUrl =
        `https://www.notion.so/install-integration` +
        `?response_type=code` +
        `&client_id=${env.NOTION_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(env.NOTION_REDIRECT_URI)}` +
        `&owner=user`;

    return NextResponse.redirect(notionAuthUrl);
}
