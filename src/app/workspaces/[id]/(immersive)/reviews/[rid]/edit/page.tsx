import { notFound } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getReviewEntries } from '@/lib/reviews/service';
import { collectionPaperIds } from '@/lib/papers/collections';
import { ReviewComposer } from '@/components/ReviewComposer';

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string; rid: string }>;
}) {
  const { id: workspaceId, rid } = await params;

  // Fetch the review — must belong to this workspace
  const [review] = await db
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.id, rid), eq(schema.reviews.workspaceId, workspaceId)));
  if (!review) notFound();

  // Fetch initial entries (sorted by position, per service.ts)
  let entries: Awaited<ReturnType<typeof getReviewEntries>> = [];
  try {
    entries = await getReviewEntries(rid, { db, schema });
  } catch {
    // Non-fatal: client will re-fetch on mount
    entries = [];
  }

  // Resolve collection name
  let collectionName: string | null = null;
  if (review.collectionId) {
    const [col] = await db
      .select({ name: schema.collections.name })
      .from(schema.collections)
      .where(eq(schema.collections.id, review.collectionId));
    collectionName = col?.name ?? null;
  }

  // Resolve author display name
  let authorName = 'Unknown';
  if (review.createdBy) {
    const [u] = await db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, review.createdBy));
    authorName = u?.name || u?.email || 'Unknown';
  }

  // Build annotation lookup map: annotationId → { quote, page, sourceLabel, themes }
  const annotationEntries = entries.filter(
    (e) => e.kind === 'annotation' && e.annotationId,
  );
  const usedAnnotationIds = annotationEntries
    .map((e) => e.annotationId as string)
    .filter(Boolean);

  const annLookup: Record<
    string,
    { quote: string; page: number | null; sourceLabel: string; themes: string[] }
  > = {};

  if (usedAnnotationIds.length > 0) {
    // Fetch the annotation rows
    const annRows = await db
      .select({
        id: schema.annotations.id,
        quote: schema.annotations.quote,
        page: schema.annotations.page,
        paperId: schema.annotations.paperId,
      })
      .from(schema.annotations)
      .where(inArray(schema.annotations.id, usedAnnotationIds));

    // Fetch the papers for those annotations to get sourceLabel (lastname · year)
    const paperIds = [...new Set(annRows.map((a) => a.paperId))];
    const paperRows =
      paperIds.length > 0
        ? await db
            .select({
              id: schema.papers.id,
              authors: schema.papers.authors,
              year: schema.papers.year,
            })
            .from(schema.papers)
            .where(inArray(schema.papers.id, paperIds))
        : [];
    const paperById: Record<string, { authors: string[] | null; year: number | null }> = {};
    for (const p of paperRows) paperById[p.id] = { authors: p.authors, year: p.year };

    // Fetch theme tags for used annotations
    const tagRows = await db
      .select()
      .from(schema.annotationThemes)
      .where(inArray(schema.annotationThemes.annotationId, usedAnnotationIds));

    // Resolve theme names
    const themeIds = [...new Set(tagRows.map((t) => t.themeId))];
    const themeNameRows =
      themeIds.length > 0
        ? await db
            .select({ id: schema.themes.id, name: schema.themes.name })
            .from(schema.themes)
            .where(inArray(schema.themes.id, themeIds))
        : [];
    const themeNameById: Record<string, string> = {};
    for (const t of themeNameRows) themeNameById[t.id] = t.name;

    const themesByAnnotation: Record<string, string[]> = {};
    for (const r of tagRows)
      (themesByAnnotation[r.annotationId] ??= []).push(themeNameById[r.themeId] ?? r.themeId);

    for (const ann of annRows) {
      const paper = paperById[ann.paperId];
      // sourceLabel = first author lastname · year
      const lastName = paper?.authors?.[0]?.split(/\s+/).pop() ?? 'Unknown';
      const year = paper?.year;
      annLookup[ann.id] = {
        quote: ann.quote,
        page: ann.page ?? null,
        sourceLabel: year != null ? `${lastName} · ${year}` : lastName,
        themes: themesByAnnotation[ann.id] ?? [],
      };
    }
  }

  // Candidate notes for the rail: annotations on papers in this collection,
  // excluding annotationIds already used by annotation entries in this review.
  const usedSet = new Set(usedAnnotationIds);
  const candidates: {
    id: string;
    quote: string;
    page: number | null;
    sourceLabel: string;
  }[] = [];

  if (review.collectionId) {
    // Get all papers in the collection (membership via paper_collections, so reused
    // papers' annotations are eligible candidates too — not just the home collection).
    const memberPaperIds = await collectionPaperIds(review.collectionId, { db, schema });
    const collPapers = memberPaperIds.length
      ? await db
          .select({ id: schema.papers.id, authors: schema.papers.authors, year: schema.papers.year })
          .from(schema.papers)
          .where(inArray(schema.papers.id, memberPaperIds))
      : [];

    const collPaperIds = collPapers.map((p) => p.id);
    const paperMeta: Record<string, { authors: string[] | null; year: number | null }> = {};
    for (const p of collPapers) paperMeta[p.id] = { authors: p.authors, year: p.year };

    if (collPaperIds.length > 0) {
      const allAnns = await db
        .select({
          id: schema.annotations.id,
          quote: schema.annotations.quote,
          page: schema.annotations.page,
          paperId: schema.annotations.paperId,
        })
        .from(schema.annotations)
        .where(inArray(schema.annotations.paperId, collPaperIds));

      for (const ann of allAnns) {
        if (usedSet.has(ann.id)) continue;
        const paper = paperMeta[ann.paperId];
        const lastName = paper?.authors?.[0]?.split(/\s+/).pop() ?? 'Unknown';
        const year = paper?.year;
        candidates.push({
          id: ann.id,
          quote: ann.quote,
          page: ann.page ?? null,
          sourceLabel: year != null ? `${lastName} · ${year}` : lastName,
        });
      }
    }
  }

  // Back-link: to the collection if known, else the workspace
  const backHref = review.collectionId
    ? `/workspaces/${workspaceId}/collections/${review.collectionId}`
    : `/workspaces/${workspaceId}`;

  return (
    <ReviewComposer
      reviewId={rid}
      initialEntries={entries.map((e) => ({
        id: e.id,
        position: e.position,
        kind: e.kind as 'prose' | 'annotation',
        prose: e.prose ?? null,
        annotationId: e.annotationId ?? null,
      }))}
      annLookup={annLookup}
      candidates={candidates}
      meta={{
        title: review.title ?? 'Untitled review',
        collectionId: review.collectionId ?? null,
        collectionName,
        authorName,
        backHref,
      }}
    />
  );
}
