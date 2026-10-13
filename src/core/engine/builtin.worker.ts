import { searchMove } from './search';
import { difficulty } from './difficulty';
import { Position } from '../position';
import { moveToUci } from '../notation';
import type { EngineRequest, EngineResponse, EngineBestMoveResponse } from './protocol';
import type { Move, Role, Square } from '../types';

/**
 * Web Worker entry point for the built-in engine (alpha-beta search).
 *
 * Protocol: see `./protocol.ts`. One search runs at a time; `stop` aborts it and `quit` clears
 * the worker state. Keeping the search in a worker is what keeps the board responsive while the
 * engine thinks.
 */

function reply(message: EngineResponse): void {
  (globalThis as unknown as { postMessage: (value: EngineResponse) => void }).postMessage(message);
}

function toPayload(move: Move): EngineBestMoveResponse['move'] {
  return {
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
    ...(move.castle ? { castle: move.castle } : {}),
  };
}

function squareIndex(name: string): Square {
  return name.charCodeAt(0) - 97 + 8 * (Number(name[1]) - 1);
}

/**
 * Rebuild repetition keys by replaying the game from its starting position. `moves[0]` is the
 * start FEN, the rest are UCI moves.
 */
function repetitionKeysFromRequest(startFen: string, moves: readonly string[]): string[] {
  if (moves.length === 0) return [];
  try {
    const replay = Position.fromFen(moves[0] ?? startFen);
    const keys: string[] = [replay.repetitionKey()];
    for (const uci of moves.slice(1)) {
      const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
      if (!match) break;
      const promotion = match[3] as Role | undefined;
      const resolved = replay.resolveMove({
        from: squareIndex(match[1]!),
        to: squareIndex(match[2]!),
        ...(promotion ? { promotion } : {}),
      });
      if (!resolved) break;
      replay.play(resolved);
      keys.push(replay.repetitionKey());
    }
    return keys;
  } catch {
    return [];
  }
}

function handle(request: EngineRequest): void {
  switch (request.type) {
    case 'start':
      reply({ type: 'ready', engine: 'builtin', name: 'Built-in engine (alpha-beta)' });
      return;

    case 'position':
      // The built-in engine searches from the FEN passed to `go`; nothing to buffer here.
      return;

    case 'go': {
      const position = Position.fromFen(request.fen);
      const preset = difficulty(request.level);
      const history = repetitionKeysFromRequest(request.fen, request.moves ?? []);
      const moves = position.legalMoves();
      if (moves.length === 0) {
        reply({ type: 'error', requestId: request.requestId, message: `No legal moves in ${request.fen}` });
        return;
      }

      // The easiest level sometimes just plays a legal move, which is beatable without being
      // absurd. Higher levels never do this.
      if (preset.randomness > 0 && Math.random() < preset.randomness) {
        const move = moves[Math.floor(Math.random() * moves.length)]!;
        reply({
          type: 'bestmove',
          requestId: request.requestId,
          move: toPayload(move),
          uci: moveToUci(position, move),
          scoreCp: 0,
          depth: 0,
        });
        return;
      }

      const result = searchMove(position, {
        depth: request.depth ?? preset.depth,
        movetimeMs: request.movetimeMs ?? preset.movetimeMs,
        noiseCp: preset.noiseCp,
        history,
        onRootMove: (move, score, depth) => {
          reply({
            type: 'info',
            requestId: request.requestId,
            depth,
            scoreCp: score,
            pv: moveToUci(position, move),
          });
        },
      });
      reply({
        type: 'bestmove',
        requestId: request.requestId,
        move: result.move === null ? null : toPayload(result.move),
        uci: result.move ? moveToUci(position, result.move) : '0000',
        scoreCp: result.scoreCp,
        ...(result.mateIn === null ? {} : { scoreMate: result.mateIn }),
        depth: result.depth,
      });
      return;
    }

    case 'stop':
      // The built-in search is synchronous from the worker's point of view, so a `stop` is
      // handled between searches: no further work is started for a stale request.
      return;

    case 'quit':
      return;
  }
}

globalThis.addEventListener('message', (event: MessageEvent<EngineRequest>) => {
  try {
    handle(event.data);
  } catch (error) {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
