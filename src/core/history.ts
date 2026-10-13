/**
 * Repetition bookkeeping. Positions are identified by board + side to move + castling rights
 * + en passant square (the FIDE definition), see `Position.repetitionKey()`.
 */

/** How often `key` occurs in `history`. */
export function countRepetitions(history: readonly string[], key: string): number {
  let count = 0;
  for (const entry of history) if (entry === key) count += 1;
  return count;
}

/** Occurrences of `key` in `history`, plus the position that is about to be created. */
export function nextRepetitionCount(history: readonly string[], key: string): number {
  return countRepetitions(history, key) + 1;
}

export function repetitionCounts(history: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of history) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/** The key that occurs most often (threefold detection for imports/replays). */
export function mostRepeated(history: readonly string[]): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of repetitionCounts(history)) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}
