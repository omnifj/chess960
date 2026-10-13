import { castlingSideFromLetter, pieceLetter } from './board';
import { Position } from './position';
import { algebraic, colorName, fileOf, FILES, rankOf, squareFromAlgebraic } from './squares';
import { countRepetitions, evaluateStatus } from './rules';
import type { CastlingSide, Color, Move, Role, Square } from './types';

const ROLE_LETTERS: Record<Role, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/**
 * SAN for a move. Must be called on the position *before* the move is played.
 *
 * Chess960 specifics: castling is always written `O-O` / `O-O-O` (never as a king capture
 * of the rook, which is how UCI encodes it), and castling rights do not change the notation.
 */
export function moveToSan(position: Position, move: Move): string {
  const moving = position.pieceAt(move.from);
  if (!moving) throw new Error(`moveToSan: no piece on ${algebraic(move.from)}`);

  if (move.castle) {
    return withCheckSuffix(position, move, move.castle === 'king' ? 'O-O' : 'O-O-O');
  }

  const targetPiece = position.pieceAt(move.to);
  const isCapture = targetPiece !== null || move.enPassant === true;
  let san: string;

  if (moving.role === 'p') {
    san = isCapture ? `${FILES[fileOf(move.from)]}x${algebraic(move.to)}` : algebraic(move.to);
    if (move.promotion) san += `=${ROLE_LETTERS[move.promotion]}`;
  } else {
    const disambiguation = disambiguate(position, move);
    san = `${ROLE_LETTERS[moving.role]}${disambiguation}${isCapture ? 'x' : ''}${algebraic(move.to)}`;
  }
  return withCheckSuffix(position, move, san);
}

/**
 * The smallest origin hint that makes the move unambiguous:
 * file, rank, or both (when two same-role pieces share both file and rank candidates).
 */
export function disambiguate(position: Position, move: Move): string {
  const moving = position.pieceAt(move.from);
  if (!moving) return '';
  const rivals = position
    .legalMoves()
    .filter((candidate) => !candidate.castle && candidate.to === move.to && candidate.from !== move.from)
    .filter((candidate) => position.roleAt(candidate.from) === moving.role);
  if (rivals.length === 0) return '';
  const sameFile = rivals.some((rival) => fileOf(rival.from) === fileOf(move.from));
  const sameRank = rivals.some((rival) => rankOf(rival.from) === rankOf(move.from));
  const file = FILES[fileOf(move.from)]!;
  const rank = String(rankOf(move.from) + 1);
  if (!sameFile) return file;
  if (!sameRank) return rank;
  return `${file}${rank}`;
}

function withCheckSuffix(position: Position, move: Move, san: string): string {
  const next = position.clone();
  next.play(move);
  if (!next.isCheck()) return san;
  return next.legalMoves().length === 0 ? `${san}#` : `${san}+`;
}

/**
 * Parse SAN (with or without `+`/`#`, tolerant of `0-0` and `O-O-O+`) against a position.
 * Returns the matching legal move, or null when the SAN does not resolve to a legal move.
 *
 * `Bxc6` and `bxc6` differ only in case yet name different pieces: the strict reading is tried
 * first (upper-case role letter = piece, lower-case file = pawn capture), and the other reading is
 * then tried as a fallback so that a hand-written or imported game is not rejected over case.
 */
export function sanToMove(position: Position, san: string): Move | null {
  const cleaned = san.trim().replace(/[+#?!]+$/g, '').replace(/\u2013|\u2014/g, '-');
  if (!cleaned) return null;

  if (/^(o-o-o|0-0-0)$/i.test(cleaned)) return findCastling(position, 'queen');
  if (/^(o-o|0-0)$/i.test(cleaned)) return findCastling(position, 'king');

  const isPieceLetter = (letter: string | undefined): boolean => Boolean(letter && /[kqrbn]/i.test(letter));
  const upperCasePiece = isPieceLetter(cleaned[0]) && cleaned[0] === cleaned[0]!.toUpperCase();
  const pawnCaptureFirst = captureParts(cleaned) !== null && !upperCasePiece;

  // Two readings of the same token; the strict one goes first.
  const readings = pawnCaptureFirst ? ['pawn', 'piece'] : ['piece', 'pawn'];
  for (const reading of readings) {
    const move = reading === 'pawn' ? fromPawnCapture(position, cleaned) : fromPieceNotation(position, cleaned);
    if (move) return move;
  }
  // A bare destination square (`e4`) is only valid for a pawn push.
  return fromPawnMove(position, cleaned);
}

interface CaptureParts {
  fromFile: number;
  to: number;
  promotion?: Role;
}

/** Split `bxc3` / `gxh8=Q` / `bxc6` into its parts. */
function captureParts(cleaned: string): CaptureParts | null {
  const match = /^([a-h])x([a-h][1-8])(?:=?([qrbn]))?$/i.exec(cleaned);
  if (!match) return null;
  const fromFile = FILES.indexOf(match[1]!.toLowerCase() as (typeof FILES)[number]);
  const to = squareFromAlgebraic(match[2]!);
  if (to === null || fromFile < 0) return null;
  const promotion = match[3]?.toLowerCase() as Role | undefined;
  return { fromFile, to, ...(promotion ? { promotion } : {}) };
}

/** `bxc3` read as a pawn capture (the strict meaning of a lower-case leading file). */
function fromPawnCapture(position: Position, cleaned: string): Move | null {
  const parts = captureParts(cleaned);
  if (!parts) return null;
  return findMove(position, {
    to: parts.to,
    role: 'p',
    fromFile: parts.fromFile,
    ...(parts.promotion ? { promotion: parts.promotion } : {}),
  });
}

/** `Bxc6`, `Nf3`, `Qh4#`, `Nde4`, `R1e2` … read as a piece move. */
function fromPieceNotation(position: Position, cleaned: string): Move | null {
  const match = /^([kqrbn])([a-h])?([1-8])?x?([a-h][1-8])(?:=?([qrbn]))?$/i.exec(cleaned);
  if (!match) return null;
  const to = squareFromAlgebraic(match[4]!);
  if (to === null) return null;
  const fromFile = match[2] ? FILES.indexOf(match[2].toLowerCase() as (typeof FILES)[number]) : undefined;
  const fromRank = match[3] ? Number(match[3]) - 1 : undefined;
  const promotion = match[5]?.toLowerCase() as Role | undefined;
  return findMove(position, {
    to,
    role: match[1]!.toLowerCase() as Role,
    ...(fromFile !== undefined && fromFile >= 0 ? { fromFile } : {}),
    ...(fromRank !== undefined ? { fromRank } : {}),
    ...(promotion ? { promotion } : {}),
  });
}

/** `e4`, `a8=Q`, or a promotion written on a capture square such as `exd8=Q`. */
function fromPawnMove(position: Position, cleaned: string): Move | null {
  const match = /^(?:([a-h]))?x?([a-h][1-8])(?:=?([qrbn]))?$/i.exec(cleaned);
  if (!match) return null;
  const to = squareFromAlgebraic(match[2]!);
  if (to === null) return null;
  const fromFile = match[1] ? FILES.indexOf(match[1].toLowerCase() as (typeof FILES)[number]) : undefined;
  const promotion = match[3]?.toLowerCase() as Role | undefined;
  return findMove(position, {
    to,
    role: 'p',
    ...(fromFile !== undefined && fromFile >= 0 ? { fromFile } : {}),
    ...(promotion ? { promotion } : {}),
  });
}

function findCastling(position: Position, side: CastlingSide): Move | null {
  return position.castlingMove(side);
}

function findMove(
  position: Position,
  criteria: {
    to: Square;
    role: Role;
    fromFile?: number;
    fromRank?: number;
    promotion?: Role;
  },
): Move | null {
  let candidates = position
    .legalMoves()
    .filter((move) => !move.castle)
    .filter((move) => move.to === criteria.to)
    .filter((move) => position.roleAt(move.from) === criteria.role)
    .filter((move) => criteria.fromFile === undefined || fileOf(move.from) === criteria.fromFile)
    .filter((move) => criteria.fromRank === undefined || rankOf(move.from) === criteria.fromRank);

  if (criteria.promotion !== undefined) {
    candidates = candidates.filter((move) => move.promotion === criteria.promotion);
  } else if (candidates.some((move) => move.promotion !== undefined)) {
    // A promotion written without "=Q" means a queen, per SAN convention. Keep the other
    // promotion roles only when no queen move exists.
    const queens = candidates.filter((move) => move.promotion === 'q');
    if (queens.length > 0) candidates = queens;
  }

  if (candidates.length === 1) return candidates[0]!;
  return null;
}

/** Convert UCI move notation (`e2e4`, `e7e8q`, Chess960 `e1h1` for O-O) to a legal move. */
export function uciToMove(position: Position, uci: string): Move | null {
  const cleaned = uci.trim().toLowerCase();
  if (/^(0000|null)$/.test(cleaned)) return null;
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(cleaned);
  if (!match) return null;
  const from = squareFromAlgebraic(match[1]!);
  const to = squareFromAlgebraic(match[2]!);
  if (from === null || to === null) return null;
  return position.resolveMove({
    from,
    to,
    ...(match[3] ? { promotion: match[3] as Role } : {}),
  });
}

/** Internal move -> UCI, using the Chess960 king-takes-rook encoding for castling. */
export function moveToUci(position: Position, move: Move): string {
  if (move.castle) {
    const rookSquare = position.rookHomeSquare(position.turn, move.castle);
    if (rookSquare !== null) return `${algebraic(move.from)}${algebraic(rookSquare)}`;
  }
  return `${algebraic(move.from)}${algebraic(move.to)}${move.promotion ?? ''}`;
}

export interface PgnMove {
  number: number;
  white?: string;
  black?: string;
}

export interface PgnOptions {
  /** Event/date/round metadata; sensible defaults are used when omitted. */
  event?: string;
  site?: string;
  date?: Date;
  round?: string;
  white?: string;
  black?: string;
  result?: PgnResult;
  /** Chess960 start FEN (Shredder-FEN castling field). */
  startFen: string;
  /** SAN strings in play order. */
  sans: string[];
  /** Extra headers (e.g. the Chess960 index). */
  extraHeaders?: Record<string, string>;
  /** Line width used when wrapping movetext (0 disables wrapping). */
  lineWidth?: number;
}

export type PgnResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export function isChess960StartFen(fen: string): boolean {
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  const rows = placement.split('/');
  if (rows.length !== 8) return false;
  const back = rows[7] ?? '';
  const king = back.indexOf('K');
  if (king < 0) return false;
  const rooks: number[] = [];
  for (let file = 0; file < 8; file += 1) if (back[file] === 'R') rooks.push(file);
  return !(rooks.length === 2 && rooks[0] === 0 && king === 4 && rooks[1] === 7);
}

/** Build a PGN game record. Chess960 games get `Variant`/`SetUp`/`FEN` headers. */
export function buildPgn(options: PgnOptions): string {
  const date = options.date ?? new Date();
  const isChess960 = isChess960StartFen(options.startFen);
  const result = options.result ?? '*';
  const headers: Array<[string, string]> = [
    ['Event', options.event ?? 'Chess960 Casual Game'],
    ['Site', options.site ?? 'Chess960 Web'],
    ['Date', `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`],
    ['Round', options.round ?? '-'],
    ['White', options.white ?? 'White'],
    ['Black', options.black ?? 'Black'],
    ['Result', result],
  ];
  if (isChess960) {
    headers.push(['Variant', 'Chess960']);
    headers.push(['SetUp', '1']);
    headers.push(['FEN', options.startFen]);
  }
  for (const [key, value] of Object.entries(options.extraHeaders ?? {})) {
    headers.push([key, value]);
  }

  const lines = headers.map(([key, value]) => `[${key} "${value.replace(/"/g, "'")}"]`);
  const moves: string[] = [];
  for (let index = 0; index < options.sans.length; index += 2) {
    const number = Math.floor(index / 2) + 1;
    const white = options.sans[index] ?? '';
    const black = options.sans[index + 1];
    moves.push(black === undefined ? `${number}. ${white}` : `${number}. ${white} ${black}`);
  }
  const movetext = `${moves.join(' ')}${moves.length > 0 ? ' ' : ''}${result}`.trim();
  const wrapped = wrapMovetext(movetext, options.lineWidth ?? 80);
  return `${lines.join('\n')}\n\n${wrapped}\n`;
}

function wrapMovetext(movetext: string, width: number): string {
  if (width <= 0 || movetext.length <= width) return movetext;
  const tokens = movetext.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const token of tokens) {
    if (current.length === 0) current = token;
    else if (current.length + 1 + token.length <= width) current += ` ${token}`;
    else {
      lines.push(current);
      current = token;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join('\n');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export interface ParsedPgn {
  headers: Record<string, string>;
  startFen: string | null;
  sans: string[];
  result: PgnResult | null;
}

/** Minimal PGN reader: headers, start FEN and SAN movetext (comments/variations stripped). */
export function parsePgn(text: string): ParsedPgn {
  const headers: Record<string, string> = {};
  let body = text;
  const headerBlock = /^\s*((?:\[[^\]]*\]\s*)+)/.exec(text);
  if (headerBlock) {
    for (const match of headerBlock[1]!.matchAll(/\[(\w+)\s+"([^"]*)"\]/g)) {
      headers[match[1]!] = match[2]!;
    }
    body = text.slice(headerBlock[1]!.length);
  }
  body = body
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\((?:[^()]|\([^()]*\))*\)/g, ' ');
  const sans: string[] = [];
  let result: PgnResult | null = null;
  for (const token of body.split(/\s+/)) {
    if (!token) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) {
      result = token as PgnResult;
      continue;
    }
    if (/^\d+\.+$/.test(token)) continue;
    const stripped = token.replace(/^\d+\.+/, '');
    if (!stripped) continue;
    sans.push(stripped);
  }
  return { headers, startFen: headers['FEN'] ?? null, sans, result };
}

/** Replay SAN movetext from a start FEN, returning the moves that applied cleanly. */
export function replaySans(startFen: string, sans: string[]): { position: Position; moves: Move[]; failedAt: number | null } {
  const position = Position.fromFen(startFen);
  const moves: Move[] = [];
  for (let index = 0; index < sans.length; index += 1) {
    const move = sanToMove(position, sans[index]!);
    if (!move) return { position, moves, failedAt: index };
    moves.push(position.play(move));
  }
  return { position, moves, failedAt: null };
}

/** Result string implied by a finished game status. */
export function resultFromStatus(status: ReturnType<typeof evaluateStatus>): PgnResult {
  if (status.state === 'checkmate' || status.state === 'resigned' || status.state === 'timeout') {
    return status.winner === 'white' ? '1-0' : '0-1';
  }
  if (status.state === 'draw' || status.state === 'stalemate') return '1/2-1/2';
  return '*';
}

export { countRepetitions, colorName, pieceLetter, castlingSideFromLetter };
export type { Color, PgnResult as GameResult };
