import { supabase } from "../src/lib/supabase.js";

async function initDb() {
    console.log("Checking for user_sessions table...");

    // We can't easily run arbitrary SQL via the supabase client without a stored procedure,
    // but we can try to query it to see if it exists.
    const { error } = await supabase.from("user_sessions").select("id").limit(1);

    if (error && error.code === "42P01") {
        console.log("Table 'user_sessions' does not exist.");
        console.log("Please run the following SQL in your Supabase SQL Editor:");
        console.log(`
CREATE TABLE user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    encrypted_access_token text NOT NULL,
    notion_user_id text,
    root_page_id text,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL
);

-- Optional: Add an index on expires_at for easier cleanup
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
        `);
    } else if (error) {
        console.error("Error checking table:", error.message);
    } else {
        console.log("Table 'user_sessions' already exists.");
    }
}

initDb();
