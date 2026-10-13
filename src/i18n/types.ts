/**
 * Language primitives shared by the i18n layer and the stores.
 *
 * This module is deliberately dependency-free: `settingsStore` and `gameStore` import from here,
 * and `i18n/messages.ts` imports from here, so it must never import a store (that would create a
 * cycle).
 */

/** Interface languages the app ships. Chinese is the default. */
export type Language = 'zh' | 'en';

/** Order used by the language picker. */
export const LANGUAGES: readonly Language[] = ['zh', 'en'];

/** Values interpolated into a message template, e.g. `{ name: 'e4' }` for `"Selected {name}"`. */
export type MessageParams = Record<string, string | number>;

export const DEFAULT_LANGUAGE: Language = 'zh';

/** Narrow anything (a persisted value, a URL parameter) to a supported language. */
export function normalizeLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : DEFAULT_LANGUAGE;
}
