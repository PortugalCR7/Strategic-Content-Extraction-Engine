# Strategic Content Extraction Engine

The Strategic Content Extraction Engine is a robust, voice-first pipeline for transforming transcripts into high-leverage content concepts across multiple platforms.

## 🚀 Status: V2 Stable

This repository represents the **V2 Stable** architecture. The pipeline is optimized for stability, deterministic cleaning, and resilient Notion exports.

### Quick Links
- [Detailed V2 Architecture Documentation](./docs/V2_ARCHITECTURE.md)

## Core Pipeline
1. **Ingest**: Receives raw audio transcripts.
2. **Clean**: Deterministically normalizes text (Strips noise, preserves voice).
3. **Theme**: Extracts core thematic anchors using LLM.
4. **Angles**: Derives narrative vectors grounded in the speaker's original diction.
5. **Matrix**: Generates platform-specific content concepts (LinkedIn, Twitter, IG Reels, YT Shorts).
6. **Export**: Delivers the result to a structured Notion page.

## Guardrails
- **10K Word Cap**: Enforced server-side for stability.
- **Deterministic Clean**: No LLM used for transcript normalization to avoid "domestication."
- **Resilient Export**: Automatic retry on Notion API 500 errors.

## Local Development
- **API**: `npm run dev` in `apps/api` (Default port 3001)
- **Web**: `npm run dev` in `apps/web` (Default port 3002)

---

> [!NOTE]
> Structural modifications to the core pipeline must branch into **V3**.
