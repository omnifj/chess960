import { formatClock } from '../../hooks/useClock';
import { useI18n } from '../../i18n';
import type { AiStatus } from '../../hooks/useAiPlayer';
import type { I18n } from '../../i18n';
import type { MessageDescriptor } from '../../i18n/messages';
import type { GameStatus } from '../../core/types';

export interface StatusBarProps {
  status: GameStatus;
  turn: 'white' | 'black';
  mode: 'local' | 'ai';
  playerColor: 'white' | 'black';
  ai: AiStatus;
  index: number | null;
  backRank: string | null;
  clock: { remaining: { white: number; black: number }; baseMs: number };
  message: MessageDescriptor | null;
  onDismissMessage: () => void;
}

/** Short human readable status line, including the win/draw reason. */
export function describeGameStatus(status: GameStatus, turn: 'white' | 'black', i18n: I18n): string {
  const { t, colorName } = i18n;
  switch (status.state) {
    case 'playing':
      return t('status.turn', { color: colorName(turn) });
    case 'check':
      return t('status.check', { color: colorName(turn) });
    case 'checkmate':
      return t('status.checkmate', { color: colorName(status.winner ?? 'white') });
    case 'stalemate':
      return t('status.stalemate');
    case 'resigned':
      return t('status.resigned', { color: colorName(status.winner ?? 'white') });
    case 'timeout':
      return t('status.timeout', { color: colorName(status.winner ?? 'white') });
    case 'draw':
      switch (status.reason) {
        case 'fifty-move':
          return t('status.drawFiftyMove');
        case 'seventy-five-move':
          return t('status.drawSeventyFiveMove');
        case 'threefold':
          return t('status.drawThreefold');
        case 'fivefold':
          return t('status.drawFivefold');
        case 'insufficient-material':
          return t('status.drawInsufficientMaterial');
        default:
          return t('status.drawAgreement');
      }
    default:
      return '';
  }
}

export function StatusBar(props: StatusBarProps): React.JSX.Element {
  const { status, turn, mode, playerColor, ai, index, backRank, clock, message, onDismissMessage } = props;
  const i18n = useI18n();
  const { t, format, colorName } = i18n;
  const finished = status.state !== 'playing' && status.state !== 'check';
  const messageText = format(message);

  return (
    <section className="status" aria-live="polite">
      <div className="status__row">
        <span
          className={`status__turn status__turn--${finished ? 'over' : turn}`}
          data-testid="status-text"
          data-state={status.state}
        >
          {describeGameStatus(status, turn, i18n)}
        </span>
        {index !== null && (
          <span
            className="badge"
            title={t('status.indexTitle', { index, backRank: backRank ?? '' })}
            data-testid="index-badge"
          >
            Chess960 #{index}
          </span>
        )}
      </div>

      {clock.baseMs > 0 && (
        <div className="clock">
          <span className={`clock__side${turn === 'black' && !finished ? ' clock__side--active' : ''}`}>
            <em>{colorName('black')}</em> {formatClock(clock.remaining.black)}
          </span>
          <span className={`clock__side${turn === 'white' && !finished ? ' clock__side--active' : ''}`}>
            <em>{colorName('white')}</em> {formatClock(clock.remaining.white)}
          </span>
        </div>
      )}

      <div className="status__meta">
        <span data-testid="mode-label">
          {mode === 'ai' ? t('status.modeAi', { color: colorName(playerColor) }) : t('status.modeLocal')}
        </span>
        {mode === 'ai' && (
          <span
            className="status__engine"
            data-testid="engine-label"
            title={format(ai.error) ?? ai.name}
          >
            {t(ai.engine === 'stockfish' ? 'engine.stockfish' : 'engine.builtin')}
            {ai.error ? t('status.engineFallback') : ''}
          </span>
        )}
      </div>

      {messageText && (
        <div className="status__message" role="status" data-testid="status-message">
          <span>{messageText}</span>
          <button
            type="button"
            className="status__dismiss"
            onClick={onDismissMessage}
            aria-label={t('status.dismiss')}
          >
            ×
          </button>
        </div>
      )}
    </section>
  );
}
