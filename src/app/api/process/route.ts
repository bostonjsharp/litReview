import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { after } from 'next/server';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { processDocument } from '@/lib/ingest/pipeline';

export const maxDuration = 60; // allow extract + embed to run in after()

const Body = z.object({ parentType: z.enum(['paper', 'review']), parentId: z.string().uuid() });

// Authenticated retry endpoint: re-runs ingestion for a paper/review that failed
// or is stuck. Normal ingestion happens inline in /api/upload via after().
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { parentType, parentId } = Body.parse(await req.json());
  const table = parentType === 'paper' ? schema.papers : schema.reviews;
  const [row] = await db.select().from(table).where(eq(table.id, parentId));
  if (!row) return new Response('Not found', { status: 404 });

  const r = row as { pdfUrl: string | null; fullText?: string | null; bodyText?: string | null };
  let bytes: Uint8Array | undefined;
  if (r.pdfUrl) {
    const res = await fetch(r.pdfUrl);
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  const pastedText = bytes ? undefined : (r.fullText ?? r.bodyText ?? undefined);

  after(
    processDocument({ parentType, parentId, bytes, pastedText }, { db, schema, llm: getLLM() }),
  );

  return Response.json({ ok: true, status: 'processing' });
}
