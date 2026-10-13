/**
 * Shared message protocol for the AI workers. Both the built-in search worker and the
 * Stockfish UCI worker speak this protocol, so the UI can swap engines without changing a line.
 */
import type { Color, Move, Role, Square } from '../types';

export interface EngineStartRequest {
  type: 'start';
  /** Initial FEN; the built-in engine only needs it once, Stockfish re-parses per `go`. */
  fen: string;
}

export interface EnginePositionRequest {
  type: 'position';
  fen: string;
  /** Optional move history in UCI so the engine can use repetition detection. */
  moves?: string[];
}

export interface EngineGoRequest {
  type: 'go';
  requestId: number;
  /** Position to search. */
  fen: string;
  /**
   * Optional game record for repetition detection: the starting FEN followed by UCI moves.
   * The Stockfish worker does not need it (UCI tracks the game itself), so it is only sent to
   * the built-in engine.
   */
  moves?: string[];
  /** Difficulty preset name, e.g. "medium". */
  level: EngineLevelName;
  /** Hard limits, used by the Stockfish worker. */
  movetimeMs?: number;
  depth?: number;
  /** Skill Level 0..20 for Stockfish. */
  skill?: number;
}

export interface EngineStopRequest {
  type: 'stop';
}

export interface EngineQuitRequest {
  type: 'quit';
}

export type EngineRequest =
  | EngineStartRequest
  | EnginePositionRequest
  | EngineGoRequest
  | EngineStopRequest
  | EngineQuitRequest;

export interface EngineReadyResponse {
  type: 'ready';
  /** 'stockfish' when the WASM engine answered `uciok`, 'builtin' for the fallback search. */
  engine: 'builtin' | 'stockfish';
  name: string;
}

/** Sent for every `go` request; `move` is null only when the position has no legal move. */
export interface EngineBestMoveResponse {
  type: 'bestmove';
  requestId: number;
  move: {
    from: Square;
    to: Square;
    promotion?: Role;
    castle?: 'king' | 'queen';
  } | null;
  /** Engine's own UCI string, kept for debugging. */
  uci: string;
  /** Centipawn score from the side-to-move point of view, when the engine reports one. */
  scoreCp?: number;
  scoreMate?: number;
  depth?: number;
}

export interface EngineInfoResponse {
  type: 'info';
  requestId: number;
  depth?: number;
  scoreCp?: number;
  scoreMate?: number;
  pv?: string;
}

export interface EngineErrorResponse {
  type: 'error';
  message: string;
  requestId?: number;
}

export type EngineResponse = EngineReadyResponse | EngineBestMoveResponse | EngineInfoResponse | EngineErrorResponse;

export type EngineLevelName = 'easy' | 'medium' | 'hard' | 'master';

export interface DifficultyPreset {
  name: EngineLevelName;
  label: string;
  description: string;
  /** Search depth for the built-in engine (ignored by Stockfish). */
  depth: number;
  /** Soft time budget in milliseconds. */
  movetimeMs: number;
  /** Stockfish `Skill Level` (0..20). */
  skill: number;
  /** Probability of playing a random legal move instead of the best one (built-in engine). */
  randomness: number;
  /** Extra centipawn noise added to the root move scores (built-in engine). */
  noiseCp: number;
}

export function moveToEnginePayload(move: Move): EngineBestMoveResponse['move'] {
  return {
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
    ...(move.castle ? { castle: move.castle } : {}),
  };
}

export type { Color, Move, Role, Square };
