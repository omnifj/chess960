import { encodePiece } from '../board';
import { Board } from '../board';
import { opposite, squareFrom } from '../squares';
import type { Chess960Position, Color, Role } from '../types';

/**
 * Chess960 (Fischer Random) start position generation.
 *
 * The 960 legal layouts are numbered 0..959 using Reinhard Scharnagl's scheme
 * (the numbering used by the original Chess960 literature and by most engines and
 * libraries). The construction is:
 *
 *   1. Put the light-squared bishop on one of b1, d1, f1, h1 — chosen by `n % 4`.
 *   2. Put the dark-squared bishop on one of a1, c1, e1, g1 — chosen by `floor(n / 4) % 4`.
 *   3. Put the queen on one of the 6 remaining squares — chosen by `floor(n / 16) % 6`.
 *   4. Put the knights on two of the 5 remaining squares — `floor(n / 96) % 10`
 *      indexes the 10 lexicographic pairs.
 *   5. The last three squares, left to right, get rook, king, rook.
 *
 * By construction the bishops are on opposite colours and the king sits between the
 * rooks, so every index 0..959 is a legal layout — and the map is a bijection
 * (`indexFromBackRank` is its inverse, verified against a brute-force reference
 * implementation in `generate.test.ts`).
 */

/** Light-square files of the back rank (b1, d1, f1, h1). */
const LIGHT_FILES = [1, 3, 5, 7] as const;
/** Dark-square files of the back rank (a1, c1, e1, g1). */
const DARK_FILES = [0, 2, 4, 6] as const;

/** The 10 ways to choose 2 of 5 free squares, in lexicographic order. */
const KNIGHT_PAIRS: ReadonlyArray<readonly [number, number]> = (() => {
  const pairs: Array<readonly [number, number]> = [];
  for (let a = 0; a < 5; a += 1) {
    for (let b = a + 1; b < 5; b += 1) pairs.push([a, b] as const);
  }
  return pairs;
})();

const BACK_RANK_ROLES = 'rrnnbbqk';

/**
 * Build the back-rank layout (files a..h, lower case) for a Scharnagl index.
 * Throws for indices outside 0..959.
 */
export function backRankFromIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 959) {
    throw new RangeError(`Chess960 index out of range: ${index}`);
  }
  const n = index;
  const layout: Array<Role | undefined> = new Array<Role | undefined>(8).fill(undefined);

  // 1. light-squared bishop
  layout[LIGHT_FILES[n % 4]!] = 'b';
  // 2. dark-squared bishop
  layout[DARK_FILES[Math.floor(n / 4) % 4]!] = 'b';
  // 3. queen
  const afterBishops = freeFiles(layout);
  layout[afterBishops[Math.floor(n / 16) % 6]!] = 'q';
  // 4. knights
  const afterQueen = freeFiles(layout);
  const knightPair = KNIGHT_PAIRS[Math.floor(n / 96) % 10]!;
  layout[afterQueen[knightPair[0]]!] = 'n';
  layout[afterQueen[knightPair[1]]!] = 'n';
  // 5. rook, king, rook left to right
  const rest = freeFiles(layout);
  layout[rest[0]!] = 'r';
  layout[rest[1]!] = 'k';
  layout[rest[2]!] = 'r';

  return layout.join('');
}

function freeFiles(layout: Array<Role | undefined>): number[] {
  const files: number[] = [];
  for (let file = 0; file < 8; file += 1) if (layout[file] === undefined) files.push(file);
  return files;
}

/** Inverse of {@link backRankFromIndex}: recover the Scharnagl index of a layout. */
export function indexFromBackRank(backRank: string): number {
  const normalized = normalizeBackRank(backRank);
  if (!normalized) throw new Error(`Invalid Chess960 back rank: "${backRank}"`);
  const files: number[] = [];
  for (let file = 0; file < 8; file += 1) files.push(file);

  const bishopFiles = files.filter((file) => normalized[file] === 'b');
  const lightBishop = bishopFiles.find((file) => file % 2 === 1)!;
  const darkBishop = bishopFiles.find((file) => file % 2 === 0)!;
  let index = LIGHT_FILES.indexOf(lightBishop as (typeof LIGHT_FILES)[number]);
  index += 4 * DARK_FILES.indexOf(darkBishop as (typeof DARK_FILES)[number]);

  const afterBishops = files.filter((file) => file !== lightBishop && file !== darkBishop);
  const queenFile = normalized.indexOf('q');
  index += 16 * afterBishops.indexOf(queenFile);

  const afterQueen = afterBishops.filter((file) => file !== queenFile);
  const knightFiles = afterQueen.filter((file) => normalized[file] === 'n');
  const pairIndex = KNIGHT_PAIRS.findIndex(
    ([a, b]) => afterQueen[a] === knightFiles[0] && afterQueen[b] === knightFiles[1],
  );
  index += 96 * pairIndex;
  return index;
}

/**
 * Validate a back-rank layout against the Chess960 constraints: exactly one king,
 * two rooks, two bishops (on opposite colours), two knights and one queen, with the
 * king strictly between the rooks. Returns the normalised (lower case) layout, or null.
 */
export function normalizeBackRank(backRank: string): string | null {
  if (typeof backRank !== 'string' || backRank.length !== 8) return null;
  const lower = backRank.toLowerCase();
  const counts: Record<string, number> = { r: 0, n: 0, b: 0, q: 0, k: 0 };
  for (const char of lower) {
    if (!(char in counts)) return null;
    counts[char] = (counts[char] ?? 0) + 1;
  }
  if (counts.r !== 2 || counts.n !== 2 || counts.b !== 2 || counts.q !== 1 || counts.k !== 1) return null;

  const bishopFiles: number[] = [];
  const rookFiles: number[] = [];
  let kingFile = -1;
  for (let file = 0; file < 8; file += 1) {
    const char = lower[file]!;
    if (char === 'b') bishopFiles.push(file);
    else if (char === 'r') rookFiles.push(file);
    else if (char === 'k') kingFile = file;
  }
  if (bishopFiles[0]! % 2 === bishopFiles[1]! % 2) return null; // bishops must be on opposite colours
  if (!(rookFiles[0]! < kingFile && kingFile < rookFiles[1]!)) return null; // king between the rooks
  return lower;
}

/** Is this layout a legal Chess960 back rank? */
export function isValidBackRank(backRank: string): boolean {
  return normalizeBackRank(backRank) !== null;
}

export interface BackRankFiles {
  /** File (0..7) of the king. */
  king: number;
  /** File of the rook used for castling to the g-file (the "h-side" rook). */
  kingRook: number;
  /** File of the rook used for castling to the c-file (the "a-side" rook). */
  queenRook: number;
}

export function backRankFiles(backRank: string): BackRankFiles {
  const normalized = normalizeBackRank(backRank);
  if (!normalized) throw new Error(`Invalid Chess960 back rank: "${backRank}"`);
  const rooks: number[] = [];
  for (let file = 0; file < 8; file += 1) if (normalized[file] === 'r') rooks.push(file);
  return { king: normalized.indexOf('k'), kingRook: rooks[1]!, queenRook: rooks[0]! };
}

/** Starting FEN (Shredder-FEN castling field) for a back-rank layout. */
export function backRankToStartFen(backRank: string): string {
  const normalized = normalizeBackRank(backRank);
  if (!normalized) throw new Error(`Invalid Chess960 back rank: "${backRank}"`);
  const { kingRook, queenRook } = backRankFiles(normalized);
  // Shredder-FEN lists the rook files in ascending order, upper case for white.
  const castling =
    [queenRook, kingRook].map((file) => String.fromCharCode(65 + file)).join('') +
    [queenRook, kingRook].map((file) => String.fromCharCode(97 + file)).join('');
  return `${normalized}/pppppppp/8/8/8/8/PPPPPPPP/${normalized.toUpperCase()} w ${castling} - 0 1`;
}

/** Random Scharnagl index in 0..959, using crypto when available. */
export function randomIndex(): number {
  const globalCrypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto;
  if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    globalCrypto.getRandomValues(buffer);
    return buffer[0]! % 960;
  }
  return Math.floor(Math.random() * 960);
}

export interface GenerateOptions {
  /** Scharnagl index; omit for a random legal layout. */
  index?: number;
  /** Injectable RNG returning [0, 1) — used for deterministic tests. */
  rng?: () => number;
}

/** Build a full {@link Chess960Position} (index + layout + start FEN). */
export function generatePosition(options: GenerateOptions = {}): Chess960Position {
  let index = options.index;
  if (index === undefined) {
    index = options.rng ? Math.floor(options.rng() * 960) : randomIndex();
  }
  index = ((index % 960) + 960) % 960;
  const backRank = backRankFromIndex(index);
  return { index, backRank, startFen: backRankToStartFen(backRank) };
}

/** All 960 layouts, in Scharnagl order. */
export function generateAll(): Chess960Position[] {
  const positions: Chess960Position[] = [];
  for (let index = 0; index < 960; index += 1) {
    const backRank = backRankFromIndex(index);
    positions.push({ index, backRank, startFen: backRankToStartFen(backRank) });
  }
  return positions;
}

/**
 * Brute-force reference generator used by the tests as an *independent* implementation:
 * walk every permutation of the multiset {r,r,n,n,b,b,q,k} in lexicographic order and keep
 * the legal ones. There are 8!/(2!2!2!) = 5040 permutations and exactly 960 of them are legal,
 * appearing in Scharnagl order.
 */
export function referenceBackRanks(): string[] {
  const counts: Record<string, number> = { r: 2, n: 2, b: 2, q: 1, k: 1 };
  const order = ['b', 'k', 'n', 'q', 'r'];
  const results: string[] = [];
  const current: string[] = [];
  const recurse = (): void => {
    if (current.length === 8) {
      const candidate = current.join('');
      if (isValidBackRank(candidate)) results.push(candidate);
      return;
    }
    for (const char of order) {
      if ((counts[char] ?? 0) <= 0) continue;
      counts[char] = (counts[char] ?? 0) - 1;
      current.push(char);
      recurse();
      current.pop();
      counts[char] = (counts[char] ?? 0) + 1;
    }
  };
  recurse();
  return results;
}

/** Extract the white back rank of a FEN when that rank is a legal Chess960 layout. */
export function backRankFromFen(fen: string): string | null {
  const rows = (fen.trim().split(/\s+/)[0] ?? '').split('/');
  if (rows.length !== 8) return null;
  return normalizeBackRank(rows[7] ?? '');
}

/** Build the board of a Chess960 start position. */
export function startBoard(backRank: string): Board {
  const normalized = normalizeBackRank(backRank);
  if (!normalized) throw new Error(`Invalid Chess960 back rank: "${backRank}"`);
  const board = Board.empty();
  for (let file = 0; file < 8; file += 1) {
    const role = normalized[file] as Role;
    board.set(squareFrom(file, 0), encodePiece('white', role));
    board.set(squareFrom(file, 7), encodePiece('black', role));
  }
  for (let file = 0; file < 8; file += 1) {
    board.set(squareFrom(file, 1), encodePiece('white', 'p'));
    board.set(squareFrom(file, 6), encodePiece('black', 'p'));
  }
  return board;
}

/** Castling context (king / rook home files, identical for both colours in Chess960). */
export function startCastlingContext(backRank: string): {
  kingFiles: { white: number; black: number };
  rookFiles: {
    white: { king: number | null; queen: number | null };
    black: { king: number | null; queen: number | null };
  };
} {
  const { king, kingRook, queenRook } = backRankFiles(backRank);
  const sides = () => ({ king: kingRook, queen: queenRook });
  return {
    kingFiles: { white: king, black: king },
    rookFiles: { white: sides(), black: sides() },
  };
}

/** Deterministic pseudo-random Chess960 layout for a numeric seed (used by tests/replays). */
export function backRankFromSeed(seed: number): string {
  let state = (seed >>> 0) || 0x9e3779b9;
  state ^= state << 13;
  state >>>= 0;
  state ^= state >> 17;
  state ^= state << 5;
  state >>>= 0;
  return backRankFromIndex(state % 960);
}

export { BACK_RANK_ROLES, opposite };
export type { Chess960Position, Color };
