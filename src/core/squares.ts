import type { Color, Role, Square } from './types';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export const WHITE: Color = 'white';
export const BLACK: Color = 'black';

export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

export function fileOf(square: Square): number {
  return square & 7;
}

export function rankOf(square: Square): number {
  return square >> 3;
}

export function squareFrom(file: number, rank: number): Square {
  return file + 8 * rank;
}

export function squareFromAlgebraic(name: string): Square | null {
  if (name.length < 2) return null;
  const file = FILES.indexOf(name[0]!.toLowerCase() as (typeof FILES)[number]);
  const rank = RANKS.indexOf(name[1] as (typeof RANKS)[number]);
  if (file < 0 || rank < 0) return null;
  return squareFrom(file, rank);
}

export function algebraic(square: Square): string {
  return `${FILES[fileOf(square)]}${RANKS[rankOf(square)]}`;
}

export function isLightSquare(square: Square): boolean {
  return (fileOf(square) + rankOf(square)) % 2 === 1;
}

/** Back-rank squares (rank 0 or 7) addressed by file. */
export function backRankSquare(color: Color, file: number): Square {
  return squareFrom(file, color === 'white' ? 0 : 7);
}

export function fileIndex(letter: string): number {
  return FILES.indexOf(letter.toLowerCase() as (typeof FILES)[number]);
}

export function roleFromLetter(letter: string): Role | null {
  const lower = letter.toLowerCase();
  if (lower === 'p' || lower === 'n' || lower === 'b' || lower === 'r' || lower === 'q' || lower === 'k') {
    return lower;
  }
  return null;
}

export function colorName(color: Color): string {
  return color === 'white' ? 'White' : 'Black';
}

/** Lower-case piece letter placed *on* a colour, used to name bishops. */
export function colorOfFile(file: number): 'light' | 'dark' {
  return file % 2 === 1 ? 'light' : 'dark';
}

/** Convert a Shredder-FEN castling letter ("A".."H" / "a".."h") to a file index. */
export function fileFromCastlingLetter(letter: string): number | null {
  const upper = letter.toUpperCase();
  const code = upper.charCodeAt(0) - 65;
  if (code < 0 || code > 7) return null;
  return code;
}
