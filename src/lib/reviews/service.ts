import { eq } from 'drizzle-orm';
import { reorder, compact } from './entries';

interface Deps {
  db: any;
  schema: any;
}

// The workspace a review belongs to (for membership guards on review sub-resources).
export async function reviewWorkspaceId(reviewId: string, deps: Deps): Promise<string | null> {
  const [r] = await deps.db
    .select({ workspaceId: deps.schema.reviews.workspaceId })
    .from(deps.schema.reviews)
    .where(eq(deps.schema.reviews.id, reviewId));
  return r?.workspaceId ?? null;
}

async function nextPosition(reviewId: string, deps: Deps): Promise<number> {
  const rows = await deps.db
    .select({ position: deps.schema.reviewEntries.position })
    .from(deps.schema.reviewEntries)
    .where(eq(deps.schema.reviewEntries.reviewId, reviewId));
  return rows.length === 0 ? 0 : Math.max(...rows.map((r: { position: number }) => r.position)) + 1;
}

export async function getReviewEntries(reviewId: string, deps: Deps) {
  const rows = await deps.db
    .select()
    .from(deps.schema.reviewEntries)
    .where(eq(deps.schema.reviewEntries.reviewId, reviewId));
  return [...rows].sort((a, b) => a.position - b.position);
}

export async function addProseEntry(reviewId: string, prose: string, deps: Deps) {
  const position = await nextPosition(reviewId, deps);
  const [row] = await deps.db
    .insert(deps.schema.reviewEntries)
    .values({ reviewId, position, kind: 'prose', prose })
    .returning();
  return row;
}

export async function addAnnotationEntry(reviewId: string, annotationId: string, deps: Deps) {
  const position = await nextPosition(reviewId, deps);
  const [row] = await deps.db
    .insert(deps.schema.reviewEntries)
    .values({ reviewId, position, kind: 'annotation', annotationId })
    .returning();
  return row;
}

export async function moveEntry(reviewId: string, entryId: string, direction: 'up' | 'down', deps: Deps) {
  const entries = await getReviewEntries(reviewId, deps);
  const updated = reorder(entries.map((e) => ({ id: e.id, position: e.position })), entryId, direction);
  for (const u of updated) {
    await deps.db
      .update(deps.schema.reviewEntries)
      .set({ position: u.position })
      .where(eq(deps.schema.reviewEntries.id, u.id));
  }
}

export async function updateProseEntry(entryId: string, prose: string, deps: Deps) {
  await deps.db
    .update(deps.schema.reviewEntries)
    .set({ prose })
    .where(eq(deps.schema.reviewEntries.id, entryId));
}

export async function removeEntry(reviewId: string, entryId: string, deps: Deps) {
  await deps.db.delete(deps.schema.reviewEntries).where(eq(deps.schema.reviewEntries.id, entryId));
  const remaining = await getReviewEntries(reviewId, deps);
  const compacted = compact(remaining.map((e) => ({ id: e.id, position: e.position })));
  for (const c of compacted) {
    await deps.db
      .update(deps.schema.reviewEntries)
      .set({ position: c.position })
      .where(eq(deps.schema.reviewEntries.id, c.id));
  }
}

// Reviews that draw from a paper — derived from the reviews' annotation entries that cite
// a note on this paper. Deduped by review id; sorted by title for stable display.
export async function reviewsCitingPaper(
  paperId: string,
  deps: Deps,
): Promise<{ id: string; title: string | null; status: string }[]> {
  const { db, schema } = deps;
  const rows = await db
    .selectDistinct({ id: schema.reviews.id, title: schema.reviews.title, status: schema.reviews.status })
    .from(schema.reviewEntries)
    .innerJoin(schema.annotations, eq(schema.reviewEntries.annotationId, schema.annotations.id))
    .innerJoin(schema.reviews, eq(schema.reviewEntries.reviewId, schema.reviews.id))
    .where(eq(schema.annotations.paperId, paperId));
  return [...rows].sort((a: { title: string | null }, b: { title: string | null }) =>
    (a.title ?? '').localeCompare(b.title ?? ''),
  );
}
