import { and, eq, inArray } from 'drizzle-orm';
import { assembleMatrix, type Matrix, type TaggedAnnotation } from './matrix';
import { buildSuggestionPrompt, parseSuggestion, type ThemeSuggestion } from './suggest';
import type { LLMProvider } from '../llm/types';

interface Deps {
  db: any;
  schema: any;
}

interface SuggestDeps extends Deps {
  llm: LLMProvider;
}

export async function createTheme(collectionId: string, name: string, createdBy: string | null, deps: Deps) {
  const [row] = await deps.db.insert(deps.schema.themes).values({ collectionId, name, createdBy }).returning();
  return row;
}

export async function renameTheme(themeId: string, name: string, deps: Deps) {
  const [row] = await deps.db
    .update(deps.schema.themes)
    .set({ name })
    .where(eq(deps.schema.themes.id, themeId))
    .returning();
  if (!row) throw new Error('theme not found');
  return row;
}

export async function deleteTheme(themeId: string, deps: Deps) {
  await deps.db.delete(deps.schema.themes).where(eq(deps.schema.themes.id, themeId));
}

export async function listThemes(collectionId: string, deps: Deps) {
  return deps.db.select().from(deps.schema.themes).where(eq(deps.schema.themes.collectionId, collectionId));
}

export async function tagAnnotation(annotationId: string, themeId: string, deps: Deps) {
  const { db, schema } = deps;
  const [ann] = await db
    .select({ paperId: schema.annotations.paperId })
    .from(schema.annotations)
    .where(eq(schema.annotations.id, annotationId));
  if (!ann) throw new Error('annotation not found');
  const [paper] = await db
    .select({ collectionId: schema.papers.collectionId })
    .from(schema.papers)
    .where(eq(schema.papers.id, ann.paperId));
  const [theme] = await db
    .select({ collectionId: schema.themes.collectionId })
    .from(schema.themes)
    .where(eq(schema.themes.id, themeId));
  if (!theme) throw new Error('theme not found');
  if (!paper?.collectionId || paper.collectionId !== theme.collectionId) {
    throw new Error('theme and annotation are in different collections');
  }
  await db.insert(schema.annotationThemes).values({ annotationId, themeId }).onConflictDoNothing();
}

export async function untagAnnotation(annotationId: string, themeId: string, deps: Deps) {
  const { db, schema } = deps;
  await db
    .delete(schema.annotationThemes)
    .where(and(eq(schema.annotationThemes.annotationId, annotationId), eq(schema.annotationThemes.themeId, themeId)));
}

export async function getMatrix(collectionId: string, deps: Deps): Promise<Matrix> {
  const { db, schema } = deps;
  const papers = await db
    .select({ id: schema.papers.id, title: schema.papers.title })
    .from(schema.papers)
    .where(eq(schema.papers.collectionId, collectionId));
  const themes = await db
    .select({ id: schema.themes.id, name: schema.themes.name })
    .from(schema.themes)
    .where(eq(schema.themes.collectionId, collectionId));
  const themeIds = themes.map((t: { id: string }) => t.id);
  let tagged: TaggedAnnotation[] = [];
  if (themeIds.length > 0) {
    tagged = await db
      .select({
        annotationId: schema.annotations.id,
        paperId: schema.annotations.paperId,
        themeId: schema.annotationThemes.themeId,
        quote: schema.annotations.quote,
        comment: schema.annotations.comment,
        page: schema.annotations.page,
      })
      .from(schema.annotationThemes)
      .innerJoin(schema.annotations, eq(schema.annotationThemes.annotationId, schema.annotations.id))
      .where(inArray(schema.annotationThemes.themeId, themeIds));
  }
  return assembleMatrix(papers, themes, tagged);
}

export async function listCollectionAnnotations(collectionId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select({ annotationId: schema.annotations.id, quote: schema.annotations.quote, comment: schema.annotations.comment })
    .from(schema.annotations)
    .innerJoin(schema.papers, eq(schema.annotations.paperId, schema.papers.id))
    .where(eq(schema.papers.collectionId, collectionId));
}

export async function suggestThemes(collectionId: string, deps: SuggestDeps): Promise<ThemeSuggestion> {
  const annotations = await listCollectionAnnotations(collectionId, deps);
  const raw = await deps.llm.complete(buildSuggestionPrompt(annotations));
  return parseSuggestion(raw);
}
