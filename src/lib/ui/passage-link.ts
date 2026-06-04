import type { ParentType } from '@/lib/llm/types';

// Builds the deep-link URL for a retrieved passage / citation. Single source of truth
// for chat citations and search results. Returns undefined when there is no sensible
// in-app target (e.g. a note whose paper is unknown).
export function passageHref(
  workspaceId: string,
  // charStart may be missing on citations stored before passage-location was added — those
  // still link to the paper, just without the ?at= anchor.
  c: { parentType: ParentType; parentId: string; paperId: string | null; charStart: number | null },
): string | undefined {
  const base = `/workspaces/${workspaceId}`;
  if (c.parentType === 'paper')
    return c.charStart != null
      ? `${base}/papers/${c.parentId}?at=${c.charStart}`
      : `${base}/papers/${c.parentId}`;
  if (c.parentType === 'annotation') return c.paperId ? `${base}/papers/${c.paperId}?ann=${c.parentId}` : undefined;
  if (c.parentType === 'review') return `${base}/reviews/${c.parentId}/edit`;
  return undefined;
}
