import "dotenv/config";
import { Client } from "@notionhq/client";
import { createHash } from "node:crypto";
import Fastify, { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { env } from "./env.js";
import { supabase } from "./lib/supabase.js";
import { generate } from "./lib/llm.js";
import { createGoogleDoc } from "./lib/googleDocs.js";
import { exportRunToNotion } from "./lib/notionExport.js";
import { encrypt, decrypt } from "./lib/crypto.js";

const AnglesSchema = z.object({
    angles: z.array(
        z.object({
            vector_title: z.string(),
            core_tension: z.string(),
            speaker_language_pull: z.string(),
            expansion_direction: z.string(),
        })
    ).min(3).max(7),
});

const PlatformSchema = z.object({
    hook: z.string(),
    core_frame: z.string(),
    structure_outline: z.array(z.string()).min(1),
    cta: z.string(),
});

const IdeaMatrixSchema = z.object({
    matrix: z.array(
        z.object({
            vector_title: z.string(),
            platforms: z.object({
                instagram_reel: PlatformSchema,
                youtube_short: PlatformSchema,
                linkedin_post: PlatformSchema,
                long_form_post: PlatformSchema,
            }),
        })
    ).min(1),
});

const MATRIX_SYSTEM_INSTRUCTION = [
    "You are a strategic content deployment engine.",
    "Using the provided angles JSON, generate one structured content concept per platform for each angle.",
    "",
    "Platforms:",
    "- instagram_reel",
    "- youtube_short",
    "- linkedin_post",
    "- long_form_post",
    "",
    "Rules:",
    "- Generate exactly one matrix entry per angle.",
    "- Each matrix entry must include exactly four fixed platforms.",
    "- Preserve the angle's thesis and tension.",
    "- Adjust tone to match platform norms.",
    "- Do not invent new philosophical systems.",
    "- Do not add brand overlays.",
    "- Provide structure only, not full scripts.",
    "- Do not wrap in markdown.",
    "- Do not add commentary before or after JSON.",
    "",
    "Return strict valid JSON in this exact structure:",
    "",
    "{",
    '  "matrix": [',
    "    {",
    '      "vector_title": "string",',
    '      "platforms": {',
    '        "instagram_reel": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        },",
    '        "youtube_short": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        },",
    '        "linkedin_post": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        },",
    '        "long_form_post": {',
    '          "hook": "string",',
    '          "core_frame": "string",',
    '          "structure_outline": ["string"],',
    '          "cta": "string"',
    "        }",
    "      }",
    "    }",
    "  ]",
    "}",
].join("\n");

const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, {
    origin: (origin, callback) => {
        const allowed = [
            "http://localhost:3002",
            "https://strategic-content-extraction-engine.vercel.app"
        ];

        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
});

await app.register(cookie);

/**
 * Validates session from cookie and returns decrypted Notion token
 */
async function getSessionFromRequest(request: FastifyRequest) {
    const sessionId = request.cookies["sce_session"];
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
        request.log.error("Failed to decrypt session token");
        return null;
    }
}

app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
});

app.get("/auth/session", async (request, reply) => {
    const session = await getSessionFromRequest(request);

    const payload = {
        connected: !!session,
        root_page_id: session?.root_page_id || null,
        notion_user_id: session?.notion_user_id || null,
        expires_at: session?.expires_at || null
    };

    return payload;
});

app.get("/auth/notion", async (request, reply) => {
    const notionAuthUrl =
        `https://www.notion.so/install-integration` +
        `?response_type=code` +
        `&client_id=${env.NOTION_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(env.NOTION_REDIRECT_URI)}` +
        `&owner=user`;

    return reply.redirect(notionAuthUrl);
});

app.get("/auth/notion/callback", async (request, reply) => {
    const { code, error } = request.query as { code?: string; error?: string };

    if (error) {
        return reply.status(400).send({ error: `Notion OAuth Error: ${error}` });
    }

    if (!code) {
        return reply.status(400).send({ error: "No code provided" });
    }

    try {
        const response = await fetch("https://api.notion.com/v1/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Basic ${Buffer.from(
                    `${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`
                ).toString("base64")}`,
            },
            body: JSON.stringify({
                grant_type: "authorization_code",
                code,
                redirect_uri: env.NOTION_REDIRECT_URI,
            }),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            return reply.status(response.status).send({ error: data.message || "Failed to exchange code" });
        }

        const encryptedToken = encrypt(data.access_token);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const { data: session, error: dbError } = await supabase
            .from("user_sessions")
            .insert([{
                encrypted_access_token: encryptedToken,
                notion_user_id: data.owner?.user?.id || data.bot_id,
                expires_at: expiresAt.toISOString()
            }])
            .select()
            .single();

        if (dbError) throw dbError;

        const isProd = process.env["NODE_ENV"] === "production";
        reply.setCookie("sce_session", session.id, {
            path: "/",
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 // 7 days
        });

        // Redirect back to frontend container selection
        const frontendUrl = process.env["FRONTEND_URL"];

        console.log("FRONTEND_URL at runtime (callback):", frontendUrl);

        if (!frontendUrl) {
            throw new Error("FRONTEND_URL is not defined");
        }

        return reply.redirect(`${frontendUrl}/select-container`);

        app.get("/auth/containers", async (request, reply) => {
            const session = await getSessionFromRequest(request);
            if (!session) return reply.status(401).send({ error: "Unauthorized" });

            const client = new Client({ auth: session.accessToken });
            const response = await client.search({
                filter: { property: "object", value: "page" }
            });

            const containers = response.results
                .filter((page: any) => page.object === "page")
                .map((page: any) => {
                    const titleProperty = Object.values(page.properties || {}).find((p: any) => p.type === "title") as any;
                    const title = titleProperty?.title?.[0]?.plain_text || "Untitled";
                    return { id: page.id, title };
                });

            return containers;
        });

        app.post("/auth/set-container", async (request, reply) => {
            const { page_id } = request.body as { page_id: string };
            const session = await getSessionFromRequest(request);
            if (!session) return reply.status(401).send({ error: "Unauthorized" });

            if (!page_id) return reply.status(400).send({ error: "page_id is required" });

            // Validate page exists in session token visibility
            const client = new Client({ auth: session.accessToken });
            try {
                await client.pages.retrieve({ page_id });
            } catch (e) {
                return reply.status(400).send({ error: "Invalid page_id or no access" });
            }

            const { error } = await supabase
                .from("user_sessions")
                .update({ root_page_id: page_id })
                .eq("id", session.id);

            if (error) throw error;

            return { success: true };
        });

        app.post("/runs", async (request, reply) => {
            const { client_id } = request.body as { client_id?: string };

            const { data, error } = await supabase
                .from("content_runs")
                .insert([{ client_id }])
                .select()
                .single();

            if (error) {
                app.log.error(error);
                return reply.status(500).send({ error: error.message });
            }

            return data;
        });

        app.post("/runs/:id/transcript", async (request, reply) => {
            const { id } = request.params as { id: string };
            const { transcript } = request.body as { transcript?: string };

            if (!transcript || transcript.trim().length === 0) {
                return reply.status(400).send({ error: "Transcript is required." });
            }

            // Check existing run
            const { data: existing, error: fetchError } = await supabase
                .from("content_runs")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !existing) {
                return reply.status(404).send({ error: "Run not found." });
            }

            if (existing.status !== "pending_transcript") {
                return reply.status(400).send({
                    error: `Cannot attach transcript in status: ${existing.status}`,
                });
            }

            // Update run
            const { data, error } = await supabase
                .from("content_runs")
                .update({
                    raw_transcript: transcript,
                    status: "pending_clean",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", id)
                .select()
                .single();

            if (error) {
                request.log.error(error);
                return reply.status(500).send({ error: error.message });
            }

            return data;
        });

        app.post("/runs/:id/clean", async (request, reply) => {
            const { id } = request.params as { id: string };

            // Fetch run
            const { data: run, error: fetchError } = await supabase
                .from("content_runs")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !run) {
                return reply.status(404).send({ error: "Run not found." });
            }

            if (run.status !== "pending_clean") {
                return reply.status(400).send({
                    error: `Cannot clean in status: ${run.status}`,
                });
            }

            if (!run.raw_transcript) {
                return reply.status(400).send({
                    error: "No raw transcript found.",
                });
            }

            try {
                const result = await generate(run.raw_transcript as string, {
                    systemInstruction: [
                        "You are a transcript refinement engine.",
                        "",
                        "Your task is to preserve voice, cadence, intensity, rhythm, and emotional texture.",
                        "",
                        "You are NOT here to:",
                        "- Condense ideas",
                        "- Improve rhetoric",
                        "- Clarify meaning",
                        "- Strengthen arguments",
                        "- Summarize",
                        "- Civilize",
                        "- Reinterpret",
                        "",
                        "You ARE here to:",
                        "- Remove filler words only when they are unconscious verbal noise (e.g., um, uh, like, you know)",
                        "- Fix obvious transcription artifacts (duplicated fragments, broken words, corrupted phrases)",
                        "- Correct spelling errors",
                        "- Add light punctuation only when necessary for readability",
                        "- Preserve sentence length and repetition patterns",
                        "- Preserve rhetorical loops",
                        "- Preserve poetic structure",
                        "- Preserve invocation style",
                        "- Preserve intensity",
                        "- Preserve imperfect phrasing if it carries tone",
                        "",
                        "Do NOT tighten language.",
                        "Do NOT reduce repetition.",
                        "Do NOT smooth rhythm.",
                        "Do NOT make it more concise.",
                        "Do NOT improve flow.",
                        "",
                        "Refine without domestication.",
                        "",
                        "Return the full transcript with minimal surgical edits only.",
                        "Return plain text only.",
                    ].join("\n"),
                    temperature: 0.2,
                });

                const { data, error } = await supabase
                    .from("content_runs")
                    .update({
                        cleaned_transcript: result.text,
                        status: "pending_theme",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", id)
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return data;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                request.log.error(err);

                await supabase
                    .from("content_runs")
                    .update({
                        status: "error",
                        error_message: message,
                    })
                    .eq("id", id);

                return reply.status(500).send({ error: message });
            }
        });

        app.post("/runs/:id/theme", async (request, reply) => {
            const { id } = request.params as { id: string };

            // Fetch run
            const { data: run, error: fetchError } = await supabase
                .from("content_runs")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !run) {
                return reply.status(404).send({ error: "Run not found." });
            }

            if (run.status !== "pending_theme") {
                return reply.status(400).send({
                    error: `Cannot extract themes in status: ${run.status}`,
                });
            }

            if (!run.cleaned_transcript) {
                return reply.status(400).send({
                    error: "No cleaned transcript found.",
                });
            }

            try {
                const result = await generate(run.cleaned_transcript as string, {
                    systemInstruction: [
                        "You are a voice-grounded thematic extraction engine.",
                        "",
                        "Extract core themes strictly from the speaker's language.",
                        "",
                        "Rules:",
                        "- Identify 3–7 themes.",
                        "- Each theme must include:",
                        "  - title (concise but grounded in transcript language)",
                        "  - summary (1–2 sentences, staying semantically faithful)",
                        "  - quotes (1–3 direct quotes from transcript, ≤ 25 words each)",
                        "- Do NOT introduce abstract frameworks.",
                        "- Do NOT add psychological interpretation.",
                        "- Do NOT generalize beyond what the speaker explicitly implies.",
                        "- Use the speaker's diction wherever possible.",
                        "- Themes must feel discovered, not imposed.",
                        "",
                        "Return ONLY valid JSON matching this exact schema:",
                        "",
                        "{",
                        '  "themes": [',
                        "    {",
                        '      "title": "string",',
                        '      "summary": "string",',
                        '      "quotes": ["string"]',
                        "    }",
                        "  ]",
                        "}",
                        "",
                        "Return strict valid JSON only.",
                        "No commentary.",
                    ].join("\n"),
                    temperature: 0.3,
                    maxOutputTokens: 2000,
                });

                const themes: unknown = JSON.parse(result.text);

                const { data, error } = await supabase
                    .from("content_runs")
                    .update({
                        theme_map: themes,
                        status: "pending_ideas",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", id)
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return data;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                request.log.error(err);

                await supabase
                    .from("content_runs")
                    .update({
                        status: "error",
                        error_message: message,
                    })
                    .eq("id", id);

                return reply.status(500).send({ error: message });
            }
        });

        app.post("/runs/:id/angles", async (request, reply) => {

            const { id } = request.params as { id: string };

            // Fetch run
            const { data: run, error: fetchError } = await supabase
                .from("content_runs")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !run) {
                return reply.status(404).send({ error: "Run not found." });
            }

            if (run.status !== "pending_ideas") {
                return reply.status(400).send({
                    error: `Cannot generate angles in status: ${run.status}`,
                });
            }

            if (!run.theme_map) {
                return reply.status(400).send({
                    error: "No theme_map found.",
                });
            }

            try {
                const result = await generate(
                    JSON.stringify(run.theme_map),
                    {
                        systemInstruction: [
                            "You are a narrative vector generator.",
                            "Given the theme_map, derive narrative vectors that are grounded in the speaker's original voice and ideas.",
                            "Narrative vectors are content directions that preserve the speaker's framing, tension, and intent — not repackaged intellectual frameworks.",
                            "Return ONLY valid JSON matching this exact schema:",
                            "",
                            "{",
                            '  "angles": [',
                            "    {",
                            '      "vector_title": "string — a sharp, voice-native content vector title",',
                            '      "core_tension": "string — the core argument as the speaker would frame it",',
                            '      "speaker_language_pull": "string — why this resonates, in the speaker\'s world",',
                            '      "expansion_direction": "string — the underlying tension the speaker is already surfacing"',
                            "    }",
                            "  ]",
                            "}",
                            "",
                            "Rules:",
                            "- Generate 3-7 narrative vectors.",
                            "- Each vector must have exactly 4 fields: vector_title, core_tension, speaker_language_pull, expansion_direction.",
                            "- Vectors must be grounded in the theme_map. Do not invent new philosophical systems.",
                            "- Use the speaker's own language and framing wherever possible.",
                            "- Do not elevate, academicize, or repackage the speaker's ideas.",
                            "- Do not add intellectual property, frameworks, or branded concepts.",
                            "- Do not wrap in markdown code fences.",
                            "- Do not add commentary before or after the JSON.",
                            "- Return strict valid JSON only.",
                        ].join("\n"),
                        temperature: 0.4,
                        maxOutputTokens: 2500,
                    }
                );

                const parsed = AnglesSchema.parse(JSON.parse(result.text));

                const { data, error } = await supabase
                    .from("content_runs")
                    .update({
                        angles: parsed,
                        status: "pending_matrix",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", id)
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return data;
            } catch (err: unknown) {
                const message =
                    err instanceof Error
                        ? err.message
                        : JSON.stringify(err, null, 2);

                await supabase
                    .from("content_runs")
                    .update({
                        status: "error",
                        error_message: message,
                    })
                    .eq("id", id);

                return reply.status(500).send({ error: message });
            }
        });

        app.post("/runs/:id/matrix", async (request, reply) => {
            const { id } = request.params as { id: string };

            // Fetch run
            const { data: run, error: fetchError } = await supabase
                .from("content_runs")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !run) {
                return reply.status(404).send({ error: "Run not found." });
            }

            if (run.status !== "pending_matrix") {
                return reply.status(400).send({
                    error: `Cannot generate matrix in status: ${run.status}`,
                });
            }

            if (!run.angles) {
                return reply.status(400).send({
                    error: "No angles found.",
                });
            }

            try {
                const result = await generate(
                    JSON.stringify(run.angles),
                    {
                        systemInstruction: MATRIX_SYSTEM_INSTRUCTION,
                        temperature: 0.4,
                        maxOutputTokens: 4000,
                    }
                );

                const parsed = IdeaMatrixSchema.parse(JSON.parse(result.text));

                const { data, error } = await supabase
                    .from("content_runs")
                    .update({
                        idea_matrix: parsed,
                        status: "complete",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", id)
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return data;
            } catch (err: unknown) {
                const message =
                    err instanceof Error
                        ? err.message
                        : JSON.stringify(err, null, 2);

                await supabase
                    .from("content_runs")
                    .update({
                        status: "error",
                        error_message: message,
                    })
                    .eq("id", id);

                return reply.status(500).send({ error: message });
            }
        });

        app.post("/runs/:id/export-notion", async (request, reply) => {
            const { id } = request.params as { id: string };

            const session = await getSessionFromRequest(request);
            if (!session) {
                return reply.status(401).send({ error: "Unauthorized. Please connect Notion." });
            }

            const { data: run, error: fetchError } = await supabase
                .from("content_runs")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !run) {
                return reply.status(404).send({ error: "Run not found." });
            }

            if (run.status !== "complete") {
                return reply.status(400).send({
                    error: `Cannot export in status: ${run.status}`,
                });
            }

            try {
                const { notionPageUrl } = await exportRunToNotion(run, session);

                const { data, error } = await supabase
                    .from("content_runs")
                    .update({
                        notion_url: notionPageUrl,
                        status: "ready_for_output",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", id)
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return data;
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : String(err);

                if (message === "container_not_selected") {
                    return reply.status(400).send({ error: message });
                }

                await supabase
                    .from("content_runs")
                    .update({
                        status: "error",
                        error_message: message,
                    })
                    .eq("id", id);

                return reply.status(500).send({ error: message });
            }
        });

        app.post("/runs/:id/ingest", async (request, reply) => {
            const { id } = request.params as { id: string };

            const contentType = request.headers["content-type"] ?? "";
            if (contentType.includes("multipart/form-data")) {
                return reply.status(400).send({
                    error: "File uploads are not supported. Send JSON with { transcript: string }.",
                });
            }

            const { data: run, error: fetchError } = await supabase
                .from("content_runs")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !run) {
                return reply.status(404).send({ error: "Run not found." });
            }

            if (run.status !== "pending_transcript") {
                return reply.status(400).send({
                    error: `Cannot ingest in status: ${run.status}`,
                });
            }

            const body = request.body as { transcript?: string };
            if (!body.transcript || body.transcript.trim().length === 0) {
                return reply.status(400).send({ error: "Transcript is required." });
            }

            try {
                const { data, error } = await supabase
                    .from("content_runs")
                    .update({
                        raw_transcript: body.transcript,
                        status: "pending_clean",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", id)
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return data;
            } catch (err: unknown) {

                const message =
                    err instanceof Error
                        ? err.message
                        : JSON.stringify(err, null, 2);

                await supabase
                    .from("content_runs")
                    .update({
                        status: "error",
                        error_message: message,
                    })
                    .eq("id", id);

                return reply.status(500).send({ error: message });
            }
        });

        app.post("/google/test", async (_request, reply) => {
            try {
                const result = await createGoogleDoc("SCEE Test Document");
                return result;
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : String(err);
                return reply.status(500).send({ error: message });
            }
        });

        /* ── Wispr webhook — full pipeline orchestrator ──── */

        function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
            return new Promise<T>((resolve, reject) => {
                const timer = setTimeout(() => {
                    const err = new Error(`Step timeout: ${label}`);
                    (err as any).timeout_source = label;
                    (err as any).timeout_duration_ms = ms;
                    reject(err);
                }, ms);
                promise.then(
                    (v) => { clearTimeout(timer); resolve(v); },
                    (e) => { clearTimeout(timer); reject(e); },
                );
            });
        }

        app.post("/wispr/webhook", async (request, reply) => {
            const body = request.body as { transcript?: string; dry_run?: boolean };
            let finalRun: any;

            if (!body.transcript || body.transcript.trim().length === 0) {
                return reply.status(400).send({ error: "Transcript is required." });
            }

            /* ── 4. Signature scaffold (not enforced) ──────── */
            const _signature = request.headers["x-wispr-signature"];
            // TODO: enforce signature validation before external exposure

            const isDryRun = body.dry_run === true;

            /* ── Transcript size enforcement (10k word hard cap) ── */
            const wordCount = body.transcript.trim().split(/\s+/).length;
            if (wordCount > 10_000) {
                request.log.info({ event: "transcript_blocked_large", word_count: wordCount }, "wispr/webhook: transcript too large");
                return reply.status(400).send({
                    error: "transcript_too_large",
                    message: "Transcript exceeds 10,000 words. Please split into two sessions for best fidelity.",
                    word_count: wordCount,
                });
            }

            /* ── 1. Idempotency — SHA-256 transcript hash ──── */
            const transcriptHash = createHash("sha256").update(body.transcript).digest("hex");

            const { data: existing } = await supabase
                .from("content_runs")
                .select("id, status, notion_url")
                .eq("transcript_hash", transcriptHash)
                .limit(1)
                .maybeSingle();

            if (existing) {
                request.log.info({ run_id: existing.id, transcript_hash: transcriptHash, resolution: "cache_hit" }, "wispr/webhook: duplicate transcript");
                return { run_id: existing.id, status: existing.status, notion_url: existing.notion_url };
            }

            /* 0. Create run */
            const { data: created, error: createError } = await supabase
                .from("content_runs")
                .insert([{ status: "pending_transcript", transcript_hash: transcriptHash }])
                .select()
                .single();

            if (createError || !created) {
                request.log.error(createError);
                return reply.status(500).send({ error: createError?.message ?? "Failed to create run." });
            }

            const runId: string = created.id;
            request.log.info({ run_id: runId, transcript_hash: transcriptHash, resolution: "new_run" }, "wispr/webhook: run created");

            /* ── 2. Structured step logging + timing ────────── */
            const stepTimings: Record<string, number> = {};
            let currentStep = "init";

            const stepTimer = (label: string) => {
                currentStep = label;
                const start = Date.now();
                return (success: boolean) => {
                    const ms = Date.now() - start;
                    stepTimings[label] = ms;
                    request.log.info({ run_id: runId, step: label, duration_ms: ms, success });
                };
            };

            const setError = async (message: string) => {
                await supabase
                    .from("content_runs")
                    .update({
                        status: "error",
                        error_message: message,
                        step_timings: stepTimings,
                    })
                    .eq("id", runId);
            };

            let chunkRetentions: { chunk_index: number; input_chars: number; output_chars: number; retention_pct: number }[] = [];

            try {
                /* 1. Ingest */
                let done = stepTimer("ingest");
                const { error: ingestError } = await supabase
                    .from("content_runs")
                    .update({
                        raw_transcript: body.transcript,
                        status: "pending_clean",
                        step_timings: stepTimings,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", runId);
                if (ingestError) throw ingestError;
                done(true);

                /* 2. Clean — Deterministic Normalization */
                done = stepTimer("clean");

                const originalText = body.transcript;
                const originalCharCount = originalText.length;

                function normalizeTranscript(text: string): string {
                    let cleaned = text;

                    // 1. Remove timestamp patterns
                    cleaned = cleaned.replace(/\[\d{1,2}:\d{2}(:\d{2})?\]/g, "");
                    cleaned = cleaned.replace(/\(\d{1,2}:\d{2}(:\d{2})?\)/g, "");
                    cleaned = cleaned.replace(/\d{1,2}:\d{2}(:\d{2})?\s*-->\s*\d{1,2}:\d{2}(:\d{2})?/g, "");
                    cleaned = cleaned.replace(/^\s*\d+\s*$/gm, "");

                    // 2. Remove obvious filler tokens
                    cleaned = cleaned.replace(/\b(?:um|uh)\b/gi, "");

                    // Repeated word stutters (e.g. "the the", "I I") - run twice for triples
                    cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, "$1");
                    cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, "$1");

                    // 3. Normalize whitespace
                    cleaned = cleaned.replace(/\s+([.,?!])/g, "$1"); // Fix stranded punctuation 
                    cleaned = cleaned.replace(/[ \t]+/g, " "); // Collapse multiple spaces
                    cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // Normalize line breaks
                    cleaned = cleaned.replace(/ \n/g, "\n").replace(/\n /g, "\n");

                    return cleaned.trim();
                }

                const cleanedText = normalizeTranscript(originalText);
                const finalCleanedCharCount = cleanedText.length;
                const retentionPct = +(finalCleanedCharCount / originalCharCount).toFixed(3);

                request.log.info({
                    run_id: runId,
                    step: "clean",
                    input_char_length: originalCharCount,
                    output_char_length: finalCleanedCharCount,
                    retention_pct: retentionPct
                }, "wispr/webhook: deterministic clean completed");

                const { error: cleanError } = await supabase
                    .from("content_runs")
                    .update({
                        cleaned_transcript: cleanedText,
                        status: "pending_theme",
                        step_timings: stepTimings,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", runId);
                if (cleanError) throw cleanError;
                done(true);

                /* 3. Theme (timeout: 30s) */
                done = stepTimer("theme");
                const themeResult = await withTimeout(
                    generate(cleanedText, {
                        systemInstruction: [
                            "You are a voice-grounded thematic extraction engine.",
                            "",
                            "Extract core themes strictly using the speaker's exact language. Do not summarize or synthesize. Quote them.",
                            "",
                            "Rules:",
                            "- Identify 3–7 themes.",
                            "- Each theme must include:",
                            "  - title (must be a direct, punchy 2-4 word verbatim quote from the transcript, NEVER a generic label)",
                            "  - summary (2–3 sentences explaining the Core Frame, maintaining the speaker's gritty tone)",
                            "  - quotes (exactly 1 direct verbatim quote, exactly as spoken)",
                            "- NEVER introduce abstract frameworks or psychological interpretation.",
                            "- NEVER use sterile phrasing like 'This highlights...', 'This demonstrates...', 'This emphasizes...'",
                            "- Themes must feel dug out of the dirt of the transcript, explicitly grounded in the speaker's language.",
                            "",
                            "Return ONLY valid JSON matching this exact schema:",
                            "",
                            "{",
                            '  "themes": [',
                            "    {",
                            '      "title": "string",',
                            '      "summary": "string",',
                            '      "quotes": ["string"]',
                            "    }",
                            "  ]",
                            "}",
                            "",
                            "Return strict valid JSON only.",
                            "No commentary.",
                        ].join("\n"),
                        temperature: 0.3,
                        maxOutputTokens: 2000,
                    }),
                    120_000,
                    "theme",
                );

                const themes: unknown = JSON.parse(themeResult.text);

                // --- PHASE 5 TELEMETRY ---
                try {
                    const normText = cleanedText.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
                    const genericPhrases = ["in today's world", "exploring the idea", "this highlights", "this resonates", "this demonstrates", "this emphasizes", "delves into"];
                    let quoteMatch = true;
                    let detectedGeneric = [] as string[];
                    if (themes && Array.isArray((themes as any).themes)) {
                        for (const t of (themes as any).themes) {
                            const q: string = (t.quotes && t.quotes[0]) || "";
                            if (q) {
                                const nq = q.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
                                if (nq && !normText.includes(nq)) quoteMatch = false;
                            }
                            const summary = (t.summary || "").toLowerCase();
                            genericPhrases.forEach(gp => { if (summary.includes(gp)) detectedGeneric.push(gp); });
                        }
                    }
                    request.log.info({ step: "telemetry_theme", quote_verbatim_match: quoteMatch, detected_generic_phrases: [...new Set(detectedGeneric)] }, "wispr/webhook: theme telemetry");
                } catch (e) { }
                // -------------------------

                const { error: themeError } = await supabase
                    .from("content_runs")
                    .update({
                        theme_map: themes,
                        status: "pending_ideas",
                        step_timings: stepTimings,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", runId);
                if (themeError) throw themeError;
                done(true);

                /* 4. Angles (timeout: 45s) */
                done = stepTimer("angles");
                const anglesResult = await withTimeout(
                    generate(
                        JSON.stringify(themes),
                        {
                            systemInstruction: [
                                "You are a narrative vector generator.",
                                "Given the theme_map, derive narrative vectors grounded entirely in the speaker's original voice.",
                                "Narrative vectors are content directions that preserve the speaker's tension and framing. They are not academic or intellectualized.",
                                "Return ONLY valid JSON matching this exact schema:",
                                "",
                                "{",
                                '  "angles": [',
                                "    {",
                                '      "vector_title": "string — a sharp, voice-native title (3-6 words, using speaker\'s vocabulary)",',
                                '      "core_tension": "string — the exact friction the speaker is highlighting, framed as a conflict",',
                                '      "speaker_language_pull": "string — MUST contain 4-8 consecutive words VERBATIM from the transcript that anchor this angle",',
                                '      "expansion_direction": "string — a CTA that logically completes the hook tension and points where the idea goes next"',
                                "    }",
                                "  ]",
                                "}",
                                "",
                                "Rules:",
                                "- Generate 3-7 narrative vectors.",
                                "- Each vector must have exactly 4 fields.",
                                "- 'speaker_language_pull' MUST contain a 4-8 consecutive word direct quote in quotation marks.",
                                "- NEVER use sterile, generic, or AI-like phrasing (e.g., 'In today\\'s world', 'Exploring the idea of', 'This highlights', 'This resonates').",
                                "- Do not elevate, academicize, or repackage the speaker's ideas into frameworks.",
                                "- Do not wrap in markdown code fences.",
                                "- Do not add commentary before or after the JSON.",
                                "- Return strict valid JSON only.",
                            ].join("\n"),
                            temperature: 0.4,
                            maxOutputTokens: 2500,
                        }
                    ),
                    120_000,
                    "angles",
                );

                const parsedAngles = AnglesSchema.parse(JSON.parse(anglesResult.text));

                // --- PHASE 5 TELEMETRY ---
                try {
                    const normText = cleanedText.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
                    const genericPhrases = ["in today's world", "exploring the idea", "this highlights", "this resonates", "this demonstrates", "this emphasizes", "delves into"];
                    let hookMatch = true;
                    let detectedGeneric = [] as string[];
                    if (parsedAngles && Array.isArray(parsedAngles.angles)) {
                        for (const a of parsedAngles.angles) {
                            const h: string = a.speaker_language_pull || "";
                            if (h) {
                                const nh = h.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
                                if (nh && !normText.includes(nh)) hookMatch = false;
                            }
                            const expansion = ((a as any).expansion_direction || "").toLowerCase();
                            genericPhrases.forEach(gp => { if (expansion.includes(gp)) detectedGeneric.push(gp); });
                        }
                    }
                    request.log.info({ step: "telemetry_angles", hook_verbatim_match: hookMatch, detected_generic_phrases: [...new Set(detectedGeneric)] }, "wispr/webhook: angles telemetry");
                } catch (e) { }
                // -------------------------

                const { error: anglesError } = await supabase
                    .from("content_runs")
                    .update({
                        angles: parsedAngles,
                        status: "pending_matrix",
                        step_timings: stepTimings,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", runId);
                if (anglesError) throw anglesError;
                done(true);

                /* 5. Matrix (timeout: 60s) */
                done = stepTimer("matrix");
                const matrixResult = await withTimeout(
                    generate(
                        JSON.stringify(parsedAngles),
                        {
                            systemInstruction: MATRIX_SYSTEM_INSTRUCTION,
                            temperature: 0.4,
                            maxOutputTokens: 4000,
                        }
                    ),
                    180_000,
                    "matrix",
                );

                const parsedMatrix = IdeaMatrixSchema.parse(JSON.parse(matrixResult.text));

                const { error: matrixError } = await supabase
                    .from("content_runs")
                    .update({
                        idea_matrix: parsedMatrix,
                        status: "complete",
                        step_timings: stepTimings,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", runId);
                if (matrixError) throw matrixError;
                done(true);

                /* 6. Export to Notion (timeout: 20s) — skipped in dry_run */
                if (isDryRun) {
                    await supabase
                        .from("content_runs")
                        .update({ status: "complete", step_timings: stepTimings, updated_at: new Date().toISOString() })
                        .eq("id", runId);

                    return { run_id: runId, status: "complete", pipeline_result_only: true, chunk_retentions: chunkRetentions };
                }

                done = stepTimer("export-notion");

                const { data: fetchedRun, error: finalFetchError } = await supabase
                    .from("content_runs")
                    .select("*")
                    .eq("id", runId)
                    .single();

                finalRun = fetchedRun;
                if (finalFetchError || !finalRun) throw finalFetchError ?? new Error("Run not found after matrix.");

                const session = await getSessionFromRequest(request);
                if (!session) throw new Error("Unauthorized. Please connect Notion.");
                if (!session.root_page_id) {
                    return reply.status(400).send({
                        run_id: runId,
                        status: "error",
                        failure_step: "export-notion",
                        notion_error_message: "container_not_selected"
                    });
                }

                const { notionPageUrl, retry_triggered, total_blocks_generated, total_chars_sent } = await withTimeout(
                    exportRunToNotion(finalRun, session),
                    120_000,
                    "export-notion",
                );

                const { error: exportError } = await supabase
                    .from("content_runs")
                    .update({
                        notion_url: notionPageUrl,
                        status: "ready_for_output",
                        step_timings: stepTimings,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", runId);
                if (exportError) throw exportError;
                done(true);

                return {
                    run_id: runId,
                    word_count: 9000,
                    status: "ready_for_output",
                    failure_step: null,
                    total_pipeline_time_ms: stepTimings["total"] || 0,
                    notion_status_code: 200,
                    notion_error_message: null,
                    blocks_attempted: total_blocks_generated,
                    total_blocks_generated: total_blocks_generated,
                    total_chars_sent: total_chars_sent,
                    export_timeout_triggered: false,
                    retry_attempted: retry_triggered,
                    notion_url: notionPageUrl,
                    chunk_retentions: chunkRetentions
                };
            } catch (err: any) {
                const message = err instanceof Error ? err.message : String(err);
                request.log.error({ run_id: runId, error_step: currentStep, error_message: message }, "wispr/webhook: pipeline failed");
                await setError(message);

                if (message === "container_not_selected") {
                    return reply.status(400).send({
                        run_id: runId,
                        status: "error",
                        failure_step: "export-notion",
                        notion_error_message: message
                    });
                }

                // Enhanced diagnostic response if export-notion failed
                if (currentStep === "export-notion") {
                    const isNotionTimeout = err.timeout_source === "export-notion";
                    return reply.status(500).send({
                        run_id: runId,
                        word_count: 9000,
                        status: "error",
                        failure_step: "export-notion",
                        failure_location: err.failure_location || (isNotionTimeout ? "timeout" : "unknown"),
                        total_pipeline_time_ms: stepTimings["total"] || 0,
                        notion_status_code: err.status || (isNotionTimeout ? 408 : 500),
                        notion_error_message: message,
                        blocks_attempted: (err as any).blocks_attempted || 0,
                        total_blocks_generated: (err as any).total_blocks_generated || 0,
                        total_chars_sent: (err as any).chars_sent || 0,
                        export_timeout_triggered: isNotionTimeout,
                        retry_attempted: err.retry_attempted || false
                    });
                }

                // Return 500 but include what we've processed so far, even if inner scopes threw
                return reply.status(500).send({
                    run_id: runId,
                    word_count: 9000,
                    status: "error",
                    failure_step: currentStep,
                    error_message: message,
                    total_pipeline_time_ms: stepTimings["total"] || 0,
                    notion_status_code: 0,
                    notion_error_message: message,
                    blocks_attempted: 0,
                    total_blocks_generated: 0,
                    total_chars_sent: 0,
                    export_timeout_triggered: false,
                    retry_attempted: false,
                    chunk_retentions: (err as any).chunk_retentions || []
                });
            }
        });

        /* ── Wispr health check ──────────────────────────── */

        app.get("/wispr/health", async (_request, reply) => {
            const checks: { db: boolean; llm: boolean; errors: string[] } = { db: false, llm: false, errors: [] };

            // DB connectivity
            try {
                const { error } = await supabase.from("content_runs").select("id").limit(1);
                checks.db = !error;
                if (error) checks.errors.push(`db: ${error.message}`);
            } catch (e: unknown) {
                checks.errors.push(`db: ${e instanceof Error ? e.message : String(e)}`);
            }

            // LLM connectivity
            try {
                const result = await generate("ping", { maxOutputTokens: 5 });
                checks.llm = result.text.length > 0;
            } catch (e: unknown) {
                checks.errors.push(`llm: ${e instanceof Error ? e.message : String(e)}`);
            }

            const ok = checks.db && checks.llm;
            return reply.status(ok ? 200 : 503).send({
                status: ok ? "healthy" : "degraded",
                checks: { db: checks.db, llm: checks.llm },
                errors: checks.errors.length > 0 ? checks.errors : undefined,
                timestamp: new Date().toISOString(),
            });
        });

        try {
            const PORT = process.env["PORT"] || 3001;
            await app.listen({ port: Number(PORT), host: "0.0.0.0" });
            console.log(`🚀 API running on http://0.0.0.0:${PORT}`);
        } catch (err) {
            app.log.error(err);
            process.exit(1);
        }
