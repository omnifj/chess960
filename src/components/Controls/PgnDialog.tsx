import { Modal } from './Modal';
import { useGameStore } from '../../store/gameStore';
import { copyText } from '../../utils/storage';
import { asMessage, useI18n } from '../../i18n';

export interface PgnDialogProps {
  onClose: () => void;
}

/** Shows the PGN of the current game with a copy button. */
export function PgnDialog({ onClose }: PgnDialogProps): React.JSX.Element {
  const { t } = useI18n();
  const game = useGameStore((state) => state.game);
  const version = useGameStore((state) => state.version);
  void version;
  const pgn = game.toPgn();
  const setMessage = useGameStore((state) => state.setMessage);

  return (
    <Modal title={t('pgn.title')} onClose={onClose} testId="pgn-dialog">
      <textarea readOnly value={pgn} rows={16} className="pgn" data-testid="pgn-text" aria-label={t('pgn.title')} />
      <div className="dialog__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            void copyText(pgn).then((ok) =>
              setMessage(asMessage(ok ? 'message.pgnCopied' : 'message.pgnCopyFailed')),
            );
            onClose();
          }}
          data-testid="copy-pgn"
        >
          {t('pgn.copy')}
        </button>
        <button type="button" className="button" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}
