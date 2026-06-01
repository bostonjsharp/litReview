import { eq } from 'drizzle-orm';
import { uploadPdf as defaultUploadPdf } from '../blob';
import { processDocument } from './pipeline';
import type { PaperMetadata } from '../llm/types-shared';
import type { LLMProvider } from '../llm/types';

interface CreateInput {
  workspaceId: string | null;
  collectionId: string | null;
  userId: string | null;
  metadata: PaperMetadata;
  pdfUrl: string | null;
}

interface CreateDeps {
  db: any;
  schema: any;
}

// Inserts the paper row. With no open-access PDF, the row is finalized as a
// metadata_only stub (it has no body text, so it is invisible to retrieval/chat).
// With a PDF, the row is left 'pending' for processImportedPdf to ingest in the
// background.
export async function createImportedPaper(
  input: CreateInput,
  deps: CreateDeps,
): Promise<{ id: string; status: 'pending' | 'metadata_only' }> {
  const { db, schema } = deps;
  const { metadata, pdfUrl } = input;
  const [row] = await db
    .insert(schema.papers)
    .values({
      collectionId: input.collectionId,
      workspaceId: input.workspaceId,
      title: metadata.title ?? null,
      doi: metadata.doi ?? null,
      status: 'pending',
      uploadedBy: input.userId,
    })
    .returning();

  if (pdfUrl) return { id: row.id, status: 'pending' };

  await db
    .update(schema.papers)
    .set({
      authors: metadata.authors ?? null,
      year: metadata.year ?? null,
      journal: metadata.journal ?? null,
      abstract: metadata.abstract ?? null,
      metadata,
      status: 'metadata_only',
    })
    .where(eq(schema.papers.id, row.id));

  return { id: row.id, status: 'metadata_only' };
}

interface ProcessDeps {
  db: any;
  schema: any;
  llm: LLMProvider;
  fetchFn?: typeof fetch;
  uploadPdf?: (filename: string, bytes: Uint8Array) => Promise<string>;
}

// Downloads the open-access PDF, stores it to blob (so the in-app viewer works the
// same as an uploaded file), then runs the standard ingest pipeline with the
// already-resolved metadata. On download failure the paper is marked failed.
export async function processImportedPdf(
  paperId: string,
  pdfUrl: string,
  metadata: PaperMetadata,
  deps: ProcessDeps,
): Promise<void> {
  const { db, schema, llm } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const uploadPdf = deps.uploadPdf ?? defaultUploadPdf;
  try {
    const res = await fetchFn(pdfUrl, { headers: { 'User-Agent': 'LitReview/1.0' } });
    if (!res.ok) throw new Error(`PDF download failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const blobUrl = await uploadPdf(`${paperId}.pdf`, bytes);
    await db.update(schema.papers).set({ pdfUrl: blobUrl }).where(eq(schema.papers.id, paperId));
    await processDocument({ parentType: 'paper', parentId: paperId, bytes, metadata }, { db, schema, llm });
  } catch (err) {
    await db
      .update(schema.papers)
      .set({ status: 'failed', errorReason: (err as Error).message })
      .where(eq(schema.papers.id, paperId));
  }
}
