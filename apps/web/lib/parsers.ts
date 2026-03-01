/**
 * Client-side file parsers for transcript input.
 * Extracts plain text from .txt, .md, .json, .vtt, .srt files.
 */

/** Strip VTT/SRT timestamps and metadata, return only spoken text. */
export function parseVTT(raw: string): string {
    return raw
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            // Skip empty lines
            if (!trimmed) return false;
            // Skip WEBVTT header
            if (trimmed === "WEBVTT") return false;
            // Skip NOTE blocks
            if (trimmed.startsWith("NOTE")) return false;
            // Skip cue identifiers (purely numeric or numeric with dashes)
            if (/^\d+$/.test(trimmed)) return false;
            // Skip timestamp lines (00:00:00.000 --> 00:00:00.000)
            if (/^\d{2}:\d{2}/.test(trimmed) && trimmed.includes("-->")) return false;
            // Skip style/region headers
            if (trimmed.startsWith("STYLE") || trimmed.startsWith("REGION")) return false;
            return true;
        })
        .map((line) => line.replace(/<[^>]+>/g, "").trim()) // strip HTML tags
        .filter(Boolean)
        .join(" ");
}

/** Strip SRT timestamps, sequence numbers, return only spoken text. */
export function parseSRT(raw: string): string {
    return raw
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            // Skip sequence numbers
            if (/^\d+$/.test(trimmed)) return false;
            // Skip timestamp lines
            if (/^\d{2}:\d{2}/.test(trimmed) && trimmed.includes("-->")) return false;
            return true;
        })
        .map((line) => line.replace(/<[^>]+>/g, "").trim())
        .filter(Boolean)
        .join(" ");
}

/** Extract transcript string from JSON. */
export function parseJSON(raw: string): string {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "transcript" in parsed &&
            typeof (parsed as Record<string, unknown>)["transcript"] === "string"
        ) {
            return (parsed as Record<string, unknown>)["transcript"] as string;
        }
        return JSON.stringify(parsed, null, 2);
    } catch {
        return raw;
    }
}

/** Read a File and extract plain text based on extension. */
export async function readTranscriptFile(file: File): Promise<string> {
    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    switch (ext) {
        case "vtt":
            return parseVTT(text);
        case "srt":
            return parseSRT(text);
        case "json":
            return parseJSON(text);
        case "txt":
        case "md":
        default:
            return text.trim();
    }
}
