# LitReview — Phase 1 Design: Foundation, Import & Citation-Grounded Chat

**Date:** 2026-05-28
**Status:** Approved (design)
**Scope:** Phase 1 of 3. Phases 2 (in-app reading & annotation) and 3 (synthesis/export) are deferred to their own design cycles.

## Context & Goals

A hosted, small multi-user web app for a research team (professors + fellows) to store, link, and query literature reviews and their source papers. Deployed on Vercel. Must comfortably hold a good volume of lit reviews and source PDFs.

The team produces reviews two ways, both first-class:
- **Imported** — reviews written elsewhere (Word/Docs/PDF) brought in as text or PDF.
- **Authored in-app** — reviews built by reading and annotating source papers (the annotation/authoring UI itself is Phase 2; Phase 1 establishes the data model and import path that Phase 2 builds on).

**Phase 1 delivers a genuinely useful tool on its own:** auth, ingestion of papers and reviews, metadata extraction, manual linking of reviews to source papers, hybrid search, and citation-grounded chat over the corpus.

## Non-Goals (Phase 1)

- PDF viewer and passage annotation (Phase 2)
- Literature matrix, cross-paper theme tagging, contradiction/gap detection, export to BibTeX/Word/Markdown (Phase 3)
- OCR for scanned PDFs
- Automatic citation → paper linking (manual linking only in Phase 1)
- Public sign-up / large-scale multi-tenancy (team allowlist only)

## Architecture

A single TypeScript **Next.js (App Router) app on Vercel**.

- **Database:** Neon / Vercel Postgres with the **pgvector** extension. All structured data *and* embeddings live in one database — no separate vector service to operate or pay for.
- **File storage:** **Vercel Blob** for original PDF files.
- **Auth:** **Auth.js (NextAuth) + Google OAuth**, gated by an **email allowlist** of team members. Non-allowlisted logins are denied.
- **LLM provider abstraction:** an `llm` module exposing `embed(texts)` and `chat(messages, context)`. The OpenAI implementation is used now (`text-embedding-3-small` for embeddings + a cheap chat model). The abstraction isolates provider choice so switching providers later is a single-module change. (Cost-conscious by default — see project constraint to prefer the cheapest capable option.)

## Data Model

- **users** — `id`, `email`, `name`, `role`, `created_at`
- **collections** — `id`, `name`, `research_question`, `created_by`, `created_at`. Lightweight grouping; a team will run several research questions in parallel.
- **papers** — `id`, `collection_id`, `title`, `authors` (array), `year`, `doi`, `journal`, `abstract`, `pdf_url`, `full_text`, `metadata` (jsonb), `status` (pending|processing|ready|failed), `error_reason`, `uploaded_by`, `created_at`
- **reviews** — `id`, `collection_id`, `title`, `body_text`, `pdf_url` (nullable), `status`, `error_reason`, `created_by`, `created_at`
- **review_paper_links** — `review_id`, `paper_id` (many-to-many; which papers a review covers)
- **chunks** — `id`, `parent_type` (paper|review), `parent_id`, `chunk_index`, `text`, `embedding` (vector), `page`, `char_start`, `char_end`. This is the RAG index. Indexed for vector similarity (pgvector) and full-text (Postgres tsvector).

## Ingestion Pipeline (Async)

Vercel functions have short execution limits, so upload and processing are **decoupled**:

1. **Upload.** User uploads a PDF (paper or review) or pastes text. The file is stored in Vercel Blob; a DB record is created with `status: pending`. The request returns immediately.
2. **Process** (background job — Vercel route handler triggered after upload, or a queued/cron-driven worker):
   - Extract text with `unpdf` / `pdf-parse`.
   - **Chunk** the text (~500 tokens per chunk, with overlap), tracking page numbers and character offsets.
   - **Embed** each chunk via the `llm` provider and store the vector in `chunks`.
   - Mark `status: ready`.
3. **Metadata extraction.** Detect a DOI or arXiv ID in the text and query **CrossRef** (free) for title/authors/year/journal/abstract. Fall back to LLM extraction from the first page if no identifier is found. The user can always edit metadata.
4. **Failure handling.** On any error, set `status: failed` with an `error_reason` and expose a retry action. PDFs that cannot be parsed (scanned/encrypted) prompt the user to paste text manually (OCR is out of scope for Phase 1).

## Linking Reviews to Source Papers

Manual in Phase 1: when creating or editing a review, the user selects which papers (within the collection) it covers, populating `review_paper_links`. Automatic citation-based linking is deferred to Phase 3.

## Search & Chat (RAG)

- **Hybrid search:** combine pgvector semantic similarity with Postgres full-text keyword search for better recall than either alone.
- **Chat flow:**
  1. Embed the user query, retrieve top-k relevant chunks (scoped — see below).
  2. Prompt the chat model to answer **only from the provided context** and to **cite each source it uses**.
  3. Return the answer **plus a citation list** (paper/review title + page) with links back to the source record.
- **Scope selector:** chat across everything, a single collection, or a single review/paper.
- **Anti-hallucination:** if retrieval confidence is low, the app responds "not found in the corpus" rather than guessing. The grounding instruction is enforced in the system prompt.

## Error Handling

- Ingestion failures are visible (`status: failed` + reason) and retryable.
- LLM/API calls retry with exponential backoff and degrade gracefully with user-facing messages.
- Auth: non-allowlisted emails are denied cleanly.

## Testing Strategy

- **Unit:** chunking logic, metadata extraction (DOI detection + CrossRef parsing), `llm` provider abstraction (mocked).
- **Integration:** full ingestion pipeline (upload → ready); retrieval quality against a small seeded corpus with known answers.
- **E2E (light):** upload a paper → ask a question → receive a correctly-cited answer.

## Watch-Items / Risks

1. **Serverless time limits** for extraction + embedding of large PDFs — mitigated by the decoupled async pipeline with a status field.
2. **Blob storage volume/cost** — acceptable at the team's scale; monitor as the corpus grows.
3. **Copyright** — internal, private, research-team use of stored papers is acceptable for this context.

## Phasing (for reference)

- **Phase 1 (this doc):** Foundation + import + citation-grounded chat.
- **Phase 2:** In-app PDF reading & annotation — viewer, passage highlights, comments anchored to exact locations, annotations linked to review entries.
- **Phase 3:** Synthesis — literature matrix, cross-paper themes/tags, contradiction & gap surfacing, export (BibTeX/Word/Markdown), automatic citation→paper linking.
