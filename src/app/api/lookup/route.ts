import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { parseIdentifier, resolveSource } from '@/lib/ingest/resolve';

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ identifier: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: 'identifier required' }, { status: 400 });

  const id = parseIdentifier(parsed.data.identifier);
  if (!id) {
    return Response.json({ error: 'Unrecognized identifier — paste a DOI or arXiv id/URL' }, { status: 400 });
  }

  try {
    const { metadata, pdfUrl, source } = await resolveSource(id);
    if (!metadata.title) {
      return Response.json({ error: 'No record found for that identifier' }, { status: 404 });
    }
    return Response.json({ metadata, fullTextAvailable: !!pdfUrl, source });
  } catch {
    return Response.json({ error: "Couldn't reach the lookup service — try again" }, { status: 502 });
  }
}
