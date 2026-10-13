import { difficulty } from './difficulty';
import { DIFFICULTY_ORDER as ORDER } from './difficulty';
import { createBuiltinWorker, createExternalWorker } from './workerFactory';
import { moveToUci } from '../notation';
import { Position } from '../position';
import type { EngineLevelName, EngineResponse, Move } from './protocol';

/**
 * Engine facade used by the UI. It prefers a Stockfish WASM build placed in
 * `public/engines/stockfish/` (see `public/engines/README.md`) and silently falls back to the
 * built-in alpha-beta engine when that build is missing, so the site is always playable.
 *
 * All heavy work happens inside a Worker: the main thread only exchanges messages.
 */

export type EngineKind = 'builtin' | 'stockfish';

export interface EngineMoveResult {
  move: Move | null;
  uci: string;
  scoreCp?: number;
  scoreMate?: number;
  depth?: number;
  engine: EngineKind;
}

export interface EngineOptions {
  /** Directory containing `stockfish.js` (+ optional `.wasm`), relative to the site root. */
  stockfishPath?: string;
  /** Disable Stockfish detection entirely (used by tests). */
  forceBuiltin?: boolean;
  /** Called whenever the engine is (re)loaded, e.g. to show the active engine in the UI. */
  onReady?: (info: { engine: EngineKind; name: string }) => void;
  /** Called when Stockfish could not be loaded, with the reason. */
  onFallback?: (reason: string) => void;
}

export interface GoOptions {
  level: EngineLevelName;
  /** Override the preset search time (ms). */
  movetimeMs?: number;
  /** Override the preset depth. */
  depth?: number;
}

const DEFAULT_STOCKFISH_PATH = './engines/stockfish/stockfish.js';
/** How long the worker handshake (`uci` -> `uciok`) may take before giving up on Stockfish. */
const START_TIMEOUT_MS = 5_000;
const GO_TIMEOUT_SLACK_MS = 20_000;
/** How long the optional Stockfish probe may take before we settle for the built-in engine. */
const STOCKFISH_PROBE_TIMEOUT_MS = 3_000;

/**
 * Check that `url` really is an engine build before we try to drive it.
 *
 * A plain `HEAD`/status check is not enough: single-page-app hosts commonly answer a missing file
 * with `200` and the `index.html` fallback, which would then be loaded as a Worker and never speak
 * UCI. So the probe downloads the first bytes and rejects anything that is not JavaScript/WASM.
 */
async function probeEngine(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-64' },
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const type = response.headers.get('content-type') ?? '';
    if (/text\/html/i.test(type)) return false;
    const head = (await response.text()).slice(0, 64).trim().toLowerCase();
    if (/^<(!doctype|html|\?xml)/.test(head)) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Set `globalThis.__debugEngine = true` to trace engine start-up in the console. */
function debugEngine(message: string, detail?: unknown): void {
  if ((globalThis as { __debugEngine?: boolean }).__debugEngine) {
    // eslint-disable-next-line no-console
    console.log(`[engine] ${message}`, detail ?? '');
  }
}

export class Engine {
  private worker: Worker | null = null;  private kind: EngineKind = 'builtin';
  private name = 'Built-in engine';
  private ready = false;
  private starting: Promise<void> | null = null;
  private pending = new Map<
    number,
    {
      resolve: (result: EngineMoveResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      level: EngineLevelName;
    }
  >();
  private requestId = 0;
  private options: EngineOptions;

  constructor(options: EngineOptions = {}) {
    this.options = options;
  }

  get engineKind(): EngineKind {
    return this.kind;
  }

  get engineName(): string {
    return this.name;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Load the engine. Safe to call repeatedly: the work happens once. */
  async init(): Promise<void> {
    if (this.ready) return;
    if (this.starting) return this.starting;
    debugEngine('init');
    this.starting = this.startInternal().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startInternal(): Promise<void> {
    debugEngine('startInternal');
    if (!this.options.forceBuiltin && typeof Worker !== 'undefined') {
      try {
        await this.startStockfish();
        return;
      } catch (error) {
        debugEngine('stockfish unavailable, falling back', error instanceof Error ? error.message : String(error));
        try {
          this.options.onFallback?.(error instanceof Error ? error.message : String(error));
        } catch {
          // A misbehaving status callback must not prevent the fallback engine from starting.
        }
      }
    }
    this.startBuiltin();
  }

  private startBuiltin(): void {
    debugEngine('startBuiltin');
    const worker = createBuiltinWorker();
    worker.addEventListener('message', (event: MessageEvent<EngineResponse>) => this.onMessage(event.data));
    worker.addEventListener('error', (event: ErrorEvent) => this.failAll(event.message || 'worker error'));
    this.worker = worker;
    this.kind = 'builtin';
    this.name = 'Built-in engine';
    this.ready = true;
    this.options.onReady?.({ engine: 'builtin', name: this.name });
  }

  private async startStockfish(): Promise<void> {
    const path = this.options.stockfishPath ?? DEFAULT_STOCKFISH_PATH;
    debugEngine('probing stockfish', path);
    // Probe the file first: a missing `public/engines/stockfish/stockfish.js` would otherwise
    // surface as an opaque worker error. Some static hosts drop the connection for a HEAD
    // request to a missing file, so the probe is bounded by a timeout — a hung probe must never
    // leave the app without an engine.
    const head = await probeEngine(path, STOCKFISH_PROBE_TIMEOUT_MS);
    debugEngine('probe result', head);
    if (!head) throw new Error(`Stockfish not found at ${path}`);

    const worker = createExternalWorker(path, 'chess960-stockfish');
    this.worker = worker;
    const uciok = waitForLine(worker, 'uciok', START_TIMEOUT_MS);
    worker.addEventListener('message', (event: MessageEvent<EngineResponse>) => this.onMessage(event.data));
    worker.postMessage('uci');
    await uciok;
    worker.postMessage('setoption name UCI_Chess960 value true'); // Chess960 castling encoding
    worker.postMessage('setoption name Threads value 1');
    worker.postMessage('setoption name Hash value 16');
    const readyPromise = waitForLine(worker, 'readyok', START_TIMEOUT_MS);
    worker.postMessage('isready');
    await readyPromise;
    this.kind = 'stockfish';
    this.name = 'Stockfish (WASM)';
    this.ready = true;
    this.options.onReady?.({ engine: 'stockfish', name: this.name });
  }

  private onMessage(message: EngineResponse): void {
    if (message.type === 'bestmove') {
      const entry = this.pending.get(message.requestId);
      if (!entry) return;
      this.pending.delete(message.requestId);
      clearTimeout(entry.timer);
      entry.resolve({
        move: message.move,
        uci: message.uci,
        ...(message.scoreCp === undefined ? {} : { scoreCp: message.scoreCp }),
        ...(message.scoreMate === undefined ? {} : { scoreMate: message.scoreMate }),
        ...(message.depth === undefined ? {} : { depth: message.depth }),
        engine: this.kind,
      });
      return;
    }
    if (message.type === 'error') {
      if (message.requestId !== undefined) {
        const entry = this.pending.get(message.requestId);
        if (entry) {
          this.pending.delete(message.requestId);
          clearTimeout(entry.timer);
          entry.reject(new Error(message.message));
        }
      }
      return;
    }
    if (message.type === 'ready') {
      this.name = message.name;
      this.kind = message.engine;
    }
  }

  private failAll(reason: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }

  /**
   * Ask for the best move in `fen`. Resolves with `move: null` when the game is already over.
   * Throws only when the engine itself fails.
   */
  async go(fen: string, options: GoOptions): Promise<EngineMoveResult> {
    await this.init();
    const worker = this.worker;
    if (!worker) throw new Error('Engine is not running');
    const preset = difficulty(options.level);
    const requestId = (this.requestId += 1);

    const result = new Promise<EngineMoveResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Engine timed out'));
      }, (options.movetimeMs ?? preset.movetimeMs) + GO_TIMEOUT_SLACK_MS);
      this.pending.set(requestId, { resolve, reject, timer, level: options.level });
    });

    if (this.kind === 'stockfish') {
      worker.postMessage(`setoption name Skill Level value ${preset.skill}`);
      worker.postMessage(`position fen ${fen}`);
      const movetime = options.movetimeMs ?? preset.movetimeMs;
      const depth = options.depth ?? preset.depth;
      worker.postMessage(`go movetime ${movetime} depth ${depth}`);
    } else {
      worker.postMessage({
        type: 'go',
        requestId,
        fen,
        level: options.level,
        movetimeMs: options.movetimeMs ?? preset.movetimeMs,
        depth: options.depth ?? preset.depth,
        skill: preset.skill,
      });
    }
    return result;
  }

  /** Ask the engine to abandon the current search. */
  stop(): void {
    if (!this.worker) return;
    if (this.kind === 'stockfish') this.worker.postMessage('stop');
    else this.worker.postMessage({ type: 'stop' });
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Engine stopped'));
    }
    this.pending.clear();
  }

  /** Shut the engine down and release the worker. */
  quit(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  /** Convenience helper: best move as a UCI string (empty when the game is over). */
  async goUci(fen: string, options: GoOptions): Promise<string> {
    const result = await this.go(fen, options);
    return result.uci;
  }

  /** UCI string for a move in a position, matching what `go` returns. */
  static toUci(position: Position, move: Move): string {
    return moveToUci(position, move);
  }
}

/** Wait for a raw UCI line (Stockfish workers talk text, not our JSON protocol). */
function waitForLine(worker: Worker, token: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for "${token}"`));
    }, timeoutMs);
    function onMessage(event: MessageEvent<unknown>): void {
      const data = event.data;
      const text = typeof data === 'string' ? data : data instanceof Error ? data.message : '';
      if (!text.includes(token)) return;
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      resolve(text);
    }
    worker.addEventListener('message', onMessage);
  });
}

export { ORDER as ENGINE_LEVELS };
export type { EngineLevelName };
