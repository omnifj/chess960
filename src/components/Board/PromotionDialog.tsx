import { useEffect, useRef } from 'react';
import { PIECE_GLYPHS } from './Board';
import { useGameStore } from '../../store/gameStore';
import { promotionRoleKey, useI18n } from '../../i18n';
import type { Role } from '../../core/types';

/**
 * Promotion picker. It is a modal dialog but also supports the keyboard (Q/R/B/N) and Escape,
 * which is what strong players expect from a chess GUI.
 */
export function PromotionDialog(): React.JSX.Element | null {
  const { t } = useI18n();
  const promotion = useGameStore((state) => state.promotion);
  const promotionColor = useGameStore((state) => state.game.position.colorAt(state.promotion?.from ?? 0));
  const completePromotion = useGameStore((state) => state.completePromotion);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!promotion) return;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        completePromotion(null);
        return;
      }
      if (key === 'q' || key === 'r' || key === 'b' || key === 'n') {
        if (promotion.options.includes(key as Role)) completePromotion(key as Role);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [promotion, completePromotion]);

  if (!promotion) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) completePromotion(null);
      }}
    >
      <div
        className="dialog promotion"
        role="dialog"
        aria-modal="true"
        aria-label={t('promotion.label')}
        tabIndex={-1}
        ref={ref}
        data-testid="promotion-dialog"
      >
        <h2>{t('promotion.title')}</h2>
        <div className="promotion__options">
          {promotion.options.map((role) => (
            <button
              key={role}
              type="button"
              className="promotion__option"
              data-testid={`promote-${role}`}
              title={t('promotion.optionTitle', { role: t(promotionRoleKey(role)), key: role.toUpperCase() })}
              onClick={() => completePromotion(role)}
            >
              <span className={`piece piece--${promotionColor ?? 'white'}`} aria-hidden="true">
                {PIECE_GLYPHS[role]}
              </span>
              <span className="promotion__label">{t(promotionRoleKey(role))}</span>
            </button>
          ))}
        </div>
        <button type="button" className="button button--ghost" onClick={() => completePromotion(null)}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
