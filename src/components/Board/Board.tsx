import { useCallback, useEffect, useRef, useState } from 'react';
import { Board as BoardModel } from '../../core/board';
import { algebraic, squareFrom } from '../../core/squares';
import { colorKey, pieceKey, useI18n } from '../../i18n';
import type { Color, Move, Role, Square } from '../../core/types';

export interface BoardProps {
  /** Piece placement of the current position (FEN placement field). */
  placement: string;
  orientation: Color;
  selected: Square | null;
  legalMoves: Move[];
  lastMove: Move | null;
  /** Square of the king in check, when the side to move is in check. */
  checkSquare: Square | null;
  flipped?: boolean;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  /** Disables all interaction (engine thinking, game over, promotion dialog open). */
  locked: boolean;
  /** Legal destinations per square for click-to-move; falls back to `legalMoves` when omitted. */
  movesFor: (square: Square) => Move[];
  onSelect: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  /** Engine hint arrow, drawn as a translucent overlay. */
  hint?: Move | null;
}

interface DragState {
  from: Square;
  role: Role;
  color: Color;
  x: number;
  y: number;
  pointerId: number;
}

const PIECE_GLYPHS: Record<Role, string> = { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' };

/**
 * The board itself. Rendering is CSS Grid plus absolutely positioned piece layers so that a
 * dragged piece can be moved with a transform without disturbing the layout.
 */
export function ChessBoard(props: BoardProps): React.JSX.Element {
  const {
    placement,
    orientation,
    selected,
    legalMoves,
    lastMove,
    checkSquare,
    showCoordinates,
    showLegalMoves,
    locked,
    movesFor,
    onSelect,
    onMove,
    hint,
  } = props;

  const { t } = useI18n();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const board = BoardModel.fromFenPlacement(placement);

  /** Square under a client point, or null when the point is outside the board. */
  const squareAt = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const element = boardRef.current;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const column = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (column < 0 || column > 7 || row < 0 || row > 7) return null;
      const file = orientation === 'white' ? column : 7 - column;
      const rank = orientation === 'white' ? 7 - row : row;
      return squareFrom(file, rank);
    },
    [orientation],
  );

  // Escape cancels an in-flight drag.
  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrag(null);
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [drag]);

  const destinations = new Set(legalMoves.map((move) => move.to));

  const handleSquarePointerDown = (event: React.PointerEvent<HTMLDivElement>, square: Square): void => {
    if (locked || event.button !== 0) return;
    const piece = board.colorAt(square);
    const role = board.roleAt(square);

    // A press on a legal destination completes the move (click-to-move).
    if (selected !== null && selected !== square && destinations.has(square)) {
      onMove(selected, square);
      return;
    }
    if (!piece || !role) {
      onSelect(square); // empty square: clear the selection
      return;
    }
    // Select the pressed piece (so a click-click sequence works) and start a drag as well, which
    // lets the same press either tap out a move or drag the piece somewhere else.
    onSelect(square);
    const moves = movesFor(square);
    if (moves.length === 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ from: square, role, color: piece, x: event.clientX, y: event.clientY, pointerId: event.pointerId });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag({ ...drag, x: event.clientX, y: event.clientY });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = squareAt(event.clientX, event.clientY);
    const from = drag.from;
    setDrag(null);
    if (target === null || target === from) return;
    onMove(from, target);
  };

  const dragOffset = (): { left: string; top: string } | null => {
    if (!drag || !boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const cell = rect.width / 8;
    const left = ((drag.x - rect.left) / rect.width) * 100;
    const top = ((drag.y - rect.top) / rect.height) * 100;
    return { left: `calc(${left}% - ${cell / 2}px)`, top: `calc(${top}% - ${cell / 2}px)` };
  };
  const offset = dragOffset();

  const squares: React.JSX.Element[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const file = orientation === 'white' ? column : 7 - column;
      const rank = orientation === 'white' ? 7 - row : row;
      const square = squareFrom(file, rank);
      const piece = board.colorAt(square);
      const role = board.roleAt(square);
      const isLight = (file + rank) % 2 === 1;
      const classes = ['square', isLight ? 'square--light' : 'square--dark'];
      if (selected === square) classes.push('square--selected');
      if (lastMove && (lastMove.from === square || lastMove.to === square)) classes.push('square--last');
      if (checkSquare === square) classes.push('square--check');
      if (showLegalMoves && destinations.has(square)) {
        classes.push(piece ? 'square--capture' : 'square--target');
      }
      if (hint && hint.from === square) classes.push('square--hint-from');
      if (hint && hint.to === square) classes.push('square--hint-to');

      const showFile = showCoordinates && row === 7;
      const showRank = showCoordinates && column === 0;

      squares.push(
        <div
          key={square}
          className={classes.join(' ')}
          data-square={algebraic(square)}
          data-testid={`square-${algebraic(square)}`}
          onPointerDown={(event) => handleSquarePointerDown(event, square)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setDrag(null)}
          role="gridcell"
          aria-label={
            piece && role
              ? t('board.squareWithPiece', {
                  square: algebraic(square),
                  color: t(colorKey(piece)),
                  role: t(pieceKey(role)),
                })
              : t('board.square', { square: algebraic(square) })
          }
        >
          {showRank && <span className="coord coord--rank">{rank + 1}</span>}
          {showFile && <span className="coord coord--file">{'abcdefgh'[file]}</span>}
          {piece && role && !(drag && drag.from === square) && (
            <span
              className={`piece piece--${piece}${locked ? '' : ' piece--draggable'}`}
              data-testid={`piece-${algebraic(square)}`}
            >
              {PIECE_GLYPHS[role]}
            </span>
          )}
        </div>,
      );
    }
  }

  return (
    <div
      className={`board board--${orientation}${drag ? ' board--dragging' : ''}`}
      ref={boardRef}
      role="grid"
      aria-label={t('board.label')}
      data-testid="board"
      data-placement={placement}
    >
      {squares}
      {drag && offset && (
        <span
          className={`piece piece--drag piece--${drag.color}`}
          style={{ left: offset.left, top: offset.top }}
          data-testid="drag-piece"
        >
          {PIECE_GLYPHS[drag.role]}
        </span>
      )}
    </div>
  );
}

export { PIECE_GLYPHS };
