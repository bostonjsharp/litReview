import { z } from 'zod';
import { after } from 'next/server';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { uploadPdf } from '@/lib/blob';
import { getLLM } from '@/lib/llm';
import { processDocument } from '@/lib/ingest/pipeline';

export const maxDuration = 60; // allow extract + embed to run in after()

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const form = await req.formData();
  const kind = z.enum(['paper', 'review']).parse(form.get('kind'));
  const workspaceId = (form.get('workspaceId') as string) || '';
  if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 });
  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const collectionId = (form.get('collectionId') as string) || null;
  const title = (form.get('title') as string) || null;
  const file = form.get('file') as File | null;
  const pastedText = (form.get('text') as string) || null;

  let pdfUrl: string | null = null;
  let bytes: Uint8Array | undefined;
  if (file && file.size > 0) {
    bytes = new Uint8Array(await file.arrayBuffer());
    try {
      pdfUrl = await uploadPdf(file.name, bytes);
    } catch {
      const msg = process.env.BLOB_READ_WRITE_TOKEN
        ? 'Failed to store the PDF. Please try again.'
        : 'PDF storage is not configured (BLOB_READ_WRITE_TOKEN is missing). See README → Vercel Blob setup.';
      return Response.json({ error: msg }, { status: 503 });
    }
  }

  const table = kind === 'paper' ? schema.papers : schema.reviews;
  const values: Record<string, unknown> = { collectionId, workspaceId, title, pdfUrl, status: 'pending' };
  if (kind === 'paper') values.uploadedBy = user.id;
  else values.createdBy = user.id;
  const [row] = await db.insert(table).values(values).returning();

  after(
    processDocument(
      { parentType: kind, parentId: row.id, bytes, pastedText: pastedText ?? undefined },
      { db, schema, llm: getLLM() },
    ),
  );

  return Response.json({ id: row.id, status: 'pending' }, { status: 202 });
}
