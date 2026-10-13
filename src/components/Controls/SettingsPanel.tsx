import { useEffect } from 'react';
import { Modal } from './Modal';
import { useSettingsStore } from '../../store/settingsStore';
import { useGameStore } from '../../store/gameStore';
import { DIFFICULTY_ORDER } from '../../core/engine/difficulty';
import { LANGUAGES, difficultyDescriptionKey, difficultyLabelKey, useI18n } from '../../i18n';
import type { BoardTheme, PieceStyle } from '../../store/settingsStore';

export interface SettingsPanelProps {
  onClose: () => void;
}

const THEME_VALUES: readonly BoardTheme[] = ['classic', 'green', 'blue', 'walnut'];
const PIECE_STYLE_VALUES: readonly PieceStyle[] = ['unicode', 'merida'];

/** Preferences: interface language, board look, hints, clock and the default opponent. */
export function SettingsPanel({ onClose }: SettingsPanelProps): React.JSX.Element {
  const { t } = useI18n();
  const settings = useSettingsStore();
  const setClock = useGameStore((state) => state.setClock);

  // Keep the game clock in sync with the settings.
  useEffect(() => {
    setClock(settings.baseMinutes, settings.incrementSeconds, settings.timerEnabled);
  }, [setClock, settings.baseMinutes, settings.incrementSeconds, settings.timerEnabled]);

  return (
    <Modal title={t('settings.title')} onClose={onClose} testId="settings-dialog">
      <div className="form">
        <fieldset className="form__group">
          <legend>{t('settings.interface')}</legend>
          <label className="field">
            <span>{t('settings.language')}</span>
            <select
              value={settings.language}
              onChange={(event) => settings.setLanguage(event.target.value === 'en' ? 'en' : 'zh')}
              data-testid="language-select"
            >
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {t(`language.${language}`)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="form__group">
          <legend>{t('settings.board')}</legend>
          <label className="field">
            <span>{t('settings.theme')}</span>
            <select value={settings.theme} onChange={(event) => settings.setTheme(event.target.value as BoardTheme)}>
              {THEME_VALUES.map((theme) => (
                <option key={theme} value={theme}>
                  {t(`theme.${theme}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('settings.pieces')}</span>
            <select
              value={settings.pieceStyle}
              onChange={(event) => settings.setPieceStyle(event.target.value as PieceStyle)}
            >
              {PIECE_STYLE_VALUES.map((style) => (
                <option key={style} value={style}>
                  {t(`pieces.${style}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.showCoordinates}
              onChange={() => settings.toggle('showCoordinates')}
            />
            <span>{t('settings.showCoordinates')}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.showLegalMoves} onChange={() => settings.toggle('showLegalMoves')} />
            <span>{t('settings.showLegalMoves')}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.autoFlip} onChange={() => settings.toggle('autoFlip')} />
            <span>{t('settings.autoFlip')}</span>
          </label>
        </fieldset>

        <fieldset className="form__group">
          <legend>{t('settings.opponentDefaults')}</legend>
          <label className="field">
            <span>{t('controls.difficulty')}</span>
            <select
              value={settings.aiLevel}
              onChange={(event) => settings.setAiLevel(event.target.value as (typeof DIFFICULTY_ORDER)[number])}
            >
              {DIFFICULTY_ORDER.map((level) => (
                <option key={level} value={level}>
                  {t(difficultyLabelKey(level))} — {t(difficultyDescriptionKey(level))}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="form__group">
          <legend>{t('settings.clock')}</legend>
          <label className="check">
            <input type="checkbox" checked={settings.timerEnabled} onChange={() => settings.toggle('timerEnabled')} />
            <span>{t('settings.useClock')}</span>
          </label>
          <div className="form__row">
            <label className="field">
              <span>{t('settings.minutes')}</span>
              <input
                type="number"
                min={1}
                max={180}
                value={settings.baseMinutes}
                onChange={(event) => settings.setTimeControl(Number(event.target.value) || 10, settings.incrementSeconds)}
                disabled={!settings.timerEnabled}
              />
            </label>
            <label className="field">
              <span>{t('settings.increment')}</span>
              <input
                type="number"
                min={0}
                max={60}
                value={settings.incrementSeconds}
                onChange={(event) => settings.setTimeControl(settings.baseMinutes, Number(event.target.value) || 0)}
                disabled={!settings.timerEnabled}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="form__group">
          <legend>{t('settings.accessibility')}</legend>
          <label className="check">
            <input type="checkbox" checked={settings.soundEnabled} onChange={() => settings.toggle('soundEnabled')} />
            <span>{t('settings.sound')}</span>
          </label>
        </fieldset>
      </div>

      <div className="dialog__actions">
        <button type="button" className="button button--primary" onClick={onClose} data-testid="settings-done">
          {t('settings.done')}
        </button>
      </div>
    </Modal>
  );
}
