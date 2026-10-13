import { encodePiece } from '../board';
import { Position } from '../position';
import { opposite } from '../squares';
import type { Move, Role } from '../types';

/**
 * Piece values and piece-square tables for the built-in engine. This is intentionally simple
 * and dependency-free: it exists so the app always has a working opponent, and so the AI is
 * testable without WASM. When Stockfish is available it is used instead.
 */

export const PIECE_VALUE: Record<Role, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10, -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10,
  25, 25, 10, 5, 5, 10, 10, 20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30, 5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20,
  20, 15, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0, 0, -20, -40, -50,
  -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 0, 10, 10, 10,
  10, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -10,
  -10, -10, -10, -20,
];

const ROOK_TABLE = [
  0, 0, 5, 10, 10, 5, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
  0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
];

const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5, 5, 5, 5, 5, 0, -10, 0, 0, 5, 5, 5, 5, 0, -5,
  -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_MIDDLE_TABLE = [
  20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20, -10, -20, -30, -30, -40,
  -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
  -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
];

const KING_ENDGAME_TABLE = [
  -50, -30, -30, -30, -30, -30, -30, -50, -30, -30, 0, 0, 0, 0, -30, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10,
  30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -20, -10, 0, 0,
  -10, -20, -30, -50, -40, -30, -20, -20, -30, -40, -50,
];

const TABLES: Record<Role, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_MIDDLE_TABLE,
};

/**
 * Piece-square bonus for a piece, from *white's* point of view. The tables are written with
 * index 0 = a1, exactly like the square encoding, so white uses them as-is and black reads
 * them vertically mirrored (63 - square).
 */
export function squareBonus(role: Role, tableSquare: number, endgame: boolean): number {
  const table = role === 'k' && endgame ? KING_ENDGAME_TABLE : TABLES[role];
  return table[tableSquare] ?? 0;
}

/**
 * Static evaluation in centipawns from the point of view of `position.turn`.
 * Material + piece-square terms, plus a small bonus for having both bishops.
 */
export function evaluate(position: Position): number {
  const counts = position.materialCount();
  const nonPawns =
    (counts.white.n ?? 0) +
    (counts.white.b ?? 0) +
    (counts.white.r ?? 0) +
    (counts.white.q ?? 0) +
    (counts.black.n ?? 0) +
    (counts.black.b ?? 0) +
    (counts.black.r ?? 0) +
    (counts.black.q ?? 0);
  const endgame = nonPawns <= 6 || ((counts.white.q ?? 0) === 0 && (counts.black.q ?? 0) === 0);

  let score = 0;
  for (let square = 0; square < 64; square += 1) {
    const code = position.board.at(square);
    if (code === 0) continue;
    const color = position.board.colorAt(square);
    const role = position.board.roleAt(square);
    if (!color || !role) continue;
    const sign = color === 'white' ? 1 : -1;
    const tableSquare = color === 'white' ? square : 63 - square;
    score += sign * (PIECE_VALUE[role] + squareBonus(role, tableSquare, endgame));
  }

  if ((counts.white.b ?? 0) >= 2) score += 30;
  if ((counts.black.b ?? 0) >= 2) score -= 30;

  // Small tempo bonus and a nudge to keep the score away from exact zeros.
  score += position.turn === 'white' ? 8 : -8;
  return position.turn === 'white' ? score : -score;
}

/** True when the side to move may take the opponent's king (should never happen in legal play). */
export function kingCapturable(position: Position): boolean {
  const enemyKing = position.board.findKing(opposite(position.turn));
  /* c8 ignore next */
  if (enemyKing === null) return false;
  return position.isAttacked(enemyKing, position.turn);
}

/** MVV-LVA style ordering score, higher is searched first. */
export function moveOrderScore(position: Position, move: Move): number {
  let score = 0;
  const victim = position.pieceAt(move.to);
  if (victim) score += 10 * PIECE_VALUE[victim.role] - PIECE_VALUE[position.roleAt(move.from) ?? 'p'];
  if (move.enPassant) score += 10 * PIECE_VALUE.p - PIECE_VALUE.p;
  if (move.promotion) score += PIECE_VALUE[move.promotion];
  if (move.castle) score += 60; // develop the king, and it is rarely bad
  return score;
}

/** Encode the position for the transposition table (board + turn + castling). */
export function positionKey(position: Position): string {
  return `${position.repetitionKeyWithoutEp()}`;
}

/** A stable key for a move (used as a map key). */
export function moveKey(move: Move): string {
  return `${move.from}-${move.to}-${move.promotion ?? ''}-${move.castle ?? ''}`;
}

/** Apply a move to a cloned position (the search never mutates its inputs). */
export function applyMove(position: Position, move: Move): Position {
  const next = position.clone();
  next.play(move);
  return next;
}

export { encodePiece };
