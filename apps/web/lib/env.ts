
export const env = {
    API_PORT: Number(process.env["API_PORT"] ?? 3001),
    API_HOST: process.env["API_HOST"] ?? "0.0.0.0",

    // ── Supabase (next phase) ───────────────────────
    SUPABASE_URL: process.env["SUPABASE_URL"] ?? "",
    SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",

    // ── LLM ─────────────────────────────────────────
    LLM_API_KEY: process.env["LLM_API_KEY"] ?? "",

    // ── Google Docs ─────────────────────────────────
    GOOGLE_PROJECT_ID: process.env["GOOGLE_PROJECT_ID"] ?? "",
    GOOGLE_CLIENT_EMAIL: process.env["GOOGLE_CLIENT_EMAIL"] ?? "",
    GOOGLE_PRIVATE_KEY: process.env["GOOGLE_PRIVATE_KEY"] ?? "",
    GOOGLE_DOCS_FOLDER_ID: process.env["GOOGLE_DOCS_FOLDER_ID"] ?? "",

    // ── Notion ──────────────────────────────────────
    NOTION_API_KEY: process.env["NOTION_API_KEY"] ?? "",
    NOTION_CLIENT_ID: process.env["NOTION_CLIENT_ID"] ?? "",
    NOTION_CLIENT_SECRET: process.env["NOTION_CLIENT_SECRET"] ?? "",
    NOTION_REDIRECT_URI: process.env["NOTION_REDIRECT_URI"] ?? "",

    // ── Session ─────────────────────────────────────
    SESSION_ENCRYPTION_SECRET: process.env["SESSION_ENCRYPTION_SECRET"] ?? "default_secret_change_me_in_production",
} as const;
