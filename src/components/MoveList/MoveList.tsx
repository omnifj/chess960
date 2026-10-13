import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';

export interface MoveListProps {
  sans: string[];
  /** Index of the last played ply (highlighted). */
  currentPly: number;
  onUndoToPly?: (ply: number) => void;
}

/**
 * The score sheet. Moves are grouped in pairs (white/black) and the latest ply is highlighted;
 * the container auto-scrolls so a long game stays readable.
 */
export function MoveList({ sans, currentPly, onUndoToPly }: MoveListProps): React.JSX.Element {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = listRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [sans.length]);

  const rows: Array<{ number: number; white?: string; black?: string; whitePly: number; blackPly: number }> = [];
  for (let index = 0; index < sans.length; index += 2) {
    rows.push({
      number: index / 2 + 1,
      white: sans[index],
      black: sans[index + 1],
      whitePly: index,
      blackPly: index + 1,
    });
  }

  return (
    <section className="movelist" aria-label={t('moves.label')}>
      <h2>{t('moves.title')}</h2>
      <div className="movelist__scroll" ref={listRef} data-testid="movelist">
        {rows.length === 0 && <p className="movelist__empty">{t('moves.empty')}</p>}
        {rows.map((row) => (
          <div className="movelist__row" key={row.number}>
            <span className="movelist__number">{row.number}.</span>
            {row.white !== undefined && (
              <button
                type="button"
                className={`movelist__move${currentPly === row.whitePly ? ' movelist__move--current' : ''}`}
                onClick={() => onUndoToPly?.(row.whitePly)}
                disabled={!onUndoToPly}
              >
                {row.white}
              </button>
            )}
            {row.black !== undefined && (
              <button
                type="button"
                className={`movelist__move${currentPly === row.blackPly ? ' movelist__move--current' : ''}`}
                onClick={() => onUndoToPly?.(row.blackPly)}
                disabled={!onUndoToPly}
              >
                {row.black}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
