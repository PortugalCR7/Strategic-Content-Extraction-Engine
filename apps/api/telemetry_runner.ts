import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log("Fetching real transcripts from Supabase...");
    const { data: runs, error } = await supabase
        .from("content_runs")
        .select("id, raw_transcript")
        .not("raw_transcript", "is", null)
        .order('created_at', { ascending: false })
        .limit(1000);

    if (error) {
        console.error("Supabase error:", error);
        return;
    }

    const validTranscripts = (runs || [])
        .filter(r => r.raw_transcript && r.raw_transcript.trim().length > 0)
        .filter(r => !r.raw_transcript.includes("[bypass_idempotency"));

    const uniqueTexts = new Set();
    const uniqueTranscripts = [];
    for (const t of validTranscripts) {
        const text = t.raw_transcript.trim();
        const wc = text.split(/\s+/).length;
        if (wc >= 1000 && wc <= 9000 && !uniqueTexts.has(text)) {
            uniqueTexts.add(text);
            uniqueTranscripts.push({ id: t.id, text, wc });
        }
    }

    const selected = uniqueTranscripts.slice(0, 10);
    console.log(`Found ${selected.length} valid real transcripts. Starting sequential execution.\n`);

    const results: any[] = [];

    for (let i = 0; i < selected.length; i++) {
        const payload = selected[i];
        console.log(`Dispatching [${i + 1}/${selected.length}] - Word Count: ${payload.wc}`);

        try {
            const saltedTranscript = payload.text + `\n\n[bypass_idempotency_${Date.now()}_${Math.random()}]`;

            const start = Date.now();
            const res = await fetch("http://localhost:3001/wispr/webhook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript: saltedTranscript })
            });

            const textOutput = await res.text();
            let data: any = {};
            try { data = JSON.parse(textOutput); } catch (e) { data = { error_step: textOutput }; }

            const end = Date.now();
            console.log(`  -> API completed in ${end - start}ms (HTTP ${res.status})`);

            let finalRun = null;
            if (data.run_id) {
                const { data: fetchRun } = await supabase
                    .from("content_runs")
                    .select("*")
                    .eq("id", data.run_id)
                    .single();
                finalRun = fetchRun;
            }

            let quote_verbatim_match = true;
            let hook_verbatim_match = true;
            let theme_count = 0;
            let narrative_vector_count = 0;

            if (finalRun) {
                const normText = payload.text.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').toLowerCase();

                // Themes Check
                if (finalRun.theme_map && Array.isArray(finalRun.theme_map.themes)) {
                    theme_count = finalRun.theme_map.themes.length;
                    for (const t of finalRun.theme_map.themes) {
                        const q = (t.quotes && t.quotes[0]) || "";
                        if (q) {
                            const nq = q.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
                            if (nq && !normText.includes(nq)) {
                                quote_verbatim_match = false;
                            }
                        } else {
                            quote_verbatim_match = false;
                        }
                    }
                } else {
                    quote_verbatim_match = false;
                }

                // Angles Check
                if (finalRun.angles && Array.isArray(finalRun.angles.angles)) {
                    narrative_vector_count = finalRun.angles.angles.length;
                    for (const a of finalRun.angles.angles) {
                        const h = a.speaker_language_pull || "";
                        if (h) {
                            const nh = h.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
                            if (nh && !normText.includes(nh)) {
                                hook_verbatim_match = false;
                            }
                        } else {
                            hook_verbatim_match = false;
                        }
                    }
                } else {
                    hook_verbatim_match = false;
                }
            } else {
                quote_verbatim_match = false;
                hook_verbatim_match = false;
            }

            const runResult = {
                run_id: data.run_id || null,
                word_count: payload.wc,
                total_pipeline_time_ms: end - start,
                quote_verbatim_match,
                hook_verbatim_match,
                theme_count,
                narrative_vector_count,
                export_success: finalRun?.status === "completed"
            };

            results.push(runResult);
            console.log("  ->", JSON.stringify(runResult));

        } catch (err: any) {
            console.error("  -> Execution Error:", err.message);
            results.push({
                run_id: null,
                word_count: payload.wc,
                total_pipeline_time_ms: 0,
                quote_verbatim_match: false,
                hook_verbatim_match: false,
                theme_count: 0,
                narrative_vector_count: 0,
                export_success: false
            });
        }
    }

    import('fs').then(fs => {
        fs.writeFileSync('/tmp/telemetry_out.json', JSON.stringify(results, null, 2));
    });

    console.log("\n[=====================================]");
    console.log("=== CONTROLLED TELEMETRY RUN RESULTS ===");
    console.log("[=====================================]\n");
    console.log(JSON.stringify(results, null, 2));
}

main();
