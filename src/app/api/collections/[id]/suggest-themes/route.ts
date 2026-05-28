import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { suggestThemes } from '@/lib/themes/service';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  try {
    return Response.json(await suggestThemes(id, { db, schema, llm: getLLM() }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
