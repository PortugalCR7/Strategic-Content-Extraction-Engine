import { notion } from "./notionClient";
import { env } from "./env";
import { supabase } from "./supabase";

/* ── Notion block helpers ────────────────────────── */

function heading2(text: string) {
    return {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
            rich_text: [{ type: "text" as const, text: { content: text } }],
        },
    };
}

function paragraph(text: string) {
    return {
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
            rich_text: [{ type: "text" as const, text: { content: text } }],
        },
    };
}

function bullet(text: string) {
    return {
        object: "block" as const,
        type: "bulleted_list_item" as const,
        bulleted_list_item: {
            rich_text: [{ type: "text" as const, text: { content: text } }],
        },
    };
}

/* ── Build page children blocks ──────────────────── */

function buildBlocks(run: any) {
    const blocks: any[] = [];

    // ── Transcript ──────────────────────────────────
    if (run.cleaned_transcript) {
        const transcriptText = String(run.cleaned_transcript);
        const transcriptParagraphs = [];
        for (let i = 0; i < transcriptText.length; i += 2000) {
            transcriptParagraphs.push(paragraph(transcriptText.slice(i, i + 2000)));
        }

        blocks.push({
            object: "block",
            type: "toggle",
            toggle: {
                rich_text: [
                    {
                        type: "text",
                        text: { content: "Transcript (click to expand)" },
                    },
                ],
                children: transcriptParagraphs,
            },
        });
    }

    // ── Core Themes ─────────────────────────────────
    blocks.push(heading2("Core Themes"));

    if (run.theme_map?.themes) {
        for (const theme of run.theme_map.themes) {
            blocks.push({
                object: "block",
                type: "toggle",
                toggle: {
                    rich_text: [
                        {
                            type: "text",
                            text: { content: theme.title },
                        },
                    ],
                    children: [
                        paragraph(theme.summary),
                        ...(theme.quotes || []).map((q: string) =>
                            bullet(`"${q}"`)
                        ),
                    ],
                },
            });
        }
    }

    // ── Strategic Angles ────────────────────────────
    blocks.push(heading2("Narrative Vectors"));

    if (run.angles?.angles) {
        for (const angle of run.angles.angles) {
            blocks.push({
                object: "block",
                type: "toggle",
                toggle: {
                    rich_text: [
                        {
                            type: "text",
                            text: { content: angle.vector_title },
                        },
                    ],
                    children: [
                        paragraph(angle.core_tension),
                        paragraph(`Speaker pull: ${angle.speaker_language_pull}`),
                        paragraph(`Expansion: ${angle.expansion_direction}`),
                    ],
                },
            });
        }
    }

    // ── Platform Deployment Matrix ──────────────────
    blocks.push(heading2("Platform Deployment Matrix"));

    if (run.idea_matrix?.matrix) {
        for (const entry of run.idea_matrix.matrix) {
            const platformBlocks: any[] = [];

            for (const [platform, detail] of Object.entries(
                entry.platforms as Record<string, any>
            )) {
                platformBlocks.push({
                    object: "block",
                    type: "toggle",
                    toggle: {
                        rich_text: [
                            {
                                type: "text",
                                text: {
                                    content: platform.replace(/_/g, " "),
                                },
                            },
                        ],
                        children: [
                            paragraph(`Hook: ${detail.hook}`),
                            paragraph(`Core Frame: ${detail.core_frame}`),
                            ...detail.structure_outline.map((point: string) =>
                                bullet(point)
                            ),
                            paragraph(`CTA: ${detail.cta}`),
                        ],
                    },
                });
            }

            blocks.push({
                object: "block",
                type: "toggle",
                toggle: {
                    rich_text: [
                        {
                            type: "text",
                            text: { content: entry.vector_title },
                        },
                    ],
                    children: platformBlocks,
                },
            });
        }
    }

    return blocks;
}

/* ── Chunking utility ────────────────────────────── */

const CHUNK_SIZE = 50;

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

import { Client } from "@notionhq/client";

/* ── Main export function ────────────────────────── */

export async function exportRunToNotion(run: any, session: any) {
    const notionClient = session.accessToken
        ? new Client({ auth: session.accessToken })
        : (session as any).auth ? session : notion; // Fallback for stability tests if they pass a client

    const exportStart = Date.now();

    const dateStr = new Date().toISOString().slice(0, 10);

    const headline =
        run.angles?.angles?.[0]?.vector_title ??
        run.theme_map?.themes?.[0]?.title ??
        "Content Run";

    const title = `${headline} [${dateStr}]`;

    /* ── Debug: Data Structure Stats ── */
    console.log(JSON.stringify({
        event: "notion_export_debug_stats",
        run_id: run.id,
        theme_map_type: typeof run.theme_map,
        theme_map_size: JSON.stringify(run.theme_map || {}).length,
        angles_type: typeof run.angles,
        angles_size: JSON.stringify(run.angles || {}).length,
        idea_matrix_type: typeof run.idea_matrix,
        idea_matrix_size: JSON.stringify(run.idea_matrix || {}).length,
    }));

    /* 1. Build full block array in memory */
    let allBlocks;
    try {
        allBlocks = buildBlocks(run);
    } catch (err: any) {
        err.failure_location = "block_build";
        throw err;
    }
    const totalBlocks = allBlocks.length;

    console.log(JSON.stringify({
        event: "notion_export_diag_blocks",
        run_id: run.id,
        totalBlocks,
    }));

    /* 2. Create page with NO children */
    let page;
    try {
        console.log(JSON.stringify({
            event: "notion_api_call_start",
            run_id: run.id,
            api_method: "pages.create",
            title,
        }));
        const rootPageId = session.root_page_id;
        if (!rootPageId) {
            throw new Error("container_not_selected");
        }

        page = await notionClient.pages.create({
            parent: { page_id: rootPageId },
            properties: {
                title: {
                    title: [{ text: { content: title } }],
                },
            },
        });
        console.log(JSON.stringify({
            event: "notion_api_call_success",
            run_id: run.id,
            api_method: "pages.create",
        }));
    } catch (err: any) {
        console.error(JSON.stringify({
            event: "notion_api_call_error",
            run_id: run.id,
            api_method: "pages.create",
            status: err.status,
            code: err.code,
            message: err.message,
            payload: err.body ? JSON.parse(err.body) : null
        }));
        const decoratedErr = err;
        decoratedErr.notion_api_method = "pages.create";
        decoratedErr.failure_location = "page_create";
        throw decoratedErr;
    }

    /* 3. Chunk and append sequentially */
    const chunks = chunkArray(allBlocks, CHUNK_SIZE);

    /* ── Diagnostic: pre-chunk stats ─────────────── */
    const serializedLen = JSON.stringify(allBlocks).length;
    console.log(JSON.stringify({
        event: "notion_export_diag_pre_chunk",
        run_id: run.id,
        totalBlocks,
        chunkCount: chunks.length,
        serialized_char_length: serializedLen,
    }));

    let totalCharsWritten = 0;
    let totalBlocksAppended = 0;
    let retry_triggered = false;
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        const batchStart = i * CHUNK_SIZE;
        const batchEnd = batchStart + chunk.length - 1;

        console.log(JSON.stringify({
            event: "notion_export_batch_start",
            run_id: run.id,
            batch: i + 1,
            batchStart,
            batchEnd,
            batchSize: chunk.length,
        }));

        const chunkLen = JSON.stringify(chunk).length;
        totalCharsWritten += chunkLen;

        try {
            console.log(JSON.stringify({
                event: "notion_api_call_start",
                run_id: run.id,
                api_method: "blocks.children.append",
                batch: i + 1,
                blocks_attempted: chunk.length,
                chars_sent: chunkLen,
                blocks_in_array_before_append: allBlocks.length,
            }));
            try {
                await notionClient.blocks.children.append({
                    block_id: page.id,
                    children: chunk,
                });
            } catch (innerErr: any) {
                if (innerErr.status === 500) {
                    retry_triggered = true;
                    console.log(JSON.stringify({
                        event: "notion_api_retry_trigger",
                        run_id: run.id,
                        batch: i + 1,
                        retry_attempted: true
                    }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await notionClient.blocks.children.append({
                        block_id: page.id,
                        children: chunk,
                    });
                } else {
                    throw innerErr;
                }
            }
            console.log(JSON.stringify({
                event: "notion_api_call_success",
                run_id: run.id,
                api_method: "blocks.children.append",
                batch: i + 1,
            }));
        } catch (err: any) {
            console.error(JSON.stringify({
                event: "notion_api_call_error",
                run_id: run.id,
                api_method: "blocks.children.append",
                batch: i + 1,
                status: err.status,
                code: err.code,
                message: err.message,
                payload: err.body ? JSON.parse(err.body) : null,
                blocks_attempted: chunk.length,
                chars_sent: chunkLen
            }));
            const decoratedErr = err;
            decoratedErr.notion_api_method = "blocks.children.append";
            decoratedErr.blocks_attempted = chunk.length;
            decoratedErr.chars_sent = chunkLen;
            decoratedErr.failure_location = "append_children";
            decoratedErr.retry_attempted = retry_triggered;
            throw decoratedErr;
        }
        totalBlocksAppended += chunk.length;

        console.log(JSON.stringify({
            event: "notion_export_batch_end",
            run_id: run.id,
            batch: i + 1,
            batchStart,
            batchEnd,
            blocksAppendedSoFar: totalBlocksAppended,
        }));
    }

    const exportDuration = Date.now() - exportStart;

    console.log(JSON.stringify({
        event: "notion_export_complete",
        run_id: run.id,
        totalBlocks,
        totalBlocksAppended,
        blocksMatch: totalBlocksAppended === totalBlocks,
        chunkCount: chunks.length,
        totalCharsWritten,
        exportDuration,
    }));

    if (totalBlocksAppended !== totalBlocks) {
        throw new Error(
            `Block parity violation: generated ${totalBlocks} blocks but appended ${totalBlocksAppended}`
        );
    }

    const notionPageUrl = `https://notion.so/${page.id.replace(/-/g, "")}`;

    return {
        notionPageId: page.id,
        notionPageUrl,
        retry_triggered,
        total_blocks_generated: totalBlocks,
        total_chars_sent: totalCharsWritten
    };
}
