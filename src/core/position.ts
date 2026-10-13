import { Board, castlingSideFromLetter, encodePiece, pieceLetter } from './board';
import {
  algebraic,
  colorName,
  fileFromCastlingLetter,
  fileOf,
  opposite,
  rankOf,
  squareFrom,
  squareFromAlgebraic,
} from './squares';
import type { CastlingSide, Color, Move, Role, Square } from './types';

/** Offsets in file/rank deltas, so wrap-around is explicit and safe. */
const KNIGHT_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const BISHOP_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ROOK_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const KING_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];

export interface CastlingFiles {
  /** Original king file (0..7) for this colour, or null when castling is impossible. */
  king: number | null;
  /** Original file of the rook that castles to the g-file. */
  kingRook: number | null;
  /** Original file of the rook that castles to the c-file. */
  queenRook: number | null;
}

export interface CastlingRights {
  white: { king: boolean; queen: boolean };
  black: { king: boolean; queen: boolean };
}

export interface FenParseOptions {
  /** Throw on castling rights that reference missing king/rook pieces; default false. */
  strictCastling?: boolean;
  /** Known king/rook home files, when the board alone is ambiguous. */
  castlingFiles?: Partial<Record<Color, CastlingFiles>>;
}

const STANDARD_CASTLING_FILES: CastlingFiles = { king: 4, kingRook: 7, queenRook: 0 };
const NO_CASTLING_FILES: CastlingFiles = { king: null, kingRook: null, queenRook: null };

export function standardCastlingFiles(): { white: CastlingFiles; black: CastlingFiles } {
  return { white: { ...STANDARD_CASTLING_FILES }, black: { ...STANDARD_CASTLING_FILES } };
}

export function noCastlingFiles(): { white: CastlingFiles; black: CastlingFiles } {
  return { white: { ...NO_CASTLING_FILES }, black: { ...NO_CASTLING_FILES } };
}

export function noRights(): CastlingRights {
  return { white: { king: false, queen: false }, black: { king: false, queen: false } };
}

/**
 * A complete, serialisable position snapshot. Unlike a FEN it preserves castling rights whose
 * rook has already been captured, which is exactly what the game history has to restore.
 */
export interface PositionStateData {
  board: string;
  turn: Color;
  castlingFiles: { white: CastlingFiles; black: CastlingFiles };
  rights: CastlingRights;
  epSquare: Square | null;
  epPawnSquare: Square | null;
  halfmoves: number;
  fullmoves: number;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: Role;
  castle?: CastlingSide;
}

interface PositionState {
  board: Board;
  turn: Color;
  castlingFiles: { white: CastlingFiles; black: CastlingFiles };
  rights: CastlingRights;
  epSquare: Square | null;
  /** Which pawn may be captured en passant (validated at generation time). */
  epPawnSquare: Square | null;
  halfmoves: number;
  fullmoves: number;
}

/**
 * A complete chess position with Chess960 rules. This is the single source of truth for
 * legality; the UI always goes through `legalMoves` / `resolveMove` / `play` and never
 * mutates the board itself.
 *
 * `play()` keeps one level of undo state, which is exactly what "does this move leave my
 * king in check?" needs. The full move history lives in `Game` (`./game.ts`).
 */
export class Position {
  board: Board;
  turn: Color;
  /** Home files of the king and rooks, per colour (fixed for the whole game). */
  castlingFiles: { white: CastlingFiles; black: CastlingFiles };
  /** Which castling rights remain. */
  rights: CastlingRights;
  /** En passant target square, FEN convention (the square behind the double-pushed pawn). */
  epSquare: Square | null;
  halfmoves: number;
  fullmoves: number;

  /** The move that produced this position (null at the start position). */
  lastMove: Move | null = null;

  private epPawnSquare: Square | null = null;
  private kingCache: { white: Square | null; black: Square | null } = { white: null, black: null };
  private previous: PositionState | null = null;

  constructor(
    board: Board,
    turn: Color = 'white',
    castlingFiles: { white: CastlingFiles; black: CastlingFiles } = noCastlingFiles(),
    rights: CastlingRights = noRights(),
    epSquare: Square | null = null,
    halfmoves = 0,
    fullmoves = 1,
  ) {
    this.board = board;
    this.turn = turn;
    this.castlingFiles = castlingFiles;
    this.rights = rights;
    this.epSquare = epSquare;
    this.halfmoves = halfmoves;
    this.fullmoves = fullmoves;
  }

  /** Standard chess start position. */
  static standard(): Position {
    return Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }

  /** Chess960 start position for a back rank such as "nrbbqknr". */
  static fromBackRank(backRank: string): Position {
    const normalized = backRank.toLowerCase();
    return Position.fromFen(`${normalized}/pppppppp/8/8/8/8/PPPPPPPP/${normalized.toUpperCase()} w KQkq - 0 1`);
  }

  clone(): Position {
    const copy = new Position(
      this.board.clone(),
      this.turn,
      { white: { ...this.castlingFiles.white }, black: { ...this.castlingFiles.black } },
      { white: { ...this.rights.white }, black: { ...this.rights.black } },
      this.epSquare,
      this.halfmoves,
      this.fullmoves,
    );
    copy.epPawnSquare = this.epPawnSquare;
    copy.lastMove = this.lastMove ? { ...this.lastMove } : null;
    return copy;
  }

  static fromFen(fen: string, options: FenParseOptions = {}): Position {
    const fields = fen.trim().split(/\s+/);
    const [placement, turnField, castlingField = '-', epField = '-', halfmoveField = '0', fullmoveField = '1'] =
      fields;
    if (!placement) throw new Error('Invalid FEN: missing piece placement');
    const board = Board.fromFenPlacement(placement);
    const turn: Color = turnField === 'b' ? 'black' : 'white';

    const castlingFiles = {
      white: { ...(options.castlingFiles?.white ?? NO_CASTLING_FILES) },
      black: { ...(options.castlingFiles?.black ?? NO_CASTLING_FILES) },
    };
    for (const color of ['white', 'black'] as const) {
      if (options.castlingFiles?.[color]) continue;
      const homeRank = color === 'white' ? 0 : 7;
      const kingSquare = board.findKing(color);
      const kingFile = kingSquare === null ? null : fileOf(kingSquare);
      castlingFiles[color].king = kingFile;
      // Derive the rook homes from the board: this is what makes a *start* position work with
      // an empty or partial castling field. (The king's file is recorded even when the king has
      // already left its home rank, because the Shredder letters are resolved against it.)
      if (kingFile === null) continue;
      const rookFiles: number[] = [];
      for (let file = 0; file < 8; file += 1) {
        if (board.is(color, 'r', squareFrom(file, homeRank))) rookFiles.push(file);
      }
      const queenside = rookFiles.filter((file) => file < kingFile);
      const kingside = rookFiles.filter((file) => file > kingFile);
      castlingFiles[color].queenRook = queenside.length > 0 ? queenside[0]! : null;
      castlingFiles[color].kingRook = kingside.length > 0 ? kingside[kingside.length - 1]! : null;
    }

    const rights = noRights();
    if (castlingField !== '-') {
      for (const raw of castlingField) {
        const color: Color = raw === raw.toUpperCase() ? 'white' : 'black';
        const files = castlingFiles[color];
        const homeRank = color === 'white' ? 0 : 7;
        const kingFile = files.king;
        if (kingFile === null) continue;
        // Letters are read against the *original* grid: K/Q against the king's file, A..H
        // (Shredder-FEN) directly against the board files; both are unambiguous for Chess960.
        let side: CastlingSide | null;
        let rookFile: number | null;
        if (raw.toUpperCase() === 'K') {
          rookFile = kingFile + 3; // O-O: the h-side rook of the standard layout
          side = 'king';
        } else if (raw.toUpperCase() === 'Q') {
          rookFile = kingFile - 4; // O-O-O: the a-side rook of the standard layout
          side = 'queen';
        } else {
          rookFile = fileFromCastlingLetter(raw);
          side = rookFile === null ? null : castlingSideFromLetter(raw, files, color);
        }
        if (side === null || rookFile === null || rookFile < 0 || rookFile > 7) continue;
        const hasKing = board.is(color, 'k', squareFrom(kingFile, homeRank));
        const hasRook = board.is(color, 'r', squareFrom(rookFile, homeRank));
        if (options.strictCastling && (!hasKing || !hasRook)) {
          throw new Error(`Invalid FEN: castling right "${raw}" without matching king/rook`);
        }
        if (!hasKing || !hasRook) continue; // stale right: drop it, like most engines
        rights[color][side] = true;
        // A Shredder letter names the exact rook file (authoritative); a K/Q letter only names
        // the side, so it must never displace a rook file that is already known.
        if (raw.toUpperCase() !== 'K' && raw.toUpperCase() !== 'Q') {
          if (side === 'king') files.kingRook = rookFile;
          else files.queenRook = rookFile;
        }
      }
    }

    const position = new Position(
      board,
      turn,
      castlingFiles,
      rights,
      null,
      Number.parseInt(halfmoveField, 10) || 0,
      Number.parseInt(fullmoveField, 10) || 1,
    );
    if (epField !== '-') {
      const epSquare = squareFromAlgebraic(epField);
      if (epSquare !== null) {
        const pawnSquare = epSquare + (turn === 'white' ? -8 : 8);
        if (board.is(opposite(turn), 'p', pawnSquare) && board.isEmpty(epSquare)) {
          position.epSquare = epSquare;
          position.epPawnSquare = pawnSquare;
        }
      }
    }
    return position;
  }

  get fen(): string {
    return this.toFen();
  }

  /** Full FEN with a Shredder-FEN castling field (unambiguous for Chess960). */
  toFen(): string {
    return this.fenWith(this.castlingField(false));
  }

  /** FEN using the traditional KQkq castling field when the rights allow it. */
  toFenWithStandardCastling(): string {
    return this.fenWith(this.castlingField(true));
  }

  private fenWith(castling: string): string {
    const ep = this.epSquare === null ? '-' : algebraic(this.epSquare);
    return `${this.board.toFenPlacement()} ${this.turn === 'white' ? 'w' : 'b'} ${castling || '-'} ${ep} ${this.halfmoves} ${this.fullmoves}`;
  }

  private castlingField(preferTraditional: boolean): string {
    if (preferTraditional && this.canUseTraditionalCastling()) {
      return [
        this.rights.white.king ? 'K' : '',
        this.rights.white.queen ? 'Q' : '',
        this.rights.black.king ? 'k' : '',
        this.rights.black.queen ? 'q' : '',
      ].join('');
    }
    let out = '';
    for (const color of ['white', 'black'] as const) {
      const side = this.castlingFiles[color];
      const value = this.rights[color];
      // Shredder-FEN: rook files named a..h, ascending, upper case for white / lower for black.
      const letters: Array<[number, string]> = [];
      if (value.king && side.kingRook !== null) letters.push([side.kingRook, rookFileLetter(side.kingRook, color)]);
      if (value.queen && side.queenRook !== null) {
        letters.push([side.queenRook, rookFileLetter(side.queenRook, color)]);
      }
      letters.sort((a, b) => a[0] - b[0]);
      out += letters.map(([, letter]) => letter).join('');
    }
    return out;
  }

  /** True when both colours still have their standard a1/h1-style rook files. */
  canUseTraditionalCastling(): boolean {
    for (const color of ['white', 'black'] as const) {
      const side = this.castlingFiles[color];
      if (side.king !== 4 || side.kingRook !== 7 || side.queenRook !== 0) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ queries

  pieceAt(square: Square): { color: Color; role: Role } | null {
    const color = this.board.colorAt(square);
    const role = this.board.roleAt(square);
    if (!color || !role) return null;
    return { color, role };
  }

  roleAt(square: Square): Role | null {
    return this.board.roleAt(square);
  }

  colorAt(square: Square): Color | null {
    return this.board.colorAt(square);
  }

  kingSquare(color: Color): Square | null {
    const cached = this.kingCache[color];
    if (cached !== null) return cached;
    const found = this.board.findKing(color);
    this.kingCache[color] = found;
    return found;
  }

  isCheck(color: Color = this.turn): boolean {
    const king = this.kingSquare(color);
    if (king === null) return false;
    return this.isAttacked(king, opposite(color));
  }

  rookHomeSquare(color: Color, side: CastlingSide): Square | null {
    const files = this.castlingFiles[color];
    const file = side === 'king' ? files.kingRook : files.queenRook;
    if (file === null) return null;
    return squareFrom(file, color === 'white' ? 0 : 7);
  }

  /** Where the king ends up after castling (g1/g8 or c1/c8). */
  castlingKingTarget(color: Color, side: CastlingSide): Square {
    return squareFrom(side === 'king' ? 6 : 2, color === 'white' ? 0 : 7);
  }

  /** Where the rook ends up after castling (f1/f8 or d1/d8). */
  castlingRookTarget(color: Color, side: CastlingSide): Square {
    return squareFrom(side === 'king' ? 5 : 3, color === 'white' ? 0 : 7);
  }

  hasCastlingRight(color: Color, side: CastlingSide): boolean {
    return this.rights[color][side];
  }

  // ------------------------------------------------------ attack checks

  /**
   * Attacks by knights, king and sliding pieces. Pawns are handled separately because
   * their attack directions are asymmetric.
   * @param stopAtKing stop sliding rays *on* an enemy king, so that "kings may not touch"
   *   can be checked for a hypothetical king position.
   */
  private kingAttackedByOffsets(kingSquare: Square, byColor: Color, stopAtKing = false): boolean {
    for (const [df, dr] of KNIGHT_DELTAS) {
      const target = offsetSquare(kingSquare, df, dr);
      if (target !== null && this.board.is(byColor, 'n', target)) return true;
    }
    for (const [df, dr] of KING_DIRECTIONS) {
      const target = offsetSquare(kingSquare, df, dr);
      if (target !== null && this.board.is(byColor, 'k', target)) return true;
    }
    for (const [df, dr] of BISHOP_DIRECTIONS) {
      if (this.rayTarget(kingSquare, df, dr, byColor, ['b', 'q'], stopAtKing)) return true;
    }
    for (const [df, dr] of ROOK_DIRECTIONS) {
      if (this.rayTarget(kingSquare, df, dr, byColor, ['r', 'q'], stopAtKing)) return true;
    }
    return false;
  }

  /**
   * First piece along a ray.
   * @param stopAtKing when true, an enemy king on the ray is *not* reported as an attacker
   *   (used to test castling squares, where only non-king attacks matter) — but it still
   *   blocks the ray, exactly like any other piece.
   */
  private rayTarget(
    from: Square,
    df: number,
    dr: number,
    byColor: Color,
    roles: readonly Role[],
    stopAtKing: boolean,
  ): boolean {
    let current = offsetSquare(from, df, dr);
    while (current !== null) {
      const code = this.board.at(current);
      if (code !== 0) {
        const color = this.board.colorAt(current);
        const role = this.board.roleAt(current);
        if (color === byColor && role && roles.includes(role)) return true;
        if (stopAtKing && role === 'k') return false;
        return false;
      }
      current = offsetSquare(current, df, dr);
    }
    return false;
  }

  private attackedByPawns(square: Square, byColor: Color): boolean {
    // A white pawn on (f, r) attacks (f±1, r+1), so `square` is attacked by a white pawn
    // sitting one rank below it.
    const attackerRank = rankOf(square) + (byColor === 'white' ? -1 : 1);
    if (attackerRank < 0 || attackerRank > 7) return false;
    for (const df of [-1, 1]) {
      const file = fileOf(square) + df;
      if (file < 0 || file > 7) continue;
      if (this.board.is(byColor, 'p', squareFrom(file, attackerRank))) return true;
    }
    return false;
  }

  /** Is `square` attacked by `byColor`? (Pawn attacks are exact, not approximate.) */
  isAttacked(square: Square, byColor: Color): boolean {
    return this.attackedByPawns(square, byColor) || this.kingAttackedByOffsets(square, byColor);
  }

  /** Attacked by anything except the enemy king — the rule for castling "through check". */
  private isAttackedIgnoringKing(square: Square, byColor: Color): boolean {
    return this.attackedByPawns(square, byColor) || this.kingAttackedByOffsets(square, byColor, true);
  }

  private kingsAdjacent(a: Square | null, b: Square | null): boolean {
    if (a === null || b === null) return false;
    return Math.abs(fileOf(a) - fileOf(b)) <= 1 && Math.abs(rankOf(a) - rankOf(b)) <= 1;
  }

  // --------------------------------------------------- move generation

  /**
   * Candidate moves. Castling moves are fully validated here. `only` restricts generation
   * to one origin square (big speed-up for the UI and the search), `capturesOnly` is used by
   * the quiescence search.
   */
  generateMoves(options: { only?: Square; capturesOnly?: boolean; includeCastling?: boolean } = {}): Move[] {
    const moves: Move[] = [];
    const us = this.turn;
    const them = opposite(us);
    const direction = us === 'white' ? 1 : -1;
    const startRank = us === 'white' ? 1 : 6;
    const promotionRank = us === 'white' ? 7 : 0;
    const capturesOnly = options.capturesOnly ?? false;
    const includeCastling = options.includeCastling ?? true;

    for (let square = 0; square < 64; square += 1) {
      if (options.only !== undefined && square !== options.only) continue;
      const piece = this.pieceAt(square);
      if (!piece || piece.color !== us) continue;

      switch (piece.role) {
        case 'p': {
          const nextRank = rankOf(square) + direction;
          if (nextRank < 0 || nextRank > 7) break;
          const forward = squareFrom(fileOf(square), nextRank);
          if (!capturesOnly && this.board.isEmpty(forward)) {
            if (nextRank === promotionRank) {
              pushPromotions(moves, square, forward);
            } else {
              moves.push({ from: square, to: forward });
              const doubleRank = rankOf(square) + 2 * direction;
              if (rankOf(square) === startRank && this.board.isEmpty(squareFrom(fileOf(square), doubleRank))) {
                moves.push({ from: square, to: squareFrom(fileOf(square), doubleRank), doublePush: true });
              }
            }
          }
          for (const df of [-1, 1]) {
            const file = fileOf(square) + df;
            if (file < 0 || file > 7) continue;
            const target = squareFrom(file, nextRank);
            const targetPiece = this.pieceAt(target);
            if (targetPiece && targetPiece.color === them) {
              if (nextRank === promotionRank) pushPromotions(moves, square, target);
              else moves.push({ from: square, to: target });
            } else if (targetPiece === null && this.epSquare === target && this.epPawnSquare !== null) {
              moves.push({ from: square, to: target, enPassant: true });
            }
          }
          break;
        }
        case 'n': {
          for (const [df, dr] of KNIGHT_DELTAS) {
            const target = offsetSquare(square, df, dr);
            if (target === null) continue;
            const targetPiece = this.pieceAt(target);
            if (targetPiece && targetPiece.color === us) continue;
            if (capturesOnly && !targetPiece) continue;
            moves.push({ from: square, to: target });
          }
          break;
        }
        case 'b':
        case 'r':
        case 'q': {
          const directions =
            piece.role === 'b' ? BISHOP_DIRECTIONS : piece.role === 'r' ? ROOK_DIRECTIONS : KING_DIRECTIONS;
          for (const [df, dr] of directions) {
            let target = offsetSquare(square, df, dr);
            while (target !== null) {
              const targetPiece = this.pieceAt(target);
              if (targetPiece === null) {
                if (!capturesOnly) moves.push({ from: square, to: target });
              } else {
                if (targetPiece.color === them) moves.push({ from: square, to: target });
                break;
              }
              target = offsetSquare(target, df, dr);
            }
          }
          break;
        }
        case 'k': {
          for (const [df, dr] of KING_DIRECTIONS) {
            const target = offsetSquare(square, df, dr);
            if (target === null) continue;
            const targetPiece = this.pieceAt(target);
            if (targetPiece && targetPiece.color === us) continue;
            if (capturesOnly && !targetPiece) continue;
            moves.push({ from: square, to: target });
          }
          if (includeCastling && !capturesOnly) {
            for (const side of ['king', 'queen'] as const) {
              const move = this.castlingMove(side);
              if (move) moves.push(move);
            }
          }
          break;
        }
      }
    }
    return moves;
  }

  /**
   * The castling move for `side`, or null when castling is illegal. Chess960 rules:
   *
   *  1. the castling right must still exist (king and that rook never moved);
   *  2. the king and that exact rook must stand on their home squares;
   *  3. all squares between king and rook must be empty;
   *  4. the king may not be in check;
   *  5. the king's path (origin to destination, inclusive) may not be attacked, and may
   *     only pass over the castling rook;
   *  6. the destinations may only hold the castling king/rook themselves;
   *  7. destinations are always g1/f1 (O-O) and c1/d1 (O-O-O); a king already standing on
   *     its destination square simply does not move (the rook still does).
   *
   * The rook is allowed to pass through or land on an attacked square — only the king's
   * path matters (FIDE Laws, Chess960 castling).
   */
  castlingMove(side: CastlingSide): Move | null {
    const us = this.turn;
    if (!this.rights[us][side]) return guard('no right');
    const kingFrom = this.kingSquare(us);
    const rookFrom = this.rookHomeSquare(us, side);
    if (kingFrom === null || rookFrom === null) return guard('no square');
    if (!this.board.is(us, 'k', kingFrom)) return guard('no king');
    if (!this.board.is(us, 'r', rookFrom)) return guard('no rook');
    const homeRank = us === 'white' ? 0 : 7;
    if (rankOf(kingFrom) !== homeRank || rankOf(rookFrom) !== homeRank) return guard('wrong rank');
    if (this.isCheck(us)) return guard('in check');

    // 3. every square strictly between king and rook must be empty
    for (const square of squaresBetween(kingFrom, rookFrom)) {
      if (!this.board.isEmpty(square)) return guard(`blocked between at ${algebraic(square)}`);
    }

    const kingTo = this.castlingKingTarget(us, side);
    const rookTo = this.castlingRookTarget(us, side);
    const opponentKing = this.kingSquare(opposite(us));

    // 5. the king may not cross or land on an attacked square
    for (const square of squaresBetween(kingFrom, kingTo, true)) {
      if (square === kingFrom) continue; // already proven not to be in check
      if (this.isAttackedIgnoringKing(square, opposite(us))) return guard(`attacked ${algebraic(square)}`);
      if (this.kingsAdjacent(square, opponentKing)) return guard(`adjacent king ${algebraic(square)}`);
    }

    // 6. the king may only cross empty squares (the castling rook may be crossed, it travels
    //    the other way), and its destination may hold nothing but the castling pieces — which
    //    covers both "the king already stands on g1/c1" and "the rook already stands there".
    for (const square of squaresBetween(kingFrom, kingTo)) {
      const occupant = this.pieceAt(square);
      const isCastlingRook = square === rookFrom && occupant?.role === 'r' && occupant.color === us;
      if (occupant && !isCastlingRook) return guard(`occupied crossing ${algebraic(square)}`);
    }
    const kingDestination = this.pieceAt(kingTo);
    if (kingDestination) {
      const isCastlingKing = kingTo === kingFrom && kingDestination.role === 'k' && kingDestination.color === us;
      const isCastlingRook = kingTo === rookFrom && kingDestination.role === 'r' && kingDestination.color === us;
      if (!isCastlingKing && !isCastlingRook) return guard(`king target occupied ${algebraic(kingTo)}`);
    }
    // ...the rook's destination must be empty, or hold the castling king when the king's path
    // crosses the rook's landing square (king b1 -> g1, rook h1 -> f1).
    if (rookTo !== rookFrom) {
      const rookDestination = this.pieceAt(rookTo);
      if (rookDestination) {
        const isCastlingKing = rookTo === kingFrom && rookDestination.role === 'k' && rookDestination.color === us;
        if (!isCastlingKing) return guard(`rook target occupied ${algebraic(rookTo)}`);
      }
    }
    if (kingTo === kingFrom && rookTo === rookFrom) return guard('nothing moves');

    return { from: kingFrom, to: kingTo, castle: side };
  }

  /** Fully legal moves (pseudo-legal moves filtered by "king not left in check"). */
  legalMoves(options: { only?: Square; capturesOnly?: boolean } = {}): Move[] {
    const us = this.turn;
    // `play`/`undo` are used as a lookahead here. Save the caller's undo slot and last-move
    // record first: otherwise probing legality would silently consume the one-level undo that
    // `Game.undo()` (and the search) relies on.
    const savedPrevious = this.previous;
    const savedLastMove = this.lastMove;
    const legal: Move[] = [];
    try {
      for (const move of this.generateMoves({ ...options, includeCastling: true })) {
        this.play(move);
        if (!this.isCheck(us)) legal.push(move);
        this.undo();
      }
    } finally {
      this.previous = savedPrevious;
      this.lastMove = savedLastMove;
    }
    return legal;
  }

  /** Is this exact move legal here? */
  isLegalMove(move: MoveInput): boolean {
    return this.resolveMove(move) !== null;
  }

  /**
   * Normalise an external move description (UI click, PGN or UCI engine) into a legal
   * internal move, or null. Castling is accepted as king->rook home square (the UCI /
   * Stockfish Chess960 encoding), king->destination (g1/c1), or an explicit `castle` side.
   */
  resolveMove(input: MoveInput): Move | null {
    const legal = this.legalMoves({ only: input.from });
    const piece = this.pieceAt(input.from);
    if (!piece) return null;

    if (piece.role === 'k') {
      for (const move of legal) {
        if (!move.castle) continue;
        const rookSquare = this.rookHomeSquare(piece.color, move.castle);
        const matchesExplicit = input.castle !== undefined && input.castle === move.castle;
        const matchesRook = rookSquare !== null && input.to === rookSquare;
        const matchesTarget = input.to === move.to;
        if (matchesExplicit || matchesRook || matchesTarget) return move;
      }
      if (input.castle !== undefined) return null;
    }
    return (
      legal.find(
        (move) =>
          !move.castle &&
          move.from === input.from &&
          move.to === input.to &&
          (input.promotion === undefined || move.promotion === input.promotion),
      ) ?? null
    );
  }

  // -------------------------------------------------------- making moves

  /**
   * Apply a legal move and remember the previous state for {@link undo}.
   *
   * Note that `play` keeps exactly one level of undo, which is all the search and the
   * "does this leave my king in check?" probe need. The full history lives in `Game`.
   */
  play(move: Move): Move {
    const us = this.turn;
    this.previous = this.captureState();
    this.applyMove(move);
    const recorded: Move = move.castle ? { ...move, to: this.castlingKingTarget(us, move.castle) } : { ...move };
    this.lastMove = recorded;
    return recorded;
  }

  /** Undo the last `play()`; returns the move that was undone, or null. */
  undo(): Move | null {
    const state = this.previous;
    if (!state) return null;
    const move = this.lastMove;
    this.restoreState(state);
    this.previous = null;
    this.lastMove = null;
    return move;
  }

  private captureState(): PositionState {
    return {
      board: this.board.clone(),
      turn: this.turn,
      castlingFiles: { white: { ...this.castlingFiles.white }, black: { ...this.castlingFiles.black } },
      rights: { white: { ...this.rights.white }, black: { ...this.rights.black } },
      epSquare: this.epSquare,
      epPawnSquare: this.epPawnSquare,
      halfmoves: this.halfmoves,
      fullmoves: this.fullmoves,
    };
  }

  /**
   * Exact, self-contained snapshot of this position. Unlike a FEN round-trip it keeps castling
   * rights that are no longer representable (a rook captured on its home square, for instance),
   * which is what the game history needs.
   */
  toState(): PositionStateData {
    const state = this.captureState();
    return {
      board: this.board.toFenPlacement(),
      turn: state.turn,
      castlingFiles: state.castlingFiles,
      rights: state.rights,
      epSquare: state.epSquare,
      epPawnSquare: state.epPawnSquare,
      halfmoves: state.halfmoves,
      fullmoves: state.fullmoves,
    };
  }

  static fromState(state: PositionStateData): Position {
    const position = new Position(
      Board.fromFenPlacement(state.board),
      state.turn,
      state.castlingFiles,
      state.rights,
      state.epSquare,
      state.halfmoves,
      state.fullmoves,
    );
    position.epPawnSquare = state.epPawnSquare;
    return position;
  }

  private restoreState(state: PositionState): void {
    this.board = state.board;
    this.turn = state.turn;
    this.castlingFiles = state.castlingFiles;
    this.rights = state.rights;
    this.epSquare = state.epSquare;
    this.epPawnSquare = state.epPawnSquare;
    this.halfmoves = state.halfmoves;
    this.fullmoves = state.fullmoves;
    this.kingCache = { white: null, black: null };
  }

  private applyMove(move: Move): void {
    const us = this.turn;
    const them = opposite(us);
    const piece = this.pieceAt(move.from);
    if (!piece) throw new Error(`No piece on ${algebraic(move.from)}`);
    if (piece.color !== us) {
      throw new Error(`It is ${colorName(us)}'s turn but ${algebraic(move.from)} holds a ${colorName(piece.color)} piece`);
    }

    this.epSquare = null;
    this.epPawnSquare = null;
    this.halfmoves += 1;

    if (move.castle) {
      const rookFrom = this.rookHomeSquare(us, move.castle);
      if (rookFrom === null) throw new Error('Illegal castling move: no rook configured');
      const kingTo = this.castlingKingTarget(us, move.castle);
      const rookTo = this.castlingRookTarget(us, move.castle);
      if (kingTo !== move.from) this.board.clear(move.from);
      this.board.clear(rookFrom);
      this.board.clear(kingTo);
      this.board.clear(rookTo);
      this.board.set(kingTo, encodePiece(us, 'k'));
      this.board.set(rookTo, encodePiece(us, 'r'));
      this.rights[us].king = false;
      this.rights[us].queen = false;
      this.kingCache[us] = kingTo;
      this.finishTurn(us);
      return;
    }

    const isCapture = !this.board.isEmpty(move.to);
    if (isCapture || piece.role === 'p') this.halfmoves = 0;

    this.board.clear(move.from);
    if (move.enPassant) {
      this.board.clear(move.to + (us === 'white' ? -8 : 8));
      this.halfmoves = 0;
    }
    this.board.set(move.to, encodePiece(us, move.promotion ?? piece.role));
    if (piece.role === 'k') this.kingCache[us] = move.to;

    if (piece.role === 'p' && move.doublePush) {
      this.epSquare = (move.from + move.to) / 2;
      this.epPawnSquare = move.to;
    }

    this.updateRights(move, piece.role, us, them);
    this.finishTurn(us);
  }

  private finishTurn(us: Color): void {
    if (us === 'black') this.fullmoves += 1;
    this.turn = opposite(us);
  }

  /**
   * Castling rights are lost when the king moves or when a rook leaves / is captured.
   * The comparison uses real squares (not files) because both colours share file indices.
   */
  private updateRights(move: Move, movedRole: Role, us: Color, them: Color): void {
    if (movedRole === 'k') {
      this.rights[us].king = false;
      this.rights[us].queen = false;
    }
    if (movedRole === 'r') {
      const queenRook = this.rookHomeSquare(us, 'queen');
      const kingRook = this.rookHomeSquare(us, 'king');
      if (queenRook !== null && move.from === queenRook) this.rights[us].queen = false;
      if (kingRook !== null && move.from === kingRook) this.rights[us].king = false;
    }
    // A rook captured on its home square also removes that castling right.
    const theirQueenRook = this.rookHomeSquare(them, 'queen');
    const theirKingRook = this.rookHomeSquare(them, 'king');
    if (theirQueenRook !== null && move.to === theirQueenRook) this.rights[them].queen = false;
    if (theirKingRook !== null && move.to === theirKingRook) this.rights[them].king = false;
  }

  // ------------------------------------------------------ position keys

  /** Board + turn + castling rights + ep square: the key for threefold repetition. */
  repetitionKey(): string {
    return `${this.repetitionKeyWithoutEp()}|${this.epSquare === null ? '-' : algebraic(this.epSquare)}`;
  }

  /** Board + turn + castling rights. */
  repetitionKeyWithoutEp(): string {
    return `${this.board.toFenPlacement()}|${this.turn}|${this.castlingField(false) || '-'}`;
  }

  /** Transposition key used by the built-in search. */
  get transpositionKey(): string {
    return this.repetitionKeyWithoutEp();
  }

  /** Piece counts per colour and role. */
  materialCount(): Record<Color, Partial<Record<Role, number>>> {
    const result: Record<Color, Partial<Record<Role, number>>> = { white: {}, black: {} };
    for (const color of ['white', 'black'] as const) {
      for (const [square] of this.board.piecesOf(color)) {
        const role = this.board.roleAt(square);
        if (!role) continue;
        result[color][role] = (result[color][role] ?? 0) + 1;
      }
    }
    return result;
  }

  /**
   * Insufficient material ("dead position" simplification):
   * K vs K, K+minor vs K, K+N vs K+N, and K+B vs K+B with same-coloured bishops.
   */
  hasInsufficientMaterial(): boolean {
    const nonKings: Array<{ color: Color; role: Role; square: Square }> = [];
    for (const color of ['white', 'black'] as const) {
      for (const [square] of this.board.piecesOf(color)) {
        const role = this.board.roleAt(square);
        if (!role || role === 'k') continue;
        nonKings.push({ color, role, square });
      }
    }
    if (nonKings.some((piece) => piece.role === 'p' || piece.role === 'r' || piece.role === 'q')) return false;
    if (nonKings.length <= 1) return true; // K vs K, or K + minor vs K
    if (nonKings.length === 2) {
      const [first, second] = nonKings as [typeof nonKings[0], typeof nonKings[0]];
      if (first.role === 'n' && second.role === 'n') return true;
      if (first.role === 'b' && second.role === 'b') {
        const firstLight = (fileOf(first.square) + rankOf(first.square)) % 2;
        const secondLight = (fileOf(second.square) + rankOf(second.square)) % 2;
        return firstLight === secondLight;
      }
    }
    return false;
  }

  /** Piece letter at a square, for debugging ("." when empty). */
  debugAt(square: Square): string {
    const piece = this.pieceAt(square);
    return piece ? pieceLetter(piece.color, piece.role) : '.';
  }

  toString(): string {
    return this.toFen();
  }
}

function offsetSquare(square: Square, fileDelta: number, rankDelta: number): Square | null {
  const file = fileOf(square) + fileDelta;
  const rank = rankOf(square) + rankDelta;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return squareFrom(file, rank);
}

/** Rook file 0..7 as a Shredder-FEN castling letter ("A".."H" / "a".."h"). */
function rookFileLetter(file: number, color: Color): string {
  return String.fromCharCode((color === 'white' ? 65 : 97) + file);
}

/**
 * Single exit point for the rejected castling branches. Set `globalThis.__castlingDebug = true`
 * in a browser console (or from a Node probe) to see exactly which rule rejected a castling
 * attempt, e.g. `__castlingDebug = true; position.castlingMove('king')`.
 */
function guard(reason: string): null {
  if ((globalThis as { __castlingDebug?: boolean }).__castlingDebug) {
    // eslint-disable-next-line no-console
    console.debug(`[castling] rejected: ${reason}`);
  }
  return null;
}

/**
 * All squares strictly between two squares on the same rank. With `inclusive` the end square
 * is appended as well; when both squares are the same, the result is just that square (the
 * Chess960 "the king does not move while castling" case).
 */
function squaresBetween(a: Square, b: Square, inclusive = false): Square[] {
  if (rankOf(a) !== rankOf(b)) return [];
  const result: Square[] = [];
  if (a === b) return inclusive ? [b] : [];
  const step = fileOf(b) > fileOf(a) ? 1 : -1;
  let file = fileOf(a) + step;
  while (file !== fileOf(b)) {
    result.push(squareFrom(file, rankOf(a)));
    file += step;
  }
  if (inclusive) result.push(b);
  return result;
}

function pushPromotions(moves: Move[], from: Square, to: Square): void {
  for (const promotion of ['q', 'r', 'b', 'n'] as const) {
    moves.push({ from, to, promotion });
  }
}
