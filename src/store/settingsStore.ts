import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DIFFICULTY_ORDER, isEngineLevelName } from '../core/engine/difficulty';
import { DEFAULT_LANGUAGE, normalizeLanguage } from '../i18n/types';
import type { Language } from '../i18n/types';
import type { EngineLevelName } from '../core/engine/protocol';
import type { Color } from '../core/types';

export type GameMode = 'local' | 'ai';
export type BoardTheme = 'classic' | 'green' | 'blue' | 'walnut';
export type PieceStyle = 'unicode' | 'merida';

export interface SettingsState {
  mode: GameMode;
  /** Human player's colour in AI mode; ignored in local mode. */
  playerColor: Color;
  aiLevel: EngineLevelName;
  /** Show the square coordinates around the board. */
  showCoordinates: boolean;
  /** Highlight the legal destinations of the selected piece. */
  showLegalMoves: boolean;
  /** Play a short sound when a move is made. */
  soundEnabled: boolean;
  /** Board orientation follows the human player's colour after a new game. */
  autoFlip: boolean;
  theme: BoardTheme;
  pieceStyle: PieceStyle;
  /** Optional clock. */
  timerEnabled: boolean;
  /** Base time per side in minutes. */
  baseMinutes: number;
  /** Increment per move in seconds. */
  incrementSeconds: number;
  /** Language of the interface. */
  language: Language;

  setMode: (mode: GameMode) => void;
  setPlayerColor: (color: Color) => void;
  setAiLevel: (level: EngineLevelName) => void;
  toggle: (key: 'showCoordinates' | 'showLegalMoves' | 'soundEnabled' | 'autoFlip' | 'timerEnabled') => void;
  setTheme: (theme: BoardTheme) => void;
  setPieceStyle: (style: PieceStyle) => void;
  setTimeControl: (baseMinutes: number, incrementSeconds: number) => void;
  setLanguage: (language: Language) => void;
  reset: () => void;
}

export type DefaultSettings = {
  mode: GameMode;
  playerColor: Color;
  aiLevel: EngineLevelName;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  soundEnabled: boolean;
  autoFlip: boolean;
  theme: BoardTheme;
  pieceStyle: PieceStyle;
  timerEnabled: boolean;
  baseMinutes: number;
  incrementSeconds: number;
  language: Language;
};

export const DEFAULT_SETTINGS: DefaultSettings = {
  mode: 'local',
  playerColor: 'white',
  aiLevel: 'medium',
  showCoordinates: true,
  showLegalMoves: true,
  soundEnabled: false,
  autoFlip: true,
  theme: 'classic',
  pieceStyle: 'unicode',
  timerEnabled: false,
  baseMinutes: 10,
  incrementSeconds: 0,
  // Chinese is the default interface language.
  language: DEFAULT_LANGUAGE,
};

/** Sanitise anything that came back from localStorage. */
export function normalizeSettings(input: Partial<SettingsState> | undefined): DefaultSettings {
  const raw = input ?? {};
  const mode: GameMode = raw.mode === 'ai' ? 'ai' : 'local';
  const playerColor: Color = raw.playerColor === 'black' ? 'black' : 'white';
  const aiLevel: EngineLevelName = isEngineLevelName(raw.aiLevel) ? raw.aiLevel : DEFAULT_SETTINGS.aiLevel;
  const theme: BoardTheme =
    raw.theme === 'green' || raw.theme === 'blue' || raw.theme === 'walnut' ? raw.theme : 'classic';
  const baseMinutes =
    typeof raw.baseMinutes === 'number' && raw.baseMinutes > 0 && raw.baseMinutes <= 180 ? raw.baseMinutes : 10;
  const incrementSeconds =
    typeof raw.incrementSeconds === 'number' && raw.incrementSeconds >= 0 && raw.incrementSeconds <= 60
      ? raw.incrementSeconds
      : 0;
  return {
    mode,
    playerColor,
    aiLevel,
    showCoordinates: raw.showCoordinates ?? DEFAULT_SETTINGS.showCoordinates,
    showLegalMoves: raw.showLegalMoves ?? DEFAULT_SETTINGS.showLegalMoves,
    soundEnabled: raw.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
    autoFlip: raw.autoFlip ?? DEFAULT_SETTINGS.autoFlip,
    theme,
    pieceStyle: raw.pieceStyle === 'merida' ? 'merida' : 'unicode',
    timerEnabled: raw.timerEnabled ?? DEFAULT_SETTINGS.timerEnabled,
    baseMinutes,
    incrementSeconds,
    language: normalizeLanguage(raw.language),
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setMode: (mode) => set({ mode }),
      setPlayerColor: (playerColor) => set({ playerColor }),
      setAiLevel: (aiLevel) => set({ aiLevel }),
      toggle: (key) => set((state) => ({ [key]: !state[key] }) as Partial<SettingsState>),
      setTheme: (theme) => set({ theme }),
      setPieceStyle: (pieceStyle) => set({ pieceStyle }),
      setTimeControl: (baseMinutes, incrementSeconds) => set({ baseMinutes, incrementSeconds }),
      setLanguage: (language) => set({ language }),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'chess960:settings',
      version: 2,
      // v1 shipped a `language` field that nothing could change (the default was 'en'). Bump to v2
      // so existing installs pick up the new Chinese default instead of keeping that stale value.
      // The partial result is safe: `merge` runs `normalizeSettings` over it straight afterwards.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<SettingsState>;
        return (version < 2 ? { ...state, language: DEFAULT_LANGUAGE } : state) as SettingsState;
      },
      merge: (persisted, current) => ({ ...current, ...normalizeSettings(persisted as Partial<SettingsState>) }),
    },
  ),
);

export { DIFFICULTY_ORDER };
export type { EngineLevelName, Language };
