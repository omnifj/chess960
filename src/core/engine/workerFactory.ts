/**
 * Worker entry point. Keeping the `new Worker(...)` call in its own module lets Vite bundle the
 * worker properly (it emits a `.js` asset); a bare `new URL('./builtin.worker.ts', import.meta.url)`
 * would ship the `.ts` file as-is, which browsers refuse to execute as a module worker.
 */
import BuiltinWorker from './builtin.worker?worker';

/** Create the built-in engine worker (ES module worker, bundled by Vite). */
export function createBuiltinWorker(): Worker {
  return new BuiltinWorker({ name: 'chess960-builtin-engine' });
}

/** Create a worker from an explicit URL (used for the optional Stockfish build). */
export function createExternalWorker(url: string, name: string): Worker {
  return new Worker(url, { type: 'module', name });
}
