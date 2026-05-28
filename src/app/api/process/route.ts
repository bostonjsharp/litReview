import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getLLM } from '@/lib/llm';
import { processDocument } from '@/lib/ingest/pipeline';

export const maxDuration = 60; // Vercel: allow up to 60s for extract + embed

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
  await processDocument(
    { parentType, parentId, bytes, pastedText: pastedText ?? undefined },
    { db, schema, llm: getLLM() },
  );
  return Response.json({ ok: true });
}
