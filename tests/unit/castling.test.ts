import { describe, expect, it } from 'vitest';
import { Position } from '../../src/core/position';
import { Game } from '../../src/core/game';
import { moveToSan } from '../../src/core/notation';
import { algebraic, squareFromAlgebraic } from '../../src/core/squares';
import type { Move } from '../../src/core/types';

function sq(name: string): number {
  const value = squareFromAlgebraic(name);
  if (value === null) throw new Error(`bad square ${name}`);
  return value;
}

function position(fen: string): Position {
  return Position.fromFen(fen);
}

function play(position: Position, from: string, to: string, promotion?: Move['promotion']): Move {
  const move = position.resolveMove({ from: sq(from), to: sq(to), ...(promotion ? { promotion } : {}) });
  if (!move) throw new Error(`illegal move ${from}${to} in ${position.toFen()}`);
  return position.play(move);
}

function castleMove(position: Position, side: 'king' | 'queen'): Move | null {
  return position.castlingMove(side);
}

/** Board after castling: does the king stand on `kingTarget` and the rook on `rookTarget`? */
function expectCastled(position: Position, color: 'white' | 'black', kingTarget: string, rookTarget: string): void {
  expect(position.colorAt(sq(kingTarget))).toBe(color);
  expect(position.roleAt(sq(kingTarget))).toBe('k');
  expect(position.colorAt(sq(rookTarget))).toBe(color);
  expect(position.roleAt(sq(rookTarget))).toBe('r');
}

describe('standard castling (sanity check before the Chess960 cases)', () => {
  const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  const castlingFen = 'r3k2r/8/8/8/8/8/8/R3K2R w HAha - 0 1';

  it('allows both sides for both colours', () => {
    const white = position(fen);
    expect(castleMove(white, 'king')).toMatchObject({ from: sq('e1'), to: sq('g1'), castle: 'king' });
    expect(castleMove(white, 'queen')).toMatchObject({ from: sq('e1'), to: sq('c1'), castle: 'queen' });

    const black = position('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    expect(castleMove(black, 'king')).toMatchObject({ from: sq('e8'), to: sq('g8'), castle: 'king' });
    expect(castleMove(black, 'queen')).toMatchObject({ from: sq('e8'), to: sq('c8'), castle: 'queen' });
  });

  it('moves king and rook to their final squares', () => {
    const short = position(fen);
    play(short, 'e1', 'g1');
    expectCastled(short, 'white', 'g1', 'f1');
    expect(short.roleAt(sq('h1'))).toBeNull();
    // Black's rights survive, white's are gone.
    expect(short.toFenWithStandardCastling().split(' ')[2]).toBe('kq');

    const long = position(fen);
    play(long, 'e1', 'c1');
    expectCastled(long, 'white', 'c1', 'd1');
    expect(long.roleAt(sq('a1'))).toBeNull();
  });

  it('refuses to castle through or out of check', () => {
    // e1 is in check from the e8 rook, and f1 would be attacked as well.
    expect(castleMove(position('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'king')).toBeNull();
    expect(castleMove(position('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'queen')).toBeNull();
    // With the rook on f8 only squares past d1 are attacked, so O-O-O stays legal.
    expect(castleMove(position('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'king')).toBeNull(); // f1/g1 attacked
    expect(castleMove(position('5rk1/8/8/8/8/8/8/R3K2R w Q - 0 1'), 'queen')).not.toBeNull(); // c1/d1 safe
  });

  it('refuses to castle when the path is blocked or the pieces moved', () => {
    expect(castleMove(position('r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1'), 'king')).toBeNull();
    expect(castleMove(position('r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1'), 'king')).toBeNull();
    expect(castleMove(position('4k3/8/8/8/8/8/8/R3K2R w - - 0 1'), 'king')).toBeNull();
    expect(castleMove(position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'queen')).not.toBeNull();
  });
});

describe('Chess960 castling: king and rook placement', () => {
  it('works when the king starts on e1 and the rooks on a1/h1 (index 518 layout)', () => {
    const start = Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1');
    expect(castleMove(start, 'king')).toBeNull(); // pieces in the way
    play(start, 'g1', 'f3');
    play(start, 'g8', 'f6');
    play(start, 'e2', 'e3');
    play(start, 'e7', 'e6');
    play(start, 'f1', 'e2');
    play(start, 'f8', 'e7');
    const castling = castleMove(start, 'king');
    expect(castling).toMatchObject({ from: sq('e1'), to: sq('g1'), castle: 'king' });
    start.play(castling!);
    expectCastled(start, 'white', 'g1', 'f1');
  });

  it('is a legal move when the king already stands on g1 (only the rook travels)', () => {
    const position960 = position('k7/8/8/8/8/8/8/1R4KR w HB - 0 1');
    const move = castleMove(position960, 'king');
    expect(move).toMatchObject({ from: sq('g1'), to: sq('g1'), castle: 'king' });
    position960.play(move!);
    expect(position960.roleAt(sq('g1'))).toBe('k');
    expect(position960.roleAt(sq('f1'))).toBe('r');
    expect(position960.roleAt(sq('h1'))).toBeNull();
  });

  it('moves the king across the board when it starts on f1 (king to g1, rook to f1)', () => {
    // King f1 with rooks a1 and h1 — the classic "king steps to g1 while the rook hops to f1".
    const position960 = position('k7/8/8/8/8/8/8/R4K1R w HA - 0 1');
    expect(position960.castlingFiles.white).toEqual({ king: 5, kingRook: 7, queenRook: 0 });
    const move = castleMove(position960, 'king');
    expect(move).toMatchObject({ from: sq('f1'), to: sq('g1'), castle: 'king' });
    position960.play(move!);
    expectCastled(position960, 'white', 'g1', 'f1');
    expect(position960.roleAt(sq('h1'))).toBeNull();
  });

  it('refuses when the enemy rook stands on the h-file and pins the castling rook', () => {
    // With a black rook on h1 the rook cannot travel h1->f1 (the king is in the way) and the
    // king would land on g1 next to it, so this is not castling at all.
    expect(castleMove(position('k7/8/8/8/8/8/8/R4K1r w F - 0 1'), 'king')).toBeNull();
  });

  it('refuses when the enemy rook stands on the h-file and pins the castling rook', () => {
    // With a black rook on h1 the rook cannot travel h1->f1 (the king is in the way) and the
    // king would land on g1 next to it, so this is not castling at all.
    expect(castleMove(position('k7/8/8/8/8/8/8/R4K1r w F - 0 1'), 'king')).toBeNull();
  });

  it('handles a king on f1 castling long (king to c1, rook to d1)', () => {
    const position960 = position('k7/8/8/8/8/8/8/R4K2 w A - 0 1');
    const move = castleMove(position960, 'queen');
    expect(move).toMatchObject({ from: sq('f1'), to: sq('c1'), castle: 'queen' });
    position960.play(move!);
    expectCastled(position960, 'white', 'c1', 'd1');
    expect(position960.roleAt(sq('a1'))).toBeNull();
  });

  it('handles a king on b1 castling short (rook travels from b1 to f1)', () => {
    const position960 = position('k7/8/8/8/8/8/8/1K5R w H - 0 1');
    const move = castleMove(position960, 'king');
    expect(move).toMatchObject({ from: sq('b1'), to: sq('g1'), castle: 'king' });
    position960.play(move!);
    expectCastled(position960, 'white', 'g1', 'f1');
    expect(position960.roleAt(sq('b1'))).toBeNull();
  });

  it('handles a king on b1 castling long (king travels to c1, rook to d1)', () => {
    const position960 = position('k7/8/8/8/8/8/8/RK6 w A - 0 1');
    const move = castleMove(position960, 'queen');
    expect(move).toMatchObject({ from: sq('b1'), to: sq('c1'), castle: 'queen' });
    position960.play(move!);
    expectCastled(position960, 'white', 'c1', 'd1');
    expect(position960.roleAt(sq('a1'))).toBeNull();
  });

  it('handles a king on c1 castling long (king stays, rook travels to d1)', () => {
    const position960 = position('k7/8/8/8/8/8/8/R1K5 w A - 0 1');
    const move = castleMove(position960, 'queen');
    expect(move).toMatchObject({ from: sq('c1'), to: sq('c1'), castle: 'queen' });
    position960.play(move!);
    expectCastled(position960, 'white', 'c1', 'd1');
    expect(position960.roleAt(sq('a1'))).toBeNull();
  });

  it('castles on the black side of the board', () => {
    const position960 = position('4kr2/8/8/8/8/8/8/K7 b f - 0 1');
    const move = castleMove(position960, 'king');
    expect(move).toMatchObject({ from: sq('e8'), to: sq('g8'), castle: 'king' });
    position960.play(move!);
    expectCastled(position960, 'black', 'g8', 'f8');
  });

  it('does nothing when the king and rook are already on their destinations', () => {
    expect(castleMove(position('k7/8/8/8/8/8/8/5RK1 w F - 0 1'), 'king')).toBeNull();
  });
});

describe('Chess960 castling: legality conditions', () => {
  it('refuses while the king is in check', () => {
    expect(castleMove(position('k7/8/8/8/8/8/4r3/1K5R w H - 0 1'), 'king')).toBeNull();
  });

  it('refuses when the king would pass through an attacked square', () => {
    // Black rook on c8 controls c1: the king's path b1 -> c1 is attacked.
    expect(castleMove(position('2r1k3/8/8/8/8/8/8/RK6 w A - 0 1'), 'queen')).toBeNull();
  });

  it('refuses when the king would land on an attacked square', () => {
    // Black rook on g8 attacks g1 — the king's destination.
    expect(castleMove(position('6rk/8/8/8/8/8/8/1K5R w H - 0 1'), 'king')).toBeNull();
  });

  it('allows castling when only the rook passes through an attacked square', () => {
    // A black bishop on h5 attacks d1 — the *rook's* destination — while the king's path
    // b1 -> c1 is clear, so O-O-O is legal even though the rook crosses an attacked square.
    const position960 = position('7k/8/8/7b/8/8/8/RK6 w A - 0 1');
    const move = castleMove(position960, 'queen');
    expect(move).toMatchObject({ from: sq('b1'), to: sq('c1'), castle: 'queen' });
    position960.play(move!);
    expectCastled(position960, 'white', 'c1', 'd1');
  });

  it('refuses when a third piece occupies the rook destination', () => {
    // Knight on g1 blocks O-O; only the a-side right is configured, so nothing is legal.
    expect(castleMove(position('k7/8/8/8/8/8/8/1K4NR w A - 0 1'), 'king')).toBeNull();
    // ...but the castling rook itself may stand on its own destination (g1 rook stays put).
    expect(castleMove(position('k7/8/8/8/8/8/8/1K5R w H - 0 1'), 'king')).not.toBeNull();
  });

  it('refuses when a third piece sits on a square the king would cross', () => {
    // King b1 -> c1: the b1 bishop stands on the only square the king crosses.
    expect(castleMove(position('k7/8/8/8/8/8/8/RB5R w A - 0 1'), 'queen')).toBeNull();
    // Clear back rank: the same castling is legal.
    expect(castleMove(position('k7/8/8/8/8/8/8/RK5R w A - 0 1'), 'queen')).toMatchObject({
      from: sq('b1'),
      to: sq('c1'),
      castle: 'queen',
    });
  });

  it('refuses when the king is not next to the right rook', () => {
    // Only the a-rook is present, so the kingside right cannot be used.
    expect(castleMove(position('k7/8/8/8/8/8/8/RK6 w H - 0 1'), 'king')).toBeNull();
    expect(castleMove(position('k7/8/8/8/8/8/8/RK6 w KA - 0 1'), 'king')).toBeNull();
    expect(castleMove(position('k7/8/8/8/8/8/8/RK6 w KA - 0 1'), 'queen')).not.toBeNull();
  });

  it('refuses when the rook is boxed in by a piece on its destination', () => {
    // Queen on d1 sits exactly where the a1 rook would land; b1 is empty for the king.
    expect(castleMove(position('k7/8/8/8/8/8/8/RK1Q3R w A - 0 1'), 'queen')).toBeNull();
    // The same queen blocks the h1 rook's landing square f1 too.
    expect(castleMove(position('k7/8/8/8/8/8/8/RK1Q3R w H - 0 1'), 'king')).toBeNull();
    // Without the queen both castlings are available (king b1: rook h1 -> f1, king stays).
    const clean = position('k7/8/8/8/8/8/8/RK5R w HA - 0 1');
    expect(castleMove(clean, 'king')).toMatchObject({ from: sq('b1'), to: sq('g1') });
    expect(castleMove(clean, 'queen')).toMatchObject({ from: sq('b1'), to: sq('c1') });
  });

  it('refuses when the squares between king and rook are occupied', () => {
    // The b1 bishop stands between the c1 king and the a1 rook.
    expect(castleMove(position('k7/8/8/8/8/8/8/RBK4R w HA - 0 1'), 'queen')).toBeNull();
    // A piece on the king's path to g1 stops O-O instead.
    expect(castleMove(position('k7/8/8/8/8/8/8/R1K2B1R w HA - 0 1'), 'king')).toBeNull();
    const clean = position('k7/8/8/8/8/8/8/R1K4R w HA - 0 1');
    expect(castleMove(clean, 'king')).not.toBeNull();
    expect(castleMove(clean, 'queen')).not.toBeNull();
  });

  it('drops the right when the king moved and came back', () => {
    const position960 = position('r3k2r/8/8/8/4P3/8/8/R3K2R w KQkq - 0 1');
    play(position960, 'e1', 'e2');
    play(position960, 'e8', 'e7');
    play(position960, 'e2', 'e1');
    play(position960, 'e7', 'e8');
    expect(castleMove(position960, 'king')).toBeNull();
    expect(castleMove(position960, 'queen')).toBeNull();
  });

  it('drops the right when the rook moved and came back', () => {
    const position960 = position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    play(position960, 'h1', 'h2');
    play(position960, 'a8', 'a7');
    play(position960, 'h2', 'h1');
    play(position960, 'a7', 'a8');
    expect(castleMove(position960, 'king')).toBeNull();
    expect(castleMove(position960, 'queen')).not.toBeNull();
  });

  it('drops the right when the rook is captured on its home square', () => {
    // The d-rooks are the castling rooks here (Shredder field HDhd). Capturing black's d8 rook
    // removes black's a-side right while the other side keeps its own — the Position tracks
    // both even where a FEN round-trip could no longer see them.
    const position960 = position('3rk2r/8/8/8/8/8/8/3RK2R w HDhd - 0 1');
    expect(position960.rights.black.queen).toBe(true);
    expect(position960.rights.black.king).toBe(true);
    const capture = position960.resolveMove({ from: sq('d1'), to: sq('d8') });
    expect(capture).not.toBeNull();
    position960.play(capture!);
    expect(position960.hasCastlingRight('black', 'queen')).toBe(false);
    expect(position960.hasCastlingRight('black', 'king')).toBe(true);
  });

  it('keeps a right whose rook is still home even after the other rook moved', () => {
    const position960 = position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    play(position960, 'a1', 'a2');
    play(position960, 'e8', 'd8');
    play(position960, 'a2', 'a1');
    play(position960, 'd8', 'e8');
    expect(position960.hasCastlingRight('white', 'queen')).toBe(false);
    expect(castleMove(position960, 'king')).not.toBeNull();
  });

  it('loses both rights after castling', () => {
    const position960 = position('k7/8/8/8/8/8/8/RK5R w HA - 0 1');
    const move = castleMove(position960, 'king');
    expect(move).toMatchObject({ from: sq('b1'), to: sq('g1'), castle: 'king' });
    position960.play(move!);
    expect(position960.hasCastlingRight('white', 'king')).toBe(false);
    expect(position960.hasCastlingRight('white', 'queen')).toBe(false);
    expect(position960.toFen().split(' ')[2]).toBe('-');
  });

  it('parses Shredder-FEN castling fields', () => {
    const position960 = position('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1');
    expect(position960.hasCastlingRight('white', 'king')).toBe(true);
    expect(position960.hasCastlingRight('white', 'queen')).toBe(true);
    expect(position960.hasCastlingRight('black', 'king')).toBe(true);
    expect(position960.hasCastlingRight('black', 'queen')).toBe(true);
    expect(castleMove(position960, 'king')).toBeNull(); // blocked by the knight and bishop
  });

  it('reads the right rook from partial castling fields', () => {
    const onlyKingside = position('r3k2r/8/8/8/8/8/8/R3K2R w Hh - 0 1');
    expect(onlyKingside.rights.white.king).toBe(true);
    expect(onlyKingside.rights.white.queen).toBe(false);
    expect(onlyKingside.rights.black.king).toBe(true);
    expect(onlyKingside.rights.black.queen).toBe(false);
  });

  it('ignores castling rights whose pieces are missing', () => {
    const noRooks = position('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1');
    expect(noRooks.rights.white.king).toBe(false);
    expect(noRooks.toFen().split(' ')[2]).toBe('-');
    expect(() => position('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1')).not.toThrow();
    expect(() =>
      Position.fromFen('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1', { strictCastling: true }),
    ).toThrow(/castling right/);
  });

  it('serialises rights as KQkq once they are standard again', () => {
    const position960 = position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(position960.toFenWithStandardCastling().split(' ')[2]).toBe('KQkq');
    // Shredder spelling lists the rook files in ascending order.
    expect(position960.toFen().split(' ')[2]).toBe('AHah');
    play(position960, 'e1', 'e2');
    expect(position960.toFenWithStandardCastling().split(' ')[2]).toBe('kq');
  });

  it('rejects a castling move sent as king-to-rook when the right is gone', () => {
    const position960 = position('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w - - 0 1');
    expect(position960.resolveMove({ from: sq('g1'), to: sq('h1') })).toBeNull();
  });

  it('accepts every castling encoding the UI or an engine may send', () => {
    const base = 'k7/8/8/8/8/8/8/R1K4R w HA - 0 1';
    const asRook = position(base).resolveMove({ from: sq('c1'), to: sq('h1') });
    expect(asRook).toMatchObject({ castle: 'king' });
    const asTarget = position(base).resolveMove({ from: sq('c1'), to: sq('g1') });
    expect(asTarget).toMatchObject({ castle: 'king' });
    const asSide = position(base).resolveMove({ from: sq('c1'), to: sq('g1'), castle: 'king' });
    expect(asSide).toMatchObject({ castle: 'king' });
    // A plain king move to g1 is not the same as castling when the square is empty and
    // castling is unavailable.
    expect(position('k7/8/8/8/8/8/8/R1K5 w - - 0 1').resolveMove({ from: sq('c1'), to: sq('g1') })).toBeNull();
  });
});

describe('en passant and pawn rules', () => {
  it('records the en passant square only after a double push', () => {
    const start = Position.standard();
    play(start, 'e2', 'e4');
    expect(start.epSquare).toBe(sq('e3'));
    play(start, 'e7', 'e5');
    expect(start.epSquare).toBe(sq('e6'));
    play(start, 'g1', 'f3');
    expect(start.epSquare).toBeNull();
  });

  it('captures en passant', () => {
    const position960 = position('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const move = position960.resolveMove({ from: sq('e5'), to: sq('d6') });
    expect(move).toMatchObject({ enPassant: true });
    position960.play(move!);
    expect(position960.roleAt(sq('d5'))).toBeNull();
    expect(position960.roleAt(sq('d6'))).toBe('p');
    expect(position960.colorAt(sq('d6'))).toBe('white');
  });

  it('rejects an en passant capture that would expose the own king', () => {
    const position960 = position('4r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    expect(position960.resolveMove({ from: sq('e5'), to: sq('d6') })).toBeNull();
    expect(position960.legalMoves({ only: sq('e5') }).some((move) => move.enPassant)).toBe(false);
  });

  it('promotes to all four roles and defaults to a queen', () => {
    const position960 = position('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const promotions = position960
      .legalMoves({ only: sq('a7') })
      .filter((move) => move.to === sq('a8'))
      .map((move) => move.promotion)
      .sort();
    expect(promotions).toEqual(['b', 'n', 'q', 'r']);
    const queen = position960.resolveMove({ from: sq('a7'), to: sq('a8'), promotion: 'q' });
    expect(queen?.promotion).toBe('q');
    const bare = position960.resolveMove({ from: sq('a7'), to: sq('a8') });
    expect(bare?.promotion).toBe('q');
  });

  it('offers all four promotions on a capture too', () => {
    const position960 = position('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const captures = position960.legalMoves({ only: sq('a7') }).filter((move) => move.to === sq('b8'));
    expect(captures).toHaveLength(4);
    expect(captures.every((move) => move.promotion !== undefined)).toBe(true);
  });
});

describe('position bookkeeping', () => {
  it('keeps FEN counters consistent', () => {
    const start = Position.standard();
    expect(start.toFenWithStandardCastling()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    play(start, 'e2', 'e4');
    expect(start.toFenWithStandardCastling()).toContain(' b KQkq e3 0 1');
    play(start, 'c7', 'c5');
    expect(start.toFenWithStandardCastling()).toContain(' w KQkq c6 0 2');
    play(start, 'g1', 'f3');
    expect(start.toFenWithStandardCastling()).toContain(' b KQkq - 1 2');
  });

  it('shares repetition keys between transpositions', () => {
    const a = Position.standard();
    play(a, 'g1', 'f3');
    play(a, 'g8', 'f6');
    play(a, 'f3', 'g1');
    play(a, 'f6', 'g8');
    expect(a.repetitionKey()).toBe(Position.standard().repetitionKey());
  });

  it('includes the en passant square in the repetition key', () => {
    const start = Position.standard();
    const afterDoublePush = Position.standard();
    play(afterDoublePush, 'e2', 'e4');
    expect(afterDoublePush.repetitionKey()).not.toBe(start.repetitionKey());
  });

  it('undoes a move exactly, including castling and en passant', () => {
    const position960 = position('4k3/8/8/3pP3/8/8/8/R3K2R w KQ d6 0 1');
    const before = position960.toFen();
    const ep = position960.resolveMove({ from: sq('e5'), to: sq('d6') })!;
    position960.play(ep);
    position960.undo();
    expect(position960.toFen()).toBe(before);

    play(position960, 'e1', 'g1');
    expectCastled(position960, 'white', 'g1', 'f1');
    position960.undo();
    expect(position960.toFen()).toBe(before);
  });

  it('reports checks, mates and stalemates through legal move counts', () => {
    expect(position('4k3/8/8/8/8/8/8/4K3 w - - 0 1').isCheck()).toBe(false);
    expect(position('k7/8/1Q6/8/8/8/8/K7 b - - 0 1').isCheck()).toBe(false); // quiet: the queen is far away

    // Black king h8, white queen g7 (defended by the g6 king): mate.
    const mate = position('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    expect(mate.isCheck()).toBe(true);
    expect(mate.legalMoves()).toHaveLength(0);

    // A plain check, with the SAN suffix produced by moveToSan.
    const checking = position('k7/8/1Q6/8/8/8/8/K7 w - - 0 1');
    const check = checking.resolveMove({ from: sq('b6'), to: sq('b7') });
    expect(check).not.toBeNull();
    expect(moveToSan(checking, check!)).toBe('Qb7+');

    // Same pieces minus the check: black has nothing to play, and is not in check.
    const stalemate = position('7k/5Q2/5K2/8/8/8/8/8 b - - 0 1');
    expect(stalemate.isCheck()).toBe(false);
    expect(stalemate.legalMoves()).toHaveLength(0);
  });

  it('detects insufficient material', () => {
    expect(position('4k3/8/8/8/8/8/8/4K3 w - - 0 1').hasInsufficientMaterial()).toBe(true);
    expect(position('4k3/8/8/8/8/8/8/3BK3 w - - 0 1').hasInsufficientMaterial()).toBe(true);
    expect(position('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').hasInsufficientMaterial()).toBe(true);
    // Bishops on the same colour complex (b1 and c1 are both light-squared): cannot mate.
    expect(position('2b1k3/8/8/8/8/8/8/1B2K3 w - - 0 1').hasInsufficientMaterial()).toBe(true);
    // Bishops of *one* colour each but different complexes (c8 light, d1 dark): a theoretical
    // mate still exists, so this is not a dead position.
    expect(position('2b1k3/8/8/8/8/8/8/3BK3 w - - 0 1').hasInsufficientMaterial()).toBe(true);
    // ...while opposite-coloured bishops facing each other do keep mating chances.
    expect(position('2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1').hasInsufficientMaterial()).toBe(false);
    expect(position('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1').hasInsufficientMaterial()).toBe(false);
    expect(position('4k3/8/8/8/8/8/8/3RK3 w - - 0 1').hasInsufficientMaterial()).toBe(false);
  });

  it('keeps the king out of the opponent king when generating moves', () => {
    // White king d3, black king d5: both e4 (adjacent) and c4 (diagonal, same distance) are
    // forbidden, while e2/d2/c2 stay available.
    const position960 = position('8/8/8/3k4/8/3K4/8/8 w - - 0 1');
    const e4 = squareFromAlgebraic('e4');
    const c4 = squareFromAlgebraic('c4');
    const e2 = squareFromAlgebraic('e2');
    const d3 = squareFromAlgebraic('d3');
    expect(e4).not.toBeNull();
    expect(position960.resolveMove({ from: d3!, to: e4! })).toBeNull();
    expect(position960.resolveMove({ from: d3!, to: c4! })).toBeNull();
    expect(position960.resolveMove({ from: d3!, to: e2! })).not.toBeNull();
    expect(position960.legalMoves({ only: d3! })).toHaveLength(5);
  });

  it('does not offer a castling move that would step next to the enemy king', () => {
    // Black king on e2 keeps the white king from reaching any castling destination.
    expect(castleMove(position('8/8/8/8/8/8/4k3/1K5R w H - 0 1'), 'king')).toBeNull();
    // Ordinary position: the castling is available.
    expect(castleMove(position('4k3/8/8/8/8/8/8/1K5R w H - 0 1'), 'king')).not.toBeNull();
  });

  it('generates castling only on the king-square request', () => {
    const position960 = position('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const all = position960.legalMoves();
    const castles = all.filter((move) => move.castle);
    expect(castles).toHaveLength(2);
    const fromKing = position960.legalMoves({ only: sq('e1') });
    expect(fromKing.filter((move) => move.castle)).toHaveLength(2);
    const fromRook = position960.legalMoves({ only: sq('h1') });
    expect(fromRook.filter((move) => move.castle)).toHaveLength(0);
  });

  it('undoes repeatedly, even after intervening legality probes', () => {
    // Regression: `Position.legalMoves` uses play/undo internally, which used to consume the
    // single undo slot and desynchronise `Game.undo`.
    const game = new Game({ standard: true });
    const startFen = game.fen;
    const played: string[] = [];
    for (const [from, to] of [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['g1', 'f3'],
      ['b8', 'c6'],
    ] as const) {
      const record = game.play({ from: sq(from), to: sq(to) });
      expect(record, `${from}${to} should be legal`).not.toBeNull();
      played.push(record!.fen);
    }
    // A legality probe between the moves and the undo used to break the history.
    expect(game.legalMoves().length).toBeGreaterThan(0);
    expect(game.status.state).toBe('playing');

    expect(game.undo()?.san).toBe('Nc6');
    expect(game.fen).toBe(played[2]);
    expect(game.undo()?.san).toBe('Nf3');
    expect(game.fen).toBe(played[1]);
    expect(game.undo()?.san).toBe('e5');
    expect(game.fen).toBe(played[0]);
    expect(game.undo()?.san).toBe('e4');
    expect(game.fen).toBe(startFen);
    expect(game.sans).toEqual([]);
    expect(game.undo()).toBeNull();
    expect(game.canUndo).toBe(false);
  });

  it('undoes a castling move exactly', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    const startFen = game.fen;
    // d1-c3 is one of the knight moves available in this Chess960 start position.
    const first = game.play({ from: sq('d1'), to: sq('c3') });
    expect(first).not.toBeNull();
    game.undo();
    expect(game.fen).toBe(startFen);
    expect(game.moveRecords).toHaveLength(0);
  });

  it('round-trips through toState/fromState', () => {
    // Index 0 layout (king g1, rooks f1/h1, knights d1/e1). In the start position the d1 knight
    // is boxed in, the e1 knight can reach g2, and the exact state must survive serialisation.
    const position960 = Position.fromFen('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1');
    const knightMove = position960.resolveMove({ from: sq('e1'), to: sq('f3') });
    expect(knightMove).not.toBeNull();
    position960.play(knightMove!);
    const restored = Position.fromState(position960.toState());
    expect(restored.toFen()).toBe(position960.toFen());
    expect(restored.repetitionKey()).toBe(position960.repetitionKey());
    expect(restored.castlingFiles).toEqual(position960.castlingFiles);
    expect(restored.rights).toEqual(position960.rights);
  });

  it('prints a readable board for debugging', () => {
    const start = Position.standard();
    expect(algebraic(start.kingSquare('white')!)).toBe('e1');
    expect(start.debugAt(sq('e1'))).toBe('K');
    expect(start.debugAt(sq('e8'))).toBe('k');
    expect(start.debugAt(sq('e4'))).toBe('.');
  });
});
