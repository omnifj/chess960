import type { DifficultyPreset, EngineLevelName } from './protocol';

/**
 * Difficulty presets. The built-in engine uses `depth` / `randomness` / `noiseCp`; the
 * Stockfish worker uses `movetimeMs` / `skill`. Both are exposed so the UI can show what a
 * level means without knowing which engine is running.
 */
export const DIFFICULTIES: Record<EngineLevelName, DifficultyPreset> = {
  easy: {
    name: 'easy',
    label: 'Easy',
    description: 'Shallow search, sometimes plays a loose move.',
    depth: 1,
    movetimeMs: 150,
    skill: 0,
    randomness: 0.35,
    noiseCp: 90,
  },
  medium: {
    name: 'medium',
    label: 'Medium',
    description: 'Club-player strength; sees immediate tactics.',
    depth: 3,
    movetimeMs: 400,
    skill: 6,
    randomness: 0.08,
    noiseCp: 30,
  },
  hard: {
    name: 'hard',
    label: 'Hard',
    description: 'Strong tactical play with a deeper search.',
    depth: 4,
    movetimeMs: 1000,
    skill: 12,
    randomness: 0,
    noiseCp: 8,
  },
  master: {
    name: 'master',
    label: 'Master',
    description: 'Full strength; give it a few seconds per move.',
    depth: 6,
    movetimeMs: 3000,
    skill: 20,
    randomness: 0,
    noiseCp: 0,
  },
};

export const DIFFICULTY_ORDER: EngineLevelName[] = ['easy', 'medium', 'hard', 'master'];

export function difficulty(name: EngineLevelName): DifficultyPreset {
  return DIFFICULTIES[name] ?? DIFFICULTIES.medium;
}

export function isEngineLevelName(value: unknown): value is EngineLevelName {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'master';
}
