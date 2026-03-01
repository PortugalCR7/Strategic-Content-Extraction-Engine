import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    const { data: runs, error } = await supabase
        .from("content_runs")
        .select("id, status, created_at, transcript_hash, cleaned_transcript, theme_map, angles")
        .order("created_at", { ascending: false })
        .limit(4);

    if (error || !runs) {
        console.error("Error fetching runs:", error);
        return;
    }

    runs.reverse().forEach((r: any, i: number) => {
        const sizes = [1000, 3000, 6000, 9000];
        console.log(`\n--- ${sizes[i]}w Run (${r.id}) --- Status: ${r.status}`);

        const cleanedText = r.cleaned_transcript || "";
        console.log(`Cleaned Text Length: ${cleanedText.length} chars (approx ${cleanedText.split(/\s+/).length} words)`);

        const themesObj = r.theme_map as any;
        const themes = themesObj?.themes;
        if (themes && themes.length > 0) {
            console.log(`Themes: ${themes.length}`);
            console.log(`  Example Theme Title: "${themes[0].title}"`);
            console.log(`  Example Theme Summary: "${themes[0].summary}"`);
            console.log(`  Example Quotes:`, themes[0].quotes);
        } else {
            console.log("Themes: NOT GENERATED OR EMPTY");
        }

        const anglesObj = r.angles as any;
        const angles = anglesObj?.angles;
        if (angles) {
            console.log(`Angles: ${angles.length}`);
            console.log(`  Example Angle Vector: "${angles[0].vector_title}"`);
            console.log(`  Example Tension: "${angles[0].core_tension}"`);
            console.log(`  Example Language Pull: "${angles[0].speaker_language_pull}"`);
            console.log(`  Example Expansion: "${angles[0].expansion_direction}"`);
        } else {
            console.log("Angles: NOT GENERATED OR INVALID");
        }
    });
}
main();
