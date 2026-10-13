import { useState } from 'react';
import { Modal } from './Modal';
import { useGameStore } from '../../store/gameStore';
import { backRankFromIndex, generatePosition, isValidBackRank, normalizeBackRank } from '../../core/chess960/generate';
import { DIFFICULTY_ORDER } from '../../core/engine/difficulty';
import { difficultyDescriptionKey, difficultyLabelKey, useI18n } from '../../i18n';
import type { EngineLevelName } from '../../core/engine/protocol';
import type { Color } from '../../core/types';
import type { GameMode } from '../../store/gameStore';

export interface NewGameDialogProps {
  onClose: () => void;
}

type StartKind = 'random' | 'index' | 'fen';

/** New-game dialog: random Chess960, a specific index, or a pasted FEN. */
export function NewGameDialog({ onClose }: NewGameDialogProps): React.JSX.Element {
  const { t } = useI18n();
  const mode = useGameStore((state) => state.mode);
  const playerColor = useGameStore((state) => state.playerColor);
  const aiLevel = useGameStore((state) => state.aiLevel);
  const newGame = useGameStore((state) => state.newGame);

  const [kind, setKind] = useState<StartKind>('random');
  const [indexText, setIndexText] = useState(() => String(generatePosition().index));
  const [fenText, setFenText] = useState('');
  const [localMode, setLocalMode] = useState<GameMode>(mode);
  const [localColor, setLocalColor] = useState<Color>(playerColor);
  const [localLevel, setLocalLevel] = useState<EngineLevelName>(aiLevel);
  /** Validation error, kept as a rendered string because every branch is fully local. */
  const [error, setError] = useState<string | null>(null);

  const resolvedIndex = Number.parseInt(indexText, 10);
  const previewBackRank =
    kind === 'index' && Number.isInteger(resolvedIndex) && resolvedIndex >= 0 && resolvedIndex <= 959
      ? backRankFromIndex(resolvedIndex)
      : null;
  const fenBackRank = kind === 'fen' ? normalizeBackRank(extractBackRank(fenText)) : null;

  const start = (): void => {
    setError(null);
    if (kind === 'random') {
      newGame({ index: generatePosition().index, mode: localMode, playerColor: localColor, aiLevel: localLevel });
      onClose();
      return;
    }
    if (kind === 'index') {
      if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0 || resolvedIndex > 959) {
        setError(t('newGame.errIndex'));
        return;
      }
      newGame({ index: resolvedIndex, mode: localMode, playerColor: localColor, aiLevel: localLevel });
      onClose();
      return;
    }
    const fen = fenText.trim();
    if (!fen) {
      setError(t('newGame.errFenRequired'));
      return;
    }
    if (!/^[rnbqkpRNBQKP1-8/]+( [wb])?( [-a-hA-HKQkq]+)?/.test(fen)) {
      setError(t('newGame.errFenInvalid'));
      return;
    }
    try {
      newGame({ startFen: fen, mode: localMode, playerColor: localColor, aiLevel: localLevel });
      onClose();
    } catch (cause) {
      // The core layer throws English parse errors; show them as the detail of a localised frame.
      setError(t('newGame.errStart', { detail: cause instanceof Error ? cause.message : String(cause) }));
    }
  };

  return (
    <Modal title={t('newGame.title')} onClose={onClose} testId="new-game-dialog">
      <div className="form">
        <fieldset className="form__group">
          <legend>{t('newGame.startingPosition')}</legend>
          <label className="radio">
            <input type="radio" name="start" checked={kind === 'random'} onChange={() => setKind('random')} />
            <span>{t('newGame.random')}</span>
          </label>
          <label className="radio">
            <input type="radio" name="start" checked={kind === 'index'} onChange={() => setKind('index')} />
            <span>{t('newGame.indexOption')}</span>
          </label>
          {kind === 'index' && (
            <div className="form__row">
              <input
                type="number"
                min={0}
                max={959}
                value={indexText}
                onChange={(event) => setIndexText(event.target.value)}
                data-testid="index-input"
                aria-label={t('newGame.indexLabel')}
              />
              <button
                type="button"
                className="button"
                onClick={() => setIndexText(String(generatePosition().index))}
                title={t('newGame.randomIndexTitle')}
              >
                {t('newGame.randomButton')}
              </button>
              {previewBackRank && (
                <code className="form__preview" data-testid="index-preview">
                  {previewBackRank}
                </code>
              )}
            </div>
          )}
          <label className="radio">
            <input type="radio" name="start" checked={kind === 'fen'} onChange={() => setKind('fen')} />
            <span>{t('newGame.customFen')}</span>
          </label>
          {kind === 'fen' && (
            <div className="form__column">
              <textarea
                rows={3}
                value={fenText}
                placeholder="nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w HBhb - 0 1"
                onChange={(event) => setFenText(event.target.value)}
                data-testid="fen-input"
                aria-label={t('newGame.fenLabel')}
              />
              {fenBackRank && isValidBackRank(fenBackRank) && (
                <small>{t('newGame.recognised', { backRank: fenBackRank })}</small>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="form__group">
          <legend>{t('newGame.opponent')}</legend>
          <select
            value={localMode}
            onChange={(event) => setLocalMode(event.target.value === 'ai' ? 'ai' : 'local')}
            data-testid="dialog-mode-select"
          >
            <option value="local">{t('controls.modeLocal')}</option>
            <option value="ai">{t('controls.modeAi')}</option>
          </select>
          <div className="form__row">
            <label className="field">
              <span>{t('controls.youPlay')}</span>
              <select
                value={localColor}
                onChange={(event) => setLocalColor(event.target.value === 'black' ? 'black' : 'white')}
                disabled={localMode !== 'ai'}
                data-testid="dialog-color-select"
              >
                <option value="white">{t('color.white')}</option>
                <option value="black">{t('color.black')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('controls.difficulty')}</span>
              <select
                value={localLevel}
                onChange={(event) => setLocalLevel(event.target.value as EngineLevelName)}
                disabled={localMode !== 'ai'}
                data-testid="dialog-level-select"
              >
                {DIFFICULTY_ORDER.map((level) => (
                  <option key={level} value={level}>
                    {t(difficultyLabelKey(level))} — {t(difficultyDescriptionKey(level))}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="dialog__actions">
        <button type="button" className="button button--primary" onClick={start} data-testid="start-game">
          {t('newGame.startGame')}
        </button>
        <button type="button" className="button" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  );
}

function extractBackRank(fen: string): string {
  const rows = (fen.trim().split(/\s+/)[0] ?? '').split('/');
  return rows[rows.length - 1] ?? '';
}
