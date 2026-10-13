import { useCallback, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { formatMessage, translate, asMessage, colorKey } from './translate';
import { DEFAULT_LANGUAGE } from './types';
import type { MessageDescriptor, MessageKey } from './messages';
import type { Language, MessageParams } from './types';
import type { Color } from '../core/types';

export interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Translate a key for the active language. */
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Render a descriptor stored in a zustand store, or null. */
  format: (descriptor: MessageDescriptor | null | undefined) => string | null;
  /** Localised colour name ("白方" / "White"). */
  colorName: (color: Color) => string;
}

/**
 * Interface language for a component. Subscribing to `settingsStore.language` is what makes the
 * whole tree re-render — including messages that the stores produced *before* the switch, because
 * they are kept as descriptors and only rendered here.
 */
export function useI18n(): I18n {
  const stored = useSettingsStore((state) => state.language);
  const language = stored ?? DEFAULT_LANGUAGE;
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => translate(language, key, params),
    [language],
  );
  const format = useCallback(
    (descriptor: MessageDescriptor | null | undefined) => formatMessage(language, descriptor),
    [language],
  );
  const colorName = useCallback((color: Color) => translate(language, colorKey(color)), [language]);

  return useMemo(
    () => ({ language, setLanguage, t, format, colorName }),
    [language, setLanguage, t, format, colorName],
  );
}

/** Translate outside React (imperative helpers, tests, `window.confirm`-style code). */
export function tNow(key: MessageKey, params?: MessageParams): string {
  return translate(currentLanguage(), key, params);
}

/** The active language, read imperatively. */
export function currentLanguage(): Language {
  return useSettingsStore.getState().language ?? DEFAULT_LANGUAGE;
}

export { asMessage };
