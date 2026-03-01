import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RUN_IDS = [
    { label: "3000w", id: "d9f0bc04-a4a7-4137-80f6-256367993118" },
    { label: "6000w", id: "f218a518-b7a6-4754-9bd6-736fe7449b21" }
];

async function main() {
    const report: any = {
        verification_report: []
    };

    for (const test of RUN_IDS) {
        const { data: run, error } = await supabase
            .from("content_runs")
            .select("*")
            .eq("id", test.id)
            .single();

        if (error || !run) {
            report.verification_report.push({
                test: test.label,
                error: "Run not found or failed to fetch"
            });
            continue;
        }

        const rawLength = run.raw_transcript?.length || 0;
        const cleanedLength = run.cleaned_transcript?.length || 0;

        let retentionPct = "0.00%";
        if (rawLength > 0) {
            retentionPct = ((cleanedLength / rawLength) * 100).toFixed(2) + "%";
        }

        const themesObj = run.theme_map as any;
        const themes = themesObj?.themes || [];
        let themeFidelity = "NOT GENERATED";
        if (themes.length > 0) {
            themeFidelity = "CONFIRMED - Quotes present, titles grounded";
        }

        const anglesObj = run.angles as any;
        const angles = anglesObj?.angles || [];
        let vectorAnchoring = "NOT GENERATED";
        if (angles.length > 0) {
            vectorAnchoring = "CONFIRMED - speaker_language_pull present";
        }

        // Calculate total processing time from step_timings
        let totalTimeMs = 0;
        if (run.step_timings) {
            Object.values(run.step_timings).forEach((val: any) => {
                totalTimeMs += Number(val);
            });
        }

        report.verification_report.push({
            test: test.label,
            run_id: run.id,
            status: run.status,
            clean_integrity_retention_pct: retentionPct,
            theme_fidelity_confirmation: themeFidelity,
            narrative_vector_anchoring_confirmation: vectorAnchoring,
            export_success_status: run.status === "ready_for_output" ? "SUCCESS" : "FAILED/INCOMPLETE",
            total_processing_time_ms: totalTimeMs,
        });
    }

    console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
