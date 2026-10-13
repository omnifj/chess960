import { PIECE_GLYPHS } from './Board';
import type { Role } from '../../core/types';

export interface PieceViewProps {
  role: Role;
  color: 'white' | 'black';
  /** Rendered as a floating layer while being dragged. */
  floating?: boolean;
  style?: React.CSSProperties;
  testId?: string;
}

/** A single chess piece. Unicode glyphs with a contrasting outline so both colours read well. */
export function PieceView({ role, color, floating, style, testId }: PieceViewProps): React.JSX.Element {
  return (
    <span
      className={`piece piece--${color}${floating ? ' piece--drag' : ''}`}
      style={style}
      data-testid={testId}
      aria-hidden="true"
    >
      {PIECE_GLYPHS[role]}
    </span>
  );
}

export { PIECE_GLYPHS };
