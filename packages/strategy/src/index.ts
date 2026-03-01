/**
 * @scee/strategy — Markdown doctrine file loader
 *
 * Reads .md doctrine files from the doctrines/ directory
 * and returns them as structured objects.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DOCTRINES_DIR = join(__dirname, "doctrines");

export interface Doctrine {
    /** Filename without extension */
    slug: string;
    /** Raw markdown content */
    content: string;
}

/**
 * Load all .md doctrine files from the doctrines/ directory.
 */
export async function loadDoctrines(): Promise<Doctrine[]> {
    let files: string[];
    try {
        files = await readdir(DOCTRINES_DIR);
    } catch {
        return [];
    }

    const mdFiles = files.filter((f) => extname(f) === ".md");

    return Promise.all(
        mdFiles.map(async (file) => ({
            slug: basename(file, ".md"),
            content: await readFile(join(DOCTRINES_DIR, file), "utf-8"),
        }))
    );
}

/**
 * Load a single doctrine by slug.
 */
export async function loadDoctrine(slug: string): Promise<Doctrine | null> {
    try {
        const content = await readFile(
            join(DOCTRINES_DIR, `${slug}.md`),
            "utf-8"
        );
        return { slug, content };
    } catch {
        return null;
    }
}
