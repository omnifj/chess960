import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { getEngine, useEngineStore } from '../store/engineStore';
import { asMessage } from '../i18n/translate';
import type { MessageDescriptor } from '../i18n/messages';
import type { EngineKind } from '../core/engine/ai';

export interface AiStatus {
  engine: EngineKind;
  name: string;
  error: MessageDescriptor | null;
}

/**
 * Plays the engine's turns. All searching happens inside a Worker (see `core/engine/ai.ts`), so
 * this hook only reacts to position changes; the board stays fully interactive while the engine
 * thinks (undo/new-game/resign remain available and cancel the pending search).
 */
export function useAiPlayer(): AiStatus {
  const mode = useGameStore((state) => state.mode);
  const aiLevel = useGameStore((state) => state.aiLevel);
  const playerColor = useGameStore((state) => state.playerColor);
  const fen = useGameStore((state) => state.fen);
  const turn = useGameStore((state) => state.turn);
  const over = useGameStore((state) => state.over);
  const promotionPending = useGameStore((state) => state.promotion !== null);
  const movesPlayed = useGameStore((state) => state.moveCount);

  const engine = useEngineStore((state) => state.engine);
  const name = useEngineStore((state) => state.name);
  const error = useEngineStore((state) => state.error);

  const started = useRef(false);
  const pendingFen = useRef<string | null>(null);

  // Load the engine once, as soon as AI mode is used.
  useEffect(() => {
    if (mode !== 'ai' || started.current) return;
    started.current = true;
    const instance = getEngine();
    void instance.init().catch((cause: unknown) => {
      useEngineStore
        .getState()
        .setError(asMessage('message.engineError', { detail: cause instanceof Error ? cause.message : String(cause) }));
    });
  }, [mode]);

  useEffect(() => {
    if (mode !== 'ai') return;
    if (over || promotionPending) return;
    if (turn === playerColor) return;
    if (pendingFen.current === fen) return; // already searching this position
    pendingFen.current = fen;

    const store = useGameStore.getState();
    const engineInstance = getEngine();
    store.setThinking(true);
    useEngineStore.getState().setThinking(true);

    void engineInstance
      .go(fen, { level: aiLevel })
      .then((result) => {
        const current = useGameStore.getState();
        if (current.fen !== fen) return; // the position moved on: undo, new game, ...
        if (!result.move) return;
        const record = current.game.play(result.move);
        if (record) {
          current.syncView();
          current.setSelected(null);
          useEngineStore.getState().setHint(null);
          useEngineStore.getState().noteMovePlayed();
          current.resetClockForNextMove();
          current.persist();
        } else {
          current.setMessage(asMessage('message.engineIllegalMove'));
        }
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (message.includes('stopped')) return; // cancelled by undo/new game
        useGameStore.getState().setMessage(asMessage('message.engineError', { detail: message }));
      })
      .finally(() => {
        useGameStore.getState().setThinking(false);
        useEngineStore.getState().setThinking(false);
        pendingFen.current = null;
      });
  }, [mode, over, promotionPending, turn, playerColor, fen, aiLevel, movesPlayed]);

  return { engine, name, error };
}

/** One-shot hint: ask the engine for the best move in the current position. */
export async function requestHint(): Promise<void> {
  const store = useGameStore.getState();
  if (store.game.isOver || store.turn !== store.playerColor) return;
  const engineStore = useEngineStore.getState();
  if (engineStore.hintBusy) return;
  engineStore.setHintBusy(true);
  try {
    const instance = getEngine();
    const result = await instance.go(useGameStore.getState().fen, { level: 'hard' });
    useEngineStore.getState().setHint(result.move);
  } catch (cause) {
    useEngineStore
      .getState()
      .setError(asMessage('message.engineError', { detail: cause instanceof Error ? cause.message : String(cause) }));
  } finally {
    useEngineStore.getState().setHintBusy(false);
  }
}
