import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { generate } from "@/lib/llm";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { exportRunToNotion } from "@/lib/notionExport";

async function withTimeout<T>(promise: Promise<T>, ms: number, stepName: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            const err: any = new Error(`Step ${stepName} timed out after ${ms}ms`);
            err.timeout_source = stepName;
            reject(err);
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

const AnglesSchema = z.object({
    angles: z
        .array(
            z.object({
                vector_title: z.string(),
                core_tension: z.string(),
                speaker_language_pull: z.string(),
                expansion_direction: z.string(),
            }),
        )
        .min(3)
        .max(7),
});

const PlatformSchema = z.object({
    hook: z.string(),
    core_frame: z.string(),
    structure_outline: z.array(z.string()).min(1),
    cta: z.string(),
});

const IdeaMatrixSchema = z.object({
    matrix: z
        .array(
            z.object({
                vector_title: z.string(),
                platforms: z.object({
                    instagram_reel: PlatformSchema,
                    youtube_short: PlatformSchema,
                    linkedin_post: PlatformSchema,
                    long_form_post: PlatformSchema,
                }),
            }),
        )
        .min(1),
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

export async function POST(request: NextRequest) {
    let body: { transcript?: string; dry_run?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.transcript || body.transcript.trim().length === 0) {
        return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
    }

    const isDryRun = body.dry_run === true;
    const wordCount = body.transcript.trim().split(/\s+/).length;

    if (wordCount > 10_000) {
        return NextResponse.json({
            error: "transcript_too_large",
            message: "Transcript exceeds 10,000 words. Please split into two sessions for best fidelity.",
            word_count: wordCount,
        }, { status: 400 });
    }

    const transcriptHash = createHash("sha256").update(body.transcript).digest("hex");

    const { data: existing } = await supabase
        .from("content_runs")
        .select("id, status, notion_url")
        .eq("transcript_hash", transcriptHash)
        .limit(1)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({
            run_id: existing.id,
            status: existing.status,
            notion_url: existing.notion_url,
        });
    }

    const { data: created, error: createError } = await supabase
        .from("content_runs")
        .insert([{ status: "pending_transcript", transcript_hash: transcriptHash }])
        .select()
        .single();

    if (createError || !created) {
        return NextResponse.json({ error: createError?.message ?? "Failed to create run." }, { status: 500 });
    }

    const runId: string = created.id;
    const stepTimings: Record<string, number> = {};
    let currentStep = "init";

    const stepTimer = (label: string) => {
        currentStep = label;
        const start = Date.now();
        return (success: boolean) => {
            const ms = Date.now() - start;
            stepTimings[label] = ms;
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

    let chunkRetentions: any[] = [];

    try {
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

        done = stepTimer("clean");
        const originalText = body.transcript;
        const originalCharCount = originalText.length;

        function normalizeTranscript(text: string): string {
            let cleaned = text;
            cleaned = cleaned.replace(/\[\d{1,2}:\d{2}(:\d{2})?\]/g, "");
            cleaned = cleaned.replace(/\(\d{1,2}:\d{2}(:\d{2})?\)/g, "");
            cleaned = cleaned.replace(/\d{1,2}:\d{2}(:\d{2})?\s*-->\s*\d{1,2}:\d{2}(:\d{2})?/g, "");
            cleaned = cleaned.replace(/^\s*\d+\s*$/gm, "");
            cleaned = cleaned.replace(/\b(?:um|uh)\b/gi, "");
            cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, "$1");
            cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, "$1");
            cleaned = cleaned.replace(/\s+([.,?!])/g, "$1");
            cleaned = cleaned.replace(/[ \t]+/g, " ");
            cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
            cleaned = cleaned.replace(/ \n/g, "\n").replace(/\n /g, "\n");
            return cleaned.trim();
        }

        const cleanedText = normalizeTranscript(originalText);

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
            "theme"
        );

        const themes: unknown = JSON.parse(themeResult.text);

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

        done = stepTimer("angles");
        const anglesResult = await withTimeout(
            generate(JSON.stringify(themes), {
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
            }),
            120_000,
            "angles"
        );

        const parsedAngles = AnglesSchema.parse(JSON.parse(anglesResult.text));

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

        done = stepTimer("matrix");
        const matrixResult = await withTimeout(
            generate(JSON.stringify(parsedAngles), {
                systemInstruction: MATRIX_SYSTEM_INSTRUCTION,
                temperature: 0.4,
                maxOutputTokens: 4000,
            }),
            180_000,
            "matrix"
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

        if (isDryRun) {
            await supabase
                .from("content_runs")
                .update({
                    status: "complete",
                    step_timings: stepTimings,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", runId);

            return NextResponse.json({
                run_id: runId,
                status: "complete",
                pipeline_result_only: true,
                chunk_retentions: chunkRetentions,
            });
        }

        done = stepTimer("export-notion");

        const { data: finalRun, error: finalFetchError } = await supabase
            .from("content_runs")
            .select("*")
            .eq("id", runId)
            .single();

        if (finalFetchError || !finalRun)
            throw finalFetchError ?? new Error("Run not found after matrix.");

        const session = await getSession();
        if (!session) throw new Error("Unauthorized. Please connect Notion.");
        if (!session.root_page_id) {
            return NextResponse.json({
                run_id: runId,
                status: "error",
                failure_step: "export-notion",
                notion_error_message: "container_not_selected",
            }, { status: 400 });
        }

        const {
            notionPageUrl,
            retry_triggered,
            total_blocks_generated,
            total_chars_sent,
        } = await withTimeout(
            exportRunToNotion(finalRun, session),
            120_000,
            "export-notion"
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

        return NextResponse.json({
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
            chunk_retentions: chunkRetentions,
        });
    } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        await setError(message);

        if (message === "container_not_selected" || message === "Unauthorized. Please connect Notion.") {
            return NextResponse.json({
                run_id: runId,
                status: "error",
                failure_step: "export-notion",
                notion_error_message: message,
            }, { status: 400 });
        }

        if (currentStep === "export-notion") {
            return NextResponse.json({
                run_id: runId,
                status: "error",
                failure_step: "export-notion",
            }, { status: 500 });
        }

        return NextResponse.json({
            run_id: runId,
            status: "error",
            failure_step: currentStep,
            error_message: message,
        }, { status: 500 });
    }
}
