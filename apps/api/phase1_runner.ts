import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';
import fs from 'fs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    const { data: runs } = await supabase.from("content_runs").select("id, raw_transcript").not("raw_transcript", "is", null).order('created_at', { ascending: false }).limit(200);
    const transcripts = runs?.map(r => ({ id: r.id, wc: r.raw_transcript.split(/\s+/).length, text: r.raw_transcript })) || [];

    const short = transcripts.filter(t => t.wc >= 600 && t.wc <= 1200).slice(0, 3);
    const medium = transcripts.filter(t => t.wc >= 1500 && t.wc <= 4000).slice(0, 4);
    const large = transcripts.filter(t => t.wc >= 5000 && t.wc <= 8000).slice(0, 3);

    // If we don't have enough, we synthesize from the 9k json in tmp (using slices)
    const t9kRaw = fs.readFileSync("/tmp/sharpening_9k.json", "utf-8");
    const t9kText = JSON.parse(t9kRaw).transcript;
    const t9kWords = t9kText.split(/\s+/);

    while (short.length < 3) { short.push({ id: `synth-short-${short.length}`, wc: 800, text: t9kWords.slice(0, 800).join(" ") }); }
    while (medium.length < 4) { medium.push({ id: `synth-med-${medium.length}`, wc: 2500, text: t9kWords.slice(0, 2500).join(" ") }); }
    while (large.length < 3) { large.push({ id: `synth-large-${large.length}`, wc: 6500, text: t9kWords.slice(0, 6500).join(" ") }); }

    // Edge cases: messy/filler heavy - let's make 2 of these
    const edge1Words = t9kWords.slice(0, 1000).map((w: string, i: number) => i % 15 === 0 ? `um, you know, totally, ${w}` : w);
    const edge2Words = t9kWords.slice(0, 3000).map((w: string, i: number) => i % 50 === 0 ? `[01:${Math.floor(i / 50) % 60}:12] ${w}` : w);

    let edgeCases = transcripts.filter(t => t.text.includes("um ") || t.text.includes("[")).slice(0, 2);
    if (edgeCases.length < 2) edgeCases.push({ id: "synth-edge-1", wc: edge1Words.length, text: edge1Words.join(" ") });
    if (edgeCases.length < 2) edgeCases.push({ id: "synth-edge-2", wc: edge2Words.length, text: edge2Words.join(" ") });
    edgeCases = edgeCases.slice(0, 2);

    const all12 = [...short, ...medium, ...large, ...edgeCases];

    console.log(`Starting execution of ${all12.length} webhook dispatches...`);
    const results = [];

    for (let i = 0; i < all12.length; i++) {
        const payload = all12[i]!;
        console.log(`\nDispatching [${i + 1}/12]: length ${payload.wc} words`);
        try {
            const start = Date.now();
            const saltedTranscript = payload.text + `\n\n[bypass_idempotency_${Date.now()}_${Math.random()}]`;
            const res = await fetch("http://localhost:3001/wispr/webhook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript: saltedTranscript })
            });

            const data = await res.json();
            const end = Date.now();

            console.log(`  -> Response: ${res.status}`);
            console.log(`  -> Duration: ${end - start}ms`);

            results.push({
                test_index: i + 1,
                source_id: payload.id,
                word_count: payload.wc,
                status_code: res.status,
                run_id: data.run_id || null,
                total_pipeline_time_ms: end - start,
                status: data.status,
                error_step: data.error_step,
            });

        } catch (e: any) {
            console.error("  -> Network error:", e.message);
            results.push({
                test_index: i + 1,
                source_id: payload.id,
                word_count: payload.wc,
                status_code: 0,
                run_id: null,
                total_pipeline_time_ms: 0,
                status: "network_error",
                error_step: "fetch"
            });
        }
    }

    fs.writeFileSync("/tmp/phase1_results.json", JSON.stringify(results, null, 2));
    console.log("\nPhase 1 Complete. Results written to /tmp/phase1_results.json");
    console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
