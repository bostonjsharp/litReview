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
  if (file && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    pdfUrl = await uploadPdf(file.name, bytes);
  }

  const table = kind === 'paper' ? schema.papers : schema.reviews;
  const values: Record<string, unknown> = { collectionId, title, pdfUrl, status: 'pending' };
  if (kind === 'paper') values.uploadedBy = user.id;
  else values.createdBy = user.id;
  const [row] = await db.insert(table).values(values).returning();

  // Fire-and-forget processing via the process route (keeps upload fast).
  const origin = new URL(req.url).origin;
  void fetch(`${origin}/api/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal': process.env.AUTH_SECRET ?? '' },
    body: JSON.stringify({ parentType: kind, parentId: row.id, pastedText, hasBlob: !!pdfUrl }),
  });

  return Response.json({ id: row.id, status: 'pending' }, { status: 202 });
}
