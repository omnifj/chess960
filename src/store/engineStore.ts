import { create } from 'zustand';
import { Engine } from '../core/engine/ai';
import type { EngineKind } from '../core/engine/ai';
import { asMessage } from '../i18n/translate';
import type { MessageDescriptor } from '../i18n/messages';
import type { Move } from '../core/types';

export interface EngineStoreState {
  /** Which engine is actually running (Stockfish when available, otherwise the built-in one). */
  engine: EngineKind;
  name: string;
  ready: boolean;
  thinking: boolean;
  /** Last engine problem, shown in the status bar. */
  error: MessageDescriptor | null;
  /** Engine suggestion for the human (the P1 "hint" feature); null when idle. */
  hint: Move | null;
  hintBusy: boolean;
  /** How many engine moves were played this game (for the UI/debug). */
  movesPlayed: number;

  setEngine: (info: { engine: EngineKind; name: string }) => void;
  setReady: (ready: boolean) => void;
  setThinking: (thinking: boolean) => void;
  setError: (error: MessageDescriptor | null) => void;
  setHint: (hint: Move | null) => void;
  setHintBusy: (busy: boolean) => void;
  noteMovePlayed: () => void;
  reset: () => void;
}

const INITIAL = {
  engine: 'builtin' as EngineKind,
  name: 'Built-in engine',
  ready: false,
  thinking: false,
  error: null,
  hint: null as Move | null,
  hintBusy: false,
  movesPlayed: 0,
};

export const useEngineStore = create<EngineStoreState>()((set) => ({
  ...INITIAL,
  setEngine: ({ engine, name }) => set({ engine, name }),
  setReady: (ready) => set({ ready }),
  setThinking: (thinking) => set({ thinking }),
  setError: (error) => set({ error }),
  setHint: (hint) => set({ hint }),
  setHintBusy: (hintBusy) => set({ hintBusy }),
  noteMovePlayed: () => set((state) => ({ movesPlayed: state.movesPlayed + 1 })),
  reset: () => set({ ...INITIAL }),
}));

/** Module-level engine singleton: one worker for the whole app. */
let engineSingleton: Engine | null = null;

/** Run a store update outside the caller's stack (engine callbacks fire mid-initialisation). */
function defer(update: () => void): void {
  queueMicrotask(() => {
    try {
      update();
    } catch {
      // A failed status update must never break the engine itself.
    }
  });
}

export function getEngine(): Engine {
  if (!engineSingleton) {
    engineSingleton = new Engine({
      onReady: (info) =>
        defer(() => {
          const store = useEngineStore.getState();
          store.setEngine(info);
          store.setReady(true);
          store.setThinking(false);
        }),
      onFallback: (reason) =>
        defer(() =>
          useEngineStore.getState().setError(asMessage('message.stockfishUnavailable', { reason })),
        ),
    });
  }
  return engineSingleton;
}

/** Tear the worker down (used by tests and when the app unmounts). */
export function disposeEngine(): void {
  engineSingleton?.quit();
  engineSingleton = null;
  useEngineStore.getState().reset();
}

// Expose the engine store alongside the game store (see `gameStore.ts`) so the active engine and
// its state can be inspected from the console or an end-to-end test.
(
  globalThis as {
    __chess960?: { game?: unknown; engine?: unknown };
  }
).__chess960 = {
  ...((globalThis as { __chess960?: { game?: unknown } }).__chess960 ?? {}),
  engine: useEngineStore,
};

export type { EngineKind };
