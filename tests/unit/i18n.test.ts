import { describe, expect, it } from 'vitest';
import { CATALOGS, en, zh } from '../../src/i18n/messages';
import { DEFAULT_LANGUAGE, LANGUAGES, normalizeLanguage } from '../../src/i18n/types';
import {
  asMessage,
  colorKey,
  difficultyDescriptionKey,
  difficultyLabelKey,
  formatMessage,
  pieceKey,
  promotionRoleKey,
  translate,
} from '../../src/i18n/translate';
import { DIFFICULTY_ORDER } from '../../src/core/engine/difficulty';
import type { Language } from '../../src/i18n/types';
import type { MessageKey } from '../../src/i18n/messages';

const ROLES = ['p', 'n', 'b', 'r', 'q', 'k'] as const;
const COLORS = ['white', 'black'] as const;

/** Every key any catalog declares, as plain strings so the parity check can diff them. */
function keysOf(catalog: Record<string, string>): string[] {
  return Object.keys(catalog).sort();
}

describe('message catalogs', () => {
  it('ships exactly the languages that are advertised', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...LANGUAGES].sort());
    expect(LANGUAGES).toContain('zh');
  });

  it('defaults to Chinese', () => {
    expect(DEFAULT_LANGUAGE).toBe('zh');
    expect(normalizeLanguage(undefined)).toBe('zh');
    expect(normalizeLanguage('nonsense')).toBe('zh');
    expect(normalizeLanguage('zh')).toBe('zh');
    expect(normalizeLanguage('en')).toBe('en');
  });

  it('has identical key sets in both catalogs', () => {
    // `en` is typed against `MessageKey`, so this can only fail through a runtime-only mistake —
    // which is exactly what a missing translation looks like in production.
    expect(keysOf(en)).toEqual(keysOf(zh));
  });

  it('has a non-empty string for every key in every catalog', () => {
    for (const [name, catalog] of Object.entries(CATALOGS)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(typeof value, `${name}.${key}`).toBe('string');
        expect(value.length, `${name}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('interpolates every placeholder that the Chinese templates declare', () => {
    // The English catalog must use the same placeholders, otherwise a param would silently vanish
    // when the user switches language.
    const placeholders = (template: string): string[] =>
      [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
    for (const key of Object.keys(zh) as MessageKey[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]));
    }
  });

  it('actually translates the interface (the two catalogs differ)', () => {
    const identical = (Object.keys(zh) as MessageKey[]).filter((key) => zh[key] === en[key]);
    // Keys that are intentionally identical in both languages: language endonyms (a language is
    // always listed in its own language), the product name, the "PGN" acronym, and the template
    // that only interpolates a square name.
    expect(identical.sort()).toEqual([
      'board.square',
      'engine.stockfish',
      'language.en',
      'language.zh',
      'pgn.title',
    ]);
  });
});

describe('translate', () => {
  it('returns the Chinese string by default and the English one on request', () => {
    expect(translate('zh', 'controls.newGame')).toBe('新对局');
    expect(translate('en', 'controls.newGame')).toBe('New game');
  });

  it('substitutes named parameters', () => {
    expect(translate('zh', 'app.plies', { count: 12 })).toBe('12 个半回合');
    expect(translate('en', 'app.plies', { count: 12 })).toBe('12 plies');
    expect(translate('en', 'message.pgnExported', { name: 'a.pgn' })).toBe('PGN exported as a.pgn.');
  });

  it('leaves unknown placeholders untouched instead of printing "undefined"', () => {
    expect(translate('en', 'app.plies', {})).toBe('{count} plies');
    expect(translate('en', 'app.plies', { other: 1 })).toBe('{count} plies');
  });

  it('falls back to Chinese (and then to the key) for a language it does not know', () => {
    const unknown = 'xx' as Language;
    expect(translate(unknown, 'controls.undo')).toBe(zh['controls.undo']);
  });

  it('builds colour and piece names for both languages', () => {
    for (const color of COLORS) {
      expect(translate('zh', colorKey(color))).toMatch(/^[\u4e00-\u9fa5]+$/);
      expect(translate('en', colorKey(color))).toMatch(/^[A-Z][a-z]+$/);
    }
    for (const role of ROLES) {
      expect(translate('zh', pieceKey(role)).length).toBe(1);
      expect(translate('en', pieceKey(role)).length).toBeGreaterThan(2);
    }
  });

  it('names every difficulty in both languages', () => {
    for (const level of DIFFICULTY_ORDER) {
      expect(translate('zh', difficultyLabelKey(level))).not.toBe('');
      expect(translate('zh', difficultyDescriptionKey(level))).not.toBe('');
      expect(translate('en', difficultyLabelKey(level))).toBe(
        { easy: 'Easy', medium: 'Medium', hard: 'Hard', master: 'Master' }[level],
      );
      expect(translate('en', difficultyDescriptionKey(level)).length).toBeGreaterThan(10);
    }
  });

  it('names every promotion choice, falling back to the piece name for non-promotion roles', () => {
    expect(translate('zh', promotionRoleKey('q'))).toBe('后');
    expect(translate('en', promotionRoleKey('n'))).toBe('Knight');
    // King and pawn are not legal promotion targets, but the helper must still be total.
    expect(translate('zh', promotionRoleKey('k'))).toBe(translate('zh', pieceKey('k')));
  });
});

describe('message descriptors', () => {
  it('keeps the key and params instead of a rendered string, so a language switch re-renders', () => {
    const descriptor = asMessage('message.pgnExported', { name: 'game.pgn' });
    expect(descriptor).toEqual({ key: 'message.pgnExported', params: { name: 'game.pgn' } });
    expect(formatMessage('zh', descriptor)).toBe('PGN 已导出为 game.pgn。');
    expect(formatMessage('en', descriptor)).toBe('PGN exported as game.pgn.');
  });

  it('omits an empty params object', () => {
    expect(asMessage('message.fenCopied')).toEqual({ key: 'message.fenCopied' });
  });

  it('renders nothing for a missing descriptor', () => {
    expect(formatMessage('en', null)).toBeNull();
    expect(formatMessage('zh', undefined)).toBeNull();
  });
});
