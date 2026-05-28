import { eq } from 'drizzle-orm';
import { reorder, compact } from './entries';

interface Deps {
  db: any;
  schema: any;
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
