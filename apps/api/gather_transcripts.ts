import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    const { data: runs } = await supabase.from("content_runs").select("id, raw_transcript").not("raw_transcript", "is", null).limit(20);
    const transcripts = runs?.map(r => ({ id: r.id, wc: r.raw_transcript.split(/\s+/).length, text: r.raw_transcript })) || [];
    
    console.log(`Found ${transcripts.length} transcripts in DB`);
    for (const t of transcripts) {
        console.log(`- ${t.id} (${t.wc} words)`);
    }
}
main();
