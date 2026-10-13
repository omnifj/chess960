/**
 * Safe localStorage helpers. Everything is wrapped because private browsing modes, blocked
 * storage and JSON corruption must never break the app — persistence is a convenience, not a
 * requirement.
 */

const PREFIX = 'chess960:';

export function storageAvailable(): boolean {
  try {
    const key = `${PREFIX}probe`;
    globalThis.localStorage?.setItem(key, '1');
    globalThis.localStorage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: ignore, the game continues in memory.
  }
}

export function remove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export const STORAGE_KEYS = {
  game: 'game',
  settings: 'settings',
} as const;

/** The persisted shape of the in-progress game (see `Game.toSnapshot`). */
export interface PersistedGame extends Record<string, unknown> {
  version: 1;
}

export function loadGame<T>(): T | null {
  const value = readJson<T | null>(STORAGE_KEYS.game, null);
  return value ?? null;
}

export function saveGame(snapshot: unknown): void {
  writeJson(STORAGE_KEYS.game, snapshot);
}

export function clearGame(): void {
  remove(STORAGE_KEYS.game);
}

/** Clipboard helper with a fallback for browsers without the async clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const document = globalThis.document;
    if (!document) return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Trigger a client-side file download (PGN export). */
export function downloadText(filename: string, text: string, mime = 'application/x-chess-pgn'): void {
  const document = globalThis.document;
  if (!document) return;
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
