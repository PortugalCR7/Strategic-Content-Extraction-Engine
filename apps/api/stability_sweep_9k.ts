import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log("Fetching 9K transcript for 10x Stability Sweep...");
    const { data: runs } = await supabase
        .from("content_runs")
        .select("raw_transcript")
        .not("raw_transcript", "is", null)
        .order('created_at', { ascending: false })
        .limit(200);

    const transcripts = (runs || []).map(r => r.raw_transcript);

    // Find closest match for 9k
    const transcript9k = transcripts
        .map(t => ({ text: t, wc: t.split(/\s+/).length }))
        .sort((a, b) => Math.abs(a.wc - 9000) - Math.abs(b.wc - 9000))[0];

    if (!transcript9k) {
        console.error("Could not find a 9k transcript.");
        return;
    }

    const testRuns = 10;
    const finalResults = [];

    for (let i = 0; i < testRuns; i++) {
        console.log(`Starting run ${i + 1}/${testRuns} (9000 words)...`);
        const startTime = Date.now();
        const salt = `\n\n[stability_sweep_9k_${Date.now()}_index_${i}]`;

        try {
            const res = await fetch("http://localhost:3001/wispr/webhook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript: transcript9k.text + salt })
            });

            const data = await res.json();

            finalResults.push({
                run_id: data.run_id,
                word_count: 9000,
                status: data.status,
                failure_step: data.failure_step || "",
                total_pipeline_time_ms: data.total_pipeline_time_ms,
                notion_status_code: data.notion_status_code || 0,
                notion_error_message: data.notion_error_message || "",
                blocks_attempted: data.blocks_attempted || 0,
                total_blocks_generated: data.total_blocks_generated || 0,
                total_chars_sent: data.total_chars_sent || 0,
                export_timeout_triggered: data.export_timeout_triggered || false,
                retry_attempted: data.retry_attempted || false
            });

            console.log(`Finished run ${i + 1}. Success: ${data.status === 'ready_for_output'}`);
        } catch (e: any) {
            console.error(`Run ${i + 1} fatal error:`, e.message);
        }
    }

    const successCount = finalResults.filter(r => r.status === "ready_for_output").length;
    const failureCount = finalResults.length - successCount;

    // Pattern detection
    const failureSteps = finalResults.filter(r => r.status !== "ready_for_output").map(r => r.failure_step);
    const mostCommonFailure = failureSteps.length > 0 ? [...new Set(failureSteps)].sort((a, b) => failureSteps.filter(v => v === b).length - failureSteps.filter(v => v === a).length)[0] : "";

    const output = {
        summary: {
            total_runs: testRuns,
            success_count: successCount,
            failure_count: failureCount,
            consistent_failure_pattern_detected: failureCount > 1 && new Set(failureSteps).size === 1,
            observed_failure_step: mostCommonFailure
        },
        runs: finalResults
    };

    console.log(JSON.stringify(output, null, 2));
}

main();
