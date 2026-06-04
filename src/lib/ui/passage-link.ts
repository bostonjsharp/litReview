import type { ParentType } from '@/lib/llm/types';

// Builds the deep-link URL for a retrieved passage / citation. Single source of truth
// for chat citations and search results. Returns undefined when there is no sensible
// in-app target (e.g. a note whose paper is unknown).
export function passageHref(
  workspaceId: string,
  c: { parentType: ParentType; parentId: string; paperId: string | null; charStart: number },
): string | undefined {
  const base = `/workspaces/${workspaceId}`;
  if (c.parentType === 'paper') return `${base}/papers/${c.parentId}?at=${c.charStart}`;
  if (c.parentType === 'annotation') return c.paperId ? `${base}/papers/${c.paperId}?ann=${c.parentId}` : undefined;
  if (c.parentType === 'review') return `${base}/reviews/${c.parentId}/edit`;
  return undefined;
}
