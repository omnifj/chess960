import { create } from 'zustand';
import { Game } from '../core/game';
import type { GameSnapshot, GameRecord } from '../core/game';
import { evaluatePosition, claimableDraw } from '../core/rules';
import { backRankFromFen, generatePosition, normalizeBackRank } from '../core/chess960/generate';
import { Position } from '../core/position';
import { opposite } from '../core/squares';
import { clearGame, loadGame, saveGame } from '../utils/storage';
import { asMessage } from '../i18n/translate';
import type { MessageDescriptor } from '../i18n/messages';
import type { Color, DrawReason, GameStatus, Move, Role, Square } from '../core/types';
import type { EngineLevelName } from '../core/engine/protocol';

export type GameMode = 'local' | 'ai';

export interface PromotionRequest {
  from: Square;
  to: Square;
  /** Legal promotion roles, always in the order queen, rook, bishop, knight. */
  options: Role[];
}

export interface ClockState {
  /** Remaining milliseconds per colour. */
  remaining: { white: number; black: number };
  /** Timestamp (ms) when the side to move last changed, or null when the clock is idle. */
  activeSince: number | null;
  baseMs: number;
  incrementMs: number;
}

export interface GameStoreState {
  /** The live game object (mutated in place; `version` is bumped on every change). */
  game: Game;
  /** Incremented on every mutation so React re-renders. */
  version: number;
  /**
   * Denormalised copies of the hot game facts. They exist so components (and effects) can
   * subscribe to a primitive that only changes when the fact changes, instead of to the mutable
   * `game` object — which would re-render (or re-run an effect) on every single move.
   */
  fen: string;
  turn: Color;
  over: boolean;
  /** Number of plies played. */
  moveCount: number;
  selected: Square | null;
  /** Legal moves of the selected square. */
  legalMoves: Move[];
  promotion: PromotionRequest | null;
  orientation: Color;
  mode: GameMode;
  playerColor: Color;
  aiLevel: EngineLevelName;
  isAiThinking: boolean;
  /** Engine suggestion for the current position (P1 "hint" feature). */
  hint: Move | null;
  /** Non-fatal message shown in the status bar (engine problems, clipboard failures...). */
  message: MessageDescriptor | null;
  clock: ClockState;

  newGame: (options?: {
    index?: number;
    backRank?: string;
    startFen?: string;
    mode?: GameMode;
    playerColor?: Color;
    aiLevel?: EngineLevelName;
    keepOrientation?: boolean;
  }) => void;
  restart: () => void;
  selectSquare: (square: Square | null) => void;
  /** Select a square without the "is it my piece?" check (used by the AI plumbing). */
  setSelected: (square: Square | null) => void;
  tryMove: (from: Square, to: Square, promotion?: Role) => GameRecord | null;
  completePromotion: (role: Role | null) => void;
  undo: () => number;
  resign: (color?: Color) => void;
  agreeDraw: () => void;
  claimDraw: () => DrawReason | null;
  flipBoard: () => void;
  setOrientation: (color: Color) => void;
  setPlayerColor: (color: Color) => void;
  setAiLevel: (level: EngineLevelName) => void;
  setMode: (mode: GameMode) => void;
  setThinking: (thinking: boolean) => void;
  setHint: (move: Move | null) => void;
  setMessage: (message: MessageDescriptor | null) => void;
  /** Re-evaluate and bump the version after an external mutation (e.g. the AI played). */
  refresh: () => void;
  /** Refresh the denormalised view fields (`fen`, `turn`, `over`, `moveCount`) and bump `version`. */
  syncView: () => void;
  /** Load a FEN or PGN body as a new game, reporting whether it worked. */
  loadFen: (fen: string) => boolean;
  setClock: (baseMinutes: number, incrementSeconds: number, enabled: boolean) => void;
  /** Apply the increment to the player who just moved and hand the clock over. */
  resetClockForNextMove: () => void;
  /** Re-anchor the clock after an undo, without granting an increment. */
  restartClockForCurrentTurn: () => void;
  tickClock: (now?: number) => Color | null;
  /** Recompute remaining time and freeze the clock (e.g. while the tab is hidden). */
  pauseClock: (now?: number) => void;
  resumeClock: (now?: number) => void;
  status: () => GameStatus;
  /** Read the colour to move. Prefer the `turn` field for rendering (cheap to compare). */
  turnOf: () => Color;
  isAiTurn: () => boolean;
  /** True when the human may move right now. */
  canHumanMove: () => boolean;
  legalMovesFrom: (square: Square) => Move[];
  lastMove: () => Move | null;
  /** Read the current FEN. Prefer the `fen` field for rendering. */
  fenString: () => string;
  pgn: () => string;
  snapshot: () => GameSnapshot;
  persist: () => void;
}

function createDefaultClock(): ClockState {
  return { remaining: { white: 0, black: 0 }, activeSince: null, baseMs: 0, incrementMs: 0 };
}

/** Restore the persisted game, falling back to a fresh random Chess960 position. */
function initialGame(): Game {
  const persisted = loadGame<GameSnapshot>();
  if (persisted && typeof persisted === 'object' && Array.isArray(persisted.moves) && typeof persisted.startFen === 'string') {
    try {
      return Game.fromSnapshot({ ...persisted, version: 1 });
    } catch {
      clearGame();
    }
  }
  return new Game({ index: generatePosition().index });
}

export const useGameStore = create<GameStoreState>()((set, get) => ({
  game: initialGame(),
  version: 0,
  // Seeded from the initial game below so a subscriber never sees an empty FEN.
  fen: '',
  turn: 'white',
  over: false,
  moveCount: 0,
  selected: null,
  legalMoves: [],
  promotion: null,
  orientation: 'white',
  mode: 'local',
  playerColor: 'white',
  aiLevel: 'medium',
  isAiThinking: false,
  hint: null,
  message: null,
  clock: createDefaultClock(),

  newGame: (options = {}) => {
    const state = get();
    const game = options.startFen
      ? new Game({ startFen: options.startFen })
      : options.backRank
        ? new Game({ backRank: options.backRank })
        : new Game({ index: options.index ?? generatePosition().index });
    const playerColor = options.playerColor ?? state.playerColor;
    set({
      game,
      selected: null,
      legalMoves: [],
      promotion: null,
      hint: null,
      message: null,
      mode: options.mode ?? state.mode,
      playerColor,
      aiLevel: options.aiLevel ?? state.aiLevel,
      orientation: options.keepOrientation ? state.orientation : playerColor,
    });
    get().syncView();
    get().persist();
  },

  restart: () => {
    const state = get();
    get().newGame({
      index: state.game.startIndex ?? undefined,
      mode: state.mode,
      playerColor: state.playerColor,
      aiLevel: state.aiLevel,
      keepOrientation: true,
    });
  },

  selectSquare: (square) => {
    const state = get();
    if (square === null) {
      set({ selected: null, legalMoves: [] });
      return;
    }
    const piece = state.game.position.pieceAt(square);
    if (!piece || piece.color !== state.game.turn) {
      set({ selected: null, legalMoves: [] });
      return;
    }
    const moves = state.game.legalMoves(square);
    set({ selected: square, legalMoves: moves });
  },

  setSelected: (square) => set({ selected: square, legalMoves: [] }),

  tryMove: (from, to, promotion) => {
    const state = get();
    if (!get().canHumanMove()) return null;
    const candidates = state.game.legalMoves(from).filter((move) => move.to === to || (move.castle && move.to === to));
    if (candidates.length === 0) {
      set({ selected: null, legalMoves: [] });
      return null;
    }
    const needsPromotion = candidates.some((move) => move.promotion !== undefined);
    if (needsPromotion && !promotion) {
      const options: Role[] = [];
      for (const role of ['q', 'r', 'b', 'n'] as const) {
        if (candidates.some((move) => move.promotion === role)) options.push(role);
      }
      set({ promotion: { from, to, options }, selected: from, legalMoves: candidates });
      return null;
    }
    const record = state.game.play({
      from,
      to,
      ...(promotion ? { promotion } : {}),
    });
    if (!record) {
      set({ selected: null, legalMoves: [], promotion: null });
      return null;
    }
    set({ selected: null, legalMoves: [], promotion: null, hint: null });
    get().syncView();
    get().resetClockForNextMove();
    get().persist();
    return record;
  },

  completePromotion: (role) => {
    const state = get();
    const request = state.promotion;
    if (!request) return;
    if (role === null) {
      set({ promotion: null, selected: null, legalMoves: [] });
      return;
    }
    set({ promotion: null });
    get().tryMove(request.from, request.to, role);
  },

  undo: () => {
    const state = get();
    if (state.isAiThinking) return 0;
    // In AI mode undo the engine's reply as well, so the human is back on move.
    const aiMode = state.mode === 'ai';
    let undone = 0;
    if (aiMode) {
      // If the engine is on move, a single ply restores the human's turn; otherwise two.
      const plies = state.game.turn !== state.playerColor ? 2 : 1;
      undone = state.game.undoMany(Math.min(plies, state.game.length)).length;
    } else {
      undone = state.game.undoMany(1).length;
    }
    if (undone === 0) return 0;
    set({ selected: null, legalMoves: [], promotion: null, hint: null });
    get().syncView();
    get().restartClockForCurrentTurn();
    get().persist();
    return undone;
  },

  resign: (color) => {
    const state = get();
    state.game.resign(color ?? state.game.turn);
    set({ selected: null, legalMoves: [], promotion: null, hint: null });
    get().syncView();
    get().pauseClock();
    get().persist();
  },

  agreeDraw: () => {
    const state = get();
    state.game.agreeDraw();
    set({ selected: null, legalMoves: [], promotion: null, hint: null });
    get().syncView();
    get().pauseClock();
    get().persist();
  },

  claimDraw: () => {
    const state = get();
    const reason = claimableDraw(state.game.position, state.game.positions.slice(0, -1));
    if (!reason) return null;
    state.game.agreeDraw();
    set({ selected: null, legalMoves: [], promotion: null, hint: null });
    get().syncView();
    get().pauseClock();
    get().persist();
    return reason;
  },

  flipBoard: () => {
    set({ orientation: opposite(get().orientation) });
  },

  setOrientation: (color) => set({ orientation: color }),

  setPlayerColor: (color) => {
    set({ playerColor: color, orientation: color });
  },

  setAiLevel: (level) => set({ aiLevel: level }),

  setMode: (mode) => {
    set({ mode });
    get().persist();
  },

  setThinking: (thinking) => set({ isAiThinking: thinking }),
  setHint: (move) => set({ hint: move }),
  setMessage: (message) => set({ message }),

  refresh: () => {
    get().syncView();
    get().resetClockForNextMove();
    get().persist();
  },

  loadFen: (fen) => {
    try {
      const position = Position.fromFen(fen);
      if (position.kingSquare('white') === null || position.kingSquare('black') === null) {
        set({ message: asMessage('message.fenMissingKing') });
        return false;
      }
      // A bare FEN cannot always describe the castling grid, but when the back rank of the FEN
      // is a legal Chess960 layout we can rebuild the king/rook home files exactly.
      const backRank = backRankFromFen(fen) ?? normalizeBackRank((fen.trim().split(/\s+/)[0] ?? '').split('/').pop() ?? '');
      const game = new Game(backRank ? { startFen: fen, backRank } : { startFen: fen });
      set({
        game,
        selected: null,
        legalMoves: [],
        promotion: null,
        hint: null,
        message: null,
      });
      get().syncView();
      get().persist();
      return true;
    } catch (error) {
      set({
        message: asMessage('message.invalidFen', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      });
      return false;
    }
  },

  setClock: (baseMinutes, incrementSeconds, enabled) => {
    const baseMs = enabled ? Math.round(baseMinutes * 60_000) : 0;
    const incrementMs = enabled ? Math.round(incrementSeconds * 1000) : 0;
    set({
      clock: {
        remaining: { white: baseMs, black: baseMs },
        activeSince: enabled ? Date.now() : null,
        baseMs,
        incrementMs,
      },
    });
  },

  /**
   * Charge the elapsed time to the side to move and report a flag fall. Returns the colour
   * that ran out of time, or null.
   */
  tickClock: (now = Date.now()) => {
    const { clock, game } = get();
    if (clock.baseMs === 0 || clock.activeSince === null) return null;
    const elapsed = Math.max(0, now - clock.activeSince);
    const remaining = {
      white: clock.remaining.white - (game.turn === 'white' ? elapsed : 0),
      black: clock.remaining.black - (game.turn === 'black' ? elapsed : 0),
    };
    set({ clock: { ...clock, remaining, activeSince: now } });
    if (remaining.white <= 0 && game.turn === 'white') return 'white';
    if (remaining.black <= 0 && game.turn === 'black') return 'black';
    return null;
  },

  /** After a move: charge the mover's time, grant the increment, hand the clock over. */
  resetClockForNextMove: () => {
    const { clock, game } = get();
    if (clock.baseMs === 0) return;
    const now = Date.now();
    const elapsed = clock.activeSince === null ? 0 : Math.max(0, now - clock.activeSince);
    const mover = opposite(game.turn);
    const remaining = {
      white: clock.remaining.white - (mover === 'white' ? elapsed : 0) + (mover === 'white' ? clock.incrementMs : 0),
      black: clock.remaining.black - (mover === 'black' ? elapsed : 0) + (mover === 'black' ? clock.incrementMs : 0),
    };
    set({ clock: { ...clock, remaining, activeSince: now } });
  },

  /** After an undo: keep the remaining times, just re-anchor the running clock. */
  restartClockForCurrentTurn: () => {
    const { clock } = get();
    if (clock.baseMs === 0) return;
    set({ clock: { ...clock, activeSince: Date.now() } });
  },

  /** Freeze the clock (tab hidden, game over, dialog open). */
  pauseClock: (now = Date.now()) => {
    const { clock, game } = get();
    if (clock.baseMs === 0 || clock.activeSince === null) return;
    const elapsed = Math.max(0, now - clock.activeSince);
    set({
      clock: {
        ...clock,
        remaining: {
          white: clock.remaining.white - (game.turn === 'white' ? elapsed : 0),
          black: clock.remaining.black - (game.turn === 'black' ? elapsed : 0),
        },
        activeSince: null,
      },
    });
  },

  resumeClock: (now = Date.now()) => {
    const { clock } = get();
    if (clock.baseMs === 0) return;
    set({ clock: { ...clock, activeSince: now } });
  },

  /**
   * Refresh the denormalised view fields and bump `version`. Every mutation ends here, which is
   * what keeps the UI (and the AI effect) in sync with the mutable Game.
   */
  syncView: () => {
    const { game, version } = get();
    set({
      version: version + 1,
      fen: game.fen,
      turn: game.turn,
      over: game.isOver,
      moveCount: game.length,
    });
  },

  status: () => {
    const { game } = get();
    // Touch `version` so callers inside render read the fresh status after a mutation.
    void get().version;
    return game.status;
  },

  turnOf: () => get().game.turn,

  isAiTurn: () => {
    const state = get();
    return state.mode === 'ai' && state.game.turn !== state.playerColor && !state.game.isOver;
  },

  canHumanMove: () => {
    const state = get();
    if (state.game.isOver || state.promotion) return false;
    if (state.mode === 'local') return true;
    if (state.isAiThinking) return false;
    return state.game.turn === state.playerColor;
  },

  legalMovesFrom: (square) => get().game.legalMoves(square),

  lastMove: () => get().game.lastMove,

  fenString: () => get().game.fen,

  pgn: () => get().game.toPgn(),

  snapshot: () => get().game.toSnapshot(),

  persist: () => {
    try {
      saveGame(get().game.toSnapshot());
    } catch {
      // Persistence is best-effort.
    }
  },
}));

/** Status helper used by the components (evaluates repetition from the game history). */
export function currentStatus(game: Game): GameStatus {
  return game.status;
}

// Seed the denormalised view fields from whichever game we started with (a restored snapshot
// may already have moves played).
useGameStore.getState().syncView();

// Expose the store for debugging and for the end-to-end tests to assert on real state. This is
// the same object the UI uses, so it is safe (and very useful) to inspect from the console.
(globalThis as { __chess960?: { game: typeof useGameStore } }).__chess960 = { game: useGameStore };

export { evaluatePosition };
export type { Color, GameStatus, Move, Role, Square };
