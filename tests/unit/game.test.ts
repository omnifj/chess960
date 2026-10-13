import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { parsePgn } from '../../src/core/notation';
import { Position } from '../../src/core/position';
import { backRankToStartFen, indexFromBackRank } from '../../src/core/chess960/generate';
import { claimableDraw, evaluatePosition, evaluateStatus } from '../../src/core/rules';
import { algebraic, squareFromAlgebraic } from '../../src/core/squares';

function sq(name: string): number {
  const value = squareFromAlgebraic(name);
  if (value === null) throw new Error(`bad square ${name}`);
  return value;
}

/** Play one move, failing loudly when it is not legal. */
function play(game: Game, from: string, to: string): void {
  if (!game.play({ from: sq(from), to: sq(to) })) throw new Error(`illegal move ${from}-${to} in ${game.fen}`);
}

function playAll(game: Game, moves: ReadonlyArray<readonly [string, string]>): void {
  for (const [from, to] of moves) play(game, from, to);
}

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Shredder-FEN spelling of the standard start position, which is how Position serialises it. */
const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w AHah - 0 1';
const STANDARD_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b AHah e3 0 1';
/** Chess960 index 0 "bbqnnrkr": rooks f1/h1, king g1 (a non-standard castling grid). */
const CHESS960_START_FEN = 'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w FHfh - 0 1';
const CHESS960_AFTER_CASTLE = 'bbqn2kr/ppppprpp/5n2/5p2/5P2/5N2/PPPPPRPP/BBQN1RK1 b h - 5 4';

/** A short legal game on the index-0 layout: both sides castle with the king staying on g1/g8. */
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

/** Fool's mate in standard chess (1. f3 e5 2. g4 Qh4#). */
const FOOLS_MATE: ReadonlyArray<readonly [string, string]> = [
  ['f2', 'f3'],
  ['e7', 'e5'],
  ['g2', 'g4'],
  ['d8', 'h4'],
];

const DATE = new Date(2024, 0, 2);

describe('Game construction', () => {
  it('builds the standard game from index 518', () => {
    const game = new Game({ index: 518 });
    expect(game.startIndex).toBe(518);
    expect(game.startBackRank).toBe('rnbqkbnr');
    expect(game.standard).toBe(true);
    expect(indexFromBackRank(game.startBackRank!)).toBe(518);
    expect(game.startFen).toBe(backRankToStartFen('rnbqkbnr'));
    expect(game.fen).toBe(game.startFen);
    expect(game.turn).toBe('white');
    expect(game.length).toBe(0);
    expect(game.canUndo).toBe(false);
    expect(game.lastMove).toBeNull();
    expect(game.lastSan).toBeNull();
    expect(game.toMovetext()).toBe('');
    expect(game.positions).toHaveLength(1);
    expect(game.status).toMatchObject({ state: 'playing', check: false });
  });

  it('builds a Chess960 game from an index', () => {
    const game = new Game({ index: 0 });
    expect(game.startIndex).toBe(0);
    expect(game.startBackRank).toBe('bbqnnrkr');
    expect(game.standard).toBe(false);
    expect(game.startFen).toBe(CHESS960_START_FEN);
    expect(game.fen).toBe(CHESS960_START_FEN);
  });

  it('builds a game from a back rank', () => {
    const game = new Game({ backRank: 'nrbbqknr' });
    expect(game.startBackRank).toBe('nrbbqknr');
    expect(game.startIndex).toBe(229);
    expect(game.standard).toBe(false);
    expect(game.startFen).toBe(backRankToStartFen('nrbbqknr'));
    expect(game.startFen).toBe('nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w BHbh - 0 1');
  });

  it('rejects an invalid back rank', () => {
    expect(() => new Game({ backRank: 'not-a-rank' })).toThrow(/Invalid Chess960 back rank/);
  });

  it('builds a game from an explicit start FEN', () => {
    const game = new Game({ startFen: CHESS960_START_FEN });
    expect(game.startFen).toBe(CHESS960_START_FEN);
    expect(game.fen).toBe(CHESS960_START_FEN);
    expect(game.startBackRank).toBe('bbqnnrkr');
    expect(game.startIndex).toBe(0);
    expect(game.standard).toBe(false);
    // The standard layout supplied as a FEN is still standard chess.
    expect(new Game({ startFen: STANDARD_START_FEN }).standard).toBe(true);
  });

  it('builds a standard game with `standard: true`', () => {
    const game = new Game({ standard: true });
    expect(game.standard).toBe(true);
    expect(game.startFen).toBe(STANDARD_START_FEN);
    expect(game.startBackRank).toBe('rnbqkbnr');
    expect(game.startIndex).toBe(518);
    // The PGN header keeps "KQkq", the live position uses the Shredder spelling.
    expect(game.fen).toBe(STANDARD_FEN);
  });
});

describe('Game.play', () => {
  it('plays a legal move and records SAN, FEN and repetition keys', () => {
    const game = new Game({ standard: true });
    const record = game.play({ from: sq('e2'), to: sq('e4') });
    expect(record).toMatchObject({ index: 0, san: 'e4' });
    expect(record!.move).toMatchObject({ from: sq('e2'), to: sq('e4'), doublePush: true });
    expect(record!.fen).toBe(STANDARD_AFTER_E4);
    expect(record!.before).toBe(game.positions[0]);
    expect(record!.after).toBe(game.positions[1]);
    expect(game.fen).toBe(STANDARD_AFTER_E4);
    expect(game.length).toBe(1);
    expect(game.canUndo).toBe(true);
    expect(game.lastSan).toBe('e4');
    expect(game.lastMove).toMatchObject({ from: sq('e2'), to: sq('e4') });
    expect(game.turn).toBe('black');
    expect(game.status.state).toBe('playing');
  });

  it('rejects illegal moves without touching the game', () => {
    const game = new Game({ standard: true });
    expect(game.play({ from: sq('e2'), to: sq('e5') })).toBeNull(); // not a pawn move
    expect(game.play({ from: sq('e7'), to: sq('e5') })).toBeNull(); // wrong side to move
    expect(game.play({ from: sq('e4'), to: sq('e5') })).toBeNull(); // empty square
    expect(game.play({ from: sq('e1'), to: sq('e2'), castle: 'king' })).toBeNull(); // bogus castling
    expect(game.length).toBe(0);
    expect(game.fen).toBe(STANDARD_FEN);
    expect(game.lastSan).toBeNull();
  });

  it('rejects every move once the game is over', () => {
    const game = new Game({ standard: true });
    playAll(game, FOOLS_MATE);
    expect(game.sans).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(game.isOver).toBe(true);
    expect(game.play({ from: sq('e1'), to: sq('e2') })).toBeNull();
    expect(game.legalMoves()).toEqual([]);
    expect(game.legalMoves(sq('e1'))).toEqual([]);
    expect(game.resolve({ from: sq('e1'), to: sq('e2') })).toBeNull();
  });
});

describe('Game move accessors', () => {
  it('exposes records, SANs, moves and the last move', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    playAll(game, SHORT_GAME.slice(0, 3));

    expect(game.sans).toEqual(['f4', 'f5', 'Nf3']);
    expect(game.length).toBe(3);
    expect(game.positions).toHaveLength(4);
    expect(game.moveRecords.map((record) => record.index)).toEqual([0, 1, 2]);
    expect(game.moveRecords.map((record) => record.san)).toEqual(game.sans);
    expect(game.moveRecords[2]!.fen).toBe(game.fen);
    expect(game.moveRecords[2]!.after).toBe(game.position.repetitionKey());
    expect(game.moveRecords[2]!.before).toBe(game.positions[2]);
    expect(game.moves.map((move) => algebraic(move.from))).toEqual(['f2', 'f7', 'e1']);
    expect(game.moves.map((move) => algebraic(move.to))).toEqual(['f4', 'f5', 'f3']);
    expect(game.lastMove).toMatchObject({ from: sq('e1'), to: sq('f3') });
    expect(game.lastSan).toBe('Nf3');
    expect(game.toMovetext()).toBe('1. f4 f5 2. Nf3');
    expect(game.describeLastMove()).toBe('Nf3 (e1-f3)');
    expect(game.legalMoves(sq('c7')).length).toBe(2); // c7-c6 and c7-c5 (black is to move)
    expect(game.legalMoves(sq('f5'))).toHaveLength(0); // blocked by the f4 pawn, no capture
    expect(game.legalMoves(sq('f4'))).toHaveLength(0); // white's pawn: not this side's turn
  });

  it('formats movetext in pairs', () => {
    const game = new Game({ standard: true });
    expect(game.toMovetext()).toBe('');
    play(game, 'e2', 'e4');
    expect(game.toMovetext()).toBe('1. e4');
    play(game, 'e7', 'e5');
    expect(game.toMovetext()).toBe('1. e4 e5');
    play(game, 'g1', 'f3');
    expect(game.toMovetext()).toBe('1. e4 e5 2. Nf3');
    expect(game.describeLastMove()).toBe('Nf3 (g1-f3)');
  });
});

describe('Game.undo / Game.undoMany', () => {
  it('restores the position, SAN list and repetition keys of the last move', () => {
    const game = new Game({ standard: true });
    playAll(game, [['e2', 'e4'], ['e7', 'e5']]);
    const positionsBefore = [...game.positions];
    const fenAfterE5 = game.fen;

    const removed = game.undo();
    expect(removed).toMatchObject({ index: 1, san: 'e5' });
    expect(game.fen).toBe(STANDARD_AFTER_E4);
    expect(game.sans).toEqual(['e4']);
    expect(game.length).toBe(1);
    expect(game.positions).toEqual(positionsBefore.slice(0, -1));
    expect(game.lastSan).toBe('e4');
    expect(game.lastMove).toMatchObject({ from: sq('e2'), to: sq('e4') });

    // The undone move can be played again and reproduces the same position.
    play(game, 'e7', 'e5');
    expect(game.fen).toBe(fenAfterE5);
    expect(game.sans).toEqual(['e4', 'e5']);
    expect(game.positions).toEqual(positionsBefore);
  });

  it('is exact across a castling move', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    playAll(game, SHORT_GAME.slice(0, 6));
    const beforeCastle = game.fen;
    const sansBefore = [...game.sans];

    const record = game.play({ from: sq('g1'), to: sq('h1') });
    expect(record?.san).toBe('O-O');
    expect(record?.move).toMatchObject({ from: sq('g1'), to: sq('g1'), castle: 'king' });
    expect(game.fen).toBe(CHESS960_AFTER_CASTLE);
    expect(game.position.hasCastlingRight('white', 'king')).toBe(false);

    game.undo();
    expect(game.fen).toBe(beforeCastle);
    expect(game.sans).toEqual(sansBefore);
    expect(game.length).toBe(6);
    expect(game.position.hasCastlingRight('white', 'king')).toBe(true);
    expect(game.position.castlingMove('king')).not.toBeNull();
  });

  it('still works after intervening legality queries', () => {
    const game = new Game({ standard: true });
    play(game, 'e2', 'e4');
    void game.status;
    game.legalMoves();
    game.resolve({ from: sq('e7'), to: sq('e5') });
    game.undo();
    expect(game.fen).toBe(STANDARD_FEN);
    expect(game.sans).toEqual([]);
    expect(game.length).toBe(0);
  });

  it('undoes back to the start position one move at a time', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    playAll(game, SHORT_GAME);

    const removed = game.undoMany(SHORT_GAME.length);
    expect(removed).toHaveLength(SHORT_GAME.length);
    expect(removed.map((record) => record.san)).toEqual([...SHORT_GAME_SANS].reverse());
    expect(game.fen).toBe(CHESS960_START_FEN);
    expect(game.sans).toEqual([]);
    expect(game.length).toBe(0);
    expect(game.canUndo).toBe(false);
    expect(game.positions).toHaveLength(1);
    expect(game.status.state).toBe('playing');
    expect(game.undo()).toBeNull();
  });

  it('undoMany(0) does nothing and undoMany(1) equals undo()', () => {
    const game = new Game({ standard: true });
    playAll(game, [['e2', 'e4'], ['e7', 'e5']]);
    expect(game.undoMany(0)).toEqual([]);
    expect(game.length).toBe(2);
    expect(game.undoMany(1).map((record) => record.san)).toEqual(['e5']);
    expect(game.fen).toBe(STANDARD_AFTER_E4);
  });

  it('undoMany stops at the start position', () => {
    const game = new Game({ standard: true });
    play(game, 'e2', 'e4');
    expect(game.undoMany(5)).toHaveLength(1);
    expect(game.undoMany(5)).toEqual([]);
    expect(game.fen).toBe(STANDARD_FEN);
  });

  it('undo clears a resignation instead of a move', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    play(game, 'f2', 'f4');
    game.resign('white');
    expect(game.status.state).toBe('resigned');

    expect(game.undo()).toBeNull(); // the resignation is not a move record
    expect(game.status.state).toBe('playing');
    expect(game.result).toBe('*');
    expect(game.length).toBe(1);
    expect(game.sans).toEqual(['f4']);
  });
});

describe('Game endings', () => {
  it('reports checkmate and its result', () => {
    const game = new Game({ standard: true });
    playAll(game, FOOLS_MATE);
    expect(game.lastSan).toBe('Qh4#');
    expect(game.status).toMatchObject({ state: 'checkmate', winner: 'black', reason: 'checkmate', check: true });
    expect(game.result).toBe('0-1');
    expect(game.isOver).toBe(true);
    expect(game.turn).toBe('white'); // the mated side is to move
  });

  it('reports stalemate and its result', () => {
    const game = new Game({ startFen: '7k/8/5K2/8/8/8/Q7/8 w - - 0 1' });
    play(game, 'a2', 'f7');
    expect(game.lastSan).toBe('Qf7');
    expect(game.position.isCheck()).toBe(false);
    expect(game.position.legalMoves()).toHaveLength(0);
    expect(game.status).toMatchObject({ state: 'stalemate', reason: 'stalemate', check: false });
    expect(game.result).toBe('1/2-1/2');
    expect(game.isOver).toBe(true);
  });

  it('resigns for the given colour, defaulting to the side to move', () => {
    const whiteResigns = new Game({ backRank: 'bbqnnrkr' });
    whiteResigns.resign('white');
    expect(whiteResigns.status).toMatchObject({ state: 'resigned', winner: 'black', reason: 'resignation' });
    expect(whiteResigns.result).toBe('0-1');
    expect(whiteResigns.isOver).toBe(true);
    expect(whiteResigns.play({ from: sq('f2'), to: sq('f4') })).toBeNull();

    const blackResigns = new Game({ backRank: 'bbqnnrkr' });
    blackResigns.resign('black');
    expect(blackResigns.result).toBe('1-0');

    // No argument: whoever is to move resigns.
    const toMoveResigns = new Game({ backRank: 'bbqnnrkr' });
    play(toMoveResigns, 'f2', 'f4'); // now black is to move
    toMoveResigns.resign();
    expect(toMoveResigns.status).toMatchObject({ state: 'resigned', winner: 'white' });
    expect(toMoveResigns.result).toBe('1-0');
  });

  it('draws by agreement', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    play(game, 'f2', 'f4');
    game.agreeDraw();
    expect(game.status).toMatchObject({ state: 'draw', reason: 'agreement' });
    expect(game.result).toBe('1/2-1/2');
    expect(game.isOver).toBe(true);
    expect(game.play({ from: sq('f7'), to: sq('f5') })).toBeNull();
    expect(game.legalMoves()).toEqual([]);

    // Taking the last move back also takes the agreement back.
    game.undo();
    expect(game.status.state).toBe('playing');
    expect(game.result).toBe('*');
    expect(game.fen).toBe(CHESS960_START_FEN);
  });
});

describe('Game draw rules', () => {
  const shuffle: ReadonlyArray<readonly [string, string]> = [
    ['g1', 'f3'],
    ['g8', 'f6'],
    ['f3', 'g1'],
    ['f6', 'g8'],
  ];

  it('detects threefold repetition', () => {
    const game = new Game({ standard: true });
    playAll(game, shuffle);
    expect(game.length).toBe(4);
    expect(game.status.state).toBe('playing'); // the start position has only occurred twice

    playAll(game, shuffle);
    expect(game.length).toBe(8);
    expect(game.positions.filter((key) => key === game.positions[0])).toHaveLength(3);
    expect(game.status).toMatchObject({ state: 'draw', reason: 'threefold', check: false });
    expect(game.result).toBe('1/2-1/2');
    expect(game.isOver).toBe(true);
    expect(evaluateStatus(game.position, game.positions.slice(0, -1))).toMatchObject({
      state: 'draw',
      reason: 'threefold',
    });
  });

  it('lets a player claim the fifty-move draw at 100 halfmoves', () => {
    const game = new Game({ startFen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 99 60' });
    play(game, 'a1', 'a2'); // a quiet rook move: no capture, no pawn move
    expect(game.position.halfmoves).toBe(100);
    expect(claimableDraw(game.position, game.positions.slice(0, -1))).toBe('fifty-move');
    // ...but it is only claimable: the game is not over until someone claims it.
    expect(game.status).toMatchObject({ state: 'playing' });
    expect(game.isOver).toBe(false);
    expect(game.result).toBe('*');
    expect(evaluatePosition(Position.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 100 60'), [])).toMatchObject({
      state: 'playing',
    });
    expect(claimableDraw(Position.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 100 60'), [])).toBe('fifty-move');
    // Below 100 halfmoves there is nothing to claim.
    expect(claimableDraw(Position.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 99 60'), [])).toBeNull();
  });

  it('draws automatically on the seventy-five-move rule', () => {
    const game = new Game({ startFen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 149 90' });
    play(game, 'a1', 'a2');
    expect(game.position.halfmoves).toBe(150);
    expect(game.status).toMatchObject({ state: 'draw', reason: 'seventy-five-move' });
    expect(game.result).toBe('1/2-1/2');
    expect(game.isOver).toBe(true);
    expect(evaluateStatus(game.position, game.positions.slice(0, -1))).toMatchObject({
      state: 'draw',
      reason: 'seventy-five-move',
    });
  });

  it('draws on insufficient material', () => {
    const game = new Game({ startFen: '4k3/8/8/8/8/8/8/3BK3 w - - 0 1' });
    expect(game.status).toMatchObject({ state: 'draw', reason: 'insufficient-material' });
    expect(game.result).toBe('1/2-1/2');
    expect(game.isOver).toBe(true);
    expect(game.play({ from: sq('d1'), to: sq('e2') })).toBeNull();
    expect(evaluatePosition(Position.fromFen('4k3/8/8/8/8/8/8/3BK3 w - - 0 1'), [])).toMatchObject({
      state: 'draw',
      reason: 'insufficient-material',
    });
  });
});

describe('Game snapshots', () => {
  it('round-trips a Chess960 game mid-way, keeping the non-standard castling grid', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    playAll(game, SHORT_GAME.slice(0, 7));

    const snapshot = game.toSnapshot();
    expect(snapshot).toMatchObject({
      version: 1,
      startFen: CHESS960_START_FEN,
      startBackRank: 'bbqnnrkr',
      startIndex: 0,
      standard: false,
    });
    expect(snapshot.castlingFiles).toEqual({
      white: { king: 6, kingRook: 7, queenRook: 5 },
      black: { king: 6, kingRook: 7, queenRook: 5 },
    });
    expect(snapshot.moves).toHaveLength(7);
    expect(snapshot.moves[0]).toMatchObject({ from: sq('f2'), to: sq('f4'), doublePush: true });
    expect(snapshot.moves[6]).toEqual({ from: sq('g1'), to: sq('g1'), castle: 'king' });

    const restored = Game.fromSnapshot(snapshot);
    expect(restored.fen).toBe(game.fen);
    expect(restored.sans).toEqual(game.sans);
    expect(restored.length).toBe(game.length);
    expect(restored.positions).toEqual(game.positions);
    expect(restored.startFen).toBe(game.startFen);
    expect(restored.startIndex).toBe(0);
    expect(restored.standard).toBe(false);
    expect(restored.position.castlingFiles).toEqual(game.position.castlingFiles);
    // White already castled king side, so only black's king-side right is left.
    expect(restored.position.castlingMove('king')).not.toBeNull();
    expect(restored.position.castlingMove('queen')).toBeNull();
  });

  it('stops at the first inconsistent move in a snapshot', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    play(game, 'f2', 'f4');
    const snapshot = game.toSnapshot();
    const corrupted = { ...snapshot, moves: [...snapshot.moves, { from: sq('a1'), to: sq('a2') }] };

    const restored = Game.fromSnapshot(corrupted);
    expect(restored.length).toBe(1);
    expect(restored.fen).toBe(game.fen);
    expect(restored.sans).toEqual(['f4']);
  });
});

describe('Game.toPgn', () => {
  it('writes the Result header of a finished standard game', () => {
    const game = new Game({ standard: true });
    playAll(game, FOOLS_MATE);
    const pgn = game.toPgn({ date: DATE });
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).not.toContain('Variant');
    expect(pgn).not.toContain('[SetUp');
    expect(pgn).toContain('1. f3 e5 2. g4 Qh4# 0-1');
    expect(parsePgn(pgn).result).toBe('0-1');
  });

  it('writes the Chess960 headers and the Result of a decided Chess960 game', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    play(game, 'f2', 'f4');
    game.resign('black');

    const pgn = game.toPgn({ date: DATE });
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[Variant "Chess960"]');
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${CHESS960_START_FEN}"]`);
    expect(pgn).toContain('[Chess960Index "0"]');
    expect(pgn).toContain('[Chess960BackRank "bbqnnrkr"]');
    expect(pgn).toContain('1. f4 1-0');
    expect(parsePgn(pgn).result).toBe('1-0');
  });

  it('writes 1/2-1/2 for a draw', () => {
    const game = new Game({ backRank: 'bbqnnrkr' });
    play(game, 'f2', 'f4');
    game.agreeDraw();
    expect(game.toPgn({ date: DATE })).toContain('[Result "1/2-1/2"]');
    expect(parsePgn(game.toPgn({ date: DATE })).result).toBe('1/2-1/2');
  });

  it('writes * for a game that is still running', () => {
    const game = new Game({ standard: true });
    play(game, 'e2', 'e4');
    expect(game.result).toBe('*');
    expect(game.toPgn({ date: DATE })).toContain('[Result "*"]');
    expect(parsePgn(game.toPgn({ date: DATE })).result).toBe('*');
  });
});
