import { describe, expect, it } from 'vitest';
import {
  backRankFiles,
  backRankFromIndex,
  backRankToStartFen,
  generateAll,
  generatePosition,
  indexFromBackRank,
  isValidBackRank,
  normalizeBackRank,
  referenceBackRanks,
  startBoard,
} from '../../src/core/chess960/generate';
import { Position } from '../../src/core/position';
import { algebraic, fileOf, rankOf, squareFromAlgebraic } from '../../src/core/squares';

const ALGEBRAIC_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function backRankOf(board: string): string {
  const rows = board.split('/');
  return rows[rows.length - 1]!.toLowerCase();
}

describe('Chess960 layout generation', () => {
  it('generates exactly 960 distinct layouts for indices 0..959', () => {
    const layouts = generateAll();
    expect(layouts).toHaveLength(960);
    expect(new Set(layouts.map((layout) => layout.backRank)).size).toBe(960);
  });

  it('matches an independent brute-force enumeration', () => {
    const reference = referenceBackRanks();
    expect(reference).toHaveLength(960);
    // The brute-force walk enumerates in lexicographic permutation order while the direct
    // construction follows Scharnagl numbering, so compare them as sets (and the round-trip
    // test below pins the actual numbering).
    expect([...generateAll().map((position) => position.backRank)].sort()).toEqual([...reference].sort());
  });

  it('every layout satisfies the Chess960 constraints', () => {
    for (const { index, backRank } of generateAll()) {
      const context = `index ${index} (${backRank})`;
      expect(backRank, context).toHaveLength(8);
      expect(isValidBackRank(backRank), context).toBe(true);

      const counts = [...backRank].reduce<Record<string, number>>((accumulator, char) => {
        accumulator[char] = (accumulator[char] ?? 0) + 1;
        return accumulator;
      }, {});
      expect(counts, context).toEqual({ r: 2, n: 2, b: 2, q: 1, k: 1 });

      // Bishops on opposite colours.
      const bishops: number[] = [];
      const rooks: number[] = [];
      let king = -1;
      for (let file = 0; file < 8; file += 1) {
        const char = backRank[file]!;
        if (char === 'b') bishops.push(file);
        else if (char === 'r') rooks.push(file);
        else if (char === 'k') king = file;
      }
      expect(bishops[0]! % 2 === bishops[1]! % 2, `${context}: bishops share a colour`).toBe(false);
      expect(rooks[0]!, `${context}: king not between rooks`).toBeLessThan(king);
      expect(king).toBeLessThan(rooks[1]!);
    }
  });

  it('round-trips index -> layout -> index', () => {
    for (let index = 0; index < 960; index += 1) {
      const backRank = backRankFromIndex(index);
      expect(indexFromBackRank(backRank), `index ${index}`).toBe(index);
    }
  });

  it('rejects illegal layouts', () => {
    // Bishops on b1 and c1 (odd + even file): opposite colours, so legal.
    expect(normalizeBackRank('bbqnnrkr')).toBe('bbqnnrkr');
    // Bishops on b1 and d1 (both odd files): same colour complex, illegal.
    expect(normalizeBackRank('bnbnqrkr')).toBeNull();
    expect(normalizeBackRank('rnbqkbnr'.replace('k', 'r'))).toBeNull(); // no king
    expect(normalizeBackRank('krnbqbnr')).toBeNull(); // king not between the rooks
    expect(normalizeBackRank('rnbqkbnr')).toBe('rnbqkbnr');
    expect(isValidBackRank('rnbqkbnr')).toBe(true);
    expect(isValidBackRank('nope')).toBe(false);
    expect(() => backRankFromIndex(960)).toThrow(RangeError);
    expect(() => backRankFromIndex(-1)).toThrow(RangeError);
  });

  it('accepts case-insensitive layouts and normalises them', () => {
    expect(normalizeBackRank('NRBBQKNR')).toBe('nrbbqknr');
    expect(backRankFromIndex(indexFromBackRank('NRBBQKNR'))).toBe('nrbbqknr');
  });

  it('produces mirrored start FENs with pawns on the 2nd and 7th ranks', () => {
    for (const index of [0, 1, 518, 959]) {
      const position = generatePosition({ index });
      const rows = position.startFen.split(' ')[0]!.split('/');
      expect(rows[1]).toBe('pppppppp');
      expect(rows[6]).toBe('PPPPPPPP');
      expect(rows[7]!.toLowerCase()).toBe(rows[0]!.toLowerCase());
      expect(rows[0]).toBe(rows[7]!.toLowerCase());
    }
  });

  it('mirrors black and white back ranks', () => {
    const board = startBoard('nrbbqknr');
    for (let file = 0; file < 8; file += 1) {
      const white = board.roleAt(squareFromFile(file, 0));
      const black = board.roleAt(squareFromFile(file, 7));
      expect(black).toBe(white);
      expect(board.colorAt(squareFromFile(file, 0))).toBe('white');
      expect(board.colorAt(squareFromFile(file, 7))).toBe('black');
      expect(board.roleAt(squareFromFile(file, 1))).toBe('p');
      expect(board.roleAt(squareFromFile(file, 6))).toBe('p');
    }
  });

  it('index 518 is the standard chess setup', () => {
    expect(backRankFromIndex(518)).toBe('rnbqkbnr');
    expect(backRankToStartFen('rnbqkbnr').split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(backRankToStartFen('rnbqkbnr')).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w AHah - 0 1');
    // ...and it can also be spelled the classic way, unlike other Chess960 layouts.
    expect(Position.fromFen(ALGEBRAIC_START_FEN).toFenWithStandardCastling()).toBe(ALGEBRAIC_START_FEN);
  });

  it('uses the published Scharnagl anchors', () => {
    expect(backRankFromIndex(0)).toBe('bbqnnrkr');
    expect(backRankFromIndex(1)).toBe('bqnbnrkr');
    expect(backRankFromIndex(959)).toBe('rkrnnqbb');
    expect(indexFromBackRank('rnbqkbnr')).toBe(518);
  });

  it('documents the castling rook files of a layout', () => {
    // Index 0 has its king on g1 with rooks on f1 and h1.
    expect(backRankFiles('bbqnnrkr')).toEqual({ king: 6, kingRook: 7, queenRook: 5 });
    expect(backRankFiles('rkrbbnqn')).toEqual({ king: 1, kingRook: 2, queenRook: 0 });
  });

  it('uses a deterministic RNG when one is injected', () => {
    expect(generatePosition({ rng: () => 0 }).index).toBe(0);
    expect(generatePosition({ rng: () => 0.999999 }).index).toBe(959);
    expect(generatePosition().startFen.split(' ')[1]).toBe('w');
  });

  it('emits Shredder-FEN castling letters that match the rook files', () => {
    for (const index of [0, 100, 518, 700, 959]) {
      const { backRank, startFen } = generatePosition({ index });
      const { queenRook, kingRook } = backRankFiles(backRank);
      const castling = startFen.split(' ')[2]!;
      expect(castling).toBe(
        `${String.fromCharCode(65 + queenRook)}${String.fromCharCode(65 + kingRook)}` +
          `${String.fromCharCode(97 + queenRook)}${String.fromCharCode(97 + kingRook)}`,
      );
    }
  });

  it('round-trips a start FEN into a playable position', () => {
    for (const index of [0, 42, 518, 959]) {
      const { startFen, backRank } = generatePosition({ index });
      const position = Position.fromFen(startFen);
      // toFen emits a Shredder field while the start FEN uses it too, so it round-trips exactly.
      expect(position.toFen()).toBe(startFen);
      expect(backRankOf(startFen.split(' ')[0]!)).toBe(backRank);
      // 20 pawn/knight moves, plus or minus a castling move that is already legal at move one
      // (a Chess960 king may start next to its rook, e.g. on g1 with the rook on h1).
      expect(position.legalMoves().length).toBeGreaterThanOrEqual(19);
      expect(position.legalMoves().length).toBeLessThanOrEqual(21);
      // The traditional KQkq spelling is only available for the standard layout.
      expect(position.canUseTraditionalCastling()).toBe(backRank === 'rnbqkbnr');
    }
  });
});

function squareFromFile(file: number, rank: number): number {
  return file + 8 * rank;
}

function square(name: string): number {
  const value = squareFromAlgebraic(name);
  if (value === null) throw new Error(`bad square ${name}`);
  return value;
}

describe('board helpers used by the Chess960 tests', () => {
  it('maps algebraic names to indices', () => {
    expect(square('a1')).toBe(0);
    expect(square('h1')).toBe(7);
    expect(square('a8')).toBe(56);
    expect(square('h8')).toBe(63);
    expect(algebraic(0)).toBe('a1');
    expect(fileOf(square('e4'))).toBe(4);
    expect(rankOf(square('e4'))).toBe(3);
  });
});
