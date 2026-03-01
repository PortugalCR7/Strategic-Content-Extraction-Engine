import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runTest(label: string, words: number, transcript: string) {
    console.log(`\n\nStarting test: ${label} (${words} words)`);
    const start = Date.now();
    let resData: any = null;
    let timedOutStep: string | null = null;
    let isSuccessResponse = false;

    // Cache breaker
    transcript += `\n\n[verification_run_${Date.now()}]`;

    try {
        const response = await fetch("http://localhost:3001/wispr/webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript }),
        });
        resData = await response.json();
        isSuccessResponse = response.ok;
    } catch (e: any) {
        console.error("Webhook call failed:", e.message);
        return { label, error: e.message };
    }

    const duration = Date.now() - start;
    const runId = resData.run_id;

    if (!isSuccessResponse && resData.error_message === "llm_timeout") {
        timedOutStep = resData.error_step || "unknown";
    } else if (!isSuccessResponse) {
        if (resData.error_message?.includes("clean_integrity_error")) {
            timedOutStep = "integrity_failed";
        }
    }

    // Fetch the run
    let run: any = null;
    if (runId) {
        const { data } = await supabase.from("content_runs").select("*").eq("id", runId).single();
        run = data;
    }

    let cleanedTextLength = 0;
    if (run?.cleaned_transcript) {
        cleanedTextLength = run.cleaned_transcript.split(/\s+/).filter(Boolean).length;
    }

    let integrityPassed = false;
    if (run?.cleaned_transcript && runId && isSuccessResponse) {
        integrityPassed = true; // if we didn't crash from clean_integrity_error, it passed!
    } else if (run?.status === "pending_theme" || run?.status === "pending_ideas" || run?.status === "pending_matrix" || run?.status === "ready_for_output" || run?.status === "complete") {
        integrityPassed = true;
    }

    const exportSuccess = run?.status === "ready_for_output" && !!run?.notion_url;

    const result = {
        label,
        run_id: runId || "N/A",
        total_duration_ms: duration,
        step_timings: run?.step_timings || resData.step_timings || {},
        integrity_passed: integrityPassed,
        export_success: exportSuccess,
        final_cleaned_transcript_word_count: cleanedTextLength,
        timed_out_step: timedOutStep,
    };

    return result;
}

async function validate() {
    const fs = await import("fs/promises");

    console.log("1. Calling /wispr/health...");
    const healthRes = await fetch("http://localhost:3001/wispr/health");
    const healthData = await healthRes.json();
    console.log("Health Status:", JSON.stringify(healthData, null, 2));

    const t3k = JSON.parse(await fs.readFile("/tmp/sharpening_3k.json", "utf-8")).transcript;
    const t6k = JSON.parse(await fs.readFile("/tmp/sharpening_6k.json", "utf-8")).transcript;
    const t9k = JSON.parse(await fs.readFile("/tmp/sharpening_9k.json", "utf-8")).transcript;

    const results = [];

    const r2 = await runTest("3,000-word transcript", 3000, t3k);
    results.push(r2);

    const r3 = await runTest("6,000-word transcript", 6000, t6k);
    results.push(r3);

    const r4 = await runTest("9,000-word transcript", 9000, t9k);
    results.push(r4);

    const report = {
        health: healthData,
        runs: results
    };

    console.log("\n\n=== FINAL STRUCTURED REPORT ===");
    console.log(JSON.stringify(report, null, 2));
}

validate().catch(console.error);
