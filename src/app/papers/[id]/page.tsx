import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { AnnotationReader } from '@/components/AnnotationReader';

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return <main style={{ padding: 40 }}>Paper not found.</main>;
  const annotations = await db.select().from(schema.annotations).where(eq(schema.annotations.paperId, id));

  const themes = paper.collectionId
    ? await db.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes).where(eq(schema.themes.collectionId, paper.collectionId))
    : [];
  const annotationIds = annotations.map((a) => a.id);
  const tagRows = annotationIds.length
    ? await db.select().from(schema.annotationThemes).where(inArray(schema.annotationThemes.annotationId, annotationIds))
    : [];
  const tagsByAnnotation: Record<string, string[]> = {};
  for (const r of tagRows) (tagsByAnnotation[r.annotationId] ??= []).push(r.themeId);

  return (
    <main style={{ padding: 40 }}>
      <h1>{paper.title ?? 'Untitled paper'}</h1>
      <AnnotationReader paperId={paper.id} fullText={paper.fullText ?? ''} initial={annotations} themes={themes} tagsByAnnotation={tagsByAnnotation} />
    </main>
  );
}
