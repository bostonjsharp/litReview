# LitReview (Phase 1)

Store source papers and literature reviews, link reviews to their sources, and ask
**citation-grounded** questions across the whole corpus. Built with Next.js (App Router)
on Vercel, Postgres + pgvector (Neon), and OpenAI behind a swappable provider interface.

> This is Phase 1: foundation, import, and chat. Phase 2 (in-app PDF reading & annotation)
> and Phase 3 (literature matrix, themes, export) are planned separately. See
> `docs/superpowers/specs/` and `docs/superpowers/plans/`.

---

## What you need

- **Node.js 20+** and npm (the project was built on Node 24 / npm 11).
- A free **Neon** Postgres database — https://console.neon.tech (no Docker needed).
- An **OpenAI API key** — https://platform.openai.com (only needed to actually run the app; tests don't use it).
- A **Google OAuth client** — for sign-in (only needed to run the app).
- A **Vercel** account — for deployment and Blob (PDF) storage.

---

## Local setup

### 1. Create the Neon database
1. Sign up at https://console.neon.tech and create a **project** (region near your team).
2. Create **two databases** inside it:
   - `litreview` — development
   - `litreview_test` — automated tests (its schema is wiped on every test run)

   In the Neon console: **Branches → your branch → Databases → New Database** (or run
   `CREATE DATABASE litreview;` and `CREATE DATABASE litreview_test;` in the SQL Editor).
3. For **each** database, copy its **pooled** connection string (Connection panel → enable
   "Pooled connection"). It looks like:
   `postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/litreview?sslmode=require`

### 2. Configure environment variables
```bash
cp .env.example .env
```
Then edit `.env`:
| Variable | Where it comes from |
|----------|---------------------|
| `DATABASE_URL` | Neon pooled string for `litreview` |
| `TEST_DATABASE_URL` | Neon pooled string for `litreview_test` (must differ from `DATABASE_URL`) |
| `AUTH_SECRET` | run `npx auth secret` and paste the value |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | a Google Cloud OAuth 2.0 Client (Web). Add redirect URI `http://localhost:3000/api/auth/callback/google` for local dev |
| `ALLOWED_EMAILS` | comma-separated list of team emails allowed to sign in |
| `OPENAI_API_KEY` | https://platform.openai.com → API keys |
| `BLOB_READ_WRITE_TOKEN` | from a Vercel Blob store (see Deploy); needed only for PDF uploads |

### 3. Install dependencies
```bash
npm install
```

### 4. Create the database schema
```bash
npm run db:gen      # generates SQL migrations from the schema (already committed; regenerate only after schema changes)
npm run db:migrate  # applies migrations to DATABASE_URL and enables the pgvector extension
```

### 5. Run the app
```bash
npm run dev
```
Open http://localhost:3000. You'll be redirected to `/login`; sign in with a Google account
whose email is in `ALLOWED_EMAILS`. From the dashboard you can **Upload** papers/reviews
(PDF or pasted text) and **Chat** the corpus.

---

## Tests
```bash
npm test
```
- **Unit tests** (LLM provider, chunking, PDF extraction, metadata, allowlist) need nothing.
- **Integration tests** use `TEST_DATABASE_URL` (the Neon test DB); they reset its `public`
  schema on each run, so they never touch your dev data.
- All OpenAI and network calls are **mocked** in tests — no API key or internet-to-OpenAI required.
- No Docker required.

---

## Reading & annotating (Phase 2)
- Open a paper at `/papers/<id>` to read its text. Select any passage and add a note — the highlight + comment is saved as a reusable, paper-level annotation.
- Your annotations are embedded, so chat can search and cite them ("Note on <paper>").
- Compose a review at `/reviews/<id>/edit`: add prose blocks and annotation blocks, and reorder them. The review is an ordered list of blocks; imported reviews keep their original text.

## Themes & literature matrix (Phase 3a)
- Create themes within a collection and tag your annotations with them (theme chips appear under each note in the paper reader at `/papers/<id>`).
- View the literature matrix at `/collections/<id>/matrix`: rows are papers, columns are themes, and each cell shows the paper's annotations tagged with that theme (linked back to the source).
- Click "Suggest themes" to have the LLM propose themes and taggings from your annotations. Suggestions are non-destructive — nothing changes until you click Apply.

## Deploy (Vercel)
1. Push this repo to GitHub and import it into Vercel.
2. Use your Neon database for production (or create a separate prod DB in the same project).
   Run `npm run db:migrate` once against its `DATABASE_URL`.
3. Add a **Vercel Blob** store to the project — this provides `BLOB_READ_WRITE_TOKEN`.
4. Set every variable from the table above in the Vercel project's Environment Variables.
5. Configure the Google OAuth redirect URI for production:
   `https://<your-app>.vercel.app/api/auth/callback/google`.
6. The `/api/process` route runs ingestion in the background (up to 60s). For large PDFs the
   Vercel **Pro** plan's longer limits are recommended; a queue-based upgrade path is noted in
   the plan's "watch-items".

---

## Switching LLM providers
Every model call goes through `src/lib/llm/`. To change provider, add a class implementing the
`LLMProvider` interface (`embed` + `chat`) and return it from `getLLM()` in `src/lib/llm/index.ts`.
Nothing else in the app needs to change.

## Architecture at a glance
- `src/db/` — Drizzle schema, client, migrations
- `src/lib/llm/` — provider-agnostic embeddings + chat (OpenAI implementation)
- `src/lib/ingest/` — PDF extraction, chunking, metadata, and the async pipeline
- `src/lib/search/` — hybrid (vector + full-text) retrieval
- `src/lib/chat/` — citation-grounded question answering
- `src/app/api/` — upload, process, collections, links, chat routes
- `src/auth.ts` + `src/middleware.ts` — Google sign-in gated by an email allowlist
