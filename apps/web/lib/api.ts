const API_BASE = "";
console.log("API_BASE BUILD MARKER v2");

export const AUTH_URL = `${API_BASE}/auth/notion`;

export interface SessionResponse {
    connected: boolean;
    workspace_name?: string;
    root_page_id?: string;
}

export async function getSession(): Promise<SessionResponse> {
    try {
        const res = await fetch(`${API_BASE}/auth/session`, {
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
    const res = await fetch(`${API_BASE}/auth/containers`, {
        credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch containers");
    return res.json();
}

export async function setContainer(pageId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/set-container`, {
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

export interface RunStatus {
    id: string;
    status: string;
    notion_url?: string;
    error_message?: string;
}

export async function submitTranscript(
    transcript: string
): Promise<WebhookResponse> {
    const res = await fetch(`${API_BASE}/wispr/webhook`, {
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

    return res.json() as Promise<WebhookResponse>;
}

/**
 * Poll run status from GET /runs/:id.
 * Currently the backend has no GET endpoint — this is ready for when one is added.
 * Returns null if the endpoint doesn't exist (404) so callers can fall back gracefully.
 */
export async function pollRunStatus(
    runId: string
): Promise<RunStatus | null> {
    try {
        const res = await fetch(`${API_BASE}/runs/${runId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
        });
        if (res.status === 404) return null; // endpoint doesn't exist yet
        if (!res.ok) return null;
        return res.json() as Promise<RunStatus>;
    } catch {
        return null;
    }
}

