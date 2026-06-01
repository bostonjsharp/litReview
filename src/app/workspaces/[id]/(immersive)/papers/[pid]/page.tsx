import { notFound } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { AnnotationReader } from '@/components/AnnotationReader';
import { colorForId } from '@/lib/ui/display';

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id: workspaceId, pid } = await params;

  // Fetch the paper — must belong to this workspace
  const [paper] = await db
    .select()
    .from(schema.papers)
    .where(and(eq(schema.papers.id, pid), eq(schema.papers.workspaceId, workspaceId)));
  if (!paper) notFound();

  // Fetch annotations for the paper
  const rawAnnotations = await db
    .select()
    .from(schema.annotations)
    .where(eq(schema.annotations.paperId, pid));

  // Fetch collection themes (requires collectionId on the paper)
  const themes =
    paper.collectionId
      ? await db
          .select({ id: schema.themes.id, name: schema.themes.name })
          .from(schema.themes)
          .where(eq(schema.themes.collectionId, paper.collectionId))
      : [];

  // Build tags-by-annotation map
  const annotationIds = rawAnnotations.map((a) => a.id);
  const tagRows =
    annotationIds.length > 0
      ? await db
          .select()
          .from(schema.annotationThemes)
          .where(inArray(schema.annotationThemes.annotationId, annotationIds))
      : [];
  const tagsByAnnotation: Record<string, string[]> = {};
  for (const r of tagRows) (tagsByAnnotation[r.annotationId] ??= []).push(r.themeId);

  // Resolve createdBy → display name + color for note footers
  const creatorIds = [...new Set(rawAnnotations.map((a) => a.createdBy).filter(Boolean) as string[])];
  const userRows =
    creatorIds.length > 0
      ? await db
          .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, creatorIds))
      : [];
  const userById: Record<string, { name: string; color: string }> = {};
  for (const u of userRows) {
    const displayName = u.name || u.email || 'Unknown';
    userById[u.id] = { name: displayName, color: colorForId(u.id) };
  }

  // Build enriched annotations (add authorName, authorColor, already has page from DB)
  const annotations = rawAnnotations.map((a) => ({
    id: a.id,
    charStart: a.charStart,
    charEnd: a.charEnd,
    quote: a.quote,
    comment: a.comment,
    page: a.page ?? 1,
    authorName: a.createdBy ? (userById[a.createdBy]?.name ?? 'Unknown') : 'Unknown',
    authorColor: a.createdBy ? (userById[a.createdBy]?.color ?? 'var(--accent)') : 'var(--accent)',
  }));

  // Compute page count from stored page offsets
  const pageCount = Array.isArray(paper.pageOffsets) ? paper.pageOffsets.length : null;

  // Back-link: go to collection page if paper has a collectionId, else the workspace
  const backHref = paper.collectionId
    ? `/workspaces/${workspaceId}/collections/${paper.collectionId}`
    : `/workspaces/${workspaceId}`;
  const backLabel = paper.collectionId
    ? 'Collection'
    : 'Workspace';

  return (
    <AnnotationReader
      paperId={paper.id}
      fullText={paper.fullText ?? ''}
      paper={{
        title: paper.title ?? 'Untitled',
        authors: paper.authors ?? [],
        year: paper.year ?? null,
        journal: paper.journal ?? null,
        doi: paper.doi ?? null,
      }}
      pageCount={pageCount}
      annotations={annotations}
      themes={themes}
      tagsByAnnotation={tagsByAnnotation}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
