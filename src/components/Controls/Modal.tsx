import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  footer?: ReactNode;
}

/** Accessible modal shell: Escape closes, focus moves inside, the backdrop click closes. */
export function Modal({ title, onClose, children, testId, footer }: ModalProps): React.JSX.Element {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} data-testid={testId}>
        <header className="dialog__header">
          <h2>{title}</h2>
          <button type="button" className="dialog__close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>
  );
}
