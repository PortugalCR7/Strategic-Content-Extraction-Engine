#!/usr/bin/env node

/**
 * SCEE Batch Stress Tester
 *
 * Reads a transcripts.json file and runs the full pipeline for each entry:
 *   create → ingest → clean → theme → angles → matrix → export-notion
 *
 * Usage:
 *   npm run batch -- ./path/to/transcripts.json
 *
 * transcripts.json format:
 *   [
 *     { "label": "Episode 1", "transcript": "..." },
 *     { "label": "Episode 2", "transcript": "..." }
 *   ]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API_BASE = process.env["API_BASE"] ?? "http://127.0.0.1:3001";

interface TranscriptEntry {
    label?: string;
    transcript: string;
}

/* ── Helpers ─────────────────────────────────────── */

async function post(path: string, body?: object): Promise<any> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json();

    if (!res.ok) {
        throw new Error(
            `${res.status} ${path}: ${JSON.stringify(json)}`
        );
    }

    return json;
}

function elapsed(start: number): string {
    return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

/* ── Pipeline steps ──────────────────────────────── */

const STEPS = [
    {
        name: "clean",
        path: (id: string) => `/runs/${id}/clean`,
    },
    {
        name: "theme",
        path: (id: string) => `/runs/${id}/theme`,
    },
    {
        name: "angles",
        path: (id: string) => `/runs/${id}/angles`,
    },
    {
        name: "matrix",
        path: (id: string) => `/runs/${id}/matrix`,
    },
    {
        name: "export-notion",
        path: (id: string) => `/runs/${id}/export-notion`,
    },
];

async function processOne(
    entry: TranscriptEntry,
    index: number
): Promise<{ label: string; id: string; status: string; duration: string }> {
    const label = entry.label ?? `Transcript #${index + 1}`;
    const start = Date.now();

    console.log(`\n━━━ [${index + 1}] ${label} ━━━`);

    // 1. Create run
    console.log("  → Creating run...");
    const run = await post("/runs", {});
    const id: string = run.id;
    console.log(`    Run ID: ${id}`);

    // 2. Ingest transcript
    console.log("  → Ingesting transcript...");
    await post(`/runs/${id}/ingest`, { transcript: entry.transcript });

    // 3-7. Pipeline steps
    for (const step of STEPS) {
        console.log(`  → ${step.name}...`);
        const stepStart = Date.now();
        await post(step.path(id));
        console.log(`    ✓ ${step.name} (${elapsed(stepStart)})`);
    }

    const duration = elapsed(start);
    console.log(`  ✅ Complete in ${duration}`);

    return { label, id, status: "complete", duration };
}

/* ── Main ────────────────────────────────────────── */

async function main() {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error("Usage: npm run batch -- ./path/to/transcripts.json");
        process.exit(1);
    }

    const absPath = resolve(filePath);
    console.log(`📂 Loading: ${absPath}`);

    let entries: TranscriptEntry[];
    try {
        const raw = readFileSync(absPath, "utf-8");
        entries = JSON.parse(raw);
    } catch (err) {
        console.error(`Failed to read/parse ${absPath}:`, err);
        process.exit(1);
    }

    if (!Array.isArray(entries) || entries.length === 0) {
        console.error("File must contain a non-empty JSON array.");
        process.exit(1);
    }

    console.log(`🚀 Processing ${entries.length} transcript(s) against ${API_BASE}\n`);

    const results: { label: string; id: string; status: string; duration: string }[] = [];
    let failures = 0;

    for (let i = 0; i < entries.length; i++) {
        try {
            const result = await processOne(entries[i], i);
            results.push(result);
        } catch (err) {
            failures++;
            const label = entries[i].label ?? `Transcript #${i + 1}`;
            const message = err instanceof Error ? err.message : String(err);
            console.error(`  ❌ FAILED: ${message}`);
            results.push({ label, id: "—", status: "error", duration: "—" });
        }
    }

    // Summary
    console.log("\n\n═══════════════════════════════════════");
    console.log("  BATCH RESULTS");
    console.log("═══════════════════════════════════════");
    console.log(`  Total:    ${entries.length}`);
    console.log(`  Success:  ${entries.length - failures}`);
    console.log(`  Failed:   ${failures}`);
    console.log("───────────────────────────────────────");

    for (const r of results) {
        const icon = r.status === "complete" ? "✅" : "❌";
        console.log(`  ${icon} ${r.label} → ${r.status} (${r.duration})`);
    }

    console.log("═══════════════════════════════════════\n");

    if (failures > 0) process.exit(1);
}

main();
