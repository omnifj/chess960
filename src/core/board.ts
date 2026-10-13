import type { CastlingSide, Color, Role, Square } from './types';
import { fileIndex, fileOf, rankOf } from './squares';

/** Pieces are encoded as `colorBit + roleCode`; 0 means empty. */
const ROLE_CODES: Record<Role, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
const CODE_ROLES: readonly Role[] = ['p', 'n', 'b', 'r', 'q', 'k'];

export function roleIndex(role: Role): number {
  return ROLE_CODES[role];
}

export function codeToRole(code: number): Role | null {
  return CODE_ROLES[(code & 7) - 1] ?? null;
}

export function codeColor(code: number): Color | null {
  if (code === 0) return null;
  return code > 8 ? 'black' : 'white';
}

export function encodePiece(color: Color, role: Role): number {
  return (color === 'white' ? 0 : 8) + ROLE_CODES[role];
}

/** Role letter in FEN case convention (upper case for white). */
export function pieceLetter(color: Color, role: Role): string {
  return color === 'white' ? role.toUpperCase() : role;
}

/** Mutable 8x8 board indexed by square (`file + 8 * rank`). */
export class Board {
  readonly squares: Uint8Array;

  constructor(squares?: Uint8Array) {
    this.squares = squares ? squares.slice() : new Uint8Array(64);
  }

  static empty(): Board {
    return new Board();
  }

  clone(): Board {
    return new Board(this.squares);
  }

  at(square: Square): number {
    return this.squares[square] ?? 0;
  }

  set(square: Square, code: number): void {
    this.squares[square] = code;
  }

  clear(square: Square): void {
    this.squares[square] = 0;
  }

  roleAt(square: Square): Role | null {
    return codeToRole(this.at(square));
  }

  colorAt(square: Square): Color | null {
    return codeColor(this.at(square));
  }

  isEmpty(square: Square): boolean {
    return this.at(square) === 0;
  }

  is(color: Color, role: Role, square: Square): boolean {
    return this.at(square) === encodePiece(color, role);
  }

  findKing(color: Color): Square | null {
    const target = encodePiece(color, 'k');
    for (let square = 0; square < 64; square += 1) {
      if (this.squares[square] === target) return square;
    }
    return null;
  }

  /** All pieces of a colour, as `[square, code]` pairs. */
  piecesOf(color: Color): Array<[Square, number]> {
    const result: Array<[Square, number]> = [];
    const black = color === 'black';
    for (let square = 0; square < 64; square += 1) {
      const code = this.at(square);
      if (code !== 0 && code > 8 === black) result.push([square, code]);
    }
    return result;
  }

  /** Piece placement field of a FEN. */
  toFenPlacement(): string {
    const ranks: string[] = [];
    for (let rank = 7; rank >= 0; rank -= 1) {
      let empty = 0;
      let row = '';
      for (let file = 0; file < 8; file += 1) {
        const code = this.at(file + 8 * rank);
        if (code === 0) {
          empty += 1;
          continue;
        }
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        const color = codeColor(code);
        const role = codeToRole(code);
        if (!color || !role) throw new Error(`Corrupt piece code ${code} on ${file},${rank}`);
        row += pieceLetter(color, role);
      }
      if (empty > 0) row += String(empty);
      ranks.push(row);
    }
    return ranks.join('/');
  }

  static fromFenPlacement(placement: string): Board {
    const board = new Board();
    const rows = placement.split('/');
    if (rows.length !== 8) {
      throw new Error(`Invalid FEN placement: expected 8 ranks, got ${rows.length}`);
    }
    for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
      const rank = 7 - rowIndex;
      const row = rows[rowIndex]!;
      let file = 0;
      for (const char of row) {
        if (char >= '1' && char <= '8') {
          file += Number(char);
          continue;
        }
        const lower = char.toLowerCase();
        const role = CODE_ROLES.find((candidate) => candidate === lower);
        if (!role || file > 7) {
          throw new Error(`Invalid FEN placement character "${char}" in rank "${row}"`);
        }
        board.set(file + 8 * rank, encodePiece(char === lower ? 'black' : 'white', role));
        file += 1;
      }
      if (file !== 8) throw new Error(`Invalid FEN rank "${row}": ${file} files`);
    }
    return board;
  }
}

export interface CastlingFilesLike {
  king: number | null;
  kingRook: number | null;
  queenRook: number | null;
}

/**
 * Interpret a castling field letter for one colour:
 * `K`/`Q` mean the outer rook relative to the king's home file, `A`..`H` name a rook file
 * directly (Shredder-FEN / X-FEN). Returns null when the letter is meaningless.
 */
export function castlingSideFromLetter(
  letter: string,
  files: CastlingFilesLike,
  color: Color,
): CastlingSide | null {
  void color;
  const kingFile = files.king;
  if (letter === 'K') return 'king';
  if (letter === 'Q') return 'queen';
  const file = fileIndex(letter);
  if (file < 0) return null;
  if (files.kingRook === file) return 'king';
  if (files.queenRook === file) return 'queen';
  return kingFile === null ? null : file > kingFile ? 'king' : 'queen';
}

/** Human readable board dump, used in tests and error messages. */
export function boardToDebugString(board: Board): string {
  const lines: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let line = `${rank + 1} `;
    for (let file = 0; file < 8; file += 1) {
      const square = file + 8 * rank;
      const color = board.colorAt(square);
      const role = board.roleAt(square);
      line += color && role ? ` ${pieceLetter(color, role)}` : ' .';
    }
    lines.push(line);
  }
  lines.push('   a b c d e f g h');
  return lines.join('\n');
}

export { fileOf, rankOf };
