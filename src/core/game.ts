import { algebraic } from './squares';
import { buildPgn, moveToSan, replaySans } from './notation';
import type { PgnOptions, PgnResult } from './notation';
import {
  backRankFromFen,
  backRankToStartFen,
  generatePosition,
  indexFromBackRank,
  normalizeBackRank,
  startCastlingContext,
} from './chess960/generate';
import { Position } from './position';
import type { CastlingFiles, PositionStateData } from './position';
import { evaluatePosition, isGameOver } from './rules';
import type { Color, GameStatus, Move } from './types';

/** Castling grid (king + rook home files) of a Chess960 start position. */
export function startCastlingFilesFromBackRank(backRank: string): {
  white: CastlingFiles;
  black: CastlingFiles;
} {
  const context = startCastlingContext(backRank);
  return {
    white: {
      king: context.kingFiles.white,
      kingRook: context.rookFiles.white.king,
      queenRook: context.rookFiles.white.queen,
    },
    black: {
      king: context.kingFiles.black,
      kingRook: context.rookFiles.black.king,
      queenRook: context.rookFiles.black.queen,
    },
  };
}

export interface GameRecord {
  /** 0-based ply index. */
  index: number;
  move: Move;
  san: string;
  /** FEN *after* the move. */
  fen: string;
  /** Repetition key of the position before the move. */
  before: string;
  /** Repetition key after the move. */
  after: string;
  /**
   * Exact state of the position *before* this move was played. `Game.undo` restores from this
   * rather than from `Position.undo()`, which only keeps one level of history (and would be
   * invalidated by any intervening legality probe).
   */
  stateBefore: PositionStateData;
}

export interface GameOptions {
  /** Chess960 back rank (e.g. "nrbbqknr"). */
  backRank?: string;
  /** Scharnagl index 0..959; random when omitted together with `startFen`/`backRank`. */
  index?: number;
  /** Explicit starting FEN. */
  startFen?: string;
  /** Standard chess instead of Chess960 (used by tests and the "standard" mode). */
  standard?: boolean;
  /**
   * King / rook home files of the position the FEN was reached from. Supplying this keeps the
   * castling grid exact even when the FEN's king no longer stands on its home square (a saved
   * mid-game position, for instance), which a bare board can no longer tell us.
   */
  castlingFiles?: { white: CastlingFiles; black: CastlingFiles };
}

export interface GameSnapshot {
  version: 1;
  startFen: string;
  startBackRank: string | null;
  startIndex: number | null;
  standard: boolean;
  /** Castling grid of the start position (kept so the snapshot replays exactly). */
  castlingFiles?: { white: CastlingFiles; black: CastlingFiles };
  moves: Array<{
    from: number;
    to: number;
    promotion?: string;
    castle?: string;
    enPassant?: boolean;
    doublePush?: boolean;
  }>;
}

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * A complete game: start position, move history with SAN, undo, resignation and status.
 * The embedded `Position` is the single source of truth and every mutation goes through
 * this class — the UI never touches the board directly.
 */
export class Game {
  position: Position;
  /** Starting FEN (Shredder-FEN castling field for Chess960). */
  readonly startFen: string;
  readonly startBackRank: string | null;
  readonly startIndex: number | null;
  readonly standard: boolean;

  private records: GameRecord[] = [];
  private repetitionKeys: string[] = [];
  private resignedBy: Color | null = null;
  private statusCache: GameStatus | null = null;

  constructor(options: GameOptions = {}) {
    if (options.standard) {
      this.standard = true;
      this.startFen = STANDARD_START_FEN;
      this.startBackRank = 'rnbqkbnr';
      this.startIndex = 518; // the standard setup is Chess960 index 518
      this.position = Position.standard();
    } else if (options.startFen) {
      const backRank = backRankFromFen(options.startFen);
      this.standard = backRank === 'rnbqkbnr';
      this.startFen = options.startFen;
      this.startBackRank = backRank;
      this.startIndex = backRank ? indexFromBackRank(backRank) : null;
      this.position = Position.fromFen(options.startFen, {
        ...(options.castlingFiles ? { castlingFiles: options.castlingFiles } : {}),
      });
    } else {
      const backRank = options.backRank ? normalizeBackRank(options.backRank) : null;
      if (options.backRank && !backRank) throw new Error(`Invalid Chess960 back rank: "${options.backRank}"`);
      const generated = backRank
        ? { index: indexFromBackRank(backRank), backRank, startFen: backRankToStartFen(backRank) }
        : generatePosition(options.index === undefined ? {} : { index: options.index });
      this.standard = generated.backRank === 'rnbqkbnr';
      this.startFen = generated.startFen;
      this.startBackRank = generated.backRank;
      this.startIndex = generated.index;
      // Chess960 castling must be spelled out: the king file alone does not tell us which
      // rooks are the castling rooks (that is the whole point of the variant).
      this.position = Position.fromFen(generated.startFen, {
        castlingFiles: startCastlingFilesFromBackRank(generated.backRank),
      });
    }
    this.repetitionKeys = [this.position.repetitionKey()];
  }

  get turn(): Color {
    return this.position.turn;
  }

  get fen(): string {
    return this.position.toFen();
  }

  /** Repetition keys of every position reached so far, starting with the start position. */
  get positions(): readonly string[] {
    return this.repetitionKeys;
  }

  get moveRecords(): readonly GameRecord[] {
    return this.records;
  }

  get moves(): Move[] {
    return this.records.map((record) => record.move);
  }

  get sans(): string[] {
    return this.records.map((record) => record.san);
  }

  get length(): number {
    return this.records.length;
  }

  get lastMove(): Move | null {
    return this.records.length > 0 ? this.records[this.records.length - 1]!.move : null;
  }

  get lastSan(): string | null {
    return this.records.length > 0 ? this.records[this.records.length - 1]!.san : null;
  }

  get canUndo(): boolean {
    return this.records.length > 0;
  }

  /** Current game status (cached until the position changes). */
  get status(): GameStatus {
    if (this.resignedBy) {
      return {
        state: 'resigned',
        winner: this.resignedBy === 'white' ? 'black' : 'white',
        reason: 'resignation',
        check: this.position.isCheck(),
      };
    }
    if (!this.statusCache) this.statusCache = evaluatePosition(this.position, this.repetitionKeys.slice(0, -1));
    return this.statusCache;
  }

  get isOver(): boolean {
    return this.status.state === 'resigned' || isGameOver(this.status);
  }

  /** Legal moves; with `from` only the moves of that piece. */
  legalMoves(from?: number): Move[] {
    if (this.isOver) return [];
    return from === undefined ? this.position.legalMoves() : this.position.legalMoves({ only: from });
  }

  /** Resolve an external move description (click, UCI, PGN) against the current position. */
  resolve(move: { from: number; to: number; promotion?: Move['promotion']; castle?: Move['castle'] }): Move | null {
    if (this.isOver) return null;
    return this.position.resolveMove(move);
  }

  /**
   * Play a move. Returns the record (with SAN), or null when the move is illegal or the game
   * is already over. Accepts internal moves as well as loose `{ from, to }` descriptions.
   */
  play(
    move: Move | { from: number; to: number; promotion?: Move['promotion']; castle?: Move['castle'] },
  ): GameRecord | null {
    if (this.isOver) return null;
    const resolved = this.position.resolveMove(move);
    if (!resolved) return null;
    const san = moveToSan(this.position, resolved);
    const before = this.position.repetitionKey();
    const stateBefore = this.position.toState();
    const played = this.position.play(resolved);
    const after = this.position.repetitionKey();
    const record: GameRecord = {
      index: this.records.length,
      move: played,
      san,
      fen: this.position.toFen(),
      before,
      after,
      stateBefore,
    };
    this.records.push(record);
    this.repetitionKeys.push(after);
    this.statusCache = null;
    return record;
  }

  /**
   * Undo the last move; returns the removed record, or null when at the start position.
   * The position is rebuilt from the record's stored state, so repeated undos and intervening
   * legality probes cannot desynchronise the history.
   */
  undo(): GameRecord | null {
    if (this.resignedBy) {
      this.resignedBy = null;
      this.statusCache = null;
      return null;
    }
    const record = this.records.pop();
    if (!record) return null;
    this.repetitionKeys.pop();
    this.position = Position.fromState(record.stateBefore);
    this.statusCache = null;
    return record;
  }

  /** Undo `count` moves (e.g. "my move plus the engine's reply"). */
  undoMany(count: number): GameRecord[] {
    const undone: GameRecord[] = [];
    for (let i = 0; i < count; i += 1) {
      const record = this.undo();
      if (!record) break;
      undone.push(record);
    }
    return undone;
  }

  resign(color: Color = this.position.turn): void {
    if (this.isOver) return;
    this.resignedBy = color;
    this.statusCache = null;
  }

  /** Force a result for draws by agreement. */
  agreeDraw(): void {
    if (this.isOver) return;
    this.resignedBy = null;
    this.statusCache = { state: 'draw', reason: 'agreement', check: this.position.isCheck() };
  }

  get result(): PgnResult {
    const status = this.status;
    if (status.state === 'checkmate' || status.state === 'resigned' || status.state === 'timeout') {
      return status.winner === 'white' ? '1-0' : '0-1';
    }
    if (status.state === 'draw' || status.state === 'stalemate') return '1/2-1/2';
    return '*';
  }

  /** PGN of the game so far (Chess960 headers are added automatically). */
  toPgn(options: Partial<PgnOptions> = {}): string {
    return buildPgn({
      ...options,
      startFen: this.startFen,
      sans: this.sans,
      result: options.result ?? this.result,
      extraHeaders: {
        ...(!this.standard && this.startIndex !== null ? { Chess960Index: String(this.startIndex) } : {}),
        ...(!this.standard && this.startBackRank ? { Chess960BackRank: this.startBackRank } : {}),
        ...options.extraHeaders,
      },
    });
  }

  /** Load a game from PGN headers + SAN movetext. */
  static fromPgn(startFen: string, sans: string[]): { game: Game; failedAt: number | null } {
    const backRank = backRankFromFen(startFen);
    const game = new Game({
      startFen,
      ...(backRank
        ? { castlingFiles: startCastlingFilesFromBackRank(backRank) }
        : {}),
    });
    const replay = replaySans(startFen, sans);
    for (const move of replay.moves) game.play(move);
    return { game, failedAt: replay.failedAt };
  }

  /** Serialisable snapshot for localStorage / URL sharing. */
  toSnapshot(): GameSnapshot {
    return {
      version: 1,
      startFen: this.startFen,
      startBackRank: this.startBackRank,
      startIndex: this.startIndex,
      standard: this.standard,
      castlingFiles: {
        white: { ...this.position.castlingFiles.white },
        black: { ...this.position.castlingFiles.black },
      },
      moves: this.records.map((record) => ({
        from: record.move.from,
        to: record.move.to,
        ...(record.move.promotion ? { promotion: record.move.promotion } : {}),
        ...(record.move.castle ? { castle: record.move.castle } : {}),
        ...(record.move.enPassant ? { enPassant: true } : {}),
        ...(record.move.doublePush ? { doublePush: true } : {}),
      })),
    };
  }

  static fromSnapshot(snapshot: GameSnapshot): Game {
    const game = new Game({
      startFen: snapshot.startFen,
      ...(snapshot.castlingFiles ? { castlingFiles: snapshot.castlingFiles } : {}),
    });
    for (const move of snapshot.moves) {
      const played = game.play({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion as Move['promotion'] } : {}),
        ...(move.castle ? { castle: move.castle as Move['castle'] } : {}),
      });
      if (!played) break; // stop at the first inconsistent move instead of corrupting the game
    }
    return game;
  }

  /** Debug helper: "1. e4 e5 2. Nf3". */
  toMovetext(): string {
    const parts: string[] = [];
    for (let index = 0; index < this.records.length; index += 2) {
      const number = Math.floor(index / 2) + 1;
      const white = this.records[index]?.san ?? '';
      const black = this.records[index + 1]?.san;
      parts.push(black === undefined ? `${number}. ${white}` : `${number}. ${white} ${black}`);
    }
    return parts.join(' ');
  }

  /** Human readable description of the last move, used in test output. */
  describeLastMove(): string {
    const last = this.records[this.records.length - 1];
    if (!last) return '(start)';
    return `${last.san} (${algebraic(last.move.from)}-${algebraic(last.move.to)})`;
  }
}

export { generatePosition, backRankFromFen, backRankToStartFen, normalizeBackRank, evaluatePosition };
export type { Color, GameStatus, Move, PgnResult };
