import { CATALOGS } from './messages';
import { DEFAULT_LANGUAGE } from './types';
import type { MessageDescriptor, MessageKey } from './messages';
import type { Language, MessageParams } from './types';
import type { EngineLevelName } from '../core/engine/protocol';
import type { Color, Role } from '../core/types';

/**
 * Pure translation core — no React, no store. Keeps the i18n layer usable from tests and from
 * plain modules, and keeps `settingsStore` free of a dependency on the hook.
 */
export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  const catalog = CATALOGS[language] ?? CATALOGS[DEFAULT_LANGUAGE];
  // Falling back to Chinese keeps a partially translated catalog usable instead of printing a key.
  const template = catalog[key] ?? CATALOGS[DEFAULT_LANGUAGE][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Render a stored descriptor, or null when there is nothing to show. */
export function formatMessage(
  language: Language,
  descriptor: MessageDescriptor | null | undefined,
): string | null {
  if (!descriptor) return null;
  return translate(language, descriptor.key, descriptor.params);
}

/** Build a descriptor; omits `params` entirely so descriptors stay comparable and serialisable. */
export function asMessage(key: MessageKey, params?: MessageParams): MessageDescriptor {
  return params ? { key, params } : { key };
}

export function colorKey(color: Color): MessageKey {
  return `color.${color}`;
}

export function pieceKey(role: Role): MessageKey {
  return `piece.${role}`;
}

export function difficultyLabelKey(level: EngineLevelName): MessageKey {
  return `difficulty.${level}.label`;
}

export function difficultyDescriptionKey(level: EngineLevelName): MessageKey {
  return `difficulty.${level}.desc`;
}

export function promotionRoleKey(role: Role): MessageKey {
  switch (role) {
    case 'q':
      return 'promotion.queen';
    case 'r':
      return 'promotion.rook';
    case 'b':
      return 'promotion.bishop';
    case 'n':
      return 'promotion.knight';
    default:
      return pieceKey(role);
  }
}
