import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';
import fs from 'fs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const stripPunctuation = (str: string) => str.replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim().toLowerCase();

async function main() {
    // Phase 1 results have the run_ids
    const phase1Raw = fs.readFileSync("/tmp/phase1_results.json", "utf-8");
    const phase1Data = JSON.parse(phase1Raw);
    const runIds = phase1Data.map((d: any) => d.run_id).filter(Boolean);

    console.log(`Analyzing ${runIds.length} runs...`);

    const { data: runs, error } = await supabase.from("content_runs").select("*").in("id", runIds);
    if (error) throw error;

    const analysis = [];

    for (const run of runs!) {
        const raw_transcript = stripPunctuation(run.raw_transcript || "");

        let theme_quotes_verbatim_match_count = 0;
        let total_theme_quotes = 0;
        const recurring_phrases: string[] = [];

        if (run.theme_map && Array.isArray(run.theme_map)) {
            for (const theme of run.theme_map) {
                total_theme_quotes++;
                // Check if the theme's core quote actually exists in the transcript
                // (Note: Currently the theme schema might just have "quote" or "verbatim_quote" depending on exact schema)
                const quoteText = theme.quote || theme.verbatim_quote || theme.supporting_quote || "";
                if (quoteText) {
                    const cleanQuote = stripPunctuation(quoteText);
                    if (raw_transcript.includes(cleanQuote)) {
                        theme_quotes_verbatim_match_count++;
                    }
                }
            }
        }

        let vector_hooks_verbatim_match_count = 0;
        let total_vectors = 0;
        const hooks: string[] = [];

        if (run.angles && Array.isArray(run.angles)) {
            for (const vector of run.angles) {
                total_vectors++;
                const hookText = vector.hook || vector.narrative_hook || "";
                if (hookText) {
                    hooks.push(hookText);
                    const cleanHook = stripPunctuation(hookText);
                    if (raw_transcript.includes(cleanHook)) {
                        vector_hooks_verbatim_match_count++;
                    }
                }
            }
        }

        analysis.push({
            run_id: run.id,
            word_count: run.raw_transcript?.split(/\s+/).length || 0,
            quote_accuracy_pct: total_theme_quotes > 0 ? (theme_quotes_verbatim_match_count / total_theme_quotes) * 100 : 0,
            vector_hook_accuracy_pct: total_vectors > 0 ? (vector_hooks_verbatim_match_count / total_vectors) * 100 : 0,
            hooks_extracted: hooks
        });
    }

    fs.writeFileSync("/tmp/phase2_analysis.json", JSON.stringify(analysis, null, 2));
    console.log("Phase 2 automated analysis complete. Results written to /tmp/phase2_analysis.json");
    console.log(JSON.stringify(analysis, null, 2));
}

main().catch(console.error);
