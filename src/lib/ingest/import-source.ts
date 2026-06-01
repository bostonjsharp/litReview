import { eq } from 'drizzle-orm';
import { uploadPdf as defaultUploadPdf } from '../blob';
import { processDocument } from './pipeline';
import { userAgent } from './contact';
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

// The columns written for a paper that has metadata but no ingestible full text.
// Such a paper has no chunks, so it stays invisible to retrieval/chat; the
// 'metadata_only' status drives the UI badge.
function metadataOnlyFields(metadata: PaperMetadata) {
  return {
    authors: metadata.authors ?? null,
    year: metadata.year ?? null,
    journal: metadata.journal ?? null,
    abstract: metadata.abstract ?? null,
    metadata,
    status: 'metadata_only' as const,
  };
}

// A real PDF begins with the "%PDF-" signature within the first bytes. Some
// publisher "pdf" links actually return an HTML landing/paywall page; scan a
// generous prefix so we can tell a true PDF from HTML before parsing it.
function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
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

  // With a PDF, insert a 'pending' row for processImportedPdf to ingest in the
  // background. Without one, insert a finalized metadata_only stub in a single
  // write (it has no body text, so it stays invisible to retrieval/chat).
  const base = {
    collectionId: input.collectionId,
    workspaceId: input.workspaceId,
    title: metadata.title ?? null,
    doi: metadata.doi ?? null,
    uploadedBy: input.userId,
  };

  const values = pdfUrl
    ? { ...base, status: 'pending' as const }
    : { ...base, ...metadataOnlyFields(metadata) };

  const [row] = await db.insert(schema.papers).values(values).returning();
  return { id: row.id, status: pdfUrl ? 'pending' : 'metadata_only' };
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
// already-resolved metadata. If the link turns out not to be a real PDF (e.g. a
// publisher landing/paywall page), the paper falls back to a metadata_only stub.
// On download failure the paper is marked failed.
export async function processImportedPdf(
  paperId: string,
  pdfUrl: string,
  metadata: PaperMetadata,
  deps: ProcessDeps,
): Promise<void> {
  const { db, schema, llm } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const uploadPdf = deps.uploadPdf ?? defaultUploadPdf;
  // processDocument owns its own error handling (it marks the paper 'failed' and
  // does not re-throw), so this catch only fires for the download/upload steps above it.
  try {
    const res = await fetchFn(pdfUrl, { headers: { 'User-Agent': userAgent() } });
    if (!res.ok) throw new Error(`PDF download failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!looksLikePdf(bytes)) {
      // The "pdf" link returned something else (commonly an HTML landing page).
      // We still have good metadata, so finalize as a stub rather than failing.
      await db.update(schema.papers).set(metadataOnlyFields(metadata)).where(eq(schema.papers.id, paperId));
      return;
    }
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
