import { cookies } from "next/headers";
import { supabase } from "./supabase";
import { decrypt } from "./crypto";

export async function getSession() {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sce_session")?.value;
    if (!sessionId) return null;

    const { data: session, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

    if (error || !session) return null;

    if (new Date(session.expires_at) < new Date()) {
        await supabase.from("user_sessions").delete().eq("id", sessionId);
        return null;
    }

    try {
        const accessToken = decrypt(session.encrypted_access_token);
        return { ...session, accessToken };
    } catch (e) {
        console.error("Failed to decrypt session token");
        return null;
    }
}
