/**
 * Interface localisation. Chinese (`zh`) is the default and the source of truth for the key set;
 * English (`en`) is typed against it, so the two catalogs cannot drift apart.
 *
 * Layering: `i18n/types.ts` and `i18n/messages.ts` are dependency-free leaves, so `gameStore` /
 * `engineStore` / `settingsStore` can import from them without a cycle. Only `useI18n.ts` reaches
 * into a store.
 */
export { CATALOGS, zh, en } from './messages';
export type { MessageDescriptor, MessageKey } from './messages';
export { LANGUAGES, DEFAULT_LANGUAGE, normalizeLanguage } from './types';
export type { Language, MessageParams } from './types';
export {
  asMessage,
  colorKey,
  difficultyDescriptionKey,
  difficultyLabelKey,
  formatMessage,
  pieceKey,
  promotionRoleKey,
  translate,
} from './translate';
export { currentLanguage, tNow, useI18n } from './useI18n';
export type { I18n } from './useI18n';
