/**
 * @scee/intelligence — LLM prompt modules
 *
 * Provides typed prompt templates and a builder function
 * for constructing LLM extraction prompts.
 */

export interface PromptTemplate {
    /** System-level instruction for the LLM */
    system: string;
    /** User-facing prompt with {{placeholder}} tokens */
    user: string;
}

export interface PromptVariables {
    [key: string]: string;
}

/**
 * Build a resolved prompt from a template and variable map.
 */
export function buildPrompt(
    template: PromptTemplate,
    variables: PromptVariables
): { system: string; user: string } {
    let resolved = template.user;
    for (const [key, value] of Object.entries(variables)) {
        resolved = resolved.replaceAll(`{{${key}}}`, value);
    }
    return { system: template.system, user: resolved };
}
