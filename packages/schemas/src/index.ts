/**
 * @scee/schemas — Shared JSON schemas & TypeScript types
 *
 * Central type definitions consumed by both the API and dashboard.
 */

export interface ExtractionRequest {
    /** Raw content to extract from */
    content: string;
    /** Target extraction strategy key */
    strategy: string;
    /** Optional metadata passed to the extraction pipeline */
    metadata?: Record<string, unknown>;
}

export interface ExtractionResult {
    /** Unique result identifier */
    id: string;
    /** Strategy that produced this result */
    strategy: string;
    /** Extracted data payload */
    data: Record<string, unknown>;
    /** ISO-8601 timestamp of extraction */
    extractedAt: string;
}

export interface HealthResponse {
    status: "ok" | "error";
    timestamp: string;
}
