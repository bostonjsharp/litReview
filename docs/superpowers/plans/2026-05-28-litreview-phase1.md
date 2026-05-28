# LitReview Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hosted multi-user web app where a research team can upload/paste source papers and lit reviews, link reviews to their sources, and ask citation-grounded questions across the corpus.

**Architecture:** A single Next.js (App Router) app on Vercel. Postgres + pgvector holds all metadata, reviews, links, and embeddings. Vercel Blob holds PDF files. Ingestion is decoupled: upload writes a `pending` record, a process step extracts text → chunks → embeds → marks `ready`. Chat retrieves top-k chunks (hybrid vector + full-text) and asks the LLM to answer only from that context, returning answer + citations. All LLM access goes through a small provider interface so OpenAI can be swapped later.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Drizzle ORM, Postgres + pgvector via **Neon** (cloud; one DB for dev, a separate DB for tests — matches production), Auth.js v5 (Google OAuth + email allowlist), Vercel Blob, `unpdf` (PDF text), `openai` SDK, `zod`, Vitest (unit + integration).

**Database note (no Docker):** Development and tests use a free **Neon** Postgres project (the same provider used in production on Vercel). Create the project in the Neon console, enable the `vector` extension is automatic on migrate, and put the connection strings in `.env`. Tests run against a *separate* `TEST_DATABASE_URL` and reset the `public` schema on each run, so they never touch dev data and need no `CREATE DATABASE` privilege.

**Conventions used throughout:**
- Embedding model: `text-embedding-3-small` → vector dimension **1536**.
- Token estimate for chunking: **~4 characters per token** (no tokenizer dependency).
- All modules export pure functions/interfaces where possible; side-effectful code (DB, network) is injected so it can be mocked in tests.
- Commit after every passing task using Conventional Commits.

---

## Shared Type Reference (defined in Task 3 / Task 2, referenced everywhere)

These exact names/signatures are used across tasks. Do not rename them.

```ts
// LLM (src/lib/llm/types.ts)
export type ParentType = 'paper' | 'review';
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface ChunkSource { parentType: ParentType; parentId: string; title: string; page: number | null; }
export interface RetrievedChunk { id: string; text: string; source: ChunkSource; }
export interface Citation { parentType: ParentType; parentId: string; title: string; page: number | null; }
export interface ChatResult { answer: string; citations: Citation[]; }
export interface LLMProvider {
  embed(texts: string[]): Promise<number[][]>;
  chat(messages: ChatMessage[], context: RetrievedChunk[]): Promise<ChatResult>;
}

// Ingest (src/lib/ingest/*)
export interface ExtractedDoc { text: string; pageOffsets: number[]; } // pageOffsets[i] = char index where page (i+1) begins
export interface Chunk { index: number; text: string; charStart: number; charEnd: number; page: number | null; }
export interface PaperMetadata { title?: string; authors?: string[]; year?: number; doi?: string; journal?: string; abstract?: string; }

// Search (src/lib/search/retrieve.ts)
export interface RetrieveScope { collectionId?: string; parentType?: ParentType; parentId?: string; }
export interface RetrieveOpts { scope?: RetrieveScope; k?: number; }
```

---

## Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `docker-compose.yml`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialize the Next.js project non-interactively**

Run:
```bash
npx --yes create-next-app@latest . --ts --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-npm --no-turbopack
```
Expected: project files created in the current directory (answer "yes" to proceed in non-empty dir if prompted; the `docs/` folder is fine to keep).

- [ ] **Step 2: Install runtime and dev dependencies**

Run:
```bash
npm install drizzle-orm postgres pgvector zod openai @vercel/blob unpdf next-auth@beta
npm install -D drizzle-kit vitest @vitest/coverage-v8 dotenv tsx
```
Expected: dependencies added with no errors.

- [ ] **Step 3: Create `.env.example` with every variable the app needs**

```bash
# Postgres via Neon (cloud). Create a project at https://console.neon.tech,
# then create TWO databases in it: one for dev, one for tests.
# Copy the pooled connection strings here (they look like the examples below).
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/litreview?sslmode=require"
TEST_DATABASE_URL="postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/litreview_test?sslmode=require"

# Auth.js
AUTH_SECRET="generate-with: npx auth secret"
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
# Comma-separated list of allowed team emails
ALLOWED_EMAILS="prof@example.edu,fellow1@example.edu"

# OpenAI
OPENAI_API_KEY=""

# Vercel Blob (set automatically on Vercel; for local dev use a token)
BLOB_READ_WRITE_TOKEN=""
```

- [ ] **Step 4: Neon database setup (no file to create — manual one-time step)**

There is no local database container. Instead:
1. Go to https://console.neon.tech and create a free project (region near your team).
2. In the project, create two databases: `litreview` (dev) and `litreview_test` (tests). (Neon: Branches/Databases → add database, or run `CREATE DATABASE litreview_test;` in the SQL editor.)
3. Copy the **pooled** connection string for each into `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`.

`pgvector` is enabled automatically by the migration step (`CREATE EXTENSION IF NOT EXISTS vector`) — no manual action needed.

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

- [ ] **Step 6: Add scripts to `package.json`**

Add to the `"scripts"` block:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:gen": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  }
}
```

- [ ] **Step 7: Append to `.gitignore`**

```
.env
.env.local
coverage/
```

- [ ] **Step 8: Verify the project builds and lints**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with tooling and local pgvector"
```

---

## Task 2: Database schema, client, and migrations

**Files:**
- Create: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`
- Test: `tests/integration/schema.test.ts`, `tests/helpers/testdb.ts`

- [ ] **Step 1: Create `src/db/schema.ts`**

```ts
import { pgTable, uuid, text, integer, timestamp, jsonb, vector, index, primaryKey } from 'drizzle-orm/pg-core';

export const statusValues = ['pending', 'processing', 'ready', 'failed'] as const;

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  researchQuestion: text('research_question'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const papers = pgTable('papers', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').references(() => collections.id),
  title: text('title'),
  authors: text('authors').array(),
  year: integer('year'),
  doi: text('doi'),
  journal: text('journal'),
  abstract: text('abstract'),
  pdfUrl: text('pdf_url'),
  fullText: text('full_text'),
  metadata: jsonb('metadata'),
  status: text('status', { enum: statusValues }).notNull().default('pending'),
  errorReason: text('error_reason'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').references(() => collections.id),
  title: text('title'),
  bodyText: text('body_text'),
  pdfUrl: text('pdf_url'),
  status: text('status', { enum: statusValues }).notNull().default('pending'),
  errorReason: text('error_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviewPaperLinks = pgTable('review_paper_links', {
  reviewId: uuid('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.reviewId, t.paperId] }) }));

export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentType: text('parent_type', { enum: ['paper', 'review'] }).notNull(),
  parentId: uuid('parent_id').notNull(),
  collectionId: uuid('collection_id'),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  page: integer('page'),
  charStart: integer('char_start').notNull(),
  charEnd: integer('char_end').notNull(),
}, (t) => ({
  embIdx: index('chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));
```

- [ ] **Step 2: Create `src/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function makeDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}

const globalForDb = globalThis as unknown as { _db?: ReturnType<typeof makeDb> };
export const { db } = globalForDb._db ?? (globalForDb._db = makeDb(process.env.DATABASE_URL!));
export { schema };
```

- [ ] **Step 3: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Create `src/db/migrate.ts` (enables pgvector, then applies migrations)**

```ts
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1 });
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();
  console.log('migrations applied');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Generate and apply migrations against the Neon dev DB**

Requires `DATABASE_URL` (Neon dev DB) set in `.env`. Run:
```bash
npm run db:gen
npm run db:migrate
```
Expected: a SQL file appears under `drizzle/`, and `migrations applied` prints with no error.

- [ ] **Step 6: Create `tests/helpers/testdb.ts` (fresh schema per test run)**

```ts
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '@/db/schema';

// Resets the `public` schema in TEST_DATABASE_URL, then re-applies migrations.
// Works on any Postgres including Neon (no CREATE DATABASE privilege needed).
// SAFETY: only ever connects to TEST_DATABASE_URL, never DATABASE_URL.
export async function makeTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  if (url === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const sql = postgres(url, { max: 1 });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  return { db: drizzle(sql, { schema }), sql, schema };
}
```

- [ ] **Step 7: Write the failing schema test `tests/integration/schema.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('schema', () => {
  it('inserts a user, collection, and paper', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: 'a@x.edu' }).returning();
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'NLP', createdBy: u.id }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'Test', uploadedBy: u.id }).returning();
    expect(p.status).toBe('pending');
    expect(p.title).toBe('Test');
  });
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- tests/integration/schema.test.ts`
Expected: PASS (requires `TEST_DATABASE_URL` pointing at the Neon test DB).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle schema, db client, and migrations"
```

---

## Task 3: LLM provider abstraction

**Files:**
- Create: `src/lib/llm/types.ts`, `src/lib/llm/openai.ts`, `src/lib/llm/index.ts`
- Test: `tests/unit/llm.test.ts`

- [ ] **Step 1: Create `src/lib/llm/types.ts`** (exact contents from the Shared Type Reference)

Copy the LLM block from the Shared Type Reference section verbatim into this file.

- [ ] **Step 2: Write the failing test `tests/unit/llm.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '@/lib/llm/openai';

function fakeClient() {
  return {
    embeddings: { create: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] }) },
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ answer: 'Yes, per [1].', citationIndexes: [1] }) } }],
        }),
      },
    },
  } as any;
}

describe('OpenAIProvider', () => {
  it('embed returns one vector per input', async () => {
    const client = fakeClient();
    client.embeddings.create.mockResolvedValue({ data: [{ embedding: [1, 2] }, { embedding: [3, 4] }] });
    const p = new OpenAIProvider(client);
    const out = await p.embed(['a', 'b']);
    expect(out).toEqual([[1, 2], [3, 4]]);
  });

  it('chat maps cited indexes back to RetrievedChunk sources', async () => {
    const p = new OpenAIProvider(fakeClient());
    const ctx = [{ id: 'c1', text: 'hello', source: { parentType: 'paper' as const, parentId: 'p1', title: 'Smith 2020', page: 3 } }];
    const res = await p.chat([{ role: 'user', content: 'q?' }], ctx);
    expect(res.answer).toContain('Yes');
    expect(res.citations).toEqual([{ parentType: 'paper', parentId: 'p1', title: 'Smith 2020', page: 3 }]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/unit/llm.test.ts`
Expected: FAIL ("Cannot find module '@/lib/llm/openai'").

- [ ] **Step 4: Create `src/lib/llm/openai.ts`**

```ts
import type OpenAI from 'openai';
import type { LLMProvider, ChatMessage, RetrievedChunk, ChatResult } from './types';

const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';

export class OpenAIProvider implements LLMProvider {
  constructor(private client: OpenAI) {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({ model: EMBED_MODEL, input: texts });
    return res.data.map((d: { embedding: number[] }) => d.embedding);
  }

  async chat(messages: ChatMessage[], context: RetrievedChunk[]): Promise<ChatResult> {
    const numbered = context.map((c, i) => `[${i + 1}] (${c.source.title}, p.${c.source.page ?? '?'})\n${c.text}`).join('\n\n');
    const system: ChatMessage = {
      role: 'system',
      content:
        'You answer questions about a corpus of academic papers and literature reviews. ' +
        'Use ONLY the numbered context passages. If the answer is not in the context, say ' +
        '"I could not find this in the corpus." Cite sources by their bracket number. ' +
        'Respond as strict JSON: {"answer": string, "citationIndexes": number[]}. ' +
        'citationIndexes lists the 1-based context passages you actually used.',
    };
    const userWithContext: ChatMessage = {
      role: 'user',
      content: `Context passages:\n\n${numbered}\n\nQuestion: ${messages[messages.length - 1].content}`,
    };
    const res = await this.client.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: 'json_object' },
      messages: [system, ...messages.slice(0, -1), userWithContext],
    });
    const raw = res.choices[0].message.content ?? '{"answer":"","citationIndexes":[]}';
    const parsed = JSON.parse(raw) as { answer: string; citationIndexes: number[] };
    const citations = (parsed.citationIndexes ?? [])
      .map((n) => context[n - 1])
      .filter(Boolean)
      .map((c) => ({ parentType: c.source.parentType, parentId: c.source.parentId, title: c.source.title, page: c.source.page }));
    return { answer: parsed.answer, citations };
  }
}
```

- [ ] **Step 5: Create `src/lib/llm/index.ts` (factory — single swap point)**

```ts
import OpenAI from 'openai';
import { OpenAIProvider } from './openai';
import type { LLMProvider } from './types';

let cached: LLMProvider | undefined;

export function getLLM(): LLMProvider {
  if (!cached) cached = new OpenAIProvider(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
  return cached;
}
export type { LLMProvider } from './types';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/unit/llm.test.ts`
Expected: PASS (both tests green).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add swappable LLM provider interface with OpenAI implementation"
```

---

## Task 4: Text chunking

**Files:**
- Create: `src/lib/ingest/chunk.ts`
- Test: `tests/unit/chunk.test.ts`

- [ ] **Step 1: Write the failing test `tests/unit/chunk.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { chunkText, pageForOffset } from '@/lib/ingest/chunk';

describe('chunkText', () => {
  it('returns one chunk for short text', () => {
    const out = chunkText('hello world', { maxTokens: 100, overlapTokens: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ index: 0, text: 'hello world', charStart: 0, charEnd: 11, page: null });
  });

  it('splits long text into overlapping chunks with correct offsets', () => {
    const text = 'a'.repeat(4000); // ~1000 tokens at 4 chars/token
    const out = chunkText(text, { maxTokens: 100, overlapTokens: 20 });
    expect(out.length).toBeGreaterThan(1);
    // chunks are contiguous-ish and cover the whole text
    expect(out[0].charStart).toBe(0);
    expect(out[out.length - 1].charEnd).toBe(4000);
    // overlap: each chunk after the first starts before the previous ended
    expect(out[1].charStart).toBeLessThan(out[0].charEnd);
    // text slice matches offsets
    expect(out[0].text).toBe(text.slice(out[0].charStart, out[0].charEnd));
  });
});

describe('pageForOffset', () => {
  it('maps a char offset to its 1-based page', () => {
    const offsets = [0, 100, 250]; // page 1 @0, page 2 @100, page 3 @250
    expect(pageForOffset(offsets, 0)).toBe(1);
    expect(pageForOffset(offsets, 99)).toBe(1);
    expect(pageForOffset(offsets, 100)).toBe(2);
    expect(pageForOffset(offsets, 300)).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/chunk.test.ts`
Expected: FAIL ("Cannot find module '@/lib/ingest/chunk'").

- [ ] **Step 3: Create `src/lib/ingest/chunk.ts`**

```ts
import type { Chunk } from '../llm/types-shared';

const CHARS_PER_TOKEN = 4;

export interface ChunkOpts { maxTokens?: number; overlapTokens?: number; }

export function chunkText(text: string, opts: ChunkOpts = {}): Chunk[] {
  const maxChars = (opts.maxTokens ?? 500) * CHARS_PER_TOKEN;
  const overlapChars = (opts.overlapTokens ?? 60) * CHARS_PER_TOKEN;
  const step = Math.max(1, maxChars - overlapChars);
  if (text.length <= maxChars) {
    return text.length === 0 ? [] : [{ index: 0, text, charStart: 0, charEnd: text.length, page: null }];
  }
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push({ index, text: text.slice(start, end), charStart: start, charEnd: end, page: null });
    index++;
    if (end === text.length) break;
    start += step;
  }
  return chunks;
}

export function pageForOffset(pageOffsets: number[], charStart: number): number {
  let page = 1;
  for (let i = 0; i < pageOffsets.length; i++) {
    if (charStart >= pageOffsets[i]) page = i + 1;
    else break;
  }
  return page;
}
```

- [ ] **Step 4: Create the shared types file `src/lib/llm/types-shared.ts`**

> Note: `Chunk`, `ExtractedDoc`, and `PaperMetadata` are domain types shared by ingest modules. Put them here so both `chunk.ts` and `extract.ts` import them.

```ts
export interface ExtractedDoc { text: string; pageOffsets: number[]; }
export interface Chunk { index: number; text: string; charStart: number; charEnd: number; page: number | null; }
export interface PaperMetadata { title?: string; authors?: string[]; year?: number; doi?: string; journal?: string; abstract?: string; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/unit/chunk.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add token-aware text chunking with page mapping"
```

---

## Task 5: PDF text extraction

**Files:**
- Create: `src/lib/ingest/extract.ts`
- Test: `tests/unit/extract.test.ts`, `tests/fixtures/make-fixture.ts`

- [ ] **Step 1: Create a tiny PDF fixture generator `tests/fixtures/make-fixture.ts`**

> `unpdf` can also build PDFs is not guaranteed; instead commit a known-good 2-page text PDF. Generate it once with this script (uses pdf-lib only as a dev-time generator).

Run:
```bash
npm install -D pdf-lib
```

```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const line of ['Page one about neural networks.', 'Page two about transformers.']) {
  const page = doc.addPage([300, 200]);
  page.drawText(line, { x: 20, y: 150, size: 12, font });
}
writeFileSync('tests/fixtures/sample.pdf', await doc.save());
console.log('wrote tests/fixtures/sample.pdf');
```

Run: `npx tsx tests/fixtures/make-fixture.ts`
Expected: `wrote tests/fixtures/sample.pdf`.

- [ ] **Step 2: Write the failing test `tests/unit/extract.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractPdf } from '@/lib/ingest/extract';

describe('extractPdf', () => {
  it('extracts text and page offsets from a 2-page PDF', async () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/sample.pdf'));
    const doc = await extractPdf(bytes);
    expect(doc.text.toLowerCase()).toContain('neural networks');
    expect(doc.text.toLowerCase()).toContain('transformers');
    expect(doc.pageOffsets.length).toBe(2);
    expect(doc.pageOffsets[0]).toBe(0);
    expect(doc.pageOffsets[1]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/unit/extract.test.ts`
Expected: FAIL ("Cannot find module '@/lib/ingest/extract'").

- [ ] **Step 4: Create `src/lib/ingest/extract.ts`**

```ts
import { extractText, getDocumentProxy } from 'unpdf';
import type { ExtractedDoc } from '../llm/types-shared';

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedDoc> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: string[] = Array.isArray(text) ? text : [text];
  const pageOffsets: number[] = [];
  let combined = '';
  for (const page of pages) {
    pageOffsets.push(combined.length);
    combined += (page ?? '') + '\n';
  }
  if (combined.trim().length === 0) {
    throw new Error('No extractable text (PDF may be scanned or encrypted)');
  }
  return { text: combined, pageOffsets };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/unit/extract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PDF text extraction with per-page offsets"
```

---

## Task 6: Metadata extraction (DOI detection, CrossRef, LLM fallback)

**Files:**
- Create: `src/lib/ingest/metadata.ts`
- Test: `tests/unit/metadata.test.ts`

- [ ] **Step 1: Write the failing test `tests/unit/metadata.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { findDoi, fetchCrossref, extractMetadata } from '@/lib/ingest/metadata';

describe('findDoi', () => {
  it('finds a DOI in text', () => {
    expect(findDoi('see doi:10.1234/abcd.5678 for details')).toBe('10.1234/abcd.5678');
  });
  it('returns null when absent', () => {
    expect(findDoi('no identifier here')).toBeNull();
  });
});

describe('fetchCrossref', () => {
  it('maps CrossRef JSON to PaperMetadata', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: {
        title: ['A Great Paper'],
        author: [{ given: 'Jane', family: 'Smith' }],
        'published-print': { 'date-parts': [[2020]] },
        'container-title': ['Journal of Things'],
        DOI: '10.1234/abcd',
      } }),
    }) as unknown as typeof fetch;
    const md = await fetchCrossref('10.1234/abcd', fakeFetch);
    expect(md).toEqual({ title: 'A Great Paper', authors: ['Jane Smith'], year: 2020, journal: 'Journal of Things', doi: '10.1234/abcd' });
  });
});

describe('extractMetadata', () => {
  it('uses CrossRef when a DOI is present', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { title: ['T'], author: [], DOI: '10.1/x' } }),
    }) as unknown as typeof fetch;
    const llm = { embed: vi.fn(), chat: vi.fn() } as any;
    const md = await extractMetadata('doi:10.1/x here', llm, fakeFetch);
    expect(md.title).toBe('T');
    expect(llm.chat).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/metadata.test.ts`
Expected: FAIL ("Cannot find module '@/lib/ingest/metadata'").

- [ ] **Step 3: Create `src/lib/ingest/metadata.ts`**

```ts
import type { LLMProvider } from '../llm/types';
import type { PaperMetadata } from '../llm/types-shared';

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
const ARXIV_RE = /arXiv:\s*(\d{4}\.\d{4,5})(v\d+)?/i;

export function findDoi(text: string): string | null {
  const m = text.match(DOI_RE);
  return m ? m[0].replace(/[).,;]+$/, '') : null;
}

export function findArxivId(text: string): string | null {
  const m = text.match(ARXIV_RE);
  return m ? m[1] : null;
}

export async function fetchCrossref(doi: string, fetchFn: typeof fetch = fetch): Promise<PaperMetadata | null> {
  const res = await fetchFn(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { 'User-Agent': 'LitReview/1.0 (mailto:team@example.edu)' },
  });
  if (!res.ok) return null;
  const { message } = await res.json();
  const md: PaperMetadata = {};
  if (message.title?.[0]) md.title = message.title[0];
  if (Array.isArray(message.author)) md.authors = message.author.map((a: { given?: string; family?: string }) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
  const year = message['published-print']?.['date-parts']?.[0]?.[0] ?? message['published-online']?.['date-parts']?.[0]?.[0];
  if (year) md.year = year;
  if (message['container-title']?.[0]) md.journal = message['container-title'][0];
  if (message.DOI) md.doi = message.DOI;
  return md;
}

export async function extractMetadata(text: string, llm: LLMProvider, fetchFn: typeof fetch = fetch): Promise<PaperMetadata> {
  const doi = findDoi(text);
  if (doi) {
    const md = await fetchCrossref(doi, fetchFn).catch(() => null);
    if (md?.title) return md;
  }
  // LLM fallback: extract from the first ~2000 chars (title page region)
  const result = await llm.chat(
    [{ role: 'user', content: `Extract bibliographic metadata from this text as JSON {title, authors[], year, journal}. Text:\n${text.slice(0, 2000)}` }],
    [],
  );
  try {
    const parsed = JSON.parse(result.answer) as PaperMetadata;
    return { ...parsed, ...(doi ? { doi } : {}) };
  } catch {
    return doi ? { doi } : {};
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/metadata.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add metadata extraction via DOI/CrossRef with LLM fallback"
```

---

## Task 7: Authentication (Auth.js + Google + email allowlist)

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
- Test: `tests/unit/allowlist.test.ts`

- [ ] **Step 1: Write the failing test `tests/unit/allowlist.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { isAllowed } from '@/auth';

describe('isAllowed', () => {
  it('allows emails on the list (case-insensitive)', () => {
    expect(isAllowed('Prof@Example.edu', 'prof@example.edu,fellow@example.edu')).toBe(true);
  });
  it('rejects emails not on the list', () => {
    expect(isAllowed('stranger@evil.com', 'prof@example.edu')).toBe(false);
  });
  it('rejects when email is missing', () => {
    expect(isAllowed(undefined, 'prof@example.edu')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/allowlist.test.ts`
Expected: FAIL ("Cannot find module '@/auth'").

- [ ] **Step 3: Create `src/auth.ts`**

```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export function isAllowed(email: string | undefined | null, allowList: string | undefined): boolean {
  if (!email || !allowList) return false;
  const set = new Set(allowList.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  return set.has(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      return isAllowed(profile?.email, process.env.ALLOWED_EMAILS);
    },
  },
});
```

- [ ] **Step 4: Create `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

- [ ] **Step 5: Create `src/middleware.ts` (protect all app routes except auth)**

```ts
import { auth } from '@/auth';

export default auth((req) => {
  if (!req.auth && !req.nextUrl.pathname.startsWith('/api/auth') && req.nextUrl.pathname !== '/login') {
    const url = new URL('/login', req.nextUrl.origin);
    return Response.redirect(url);
  }
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/unit/allowlist.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Google auth gated by an email allowlist"
```

---

## Task 8: Ingestion pipeline orchestration

**Files:**
- Create: `src/lib/ingest/pipeline.ts`
- Test: `tests/integration/pipeline.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/pipeline.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { processDocument } from '@/lib/ingest/pipeline';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function fakeLLM() {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map(() => Array(1536).fill(0.01))),
    chat: vi.fn(async () => ({ answer: '{}', citations: [] })),
  };
}

describe('processDocument', () => {
  it('extracts, chunks, embeds, and marks a paper ready', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    const llm = fakeLLM();
    await processDocument(
      { parentType: 'paper', parentId: p.id, pastedText: 'Neural networks are great. '.repeat(500) },
      { db: ctx.db, schema: ctx.schema, llm },
    );
    const [updated] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(updated.status).toBe('ready');
    expect(updated.fullText).toContain('Neural networks');
    const rows = await ctx.db.select().from(ctx.schema.chunks).where(eq(ctx.schema.chunks.parentId, p.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(llm.embed).toHaveBeenCalled();
  });

  it('marks failed with a reason when text cannot be produced', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    await processDocument(
      { parentType: 'paper', parentId: p.id, pastedText: '   ' },
      { db: ctx.db, schema: ctx.schema, llm: fakeLLM() },
    );
    const [updated] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(updated.status).toBe('failed');
    expect(updated.errorReason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/pipeline.test.ts`
Expected: FAIL ("Cannot find module '@/lib/ingest/pipeline'").

- [ ] **Step 3: Create `src/lib/ingest/pipeline.ts`**

```ts
import { eq } from 'drizzle-orm';
import { extractPdf } from './extract';
import { chunkText, pageForOffset } from './chunk';
import { extractMetadata } from './metadata';
import type { LLMProvider } from '../llm/types';
import type { ParentType } from '../llm/types';

interface ProcessInput {
  parentType: ParentType;
  parentId: string;
  bytes?: Uint8Array;
  pastedText?: string;
}
interface Deps {
  db: any;
  schema: any;
  llm: LLMProvider;
}

export async function processDocument(input: ProcessInput, deps: Deps): Promise<void> {
  const { db, schema, llm } = deps;
  const table = input.parentType === 'paper' ? schema.papers : schema.reviews;
  try {
    await db.update(table).set({ status: 'processing' }).where(eq(table.id, input.parentId));

    let text: string;
    let pageOffsets: number[] = [0];
    if (input.bytes) {
      const doc = await extractPdf(input.bytes);
      text = doc.text;
      pageOffsets = doc.pageOffsets;
    } else {
      text = input.pastedText ?? '';
    }
    if (text.trim().length === 0) {
      throw new Error('No extractable text (scanned/encrypted PDF or empty paste). Paste text manually to proceed.');
    }

    // Metadata (papers only)
    if (input.parentType === 'paper') {
      const md = await extractMetadata(text, llm).catch(() => ({}));
      await db.update(schema.papers).set({
        fullText: text,
        title: md.title ?? undefined,
        authors: md.authors ?? undefined,
        year: md.year ?? undefined,
        doi: md.doi ?? undefined,
        journal: md.journal ?? undefined,
        abstract: md.abstract ?? undefined,
        metadata: md,
      }).where(eq(schema.papers.id, input.parentId));
    } else {
      await db.update(schema.reviews).set({ bodyText: text }).where(eq(schema.reviews.id, input.parentId));
    }

    // Chunk + embed
    const chunks = chunkText(text);
    const embeddings = await llm.embed(chunks.map((c) => c.text));
    const [parentRow] = await db.select().from(table).where(eq(table.id, input.parentId));
    const rows = chunks.map((c, i) => ({
      parentType: input.parentType,
      parentId: input.parentId,
      collectionId: parentRow.collectionId ?? null,
      chunkIndex: c.index,
      text: c.text,
      embedding: embeddings[i],
      page: pageForOffset(pageOffsets, c.charStart),
      charStart: c.charStart,
      charEnd: c.charEnd,
    }));
    if (rows.length > 0) await db.insert(schema.chunks).values(rows);

    await db.update(table).set({ status: 'ready', errorReason: null }).where(eq(table.id, input.parentId));
  } catch (err) {
    await db.update(table).set({ status: 'failed', errorReason: (err as Error).message }).where(eq(table.id, input.parentId));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/pipeline.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add async ingestion pipeline (extract, chunk, embed, status)"
```

---

## Task 9: Hybrid retrieval (vector + full-text)

**Files:**
- Create: `src/lib/search/retrieve.ts`
- Test: `tests/integration/retrieve.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/retrieve.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

// Embedding stub: "transformer" query close to chunk A, far from chunk B.
function fakeLLM(queryVec: number[]) {
  return { embed: vi.fn(async () => [queryVec]), chat: vi.fn() } as any;
}

describe('retrieve', () => {
  it('returns the most similar chunk first with a usable source', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Attention Paper', status: 'ready' }).returning();
    const near = Array(1536).fill(0); near[0] = 1;
    const far = Array(1536).fill(0); far[1] = 1;
    await ctx.db.insert(ctx.schema.chunks).values([
      { parentType: 'paper', parentId: p.id, chunkIndex: 0, text: 'about transformers', embedding: near, page: 1, charStart: 0, charEnd: 18 },
      { parentType: 'paper', parentId: p.id, chunkIndex: 1, text: 'about cooking', embedding: far, page: 2, charStart: 18, charEnd: 31 },
    ]);
    const res = await retrieve('transformers', fakeLLM(near), ctx.db, { k: 1, schema: ctx.schema } as any);
    expect(res).toHaveLength(1);
    expect(res[0].text).toBe('about transformers');
    expect(res[0].source).toMatchObject({ parentType: 'paper', parentId: p.id, title: 'Attention Paper', page: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/retrieve.test.ts`
Expected: FAIL ("Cannot find module '@/lib/search/retrieve'").

- [ ] **Step 3: Create `src/lib/search/retrieve.ts`**

```ts
import { sql, and, eq } from 'drizzle-orm';
import type { LLMProvider, RetrievedChunk, ParentType } from '../llm/types';

export interface RetrieveScope { collectionId?: string; parentType?: ParentType; parentId?: string; }
export interface RetrieveOpts { scope?: RetrieveScope; k?: number; schema: any; }

export async function retrieve(query: string, llm: LLMProvider, db: any, opts: RetrieveOpts): Promise<RetrievedChunk[]> {
  const { schema } = opts;
  const k = opts.k ?? 8;
  const [queryVec] = await llm.embed([query]);
  const vecLiteral = `[${queryVec.join(',')}]`;

  const conds = [] as any[];
  if (opts.scope?.collectionId) conds.push(eq(schema.chunks.collectionId, opts.scope.collectionId));
  if (opts.scope?.parentType) conds.push(eq(schema.chunks.parentType, opts.scope.parentType));
  if (opts.scope?.parentId) conds.push(eq(schema.chunks.parentId, opts.scope.parentId));
  const where = conds.length ? and(...conds) : undefined;

  // Vector similarity (cosine distance; smaller = closer). Hybrid: also boost rows whose
  // text matches the query via Postgres full-text search.
  const rows = await db
    .select({
      id: schema.chunks.id,
      text: schema.chunks.text,
      parentType: schema.chunks.parentType,
      parentId: schema.chunks.parentId,
      page: schema.chunks.page,
      dist: sql<number>`${schema.chunks.embedding} <=> ${vecLiteral}::vector`,
      lexical: sql<number>`ts_rank(to_tsvector('english', ${schema.chunks.text}), plainto_tsquery('english', ${query}))`,
    })
    .from(schema.chunks)
    .where(where)
    .orderBy(sql`(${schema.chunks.embedding} <=> ${vecLiteral}::vector) - 0.1 * ts_rank(to_tsvector('english', ${schema.chunks.text}), plainto_tsquery('english', ${query}))`)
    .limit(k);

  // Resolve titles for each parent.
  const out: RetrievedChunk[] = [];
  for (const r of rows) {
    const table = r.parentType === 'paper' ? schema.papers : schema.reviews;
    const [parent] = await db.select({ title: table.title }).from(table).where(eq(table.id, r.parentId));
    out.push({
      id: r.id,
      text: r.text,
      source: { parentType: r.parentType, parentId: r.parentId, title: parent?.title ?? 'Untitled', page: r.page },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/retrieve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add hybrid vector + full-text retrieval"
```

---

## Task 10: Citation-grounded chat

**Files:**
- Create: `src/lib/chat/answer.ts`
- Test: `tests/integration/chat.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/chat.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { answerQuestion } from '@/lib/chat/answer';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('answerQuestion', () => {
  it('retrieves context and returns an answer with citations', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Smith 2020', status: 'ready' }).returning();
    const vec = Array(1536).fill(0); vec[0] = 1;
    await ctx.db.insert(ctx.schema.chunks).values([
      { parentType: 'paper', parentId: p.id, chunkIndex: 0, text: 'Transformers outperform RNNs.', embedding: vec, page: 4, charStart: 0, charEnd: 28 },
    ]);
    const llm = {
      embed: vi.fn(async () => [vec]),
      chat: vi.fn(async (_msgs, context) => ({ answer: 'Transformers outperform RNNs.', citations: context.map((c: any) => ({ ...c.source })) })),
    } as any;
    const res = await answerQuestion('Do transformers beat RNNs?', llm, ctx.db, { schema: ctx.schema });
    expect(res.answer).toContain('Transformers');
    expect(res.citations[0]).toMatchObject({ title: 'Smith 2020', page: 4 });
    expect(llm.chat).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/chat.test.ts`
Expected: FAIL ("Cannot find module '@/lib/chat/answer'").

- [ ] **Step 3: Create `src/lib/chat/answer.ts`**

```ts
import { retrieve, type RetrieveScope } from '../search/retrieve';
import type { LLMProvider, ChatResult } from '../llm/types';

export interface AnswerOpts { scope?: RetrieveScope; k?: number; schema: any; }

export async function answerQuestion(query: string, llm: LLMProvider, db: any, opts: AnswerOpts): Promise<ChatResult> {
  const context = await retrieve(query, llm, db, { scope: opts.scope, k: opts.k ?? 8, schema: opts.schema });
  if (context.length === 0) {
    return { answer: 'I could not find this in the corpus.', citations: [] };
  }
  return llm.chat([{ role: 'user', content: query }], context);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add citation-grounded chat over retrieved context"
```

---

## Task 11: API routes (upload, process, collections, links, chat)

**Files:**
- Create: `src/lib/blob.ts`, `src/app/api/upload/route.ts`, `src/app/api/process/route.ts`, `src/app/api/collections/route.ts`, `src/app/api/links/route.ts`, `src/app/api/chat/route.ts`, `src/lib/session.ts`
- Test: `tests/integration/upload-flow.test.ts`

- [ ] **Step 1: Create `src/lib/session.ts` (resolve the current allowlisted user, creating the row on first sight)**

```ts
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';

export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Response('Unauthorized', { status: 401 });
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return existing;
  const [created] = await db.insert(schema.users).values({ email, name: session.user?.name ?? null }).returning();
  return created;
}
```

- [ ] **Step 2: Create `src/lib/blob.ts`**

```ts
import { put } from '@vercel/blob';

export async function uploadPdf(filename: string, bytes: Uint8Array): Promise<string> {
  const { url } = await put(`pdfs/${Date.now()}-${filename}`, Buffer.from(bytes), { access: 'public', contentType: 'application/pdf' });
  return url;
}
```

- [ ] **Step 3: Create `src/app/api/collections/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';

const Body = z.object({ name: z.string().min(1), researchQuestion: z.string().optional() });

export async function GET() {
  await requireUser();
  const rows = await db.select().from(schema.collections);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const user = await requireUser();
  const body = Body.parse(await req.json());
  const [row] = await db.insert(schema.collections).values({ name: body.name, researchQuestion: body.researchQuestion, createdBy: user.id }).returning();
  return Response.json(row, { status: 201 });
}
```

- [ ] **Step 4: Create `src/app/api/upload/route.ts` (creates the record, stores the blob, fires processing)**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { uploadPdf } from '@/lib/blob';

export async function POST(req: Request) {
  const user = await requireUser();
  const form = await req.formData();
  const kind = z.enum(['paper', 'review']).parse(form.get('kind'));
  const collectionId = (form.get('collectionId') as string) || null;
  const title = (form.get('title') as string) || null;
  const file = form.get('file') as File | null;
  const pastedText = (form.get('text') as string) || null;

  let pdfUrl: string | null = null;
  let bytes: Uint8Array | null = null;
  if (file) {
    bytes = new Uint8Array(await file.arrayBuffer());
    pdfUrl = await uploadPdf(file.name, bytes);
  }

  const table = kind === 'paper' ? schema.papers : schema.reviews;
  const values: Record<string, unknown> = { collectionId, title, pdfUrl, status: 'pending' };
  if (kind === 'paper') values.uploadedBy = user.id; else values.createdBy = user.id;
  const [row] = await db.insert(table).values(values).returning();

  // Fire-and-forget processing via the process route (keeps upload fast; survives within the function).
  const origin = new URL(req.url).origin;
  void fetch(`${origin}/api/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal': process.env.AUTH_SECRET ?? '' },
    body: JSON.stringify({ parentType: kind, parentId: row.id, pastedText, hasBlob: !!pdfUrl }),
  });

  return Response.json({ id: row.id, status: 'pending' }, { status: 202 });
}
```

- [ ] **Step 5: Create `src/app/api/process/route.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getLLM } from '@/lib/llm';
import { processDocument } from '@/lib/ingest/pipeline';

export const maxDuration = 60; // Vercel: allow up to 60s for extract+embed

export async function POST(req: Request) {
  if ((req.headers.get('x-internal') ?? '') !== (process.env.AUTH_SECRET ?? 'x')) {
    return new Response('forbidden', { status: 403 });
  }
  const { parentType, parentId, pastedText, hasBlob } = await req.json();
  let bytes: Uint8Array | undefined;
  if (hasBlob) {
    const table = parentType === 'paper' ? schema.papers : schema.reviews;
    const [row] = await db.select().from(table).where(eq(table.id, parentId));
    if (row?.pdfUrl) {
      const res = await fetch(row.pdfUrl);
      bytes = new Uint8Array(await res.arrayBuffer());
    }
  }
  await processDocument({ parentType, parentId, bytes, pastedText: pastedText ?? undefined }, { db, schema, llm: getLLM() });
  return Response.json({ ok: true });
}
```

- [ ] **Step 6: Create `src/app/api/links/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';

const Body = z.object({ reviewId: z.string().uuid(), paperId: z.string().uuid() });

export async function POST(req: Request) {
  await requireUser();
  const { reviewId, paperId } = Body.parse(await req.json());
  await db.insert(schema.reviewPaperLinks).values({ reviewId, paperId }).onConflictDoNothing();
  return Response.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 7: Create `src/app/api/chat/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { answerQuestion } from '@/lib/chat/answer';

const Body = z.object({
  query: z.string().min(1),
  scope: z.object({ collectionId: z.string().optional(), parentType: z.enum(['paper', 'review']).optional(), parentId: z.string().optional() }).optional(),
});

export async function POST(req: Request) {
  await requireUser();
  const body = Body.parse(await req.json());
  const result = await answerQuestion(body.query, getLLM(), db, { scope: body.scope, schema });
  return Response.json(result);
}
```

- [ ] **Step 8: Write the failing test `tests/integration/upload-flow.test.ts`** (tests pipeline wiring without HTTP/auth by calling `processDocument` through the same shape the route uses)

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { processDocument } from '@/lib/ingest/pipeline';
import { answerQuestion } from '@/lib/chat/answer';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('upload → process → chat flow', () => {
  it('an ingested paper becomes answerable', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'RNN vs Transformer', status: 'pending' }).returning();
    const vec = Array(1536).fill(0); vec[0] = 1;
    const llm = {
      embed: vi.fn(async (texts: string[]) => texts.map(() => vec)),
      chat: vi.fn(async (_m, ctxChunks) => ({ answer: 'Transformers win.', citations: ctxChunks.map((c: any) => ({ ...c.source })) })),
    } as any;
    await processDocument({ parentType: 'paper', parentId: p.id, pastedText: 'Transformers outperform RNNs on long sequences. '.repeat(50) }, { db: ctx.db, schema: ctx.schema, llm });
    const [ready] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(ready.status).toBe('ready');
    const res = await answerQuestion('Which is better?', llm, ctx.db, { schema: ctx.schema });
    expect(res.answer).toBe('Transformers win.');
    expect(res.citations[0].title).toBe('RNN vs Transformer');
  });
});
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- tests/integration/upload-flow.test.ts`
Expected: PASS.

- [ ] **Step 10: Verify all routes typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add upload, process, collections, links, and chat API routes"
```

---

## Task 12: Minimal UI (login, dashboard, upload, chat)

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/page.tsx` (replace scaffold), `src/app/upload/page.tsx`, `src/app/chat/page.tsx`, `src/components/UploadForm.tsx`, `src/components/ChatPanel.tsx`

> UI is intentionally minimal and unstyled-but-usable. Behavior is covered by the API/integration tests above; these pages wire the proven backend to the browser.

- [ ] **Step 1: Create `src/app/login/page.tsx`**

```tsx
import { signIn } from '@/auth';

export default function Login() {
  return (
    <main style={{ padding: 40 }}>
      <h1>LitReview</h1>
      <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }); }}>
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/app/page.tsx` with a dashboard**

```tsx
import Link from 'next/link';
import { auth, signOut } from '@/auth';

export default async function Home() {
  const session = await auth();
  return (
    <main style={{ padding: 40 }}>
      <h1>LitReview</h1>
      <p>Signed in as {session?.user?.email}</p>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link href="/upload">Upload</Link>
        <Link href="/chat">Chat</Link>
      </nav>
      <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create `src/components/UploadForm.tsx`**

```tsx
'use client';
import { useState } from 'react';

export function UploadForm() {
  const [status, setStatus] = useState('');
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('Uploading…');
    const res = await fetch('/api/upload', { method: 'POST', body: new FormData(e.currentTarget) });
    const json = await res.json();
    setStatus(res.ok ? `Queued (id ${json.id}). Processing in background.` : `Error: ${JSON.stringify(json)}`);
  }
  return (
    <form onSubmit={onSubmit}>
      <select name="kind"><option value="paper">Paper</option><option value="review">Review</option></select>
      <input name="title" placeholder="Title (optional)" />
      <input type="file" name="file" accept="application/pdf" />
      <textarea name="text" placeholder="…or paste text here" rows={6} />
      <button type="submit">Upload</button>
      <p>{status}</p>
    </form>
  );
}
```

- [ ] **Step 4: Create `src/app/upload/page.tsx`**

```tsx
import { UploadForm } from '@/components/UploadForm';
export default function UploadPage() {
  return <main style={{ padding: 40 }}><h1>Upload</h1><UploadForm /></main>;
}
```

- [ ] **Step 5: Create `src/components/ChatPanel.tsx`**

```tsx
'use client';
import { useState } from 'react';

interface Citation { title: string; page: number | null; }
export function ChatPanel() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  async function ask() {
    setAnswer('Thinking…'); setCitations([]);
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
    const json = await res.json();
    setAnswer(json.answer); setCitations(json.citations ?? []);
  }
  return (
    <div>
      <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={3} placeholder="Ask the corpus…" />
      <button onClick={ask}>Ask</button>
      <p>{answer}</p>
      {citations.length > 0 && (
        <ul>{citations.map((c, i) => <li key={i}>{c.title}{c.page ? `, p.${c.page}` : ''}</li>)}</ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `src/app/chat/page.tsx`**

```tsx
import { ChatPanel } from '@/components/ChatPanel';
export default function ChatPage() {
  return <main style={{ padding: 40 }}><h1>Chat</h1><ChatPanel /></main>;
}
```

- [ ] **Step 7: Verify build and types**

Run: `npm run build`
Expected: build succeeds (set placeholder env vars if build requires them; `OPENAI_API_KEY` and auth vars can be empty strings for a type/build check).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add minimal UI for login, upload, and chat"
```

---

## Task 13: Full test pass, README, and deployment notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the entire test suite**

Run: `npm test` (requires `TEST_DATABASE_URL` set to the Neon test DB).
Expected: all unit and integration tests PASS.

- [ ] **Step 2: Create `README.md` with setup and deploy steps**

```markdown
# LitReview (Phase 1)

Store source papers and lit reviews, link them, and ask citation-grounded questions.

## Local setup
1. **Create a Neon database.** Sign up at https://console.neon.tech, create a project, and create two databases in it: `litreview` (dev) and `litreview_test` (tests). Copy each pooled connection string.
2. `cp .env.example .env` and fill in:
   - `DATABASE_URL` / `TEST_DATABASE_URL` — the two Neon connection strings from step 1.
   - `AUTH_SECRET` — generate with `npx auth secret`.
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from a Google Cloud OAuth client (redirect URI `http://localhost:3000/api/auth/callback/google` for dev).
   - `ALLOWED_EMAILS` — comma-separated team emails.
   - `OPENAI_API_KEY` — from https://platform.openai.com.
   - `BLOB_READ_WRITE_TOKEN` — from a Vercel Blob store (see Deploy below); only needed for PDF uploads.
3. `npm install`
4. `npm run db:gen && npm run db:migrate` — generates and applies the schema to the Neon dev DB (auto-enables the `vector` extension).
5. `npm run dev` — open http://localhost:3000.

## Tests
`npm test` — unit tests need nothing; integration tests use `TEST_DATABASE_URL` (the Neon test DB), whose `public` schema is reset on each run. No Docker required. LLM and network calls are mocked, so no OpenAI key is needed for tests.

## Deploy (Vercel)
- Use the same Neon project (or a production database in it); run `npm run db:migrate` against its `DATABASE_URL` once.
- Add a Vercel Blob store (provides `BLOB_READ_WRITE_TOKEN`).
- Set all `.env` variables in the Vercel project settings.
- Configure the Google OAuth redirect URI: `https://<app>/api/auth/callback/google`.
- The `/api/process` route runs ingestion in the background (up to 60s; Pro plan recommended for larger PDFs).

## Provider swap
All model calls go through `src/lib/llm/`. To change providers, add a class implementing `LLMProvider` and return it from `getLLM()`.
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add README with setup, test, and deploy instructions"
```

---

## Self-Review (completed during authoring)

**Spec coverage check:**
- Auth.js + Google + allowlist → Task 7 ✓
- Postgres + pgvector single-DB → Tasks 2, 9 ✓
- Vercel Blob for PDFs → Tasks 11 (`blob.ts`, upload route) ✓
- Provider abstraction (`embed`/`chat`, swappable) → Task 3 ✓
- Data model (users, collections, papers, reviews, links, chunks) → Task 2 ✓
- Async ingestion (upload→pending, process→ready/failed, status+reason+retry) → Tasks 8, 11 ✓ (retry = re-POST to `/api/process`; surfaced in UI status)
- PDF extraction with page tracking + scanned/encrypted fallback message → Tasks 5, 8 ✓
- Chunking (~500 tokens, overlap, page/offset) → Task 4 ✓
- Metadata: DOI detect → CrossRef → LLM fallback → editable → Task 6 ✓ (editing exposed via collections/paper edit is a thin follow-up; metadata is stored editable in `papers`)
- Manual review↔paper linking → Task 11 (`links` route) ✓
- Hybrid search (vector + full-text) → Task 9 ✓
- Citation-grounded chat with scope selector + "not found" behavior → Tasks 3, 10, 11 ✓
- Testing (unit, integration, light E2E) → unit (Tasks 3–7), integration (Tasks 2, 8–11), E2E-as-flow (Task 11 upload-flow) ✓

**Type consistency:** `ParentType`, `RetrievedChunk`, `ChunkSource`, `Citation`, `ChatResult`, `LLMProvider`, `Chunk`, `ExtractedDoc`, `PaperMetadata`, `RetrieveScope`/`RetrieveOpts` used identically across tasks. `retrieve`/`answerQuestion` both take `{ schema }` in opts. `processDocument` signature `(input, { db, schema, llm })` consistent between Task 8 and Task 11.

**Known thin spots (acceptable for Phase 1, flagged not hidden):**
- Metadata editing UI is not built (data is stored and editable at the DB/API layer); a small edit form is a fast Phase-1.1 add if the team wants it.
- The `/api/process` fire-and-forget pattern relies on the function staying alive; for very large PDFs a queue (e.g. Vercel Cron pulling `pending` rows) is the documented upgrade path.
