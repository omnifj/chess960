/**
 * Core domain types for the Chess960 engine.
 *
 * Conventions used across the whole codebase:
 *  - A `Square` is a 0..63 integer index: `file + 8 * rank`, so a1 = 0, h1 = 7, a8 = 56, h8 = 63.
 *  - A `Piece` is `{ color, role }` (role is uppercase for white, lowercase for black, like FEN).
 *  - Algebraic names ("e4") and square indices are converted through `./squares`.
 */

export type Color = 'white' | 'black';

export type Role = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Square index 0..63 (`file + 8 * rank`). */
export type Square = number;

export interface Piece {
  color: Color;
  role: Role;
}

export type CastlingSide = 'king' | 'queen';

/** A move in internal representation. `to` is always the real destination of the piece. */
export interface Move {
  from: Square;
  to: Square;
  /** Promotion role, only ever 'n' | 'b' | 'r' | 'q'. */
  promotion?: Role;
  /** True for a castling move (X-FEN/UCI style: `to` is the king's final square). */
  castle?: CastlingSide;
  /** True for an en passant capture. */
  enPassant?: boolean;
  /** True for a double pawn push (recorded so that FEN/undo can restore the ep square). */
  doublePush?: boolean;
}

export interface CastlingRights {
  white: { king: boolean; queen: boolean };
  black: { king: boolean; queen: boolean };
}

export type GameOutcome =
  | 'playing'
  /** Side to move is in check but has legal moves. */
  | 'check'
  | 'checkmate'
  | 'stalemate'
  /** Draw by insufficient material, 50-move rule or threefold repetition. */
  | 'draw'
  /** A player resigned (the engine has no board equivalent). */
  | 'resigned'
  /** A player lost on time (used when the optional clock is enabled). */
  | 'timeout';

export type DrawReason =
  | 'stalemate'
  | 'fifty-move'
  | 'seventy-five-move'
  | 'threefold'
  | 'fivefold'
  | 'insufficient-material'
  | 'agreement';

export interface GameStatus {
  state: GameOutcome;
  /** Winner when the game is decided. */
  winner?: Color;
  reason?: DrawReason | 'checkmate' | 'resignation' | 'timeout';
  /** True when the side to move is in check (also true for checkmate). */
  check: boolean;
}

export interface Chess960Position {
  /** Scharnagl index 0..959. */
  index: number;
  /** Back-rank layout from file a to file h, e.g. "nrbbqknr" (lower case). */
  backRank: string;
  /** Full starting FEN with Shredder-FEN castling field. */
  startFen: string;
}

export interface PositionKeyFields {
  /** Piece placement field of the FEN. */
  board: string;
  /** 'w' | 'b'. */
  turn: string;
  /** Shredder-FEN castling field. */
  castling: string;
  /** En passant target square in algebraic notation, or '-'. */
  ep: string;
}
