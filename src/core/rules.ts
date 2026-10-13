import { Position } from './position';
import { nextRepetitionCount } from './history';
import type { Color, DrawReason, GameStatus } from './types';

export { countRepetitions, nextRepetitionCount, repetitionCounts } from './history';

/**
 * Evaluate a position that has just been reached. `history` are the repetition keys of all
 * *previous* positions (including the current one when the caller tracks it) — pass the list
 * that `Game.positions` exposes to get threefold/fivefold detection for free.
 */
export function evaluatePosition(position: Position, history: readonly string[] = []): GameStatus {
  const check = position.isCheck();
  const legal = position.legalMoves();

  if (legal.length === 0) {
    if (check) {
      return {
        state: 'checkmate',
        winner: position.turn === 'white' ? 'black' : 'white',
        reason: 'checkmate',
        check: true,
      };
    }
    return { state: 'stalemate', reason: 'stalemate', check: false };
  }

  const repetitions = nextRepetitionCount(history, position.repetitionKey());
  if (repetitions >= 5) {
    return { state: 'draw', reason: 'fivefold', check };
  }
  if (position.halfmoves >= 150) {
    return { state: 'draw', reason: 'seventy-five-move', check };
  }
  if (position.hasInsufficientMaterial()) {
    return { state: 'draw', reason: 'insufficient-material', check };
  }
  if (repetitions >= 3) {
    return { state: 'draw', reason: 'threefold', check };
  }
  if (check) return { state: 'check', check: true };
  return { state: 'playing', check: false };
}

/** Convenience wrapper used by the store and the tests. */
export function evaluateStatus(position: Position, history: readonly string[] = []): GameStatus {
  return evaluatePosition(position, history);
}

/** Draws that the *player* may claim (50-move rule, threefold repetition). */
export function claimableDraw(position: Position, history: readonly string[]): DrawReason | null {
  const repetitions = nextRepetitionCount(history, position.repetitionKey());
  if (repetitions >= 3) return 'threefold';
  if (position.halfmoves >= 100) return 'fifty-move';
  return null;
}

export function isGameOver(status: GameStatus): boolean {
  return status.state !== 'playing' && status.state !== 'check';
}

export function winnerOf(status: GameStatus): Color | undefined {
  return status.winner;
}

/** Short human readable status text (English; the UI can localise on top of this). */
export function describeStatus(status: GameStatus, turn: Color): string {
  switch (status.state) {
    case 'playing':
      return `${turn === 'white' ? 'White' : 'Black'} to move`;
    case 'check':
      return `${turn === 'white' ? 'White' : 'Black'} to move — check!`;
    case 'checkmate':
      return `Checkmate — ${status.winner === 'white' ? 'White' : 'Black'} wins`;
    case 'stalemate':
      return 'Draw by stalemate';
    case 'resigned':
      return `${status.winner === 'white' ? 'White' : 'Black'} wins by resignation`;
    case 'timeout':
      return `${status.winner === 'white' ? 'White' : 'Black'} wins on time`;
    case 'draw':
      switch (status.reason) {
        case 'fifty-move':
          return 'Draw by the fifty-move rule';
        case 'seventy-five-move':
          return 'Draw by the seventy-five-move rule';
        case 'threefold':
          return 'Draw by threefold repetition';
        case 'fivefold':
          return 'Draw by fivefold repetition';
        case 'insufficient-material':
          return 'Draw by insufficient material';
        default:
          return 'Draw by agreement';
      }
    default:
      return '';
  }
}
