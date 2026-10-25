/**
 * The saved listings after one heart is pressed, as a new set.
 *
 * Never the same set changed in place: the hearts read it through
 * `useSyncExternalStore`, which re-renders only when the snapshot is a
 * different object — so a save went through and the heart stayed empty
 * until the page was reloaded.
 */
export function withSaved(
  ids: ReadonlySet<string> | null,
  listingId: string,
  saved: boolean,
): Set<string> {
  const next = new Set(ids ?? []);
  if (saved) next.add(listingId);
  else next.delete(listingId);
  return next;
}
