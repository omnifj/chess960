import { Position } from '../position';
import { evaluate, moveKey, moveOrderScore, positionKey } from './evaluate';
import type { Move } from '../types';

/**
 * The built-in fallback engine: alpha-beta negamax with iterative deepening, a quiescence
 * search for captures, MVV-LVA move ordering and a small transposition table.
 *
 * It is deliberately dependency-free (no WASM, no network) so the app always has a usable
 * opponent — and so the AI path is unit-testable in Node. It runs inside a Web Worker, so even
 * a deep search never blocks the UI.
 */

const MATE_SCORE = 100_000;
const MATE_THRESHOLD = MATE_SCORE - 1000;
const INFINITY = 1_000_000;

export interface SearchOptions {
  /** Maximum depth in plies. */
  depth: number;
  /** Soft time budget in milliseconds; the search stops cleanly once exceeded. */
  movetimeMs: number;
  /** Multiplier applied to the root move scores to weaken the engine (0 = full strength). */
  noiseCp?: number;
  /** Injectable RNG so tests are deterministic. */
  rng?: () => number;
  /** Repetition keys of the positions before the current one (draw detection). */
  history?: readonly string[];
  /** Called when a new root move becomes the best one (for `info` messages). */
  onRootMove?: (move: Move, score: number, depth: number) => void;
}

export interface SearchResult {
  move: Move | null;
  /** Score in centipawns from the side to move; mate scores are near ±MATE_SCORE. */
  scoreCp: number;
  /** Set when a forced mate was found: plies to mate, negative when being mated. */
  mateIn: number | null;
  depth: number;
  nodes: number;
  /** All scored root moves, best first (used by the hint feature and tests). */
  rootMoves: Array<{ move: Move; score: number }>;
}

interface SearchContext {
  nodes: number;
  deadline: number;
  aborted: boolean;
  rng: () => number;
  history: Set<string>;
}

export function searchMove(position: Position, options: SearchOptions): SearchResult {
  const context: SearchContext = {
    nodes: 0,
    deadline: options.movetimeMs > 0 ? Date.now() + options.movetimeMs : Number.POSITIVE_INFINITY,
    aborted: false,
    rng: options.rng ?? Math.random,
    history: new Set(options.history ?? []),
  };
  const table = new Map<string, { depth: number; score: number }>();
  const rootMoves = position.legalMoves();
  if (rootMoves.length === 0) {
    return { move: null, scoreCp: 0, mateIn: null, depth: 0, nodes: 0, rootMoves: [] };
  }
  if (rootMoves.length === 1) {
    return { move: rootMoves[0]!, scoreCp: 0, mateIn: null, depth: 0, nodes: 0, rootMoves: [{ move: rootMoves[0]!, score: 0 }] };
  }

  let bestMove = rootMoves[0]!;
  let bestScore = 0;
  let scored: Array<{ move: Move; score: number }> = rootMoves.map((move) => ({ move, score: 0 }));
  let completedDepth = 0;

  for (let depth = 1; depth <= Math.max(1, options.depth); depth += 1) {
    const ordered = orderRootMoves(position, scored, bestMove);
    const current: Array<{ move: Move; score: number }> = [];
    let alpha = -INFINITY;
    let depthBest = ordered[0]!;
    let depthBestScore = -INFINITY;

    for (const move of ordered) {
      const next = position.clone();
      next.play(move);
      const score = -negamax(next, depth - 1, -INFINITY, -alpha, 1, context, table);
      current.push({ move, score });
      if (score > depthBestScore) {
        depthBestScore = score;
        depthBest = move;
      }
      if (score > alpha) alpha = score;
      if (context.aborted) break;
    }

    if (current.length > 0) {
      // Keep the fully searched moves plus their scores; on an abort, fall back to the previous
      // iteration's result so that the returned move is always backed by a complete search.
      scored = current;
      if (!context.aborted || depth === 1) {
        bestMove = depthBest;
        bestScore = depthBestScore;
        completedDepth = depth;
        options.onRootMove?.(bestMove, bestScore, depth);
      }
    }
    if (context.aborted || Date.now() >= context.deadline) break;
  }

  // Optional weakening: add noise to the root scores and pick the best of the noisy values.
  const noise = options.noiseCp ?? 0;
  if (noise > 0) {
    let noisyBest = bestMove;
    let noisyScore = -INFINITY;
    for (const entry of scored) {
      const value = entry.score + (context.rng() * 2 - 1) * noise;
      if (value > noisyScore) {
        noisyScore = value;
        noisyBest = entry.move;
      }
    }
    bestMove = noisyBest;
    bestScore = scored.find((entry) => moveKey(entry.move) === moveKey(bestMove))?.score ?? bestScore;
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    move: bestMove,
    scoreCp: bestScore,
    mateIn: mateInFromScore(bestScore),
    depth: completedDepth,
    nodes: context.nodes,
    rootMoves: scored,
  };
}

function orderRootMoves(
  position: Position,
  scored: Array<{ move: Move; score: number }>,
  bestMove: Move,
): Move[] {
  const scoreByMove = new Map(scored.map((entry) => [moveKey(entry.move), entry.score]));
  return position
    .legalMoves()
    .map((move) => ({
      move,
      order:
        (moveKey(move) === moveKey(bestMove) ? 1_000_000 : 0) +
        (scoreByMove.get(moveKey(move)) ?? 0) +
        moveOrderScore(position, move),
    }))
    .sort((a, b) => b.order - a.order)
    .map((entry) => entry.move);
}

function negamax(
  position: Position,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  context: SearchContext,
  table: Map<string, { depth: number; score: number }>,
): number {
  context.nodes += 1;
  if ((context.nodes & 1023) === 0 && Date.now() >= context.deadline) context.aborted = true;
  if (context.aborted) return alpha;

  const key = positionKey(position);
  if (context.history.has(position.repetitionKey())) return 0; // repetition: treat as a draw
  if (position.halfmoves >= 100 || position.hasInsufficientMaterial()) return 0;

  const cached = table.get(key);
  if (cached && cached.depth >= depth) return cached.score;

  const moves = position.legalMoves();
  if (moves.length === 0) {
    // Checkmate is a loss for the side to move; deeper mates are "better" (less bad).
    return position.isCheck() ? -MATE_SCORE + ply : 0;
  }
  if (depth <= 0) return quiescence(position, alpha, beta, ply, context);

  let best = -INFINITY;
  for (const move of sortMoves(position, moves)) {
    const next = position.clone();
    next.play(move);
    const score = -negamax(next, depth - 1, -beta, -alpha, ply + 1, context, table);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
    if (context.aborted) break;
  }
  table.set(key, { depth, score: best });
  return best;
}

function quiescence(
  position: Position,
  alpha: number,
  beta: number,
  ply: number,
  context: SearchContext,
): number {
  context.nodes += 1;
  if ((context.nodes & 1023) === 0 && Date.now() >= context.deadline) context.aborted = true;
  if (context.aborted) return alpha;

  const standPat = evaluate(position);
  if (standPat >= beta) return beta;
  let best = standPat;
  if (best > alpha) alpha = best;
  if (ply > 12) return best;

  const captures = position.legalMoves({ capturesOnly: true });
  for (const move of sortMoves(position, captures)) {
    const next = position.clone();
    next.play(move);
    const score = -quiescence(next, -beta, -alpha, ply + 1, context);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
    if (score > best) best = score;
    if (context.aborted) break;
  }
  return best;
}

function sortMoves(position: Position, moves: Move[]): Move[] {
  return moves
    .map((move) => ({ move, score: moveOrderScore(position, move) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

/** Convert a mate score back into "mate in N plies", or null for a normal score. */
export function mateInFromScore(score: number): number | null {
  if (Math.abs(score) < MATE_THRESHOLD) return null;
  const plies = MATE_SCORE - Math.abs(score);
  return score > 0 ? plies : -plies;
}

/** Score for the side that is *not* to move (used by the evaluation bar). */
export function scoreForWhite(position: Position, scoreCp: number): number {
  return position.turn === 'white' ? scoreCp : -scoreCp;
}

export { MATE_SCORE, MATE_THRESHOLD, INFINITY };
