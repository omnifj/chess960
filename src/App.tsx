import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChessBoard } from './components/Board/Board';
import { PromotionDialog } from './components/Board/PromotionDialog';
import { GameControls } from './components/Controls/GameControls';
import { NewGameDialog } from './components/Controls/NewGameDialog';
import { PgnDialog } from './components/Controls/PgnDialog';
import { SettingsPanel } from './components/Controls/SettingsPanel';
import { MoveList } from './components/MoveList/MoveList';
import { StatusBar } from './components/Status/StatusBar';
import { useAiPlayer } from './hooks/useAiPlayer';
import { useClock } from './hooks/useClock';
import { useDialogStore } from './store/dialogStore';
import { useEngineStore } from './store/engineStore';
import { useGameStore } from './store/gameStore';
import { useSettingsStore } from './store/settingsStore';
import { asMessage, useI18n } from './i18n';
import type { Color, Move, Square } from './core/types';

/**
 * App shell. Layout: board on the left, information and controls on the right; on narrow
 * screens the two stack. All rules live in `src/core`, all state in `src/store`; this file only
 * wires them to the DOM.
 */
export function App(): React.JSX.Element {
  const { t, language, colorName } = useI18n();
  const settings = useSettingsStore();
  const dialogs = useDialogStore();

  const game = useGameStore((state) => state.game);
  const version = useGameStore((state) => state.version);
  const selected = useGameStore((state) => state.selected);
  const legalMoves = useGameStore((state) => state.legalMoves);
  const orientation = useGameStore((state) => state.orientation);
  const mode = useGameStore((state) => state.mode);
  const playerColor = useGameStore((state) => state.playerColor);
  const turn = useGameStore((state) => state.turn);
  const over = useGameStore((state) => state.over);
  const moveCount = useGameStore((state) => state.moveCount);
  const message = useGameStore((state) => state.message);
  const clock = useGameStore((state) => state.clock);
  const promotionPending = useGameStore((state) => state.promotion !== null);

  const selectSquare = useGameStore((state) => state.selectSquare);
  const tryMove = useGameStore((state) => state.tryMove);
  const setMessage = useGameStore((state) => state.setMessage);
  const legalMovesFrom = useGameStore((state) => state.legalMovesFrom);
  const resignColor = useGameStore((state) => state.resign);

  const hint = useEngineStore((state) => state.hint);

  const [clockEnabled, setClockEnabled] = useState(settings.timerEnabled);

  const ai = useAiPlayer();
  const thinking = useGameStore((state) => state.isAiThinking);

  /** A short blip on move using the Web Audio API (no asset needed). */
  const playMoveSound = useCallback((): void => {
    try {
      const AudioContextCtor =
        globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.04;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.06);
      setTimeout(() => void context.close(), 200);
    } catch {
      // Sound is a nicety; never let it break the game.
    }
  }, []);

  // Keep the game clock in sync with the settings page.
  useEffect(() => {
    setClockEnabled(settings.timerEnabled);
    useGameStore.getState().setClock(settings.baseMinutes, settings.incrementSeconds, settings.timerEnabled);
  }, [settings.timerEnabled, settings.baseMinutes, settings.incrementSeconds]);

  const onFlag = useCallback(
    (color: Color) => {
      const store = useGameStore.getState();
      if (store.over) return;
      store.resign(color);
      store.setMessage(asMessage(color === 'white' ? 'message.whiteTimeout' : 'message.blackTimeout'));
    },
    [],
  );
  useClock(clockEnabled && !over, onFlag);

  // Reflect the interface language on the document: `index.html` ships the Chinese default, and
  // switching to English updates both the lang attribute and the tab title.
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = t('app.title');
  }, [language, t]);

  // Apply the board theme / piece style / legal-move preference as CSS-data attributes.
  const rootData = useMemo(
    () => ({
      'data-theme': settings.theme,
      'data-pieces': settings.pieceStyle,
    }),
    [settings.theme, settings.pieceStyle],
  );

  const status = game.status;
  void version;

  const checkSquare: Square | null = status.check ? game.position.kingSquare(turn) : null;
  const lastMove: Move | null = game.lastMove;
  const canMove = mode === 'local' ? !over && !promotionPending : !over && !thinking && turn === playerColor && !promotionPending;

  const handleSelect = useCallback(
    (square: Square) => {
      if (!canMove) return;
      selectSquare(square);
    },
    [canMove, selectSquare],
  );

  const handleMove = useCallback(
    (from: Square, to: Square) => {
      if (!canMove) return;
      const record = tryMove(from, to);
      if (!record) {
        // Not legal from the current selection: treat it as a fresh selection attempt.
        selectSquare(from);
      } else if (settings.soundEnabled) {
        playMoveSound();
      }
    },
    [canMove, tryMove, selectSquare, settings.soundEnabled, playMoveSound],
  );

  const movesFor = useCallback((square: Square) => legalMovesFrom(square), [legalMovesFrom]);

  // Undo to an arbitrary ply when the move list is clicked.
  const undoToPly = useCallback((ply: number) => {
    const target = ply + 1;
    let guard = 0;
    while (useGameStore.getState().moveCount > target && guard < 500) {
      useGameStore.getState().undo();
      guard += 1;
    }
  }, []);

  useEffect(() => {
    if (over && mode === 'ai') useEngineStore.getState().setThinking(false);
  }, [over, mode]);

  return (
    <div className="app" {...rootData}>
      <header className="app__header">
        <h1>
          Chess<span>960</span>
        </h1>
        <p className="app__tagline">{t('app.tagline')}</p>
      </header>

      <main className="app__main">
        <div className="app__board">
          <ChessBoard
            placement={game.position.board.toFenPlacement()}
            orientation={orientation}
            selected={selected}
            legalMoves={legalMoves}
            lastMove={lastMove}
            checkSquare={checkSquare}
            showCoordinates={settings.showCoordinates}
            showLegalMoves={settings.showLegalMoves}
            locked={!canMove}
            movesFor={movesFor}
            onSelect={handleSelect}
            onMove={handleMove}
            hint={hint}
          />
          <div className="app__board-actions">
            <button
              type="button"
              className="button"
              onClick={() => useGameStore.getState().flipBoard()}
              data-testid="flip-under-board"
            >
              {t('app.flipBoard')}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                if (mode === 'local') selectSquare(null);
                else resignColor(playerColor);
              }}
              disabled={over}
              data-testid="resign-under-board"
            >
              {mode === 'local' ? t('app.clearSelection') : t('app.resign')}
            </button>
            <span className="app__ply">{t('app.plies', { count: moveCount })}</span>
          </div>
        </div>

        <aside className="app__side">
          <StatusBar
            status={status}
            turn={turn}
            mode={mode}
            playerColor={playerColor}
            ai={ai}
            index={game.startIndex}
            backRank={game.startBackRank}
            clock={clock}
            message={message}
            onDismissMessage={() => setMessage(null)}
          />
          <GameControls
            onOpenNewGame={() => dialogs.open('newGame')}
            onOpenSettings={() => dialogs.open('settings')}
            onOpenPgn={() => dialogs.open('pgn')}
          />
          <MoveList sans={game.sans} currentPly={game.length - 1} onUndoToPly={moveCount > 0 ? undoToPly : undefined} />
        </aside>
      </main>

      <footer className="app__footer">
        <span>
          {t('app.keyboardLabel')} <kbd>U</kbd> {t('shortcut.undo')} · <kbd>F</kbd> {t('shortcut.flip')} ·{' '}
          <kbd>C</kbd> {t('shortcut.copyFen')} · <kbd>H</kbd> {t('shortcut.hint')} · <kbd>N</kbd>{' '}
          {t('shortcut.newGame')}
        </span>
      </footer>

      {dialogs.newGame && <NewGameDialog onClose={() => dialogs.close('newGame')} />}
      {dialogs.settings && <SettingsPanel onClose={() => dialogs.close('settings')} />}
      {dialogs.pgn && <PgnDialog onClose={() => dialogs.close('pgn')} />}
      <PromotionDialog />

      <span className="visually-hidden" role="status">
        {over ? t('app.liveGameOver') : t('app.liveTurn', { color: colorName(turn) })}
      </span>
    </div>
  );
}
