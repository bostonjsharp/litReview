import { z } from 'zod';
import { after } from 'next/server';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { uploadPdf } from '@/lib/blob';
import { getLLM } from '@/lib/llm';
import { processDocument } from '@/lib/ingest/pipeline';

export const maxDuration = 60; // allow extract + embed to run in after()

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const form = await req.formData();
  const kind = z.enum(['paper', 'review']).parse(form.get('kind'));
  const collectionId = (form.get('collectionId') as string) || null;
  const title = (form.get('title') as string) || null;
  const file = form.get('file') as File | null;
  const pastedText = (form.get('text') as string) || null;

  let pdfUrl: string | null = null;
  let bytes: Uint8Array | undefined;
  if (file && file.size > 0) {
    bytes = new Uint8Array(await file.arrayBuffer());
    pdfUrl = await uploadPdf(file.name, bytes);
  }

  const table = kind === 'paper' ? schema.papers : schema.reviews;
  const values: Record<string, unknown> = { collectionId, title, pdfUrl, status: 'pending' };
  if (kind === 'paper') values.uploadedBy = user.id;
  else values.createdBy = user.id;
  const [row] = await db.insert(table).values(values).returning();

  // Process AFTER the response is sent, but within this same invocation. Vercel keeps
  // the function alive for after() up to maxDuration, so this survives where a
  // fire-and-forget fetch would be dropped. The uploaded bytes are already in memory.
  after(
    processDocument(
      { parentType: kind, parentId: row.id, bytes, pastedText: pastedText ?? undefined },
      { db, schema, llm: getLLM() },
    ),
  );

  return Response.json({ id: row.id, status: 'pending' }, { status: 202 });
}
