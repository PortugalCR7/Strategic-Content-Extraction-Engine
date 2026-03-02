const API_BASE = "";

export const AUTH_URL = `/api/auth/notion`;

export interface SessionResponse {
    connected: boolean;
    workspace_name?: string;
    root_page_id?: string;
}

export async function getSession(): Promise<SessionResponse> {
    try {
        const res = await fetch(`/api/auth/session`, {
            credentials: "include",
        });
        if (!res.ok) return { connected: false };
        return res.json();
    } catch {
        return { connected: false };
    }
}

export interface NotionContainer {
    id: string;
    title: string;
}

export async function getContainers(): Promise<NotionContainer[]> {
    const res = await fetch(`/api/auth/containers`, {
        credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch containers");
    return res.json();
}

export async function setContainer(pageId: string): Promise<void> {
    const res = await fetch(`/api/auth/set-container`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId }),
        credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to set container");
}

export interface WebhookResponse {
    run_id: string;
    status: string;
    notion_url: string;
}

export async function submitTranscript(
    transcript: string
): Promise<WebhookResponse> {
    const res = await fetch(`/api/wispr/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
        credentials: "include",
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
            (body as { error?: string } | null)?.error ??
            `Request failed (${res.status})`;
        throw new Error(message);
    }

    return res.json();
}