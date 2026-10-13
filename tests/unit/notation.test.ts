import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import {
  buildPgn,
  isChess960StartFen,
  moveToSan,
  moveToUci,
  parsePgn,
  replaySans,
  sanToMove,
  uciToMove,
} from '../../src/core/notation';
import { Position } from '../../src/core/position';
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

/** Resolve a move in `fen` without playing it (the position `moveToSan` must be called on). */
function moveIn(
  fen: string,
  from: string,
  to: string,
  promotion?: Move['promotion'],
): { position: Position; move: Move } {
  const current = position(fen);
  const move = current.resolveMove({ from: sq(from), to: sq(to), ...(promotion ? { promotion } : {}) });
  if (!move) throw new Error(`illegal move ${from}-${to} in ${fen}`);
  return { position: current, move };
}

function sanOf(fen: string, from: string, to: string, promotion?: Move['promotion']): string {
  const { position: current, move } = moveIn(fen, from, to, promotion);
  return moveToSan(current, move);
}

function describeMove(move: Move | null): string {
  if (!move) return 'null';
  return `${algebraic(move.from)}${algebraic(move.to)}${move.promotion ?? ''}${move.castle ? ` castle:${move.castle}` : ''}`;
}

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Chess960 index 0 "bbqnnrkr": bishops a1/b1, queen c1, knights d1/e1, rooks f1/h1, king g1. */
const CHESS960_FEN = 'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFfh - 0 1';
const DATE = new Date(2024, 0, 2);

/** A short, legal game on the index-0 layout, ending with castling for both sides. */
const SHORT_GAME: ReadonlyArray<readonly [string, string]> = [
  ['f2', 'f4'],
  ['f7', 'f5'],
  ['e1', 'f3'],
  ['e8', 'f6'],
  ['f1', 'f2'],
  ['f8', 'f7'],
  ['g1', 'h1'],
  ['g8', 'h8'],
];
const SHORT_GAME_SANS = ['f4', 'f5', 'Nf3', 'Nf6', 'Rf2', 'Rf7', 'O-O', 'O-O'];

function playAll(game: Game, moves: ReadonlyArray<readonly [string, string]>): void {
  for (const [from, to] of moves) {
    if (!game.play({ from: sq(from), to: sq(to) })) throw new Error(`illegal move ${from}-${to} in ${game.fen}`);
  }
}

describe('moveToSan: pawn moves and captures', () => {
  it('writes pawn pushes and double pushes', () => {
    expect(sanOf(STANDARD_FEN, 'e2', 'e4')).toBe('e4');
    expect(sanOf(STANDARD_FEN, 'e2', 'e3')).toBe('e3');
    expect(sanOf(CHESS960_FEN, 'b2', 'b4')).toBe('b4');
  });

  it('writes captures with the origin file', () => {
    expect(sanOf('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'e4', 'd5')).toBe('exd5');
    // A b-file pawn capture starts with the same letter as the bishop, but SAN is lower case.
    expect(sanOf('4k3/8/8/8/8/2p5/1P6/4K3 w - - 0 1', 'b2', 'c3')).toBe('bxc3');
  });

  it('writes en passant like any other capture', () => {
    const { position: current, move } = moveIn('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5', 'd6');
    expect(move.enPassant).toBe(true);
    expect(moveToSan(current, move)).toBe('exd6');
  });

  it('writes piece moves and captures', () => {
    expect(sanOf(STANDARD_FEN, 'g1', 'f3')).toBe('Nf3');
    expect(sanOf('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', 'f3', 'e5')).toBe('Nxe5');
    expect(sanOf('r3k3/8/8/8/8/8/8/R3K3 w Q - 0 1', 'a1', 'a8')).toBe('Rxa8+');
  });
});

describe('moveToSan: disambiguation', () => {
  it('adds no hint when only one piece of that role can reach the square', () => {
    expect(sanOf('4k3/8/8/8/8/8/3N1N2/4K3 w - - 0 1', 'd2', 'b3')).toBe('Nb3');
  });

  it('uses the origin file when the rivals share the rank', () => {
    const fen = '4k3/8/8/8/8/8/3N1N2/4K3 w - - 0 1';
    expect(sanOf(fen, 'd2', 'e4')).toBe('Nde4');
    expect(sanOf(fen, 'f2', 'e4')).toBe('Nfe4');
  });

  it('uses the origin rank when the rivals share the file', () => {
    const fen = '4k3/8/8/1N6/8/8/8/1N2K3 w - - 0 1';
    expect(sanOf(fen, 'b1', 'c3')).toBe('N1c3');
    expect(sanOf(fen, 'b5', 'c3')).toBe('N5c3');
  });

  it('uses file and rank when one rival shares the file and another the rank', () => {
    // Queens on a1, a3 and c1 all reach b2: a1 shares the file with a3 and the rank with c1.
    const fen = '4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1';
    expect(sanOf(fen, 'a1', 'b2')).toBe('Qa1b2');
    // The two rivals each need only one hint against the others.
    expect(sanOf(fen, 'a3', 'b2')).toBe('Q3b2');
    expect(sanOf(fen, 'c1', 'b2')).toBe('Qcb2');
  });
});

describe('moveToSan: promotion', () => {
  const quiet = '8/P7/8/4k3/8/8/8/4K3 w - - 0 1';

  it('names the promotion piece', () => {
    expect(sanOf(quiet, 'a7', 'a8', 'q')).toBe('a8=Q');
    expect(sanOf(quiet, 'a7', 'a8', 'r')).toBe('a8=R');
    expect(sanOf(quiet, 'a7', 'a8', 'b')).toBe('a8=B');
    expect(sanOf(quiet, 'a7', 'a8', 'n')).toBe('a8=N');
  });

  it('keeps the origin file on a capture-promotion', () => {
    const capture = '1n4k1/P7/8/8/8/8/8/4K3 w - - 0 1';
    expect(sanOf(capture, 'a7', 'b8', 'q')).toBe('axb8=Q+'); // Qb8 checks the king on g8
    expect(sanOf(capture, 'a7', 'b8', 'r')).toBe('axb8=R+');
    expect(sanOf(capture, 'a7', 'b8', 'b')).toBe('axb8=B');
    expect(sanOf(capture, 'a7', 'b8', 'n')).toBe('axb8=N');
  });
});

describe('moveToSan: check and mate suffixes', () => {
  it('adds + for a check that is not mate', () => {
    expect(sanOf('k7/8/1Q6/8/8/8/8/K7 w - - 0 1', 'b6', 'b7')).toBe('Qb7+');
  });

  it('adds # for checkmate (also for a promotion mate)', () => {
    expect(sanOf('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'd8', 'h4')).toBe('Qh4#');
    expect(sanOf('8/P7/8/8/8/8/8/k1K5 w - - 0 1', 'a7', 'a8', 'q')).toBe('a8=Q#');
  });

  it('the mate suffix really is a mate', () => {
    const { position: current, move } = moveIn('8/P7/8/8/8/8/8/k1K5 w - - 0 1', 'a7', 'a8', 'q');
    current.play(move);
    expect(current.isCheck()).toBe(true);
    expect(current.legalMoves()).toHaveLength(0);
  });
});

describe('moveToSan: castling in Chess960 positions', () => {
  it('writes O-O when the king already stands on g1 and never moves', () => {
    // King g1 with the b1/h1 rooks: O-O only moves the h1 rook to f1, hopping over the king.
    const fen = 'k7/8/8/8/8/8/8/1R4KR w HB - 0 1';
    const { position: current, move } = moveIn(fen, 'g1', 'h1');
    expect(move).toMatchObject({ from: sq('g1'), to: sq('g1'), castle: 'king' });
    expect(moveToSan(current, move)).toBe('O-O');
    current.play(move);
    expect(current.roleAt(sq('g1'))).toBe('k'); // the king did not travel to g1, it was already there
    expect(current.roleAt(sq('f1'))).toBe('r');
    expect(current.roleAt(sq('h1'))).toBeNull();
  });

  it('writes O-O-O when a king on g1 travels to c1', () => {
    const fen = 'k7/8/8/8/8/8/8/1R4KR w HB - 0 1';
    const { position: current, move } = moveIn(fen, 'g1', 'b1'); // king-to-rook encoding
    expect(move).toMatchObject({ from: sq('g1'), to: sq('c1'), castle: 'queen' });
    expect(moveToSan(current, move)).toBe('O-O-O');
    current.play(move);
    expect(current.roleAt(sq('c1'))).toBe('k');
    expect(current.roleAt(sq('d1'))).toBe('r');
    expect(current.roleAt(sq('b1'))).toBeNull();
  });

  it('writes O-O / O-O-O when the king crosses the rook landing square', () => {
    // King b1 with rooks a1/h1: O-O walks the king across f1, where the h1 rook lands.
    const fen = '4k3/8/8/8/8/8/8/RK5R w HA - 0 1';
    expect(sanOf(fen, 'b1', 'h1')).toBe('O-O');
    expect(sanOf(fen, 'b1', 'a1')).toBe('O-O-O');
  });

  it('adds the check suffix to a castling move', () => {
    // O-O puts the rook on f1, which checks the black king on f8.
    expect(sanOf('5k2/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1', 'h1')).toBe('O-O+');
  });
});

describe('sanToMove', () => {
  it('resolves SAN back to the move it was generated from', () => {
    expect(sanToMove(position('4k3/8/8/8/8/8/3N1N2/4K3 w - - 0 1'), 'Nde4')).toMatchObject({
      from: sq('d2'),
      to: sq('e4'),
    });
    expect(sanToMove(position('4k3/8/8/1N6/8/8/8/1N2K3 w - - 0 1'), 'N5c3')).toMatchObject({
      from: sq('b5'),
      to: sq('c3'),
    });
    expect(sanToMove(position('4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1'), 'Qa1b2')).toMatchObject({
      from: sq('a1'),
      to: sq('b2'),
    });
    expect(sanToMove(position('4k3/8/8/8/8/2p5/1P6/4K3 w - - 0 1'), 'bxc3')).toMatchObject({
      from: sq('b2'),
      to: sq('c3'),
    });
    expect(sanToMove(position('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), 'exd6')).toMatchObject({
      from: sq('e5'),
      to: sq('d6'),
      enPassant: true,
    });
  });

  it('accepts the promotion forms moveToSan produces', () => {
    const quiet = position('8/P7/8/4k3/8/8/8/4K3 w - - 0 1');
    for (const [san, promotion] of [
      ['a8=Q', 'q'],
      ['a8=R', 'r'],
      ['a8=B', 'b'],
      ['a8=N', 'n'],
    ] as const) {
      expect(sanToMove(quiet, san)).toMatchObject({ from: sq('a7'), to: sq('a8'), promotion });
    }
    expect(sanToMove(position('1n4k1/P7/8/8/8/8/8/4K3 w - - 0 1'), 'axb8=Q')).toMatchObject({
      from: sq('a7'),
      to: sq('b8'),
      promotion: 'q',
    });
    // A promotion written without a role means a queen (the same default `resolveMove` uses).
    expect(sanToMove(position('8/P7/8/4k3/8/8/8/4K3 w - - 0 1'), 'a8')).toMatchObject({
      from: sq('a7'),
      to: sq('a8'),
      promotion: 'q',
    });
  });

  it('separates an upper-case piece capture from a lower-case pawn capture', () => {
    // Bishop b5 takes the c6 knight: only the upper-case reading is a move here.
    const italian = position('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    expect(sanToMove(italian, 'Bxc6')).toMatchObject({ from: sq('b5'), to: sq('c6') });
    expect(moveToSan(italian, sanToMove(italian, 'Bxc6')!)).toBe('Bxc6');

    // Both readings are legal here: 'Bxc3' is the a5 bishop, 'bxc3' the b2 pawn.
    const both = position('4k3/8/8/B7/8/2p5/1P6/4K3 w - - 0 1');
    expect(sanToMove(both, 'Bxc3')).toMatchObject({ from: sq('a5'), to: sq('c3') });
    expect(sanToMove(both, 'bxc3')).toMatchObject({ from: sq('b2'), to: sq('c3') });
    expect(moveToSan(both, sanToMove(both, 'Bxc3')!)).toBe('Bxc3');
    expect(moveToSan(both, sanToMove(both, 'bxc3')!)).toBe('bxc3');
  });

  it('accepts both castling spellings, with and without suffixes', () => {
    const fen = '5k2/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    for (const san of ['O-O', '0-0', 'o-o', 'O-O+!?']) {
      expect(sanToMove(position(fen), san), san).toMatchObject({ from: sq('e1'), to: sq('g1'), castle: 'king' });
    }
    for (const san of ['O-O-O', '0-0-0']) {
      expect(sanToMove(position(fen), san), san).toMatchObject({ from: sq('e1'), to: sq('c1'), castle: 'queen' });
    }
    // The en dash is accepted as a dash, like the em dash.
    expect(sanToMove(position(fen), 'O\u2013O')).toMatchObject({ castle: 'king' });
  });

  it('rejects nonsense and illegal moves', () => {
    const start = position(STANDARD_FEN);
    for (const san of ['', '   ', 'Zz9', 'xyz', 'e9', 'Ke9', 'Qh9', 'Qq4', 'Nf3x', 'Kxh8', 'Nf6']) {
      expect(sanToMove(start, san), san).toBeNull();
    }
    // Well-formed SAN that names no legal move in this position.
    expect(sanToMove(start, 'exd5')).toBeNull(); // nothing on d5 to capture
    expect(sanToMove(start, 'Bb5')).toBeNull(); // no bishop can reach b5 yet
    // Castling is not available here (the pieces are in the way / the right is gone).
    expect(sanToMove(start, 'O-O')).toBeNull();
    expect(sanToMove(position('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w - - 0 1'), 'O-O')).toBeNull();
  });
});

describe('sanToMove: round-trips a real Chess960 game', () => {
  it('re-parses every SAN against the position it was generated from', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    const generated: string[] = [];
    for (const [from, to] of SHORT_GAME) {
      const before = game.position;
      const move = before.resolveMove({ from: sq(from), to: sq(to) });
      expect(move, `${from}-${to} must be legal`).not.toBeNull();
      const san = moveToSan(before, move!);
      generated.push(san);

      const reparsed = sanToMove(before, san);
      expect(describeMove(reparsed), san).toBe(describeMove(move));
      expect(reparsed).toMatchObject({ from: move!.from, to: move!.to });

      expect(game.play(move!)).not.toBeNull();
    }
    expect(generated).toEqual(SHORT_GAME_SANS);
    expect(game.sans).toEqual(SHORT_GAME_SANS);
    // The same movetext replays from the start FEN without a failure.
    const replay = replaySans(game.startFen, generated);
    expect(replay.failedAt).toBeNull();
    expect(replay.moves).toHaveLength(SHORT_GAME.length);
    expect(replay.position.fen).toBe(game.fen);
  });

  it('replays an opening that contains a bishop capture', () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6'];
    const replay = replaySans(STANDARD_FEN, sans);
    expect(replay.failedAt).toBeNull();
    expect(replay.moves).toHaveLength(sans.length);
    expect(replay.moves[6]).toMatchObject({ from: sq('b5'), to: sq('c6') });
    // ...and the d7 pawn recaptured on c6.
    expect(replay.position.colorAt(sq('c6'))).toBe('black');
    expect(replay.position.roleAt(sq('c6'))).toBe('p');
  });
});

describe('uciToMove', () => {
  it('parses normal moves (case-insensitively)', () => {
    expect(uciToMove(position(STANDARD_FEN), 'e2e4')).toMatchObject({ from: sq('e2'), to: sq('e4') });
    expect(uciToMove(position(STANDARD_FEN), 'g1f3')).toMatchObject({ from: sq('g1'), to: sq('f3') });
    expect(uciToMove(position(STANDARD_FEN), 'E2E4')).toMatchObject({ from: sq('e2'), to: sq('e4') });
  });

  it('parses promotion moves', () => {
    expect(uciToMove(position('7k/4P3/8/8/8/8/8/4K3 w - - 0 1'), 'e7e8q')).toMatchObject({
      from: sq('e7'),
      to: sq('e8'),
      promotion: 'q',
    });
    const fen = '4k3/3P4/8/8/8/8/8/4K3 w - - 0 1';
    expect(uciToMove(position(fen), 'd7d8q')).toMatchObject({ from: sq('d7'), to: sq('d8'), promotion: 'q' });
    expect(uciToMove(position(fen), 'd7d8n')).toMatchObject({ from: sq('d7'), to: sq('d8'), promotion: 'n' });
    // Without a piece letter the engine promotes to a queen.
    expect(uciToMove(position(fen), 'd7d8')).toMatchObject({ promotion: 'q' });
  });

  it('parses the Chess960 king-to-rook castling encoding', () => {
    const standardBoard = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    expect(uciToMove(position(standardBoard), 'e1h1')).toMatchObject({
      from: sq('e1'),
      to: sq('g1'),
      castle: 'king',
    });
    expect(uciToMove(position(standardBoard), 'e1a1')).toMatchObject({
      from: sq('e1'),
      to: sq('c1'),
      castle: 'queen',
    });
    // The king-to-destination form is accepted too.
    expect(uciToMove(position(standardBoard), 'e1g1')).toMatchObject({ to: sq('g1'), castle: 'king' });

    const chess960 = '1k6/8/8/8/8/8/8/RK5R w HA - 0 1';
    expect(uciToMove(position(chess960), 'b1h1')).toMatchObject({ from: sq('b1'), to: sq('g1'), castle: 'king' });
    expect(uciToMove(position(chess960), 'b1a1')).toMatchObject({ from: sq('b1'), to: sq('c1'), castle: 'queen' });
  });

  it('returns null for "0000", "(none)" and malformed input', () => {
    const kings = position('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    for (const uci of ['0000', '(none)', 'null', '']) {
      expect(uciToMove(kings, uci), uci).toBeNull();
    }
    const start = position(STANDARD_FEN);
    for (const uci of ['e2e9', 'zz', 'e2', 'e2e4q2', 'e2e5']) {
      expect(uciToMove(start, uci), uci).toBeNull();
    }
  });
});

describe('moveToUci', () => {
  it('emits plain moves and promotions', () => {
    expect(moveToUci(position(STANDARD_FEN), moveIn(STANDARD_FEN, 'e2', 'e4').move)).toBe('e2e4');
    const { position: current, move } = moveIn('4k3/3P4/8/8/8/8/8/4K3 w - - 0 1', 'd7', 'd8', 'q');
    expect(moveToUci(current, move)).toBe('d7d8q');
  });

  it('emits the king-to-rook form for castling', () => {
    const standardBoard = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    expect(moveToUci(position(standardBoard), moveIn(standardBoard, 'e1', 'h1').move)).toBe('e1h1');
    expect(moveToUci(position(standardBoard), moveIn(standardBoard, 'e1', 'a1').move)).toBe('e1a1');

    const chess960 = '1k6/8/8/8/8/8/8/RK5R w HA - 0 1';
    expect(moveToUci(position(chess960), moveIn(chess960, 'b1', 'h1').move)).toBe('b1h1');
    expect(moveToUci(position(chess960), moveIn(chess960, 'b1', 'a1').move)).toBe('b1a1');

    // A king that already stands on its castling square still names the rook it takes.
    const stays = 'k7/8/8/8/8/8/8/1R4KR w HB - 0 1';
    expect(moveToUci(position(stays), moveIn(stays, 'g1', 'h1').move)).toBe('g1h1');
  });
});

describe('buildPgn', () => {
  it('adds Variant/SetUp/FEN headers for a Chess960 start position', () => {
    const pgn = buildPgn({ startFen: CHESS960_FEN, sans: ['f4', 'f5', 'Nf3'], result: '1-0', date: DATE });
    expect(pgn).toContain('[Variant "Chess960"]');
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${CHESS960_FEN}"]`);
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[Date "2024.01.02"]');
  });

  it('leaves standard chess without the Chess960 headers', () => {
    const pgn = buildPgn({ startFen: STANDARD_FEN, sans: ['e4', 'e5'], date: DATE });
    expect(pgn).not.toContain('Variant');
    expect(pgn).not.toContain('SetUp');
    expect(pgn).not.toContain('[FEN');
    expect(pgn).toContain('[Result "*"]');
  });

  it('numbers the movetext and ends it with the result', () => {
    const pgn = buildPgn({ startFen: STANDARD_FEN, sans: ['e4', 'e5', 'Nf3'], result: '1-0', date: DATE });
    expect(pgn.trimEnd().split('\n\n')[1]).toBe('1. e4 e5 2. Nf3 1-0');
    // An odd number of plies leaves the last move unpaired.
    expect(buildPgn({ startFen: STANDARD_FEN, sans: ['e4'], date: DATE })).toContain('\n\n1. e4 *\n');
    // No moves at all: just the result.
    expect(buildPgn({ startFen: STANDARD_FEN, sans: [], date: DATE })).toContain('\n\n*\n');
  });

  it('keeps a custom start FEN verbatim', () => {
    const customFen = 'bbqnnrkr/pppppppp/8/8/5P2/8/PPPPP1PP/BBQNNRKR b FHfh f3 0 1';
    const pgn = buildPgn({ startFen: customFen, sans: ['f5', 'Nf3'], result: '*', date: DATE });
    expect(pgn).toContain(`[FEN "${customFen}"]`);
    expect(parsePgn(pgn).startFen).toBe(customFen);
    expect(parsePgn(pgn).sans).toEqual(['f5', 'Nf3']);
  });

  it('wraps the movetext at lineWidth and disables wrapping at 0', () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
    const movetext = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 1/2-1/2';

    const wrapped = buildPgn({ startFen: STANDARD_FEN, sans, result: '1/2-1/2', lineWidth: 20, date: DATE });
    const lines = wrapped.trimEnd().split('\n\n')[1]!.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20);
    expect(lines.join(' ')).toBe(movetext);

    const unwrapped = buildPgn({ startFen: STANDARD_FEN, sans, result: '1/2-1/2', lineWidth: 0, date: DATE });
    expect(unwrapped.trimEnd().split('\n\n')[1]).toBe(movetext);
  });

  it('escapes quotes in header values', () => {
    expect(buildPgn({ startFen: STANDARD_FEN, sans: [], white: 'He said "hi"', date: DATE })).toContain(
      '[White "He said \'hi\'"]',
    );
  });
});

describe('parsePgn and Game.fromPgn', () => {
  it('round-trips a complete Chess960 game', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    playAll(game, SHORT_GAME);

    const pgn = game.toPgn({ result: '1-0', date: DATE });
    const parsed = parsePgn(pgn);
    expect(parsed.headers['Variant']).toBe('Chess960');
    expect(parsed.headers['SetUp']).toBe('1');
    expect(parsed.headers['Result']).toBe('1-0');
    expect(parsed.headers['Chess960Index']).toBe('0');
    expect(parsed.startFen).toBe(game.startFen);
    expect(parsed.sans).toEqual(SHORT_GAME_SANS);
    expect(parsed.result).toBe('1-0');

    const { game: restored, failedAt } = Game.fromPgn(parsed.startFen!, parsed.sans);
    expect(failedAt).toBeNull();
    expect(restored.sans).toEqual(game.sans);
    expect(restored.fen).toBe(game.fen);
    expect(restored.length).toBe(game.length);
    expect(restored.startIndex).toBe(0);
    expect(restored.startBackRank).toBe('bbqnnrkr');
    expect(restored.standard).toBe(false);
  });

  it('strips comments, variations and annotations, and keeps the result', () => {
    const parsed = parsePgn(`[Event "X"]
[Result "0-1"]

1. e4 {comment} e5 ; trailing
2. Nf3 $1 (2. Bc4 Nf6) Nc6 0-1`);
    expect(parsed.headers).toEqual({ Event: 'X', Result: '0-1' });
    expect(parsed.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(parsed.result).toBe('0-1');
    expect(parsed.startFen).toBeNull();
  });
});

describe('isChess960StartFen', () => {
  it('is false for the standard start position', () => {
    expect(isChess960StartFen(STANDARD_FEN)).toBe(false);
    // The Shredder-FEN spelling of the same layout is still standard chess.
    expect(isChess960StartFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1')).toBe(false);
    // ...and so is a later position whose back rank is untouched.
    expect(isChess960StartFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(false);
  });

  it('is true for a Chess960 start position', () => {
    expect(isChess960StartFen(CHESS960_FEN)).toBe(true);
    expect(isChess960StartFen('nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w BHbh - 0 1')).toBe(true);
    expect(isChess960StartFen('not a fen')).toBe(false);
  });
});
