import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RUN_IDS = [
    "d08e86aa-2b84-404c-8ec0-bca561e2020f",
    "388d3ad6-31cc-4112-ad67-a3439d44623c"
];

async function main() {
    const report: any = {
        database_rows: []
    };

    for (const id of RUN_IDS) {
        const { data: run, error } = await supabase
            .from("content_runs")
            .select("id, status, transcript_hash, step_timings, raw_transcript")
            .eq("id", id)
            .single();

        if (error || !run) {
            report.database_rows.push({
                run_id: id,
                error: "Run not found or failed to fetch"
            });
            continue;
        }

        const has_raw_transcript = !!run.raw_transcript && run.raw_transcript.length > 0;

        report.database_rows.push({
            run_id: run.id,
            status: run.status,
            transcript_hash: run.transcript_hash || null,
            raw_transcript_present: has_raw_transcript,
            step_timings_exists: !!run.step_timings && Object.keys(run.step_timings).length > 0
        });
    }

    console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
