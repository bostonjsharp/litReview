import { z } from 'zod';
import { after } from 'next/server';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { parseIdentifier, resolveSource } from '@/lib/ingest/resolve';
import { createImportedPaper, processImportedPdf } from '@/lib/ingest/import-source';

export const maxDuration = 60; // allow download + extract + embed to run in after()

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = z
    .object({
      identifier: z.string().min(1),
      workspaceId: z.string().min(1),
      collectionId: z.string().nullish(),
    })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: 'identifier and workspaceId required' }, { status: 400 });
  const { identifier, workspaceId, collectionId } = parsed.data;

  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });

  const id = parseIdentifier(identifier);
  if (!id) return Response.json({ error: 'Unrecognized identifier' }, { status: 400 });

  let resolved;
  try {
    resolved = await resolveSource(id);
  } catch {
    return Response.json({ error: "Couldn't reach the lookup service — try again" }, { status: 502 });
  }
  if (!resolved.metadata.title) {
    return Response.json({ error: 'No record found for that identifier' }, { status: 404 });
  }

  const { id: paperId, status } = await createImportedPaper(
    {
      workspaceId,
      collectionId: collectionId ?? null,
      userId: user.id,
      metadata: resolved.metadata,
      pdfUrl: resolved.pdfUrl,
    },
    { db, schema },
  );

  if (status === 'pending' && resolved.pdfUrl) {
    after(processImportedPdf(paperId, resolved.pdfUrl, resolved.metadata, { db, schema, llm: getLLM() }));
  }

  return Response.json({ id: paperId, status }, { status: 202 });
}
