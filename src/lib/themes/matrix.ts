export interface MatrixPaper {
  id: string;
  title: string | null;
  author: string | null;
  year: number | null;
}
export interface MatrixTheme {
  id: string;
  name: string;
}
export interface AnnotationCell {
  id: string;
  quote: string;
  comment: string;
  page: number | null;
}
export interface TaggedAnnotation {
  annotationId: string;
  paperId: string;
  themeId: string;
  quote: string;
  comment: string;
  page: number | null;
}
export interface Matrix {
  themes: MatrixTheme[];
  papers: MatrixPaper[];
  cells: Record<string, Record<string, AnnotationCell[]>>;
}

export function assembleMatrix(papers: MatrixPaper[], themes: MatrixTheme[], tagged: TaggedAnnotation[]): Matrix {
  const cells: Record<string, Record<string, AnnotationCell[]>> = {};
  for (const t of tagged) {
    (cells[t.paperId] ??= {});
    (cells[t.paperId][t.themeId] ??= []).push({ id: t.annotationId, quote: t.quote, comment: t.comment, page: t.page });
  }
  return { themes, papers, cells };
}
