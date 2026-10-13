import type { MessageParams } from './types';

/**
 * Message catalogs. `zh` is the source of truth for the key set — `en` is typed as
 * `Record<MessageKey, string>`, so a missing or misspelled English key is a compile error.
 *
 * Templates interpolate `{name}` placeholders through `translate()`.
 */
export const zh = {
  // ---------------------------------------------------------------- app shell
  'app.title': 'Chess960 — Fischer Random 国际象棋',
  'app.tagline': 'Fischer Random —— 每一局都从 960 种合法布局之一开始。',
  'app.flipBoard': '翻转棋盘',
  'app.clearSelection': '取消选择',
  'app.resign': '认输',
  'app.plies': '{count} 个半回合',
  'app.keyboardLabel': '快捷键：',
  'app.liveGameOver': '对局结束',
  'app.liveTurn': '{color}走棋',

  'shortcut.undo': '撤销',
  'shortcut.flip': '翻转',
  'shortcut.copyFen': '复制 FEN',
  'shortcut.hint': '提示',
  'shortcut.newGame': '新对局',

  'common.cancel': '取消',
  'common.close': '关闭',

  // ------------------------------------------------------------------- domain
  'color.white': '白方',
  'color.black': '黑方',

  'piece.k': '王',
  'piece.q': '后',
  'piece.r': '车',
  'piece.b': '象',
  'piece.n': '马',
  'piece.p': '兵',

  'board.label': 'Chess960 棋盘',
  'board.square': '{square}',
  'board.squareWithPiece': '{square} {color}{role}',

  // ------------------------------------------------------------------- status
  'status.turn': '{color}走棋',
  'status.check': '{color}走棋 —— 将军！',
  'status.checkmate': '将死 —— {color}胜',
  'status.stalemate': '逼和，和棋',
  'status.resigned': '{color}因对方认输获胜',
  'status.timeout': '{color}因对方超时获胜',
  'status.drawFiftyMove': '五十步规则判和',
  'status.drawSeventyFiveMove': '七十五步规则判和',
  'status.drawThreefold': '三次重复局面判和',
  'status.drawFivefold': '五次重复局面判和',
  'status.drawInsufficientMaterial': '子力不足判和',
  'status.drawAgreement': '双方协议和棋',
  'status.indexTitle': 'Chess960 起始局面 {index}（底线 {backRank}）',
  'status.modeLocal': '本地双人对弈',
  'status.modeAi': '人机对弈 · 你执{color}',
  'status.engineFallback': '（已回退）',
  'status.dismiss': '关闭消息',

  // ---------------------------------------------------------------- move list
  'moves.title': '着法',
  'moves.label': '着法列表',
  'moves.empty': '尚无着法。',

  // ---------------------------------------------------------------- promotion
  'promotion.label': '兵升变',
  'promotion.title': '升变为',
  'promotion.queen': '后',
  'promotion.rook': '车',
  'promotion.bishop': '象',
  'promotion.knight': '马',
  'promotion.optionTitle': '{role}（{key}）',

  // ----------------------------------------------------------------- controls
  'controls.label': '对局操作',
  'controls.newGame': '新对局',
  'controls.undo': '撤销',
  'controls.undoTitle': '撤销（U）',
  'controls.restart': '重新开始',
  'controls.restartTitle': '用同一局面重下一局',
  'controls.flip': '翻转',
  'controls.flipTitle': '翻转棋盘（F）',
  'controls.resign': '认输',
  'controls.resignConfirm': '确定要认输吗？',
  'controls.draw': '和棋',
  'controls.claimDraw': '主张和棋',
  'controls.claimDrawTitle': '按五十步或三次重复规则主张和棋',
  'controls.copyFen': '复制 FEN',
  'controls.copyFenTitle': '复制 FEN（C）',
  'controls.exportPgn': '导出 PGN',
  'controls.showPgn': '显示 PGN',
  'controls.hint': '提示',
  'controls.hintBusy': '思考中…',
  'controls.hintTitle': '让引擎给出最佳着法（H）',
  'controls.mode': '模式',
  'controls.modeLocal': '本地双人',
  'controls.modeAi': '人机对战',
  'controls.youPlay': '你执',
  'controls.difficulty': '难度',
  'controls.engineTitle': '当前引擎',
  'controls.selected': '已选 {square}',
  'controls.hintLabel': '提示：{move}',
  'controls.settings': '设置',

  // ---------------------------------------------------------------- new game
  'newGame.title': '新对局',
  'newGame.startingPosition': '起始局面',
  'newGame.random': '随机 Chess960 局面',
  'newGame.indexOption': 'Chess960 编号（0–959）',
  'newGame.indexLabel': 'Chess960 编号',
  'newGame.randomIndexTitle': '随机取一个编号',
  'newGame.randomButton': '随机',
  'newGame.customFen': '自定义 FEN',
  'newGame.fenLabel': '起始 FEN',
  'newGame.recognised': '识别出的 Chess960 底线：{backRank}',
  'newGame.opponent': '对手',
  'newGame.startGame': '开始对局',
  'newGame.errIndex': '请输入 0 到 959 之间的 Chess960 编号。',
  'newGame.errFenRequired': '请粘贴一个 FEN 作为起始局面。',
  'newGame.errFenInvalid': '这看起来不是一个 FEN。',
  'newGame.errStart': '无法开始对局：{detail}',

  // ----------------------------------------------------------------- settings
  'settings.title': '设置',
  'settings.board': '棋盘',
  'settings.theme': '主题',
  'settings.pieces': '棋子',
  'settings.showCoordinates': '显示坐标',
  'settings.showLegalMoves': '高亮可走着法',
  'settings.autoFlip': '新对局时朝向人类玩家',
  'settings.opponentDefaults': '对手默认值',
  'settings.clock': '时钟',
  'settings.useClock': '使用时钟',
  'settings.minutes': '分钟',
  'settings.increment': '加秒（秒）',
  'settings.accessibility': '无障碍',
  'settings.sound': '走子音效',
  'settings.interface': '界面',
  'settings.language': '语言',
  'settings.done': '完成',

  'theme.classic': '经典（棕）',
  'theme.green': '比赛（绿）',
  'theme.blue': '蓝色',
  'theme.walnut': '胡桃木',
  'pieces.unicode': '实心（默认）',
  'pieces.merida': '描边',

  // Language names are shown in their own language in both catalogs.
  'language.zh': '中文',
  'language.en': 'English',

  // --------------------------------------------------------------- difficulty
  'difficulty.easy.label': '简单',
  'difficulty.easy.desc': '搜索较浅，偶尔会走出软着。',
  'difficulty.medium.label': '中等',
  'difficulty.medium.desc': '俱乐部水平，能抓住眼前的战术。',
  'difficulty.hard.label': '困难',
  'difficulty.hard.desc': '战术能力强，搜索更深。',
  'difficulty.master.label': '大师',
  'difficulty.master.desc': '全强度，每步会思考几秒。',

  // ------------------------------------------------------------------- engine
  'engine.builtin': '内置引擎',
  'engine.stockfish': 'Stockfish (WASM)',

  // ---------------------------------------------------------------------- pgn
  'pgn.title': 'PGN',
  'pgn.copy': '复制 PGN',

  // ----------------------------------------------------------- transient text
  'message.fenCopied': 'FEN 已复制到剪贴板。',
  'message.fenCopyFailed': '无法访问剪贴板 —— FEN 显示在下方。',
  'message.pgnCopied': 'PGN 已复制。',
  'message.pgnCopyFailed': '无法复制 PGN。',
  'message.pgnExported': 'PGN 已导出为 {name}。',
  'message.drawClaimed': '已主张和棋（{reason}）。',
  'message.drawClaimedThreefold': '已按三次重复规则主张和棋。',
  'message.drawClaimedFiftyMove': '已按五十步规则主张和棋。',
  'message.nothingToClaim': '当前没有可主张的和棋。',
  'message.engineIllegalMove': '引擎返回了非法着法，已跳过。',
  'message.engineError': '引擎错误：{detail}',
  'message.whiteTimeout': '白方超时。',
  'message.blackTimeout': '黑方超时。',
  'message.fenMissingKing': '该 FEN 缺少王。',
  'message.invalidFen': 'FEN 无效：{detail}',
  'message.stockfishUnavailable': 'Stockfish 不可用（{reason}），已改用内置引擎。',
} as const;

/** The key set every catalog must provide. */
export type MessageKey = keyof typeof zh;

export const en: Record<MessageKey, string> = {
  // ---------------------------------------------------------------- app shell
  'app.title': 'Chess960 — play Fischer Random chess',
  'app.tagline': 'Fischer Random — every game starts from one of 960 legal positions.',
  'app.flipBoard': 'Flip board',
  'app.clearSelection': 'Clear selection',
  'app.resign': 'Resign',
  'app.plies': '{count} plies',
  'app.keyboardLabel': 'Keyboard:',
  'app.liveGameOver': 'Game over',
  'app.liveTurn': '{color} to move',

  'shortcut.undo': 'undo',
  'shortcut.flip': 'flip',
  'shortcut.copyFen': 'copy FEN',
  'shortcut.hint': 'hint',
  'shortcut.newGame': 'new game',

  'common.cancel': 'Cancel',
  'common.close': 'Close',

  // ------------------------------------------------------------------- domain
  'color.white': 'White',
  'color.black': 'Black',

  'piece.k': 'king',
  'piece.q': 'queen',
  'piece.r': 'rook',
  'piece.b': 'bishop',
  'piece.n': 'knight',
  'piece.p': 'pawn',

  'board.label': 'Chess960 board',
  'board.square': '{square}',
  'board.squareWithPiece': '{square} {color} {role}',

  // ------------------------------------------------------------------- status
  'status.turn': '{color} to move',
  'status.check': '{color} to move — check!',
  'status.checkmate': 'Checkmate — {color} wins',
  'status.stalemate': 'Draw by stalemate',
  'status.resigned': '{color} wins by resignation',
  'status.timeout': '{color} wins on time',
  'status.drawFiftyMove': 'Draw by the fifty-move rule',
  'status.drawSeventyFiveMove': 'Draw by the seventy-five-move rule',
  'status.drawThreefold': 'Draw by threefold repetition',
  'status.drawFivefold': 'Draw by fivefold repetition',
  'status.drawInsufficientMaterial': 'Draw by insufficient material',
  'status.drawAgreement': 'Draw by agreement',
  'status.indexTitle': 'Chess960 start position {index} (back rank {backRank})',
  'status.modeLocal': 'Local two-player',
  'status.modeAi': 'Human vs engine · you play {color}',
  'status.engineFallback': ' (fallback)',
  'status.dismiss': 'Dismiss message',

  // ---------------------------------------------------------------- move list
  'moves.title': 'Moves',
  'moves.label': 'Move list',
  'moves.empty': 'No moves yet.',

  // ---------------------------------------------------------------- promotion
  'promotion.label': 'Promote pawn',
  'promotion.title': 'Promote to',
  'promotion.queen': 'Queen',
  'promotion.rook': 'Rook',
  'promotion.bishop': 'Bishop',
  'promotion.knight': 'Knight',
  'promotion.optionTitle': '{role} ({key})',

  // ----------------------------------------------------------------- controls
  'controls.label': 'Game controls',
  'controls.newGame': 'New game',
  'controls.undo': 'Undo',
  'controls.undoTitle': 'Undo (U)',
  'controls.restart': 'Restart',
  'controls.restartTitle': 'Replay the same position',
  'controls.flip': 'Flip',
  'controls.flipTitle': 'Flip the board (F)',
  'controls.resign': 'Resign',
  'controls.resignConfirm': 'Resign this game?',
  'controls.draw': 'Draw',
  'controls.claimDraw': 'Claim draw',
  'controls.claimDrawTitle': 'Claim a draw under the 50-move or threefold-repetition rule',
  'controls.copyFen': 'Copy FEN',
  'controls.copyFenTitle': 'Copy FEN (C)',
  'controls.exportPgn': 'Export PGN',
  'controls.showPgn': 'Show PGN',
  'controls.hint': 'Hint',
  'controls.hintBusy': 'Thinking…',
  'controls.hintTitle': 'Ask the engine for the best move (H)',
  'controls.mode': 'Mode',
  'controls.modeLocal': 'Local two-player',
  'controls.modeAi': 'Human vs engine',
  'controls.youPlay': 'You play',
  'controls.difficulty': 'Difficulty',
  'controls.engineTitle': 'Active engine',
  'controls.selected': 'Selected {square}',
  'controls.hintLabel': 'Hint: {move}',
  'controls.settings': 'Settings',

  // ---------------------------------------------------------------- new game
  'newGame.title': 'New game',
  'newGame.startingPosition': 'Starting position',
  'newGame.random': 'Random Chess960 position',
  'newGame.indexOption': 'Chess960 index (0–959)',
  'newGame.indexLabel': 'Chess960 index',
  'newGame.randomIndexTitle': 'Pick a random index',
  'newGame.randomButton': 'Random',
  'newGame.customFen': 'Custom FEN',
  'newGame.fenLabel': 'Starting FEN',
  'newGame.recognised': 'Recognised Chess960 back rank: {backRank}',
  'newGame.opponent': 'Opponent',
  'newGame.startGame': 'Start game',
  'newGame.errIndex': 'Enter a Chess960 index between 0 and 959.',
  'newGame.errFenRequired': 'Paste a FEN to start from.',
  'newGame.errFenInvalid': 'That does not look like a FEN.',
  'newGame.errStart': 'Could not start the game: {detail}',

  // ----------------------------------------------------------------- settings
  'settings.title': 'Settings',
  'settings.board': 'Board',
  'settings.theme': 'Theme',
  'settings.pieces': 'Pieces',
  'settings.showCoordinates': 'Show coordinates',
  'settings.showLegalMoves': 'Highlight legal moves',
  'settings.autoFlip': "Face the human player's colour on a new game",
  'settings.opponentDefaults': 'Opponent defaults',
  'settings.clock': 'Clock',
  'settings.useClock': 'Use a clock',
  'settings.minutes': 'Minutes',
  'settings.increment': 'Increment (s)',
  'settings.accessibility': 'Accessibility',
  'settings.sound': 'Sound on move',
  'settings.interface': 'Interface',
  'settings.language': 'Language',
  'settings.done': 'Done',

  'theme.classic': 'Classic (brown)',
  'theme.green': 'Tournament (green)',
  'theme.blue': 'Blue',
  'theme.walnut': 'Walnut',
  'pieces.unicode': 'Solid (default)',
  'pieces.merida': 'Outline',

  'language.zh': '中文',
  'language.en': 'English',

  // --------------------------------------------------------------- difficulty
  'difficulty.easy.label': 'Easy',
  'difficulty.easy.desc': 'Shallow search, sometimes plays a loose move.',
  'difficulty.medium.label': 'Medium',
  'difficulty.medium.desc': 'Club-player strength; sees immediate tactics.',
  'difficulty.hard.label': 'Hard',
  'difficulty.hard.desc': 'Strong tactical play with a deeper search.',
  'difficulty.master.label': 'Master',
  'difficulty.master.desc': 'Full strength; give it a few seconds per move.',

  // ------------------------------------------------------------------- engine
  'engine.builtin': 'Built-in engine',
  'engine.stockfish': 'Stockfish (WASM)',

  // ---------------------------------------------------------------------- pgn
  'pgn.title': 'PGN',
  'pgn.copy': 'Copy PGN',

  // ----------------------------------------------------------- transient text
  'message.fenCopied': 'FEN copied to the clipboard.',
  'message.fenCopyFailed': 'Could not access the clipboard — FEN is shown below.',
  'message.pgnCopied': 'PGN copied.',
  'message.pgnCopyFailed': 'Could not copy the PGN.',
  'message.pgnExported': 'PGN exported as {name}.',
  'message.drawClaimed': 'Draw claimed ({reason}).',
  'message.drawClaimedThreefold': 'Draw claimed under the threefold-repetition rule.',
  'message.drawClaimedFiftyMove': 'Draw claimed under the fifty-move rule.',
  'message.nothingToClaim': 'Nothing to claim right now.',
  'message.engineIllegalMove': 'The engine returned an illegal move; skipping it.',
  'message.engineError': 'Engine error: {detail}',
  'message.whiteTimeout': 'White ran out of time.',
  'message.blackTimeout': 'Black ran out of time.',
  'message.fenMissingKing': 'That FEN is missing a king.',
  'message.invalidFen': 'Invalid FEN: {detail}',
  'message.stockfishUnavailable': 'Stockfish unavailable ({reason}). Using the built-in engine.',
};

export const CATALOGS: Record<'zh' | 'en', Record<MessageKey, string>> = { zh, en };

/**
 * A language-independent reference to a message. Stores keep these instead of rendered strings so
 * that switching the interface language re-renders even messages that were produced earlier.
 */
export interface MessageDescriptor {
  key: MessageKey;
  params?: MessageParams;
}
