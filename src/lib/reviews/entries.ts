export interface EntryPos {
  id: string;
  position: number;
}

// Returns a new array where `id` swaps positions with its neighbor. No-op at the
// boundary. Input order is preserved; only the `position` values change.
export function reorder(entries: EntryPos[], id: string, direction: 'up' | 'down'): EntryPos[] {
  const sorted = [...entries].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex((e) => e.id === id);
  if (idx === -1) return entries;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= sorted.length) return entries;
  const result = new Map(entries.map((e) => [e.id, e.position]));
  result.set(sorted[idx].id, sorted[swapWith].position);
  result.set(sorted[swapWith].id, sorted[idx].position);
  return entries.map((e) => ({ id: e.id, position: result.get(e.id)! }));
}

// Renumbers entries to contiguous 0..n-1 positions following their current order.
export function compact(entries: EntryPos[]): EntryPos[] {
  return [...entries]
    .sort((a, b) => a.position - b.position)
    .map((e, i) => ({ id: e.id, position: i }));
}
