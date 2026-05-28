import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { listAnnotations } from '@/lib/annotate/service';
import { getLLM } from '@/lib/llm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return new Response('Not found', { status: 404 });
  const annotations = await listAnnotations(id, { db, schema, llm: getLLM() });
  return Response.json({ paper: { id: paper.id, title: paper.title, fullText: paper.fullText }, annotations });
}
