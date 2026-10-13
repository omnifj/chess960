import { useCallback, useEffect, useMemo } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useEngineStore } from '../../store/engineStore';
import { DIFFICULTY_ORDER } from '../../core/engine/difficulty';
import { requestHint } from '../../hooks/useAiPlayer';
import { copyText, downloadText } from '../../utils/storage';
import { algebraic } from '../../core/squares';
import { asMessage, difficultyLabelKey, useI18n } from '../../i18n';

export interface GameControlsProps {
  onOpenNewGame: () => void;
  onOpenSettings: () => void;
  onOpenPgn: () => void;
}

/** The control bar: game actions, engine setup and the share/export helpers. */
export function GameControls({ onOpenNewGame, onOpenSettings, onOpenPgn }: GameControlsProps): React.JSX.Element {
  const { t } = useI18n();
  const mode = useGameStore((state) => state.mode);
  const playerColor = useGameStore((state) => state.playerColor);
  const aiLevel = useGameStore((state) => state.aiLevel);
  const over = useGameStore((state) => state.over);
  const thinking = useGameStore((state) => state.isAiThinking);
  const selected = useGameStore((state) => state.selected);
  const moveCount = useGameStore((state) => state.moveCount);
  const fen = useGameStore((state) => state.fen);
  const game = useGameStore((state) => state.game);
  const promotionPending = useGameStore((state) => state.promotion !== null);
  const hint = useEngineStore((state) => state.hint);
  const hintBusy = useEngineStore((state) => state.hintBusy);
  const engineKind = useEngineStore((state) => state.engine);

  const undo = useGameStore((state) => state.undo);
  const resign = useGameStore((state) => state.resign);
  const agreeDraw = useGameStore((state) => state.agreeDraw);
  const claimDraw = useGameStore((state) => state.claimDraw);
  const flipBoard = useGameStore((state) => state.flipBoard);
  const setMode = useGameStore((state) => state.setMode);
  const setPlayerColor = useGameStore((state) => state.setPlayerColor);
  const setAiLevel = useGameStore((state) => state.setAiLevel);
  const setMessage = useGameStore((state) => state.setMessage);
  const restart = useGameStore((state) => state.restart);

  const copyFen = useCallback(async () => {
    const ok = await copyText(fen);
    setMessage(asMessage(ok ? 'message.fenCopied' : 'message.fenCopyFailed'));
  }, [fen, setMessage]);

  const exportPgn = useCallback(() => {
    const name = `chess960-${game.startIndex ?? 'custom'}-${new Date().toISOString().slice(0, 10)}.pgn`;
    downloadText(name, game.toPgn());
    setMessage(asMessage('message.pgnExported', { name }));
  }, [game, setMessage]);

  const onHint = useCallback(() => {
    void requestHint();
  }, []);

  // Keyboard shortcuts: U undo, F flip, C copy FEN, H hint.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'u') undo();
      else if (key === 'f') flipBoard();
      else if (key === 'c') void copyFen();
      else if (key === 'h') onHint();
      else if (key === 'n') onOpenNewGame();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [undo, flipBoard, copyFen, onHint, onOpenNewGame]);

  const canClaim = useMemo(() => {
    void moveCount;
    return !over;
  }, [moveCount, over]);

  const hintMove = hint
    ? hint.castle
      ? `${algebraic(hint.from)}${hint.castle === 'king' ? ' O-O' : ' O-O-O'}`
      : `${algebraic(hint.from)}–${algebraic(hint.to)}`
    : null;

  return (
    <section className="controls" aria-label={t('controls.label')}>
      <div className="controls__group controls__group--primary">
        <button type="button" className="button button--primary" onClick={onOpenNewGame} data-testid="new-game">
          {t('controls.newGame')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => undo()}
          disabled={thinking || moveCount === 0 || promotionPending}
          data-testid="undo"
          title={t('controls.undoTitle')}
        >
          {t('controls.undo')}
        </button>
        <button
          type="button"
          className="button"
          onClick={restart}
          disabled={thinking || promotionPending}
          data-testid="restart"
          title={t('controls.restartTitle')}
        >
          {t('controls.restart')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => flipBoard()}
          data-testid="flip"
          title={t('controls.flipTitle')}
        >
          {t('controls.flip')}
        </button>
      </div>

      <div className="controls__group">
        <button
          type="button"
          className="button"
          onClick={() => {
            if (over) return;
            if (window.confirm(t('controls.resignConfirm'))) resign();
          }}
          disabled={over || promotionPending}
          data-testid="resign"
        >
          {t('controls.resign')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => agreeDraw()}
          disabled={over || promotionPending}
          data-testid="draw"
        >
          {t('controls.draw')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            const reason = claimDraw();
            if (reason === 'threefold') setMessage(asMessage('message.drawClaimedThreefold'));
            else if (reason === 'fifty-move') setMessage(asMessage('message.drawClaimedFiftyMove'));
            else if (reason) setMessage(asMessage('message.drawClaimed', { reason }));
            else setMessage(asMessage('message.nothingToClaim'));
          }}
          disabled={!canClaim}
          data-testid="claim-draw"
          title={t('controls.claimDrawTitle')}
        >
          {t('controls.claimDraw')}
        </button>
      </div>

      <div className="controls__group">
        <button
          type="button"
          className="button"
          onClick={() => void copyFen()}
          data-testid="copy-fen"
          title={t('controls.copyFenTitle')}
        >
          {t('controls.copyFen')}
        </button>
        <button type="button" className="button" onClick={exportPgn} data-testid="export-pgn">
          {t('controls.exportPgn')}
        </button>
        <button type="button" className="button" onClick={onOpenPgn} data-testid="show-pgn">
          {t('controls.showPgn')}
        </button>
        <button
          type="button"
          className="button"
          onClick={onHint}
          disabled={mode !== 'ai' || over || thinking || hintBusy}
          data-testid="hint"
          title={t('controls.hintTitle')}
        >
          {hintBusy ? t('controls.hintBusy') : t('controls.hint')}
        </button>
      </div>

      <div className="controls__group controls__group--selects">
        <label className="field">
          <span>{t('controls.mode')}</span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value === 'ai' ? 'ai' : 'local')}
            data-testid="mode-select"
          >
            <option value="local">{t('controls.modeLocal')}</option>
            <option value="ai">{t('controls.modeAi')}</option>
          </select>
        </label>

        <label className="field">
          <span>{t('controls.youPlay')}</span>
          <select
            value={playerColor}
            onChange={(event) => setPlayerColor(event.target.value === 'black' ? 'black' : 'white')}
            disabled={mode !== 'ai'}
            data-testid="color-select"
          >
            <option value="white">{t('color.white')}</option>
            <option value="black">{t('color.black')}</option>
          </select>
        </label>

        <label className="field">
          <span>{t('controls.difficulty')}</span>
          <select
            value={aiLevel}
            onChange={(event) => setAiLevel(event.target.value as (typeof DIFFICULTY_ORDER)[number])}
            disabled={mode !== 'ai'}
            data-testid="level-select"
          >
            {DIFFICULTY_ORDER.map((level) => (
              <option key={level} value={level}>
                {t(difficultyLabelKey(level))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="controls__meta">
        <span title={t('controls.engineTitle')}>
          {t(engineKind === 'stockfish' ? 'engine.stockfish' : 'engine.builtin')}
        </span>
        {selected !== null && <span>{t('controls.selected', { square: algebraic(selected) })}</span>}
        {hintMove && <span data-testid="hint-label">{t('controls.hintLabel', { move: hintMove })}</span>}
        <button type="button" className="button button--link" onClick={onOpenSettings} data-testid="open-settings">
          {t('controls.settings')}
        </button>
      </div>
      <FenLine fen={fen} />
    </section>
  );
}

function FenLine({ fen }: { fen: string }): React.JSX.Element {
  return (
    <div className="fenline">
      <code data-testid="fen-text">{fen}</code>
    </div>
  );
}
