import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
        return NextResponse.json({ error: `Notion OAuth Error: ${error}` }, { status: 400 });
    }

    if (!code) {
        return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    try {
        const response = await fetch("https://api.notion.com/v1/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Basic ${Buffer.from(
                    `${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`,
                ).toString("base64")}`,
            },
            body: JSON.stringify({
                grant_type: "authorization_code",
                code,
                redirect_uri: env.NOTION_REDIRECT_URI,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(
                { error: data.message || "Failed to exchange code" },
                { status: response.status }
            );
        }

        const encryptedToken = encrypt(data.access_token);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const { data: session, error: dbError } = await supabase
            .from("user_sessions")
            .insert([
                {
                    encrypted_access_token: encryptedToken,
                    notion_user_id: data.owner?.user?.id || data.bot_id,
                    expires_at: expiresAt.toISOString(),
                },
            ])
            .select()
            .single();

        if (dbError) throw dbError;

        const cookieStore = await cookies();
        cookieStore.set({
            name: "sce_session",
            value: session.id,
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60,
        });

        return NextResponse.redirect(new URL("/select-container", request.url));
    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
