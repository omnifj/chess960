# UI 与状态管理

本文件说明视图层（`src/components/`）、四个 zustand store（`src/store/`）、两个 hook（`src/hooks/`）以及样式与工具层。

---

## 1. 界面结构

`src/App.tsx` 是唯一的外壳，布局是"左棋盘、右信息栏"，窄屏（≤900px）自动变单列：

```
<App>
  <div class="app" data-theme={theme} data-pieces={pieceStyle}>
    ├─ 顶栏     标题 + 副标题
    ├─ 棋盘区   <ChessBoard>                ← 纯展示，输入全靠 props
    │            <PromotionDialog>          ← 常驻挂载，无待决升变时返回 null
    │            翻转 / 认输 两个棋盘下方按钮
    │            "{n} plies"
    ├─ 侧栏     <StatusBar>                  ← 状态行 + Chess960 编号徽章 + 双时钟 + 引擎名
    │            <GameControls>              ← 操作按钮 + 模式/执色/难度下拉 + FEN 行
    │            <MoveList>                  ← 记谱表，点某一步可回退到那里
    ├─ 弹窗     <NewGameDialog> / <SettingsPanel> / <PgnDialog>   ← 条件渲染
    ├─ 隐藏     <span class="visually-hidden" role="status">      ← 屏幕阅读器实时播报
    └─ 页脚     快捷键说明（U / F / C / H / N）
```

### 组件清单

| 组件 | 文件 | 行数 | 职责 |
|---|---|---|---|
| `ChessBoard` | `components/Board/Board.tsx` | 222 | 棋盘网格 + 指针拖拽 / 点击走子。**不 import 任何业务 store**，全部经 props 进出；唯一的例外是 `useI18n()`（为了格子与棋盘的 `aria-label`）。 |
| `PieceView` | `components/Board/Piece.tsx` | 27 | 单枚棋子的展示 span。⚠️ **当前是死代码**——没有任何文件 import 它，`Board` 与 `PromotionDialog` 都内联构建棋子 span。`PIECE_GLYPHS` 实际来自 `Board.tsx`。 |
| `PromotionDialog` | `components/Board/PromotionDialog.tsx` | 78 | 升变选择弹窗。无待决升变时 `return null`。 |
| `GameControls` | `components/Controls/GameControls.tsx` | 256 | 操作栏：新局/撤销/重开/翻转/认输/和棋/主张和棋、复制 FEN、导出 PGN、显示 PGN、提示、设置入口、模式与难度下拉、FEN 显示；并注册全局快捷键。 |
| `Modal` | `components/Controls/Modal.tsx` | 47 | 通用无障碍弹窗外壳（三个弹窗都基于它）。 |
| `NewGameDialog` | `components/Controls/NewGameDialog.tsx` | 198 | 新局设置：随机布局 / 指定编号 0–959 / 自定义 FEN，以及本局的模式、执色、难度。 |
| `PgnDialog` | `components/Controls/PgnDialog.tsx` | 42 | 只读 PGN 查看 + 复制。 |
| `SettingsPanel` | `components/Controls/SettingsPanel.tsx` | 156 | 偏好设置：**界面语言**、主题、棋子风格、坐标/提示开关、时钟、音效、默认对手。 |
| `MoveList` | `components/MoveList/MoveList.tsx` | 68 | 记谱表；每步是按钮，点击回退到该步。不 import 任何项目模块（除 i18n）。 |
| `StatusBar` | `components/Status/StatusBar.tsx` | 127 | 状态文本、Chess960 编号徽章、双时钟、引擎名、可关闭的消息条。 |

### 棋盘的交互实现（`Board.tsx`）

**一个 `onPointerDown` 同时承担"点击"和"拖拽"**：

```
pointerdown（左键 且 未 locked）
  ├─ 已有 selected 且该格 ∈ destinations   → onMove(selected, square)     【点击落子】
  └─ 否则
       空格 → onSelect(square)（store 清空选择）
       有子 → onSelect(square) + movesFor(square)
              若该子有可走格 → setPointerCapture(pointerId) + 进入 drag 状态  【开始拖拽】

pointermove / pointerup（在每格上，按 pointerId 过滤）
  pointerup → squareAt(clientX, clientY) 换算目标格 → onMove(from, target)
              目标为 null 或等于起点 → 无操作
  pointercancel / Esc → 清掉 drag
```

- 拖拽中的浮层是绝对定位的 `span.piece--drag`，用 `left/top = calc(<百分比>% - <半格>px)` 摆放；CSS 中该元素宽高为 `12.5%`。
- 因为用的是 pointer 事件 + `setPointerCapture`，**触摸和笔同样可用**（CSS 里 `.board { touch-action: none; user-select: none; }` 是必须的）。
- 目标格换算只看棋盘矩形，因此对翻转方向天然免疫。

### 无障碍

| 位置 | 做法 |
|---|---|
| 棋盘容器 | `role="grid"`、`aria-label="Chess960 board"` |
| 每个格子 | `role="gridcell"`、`aria-label="e4 white pawn"`、`data-square` |
| 棋子 | `aria-hidden="true"`（信息已由格子的 aria-label 表达） |
| 状态栏 | `<section aria-live="polite">` |
| 回合播报 | `.visually-hidden` + `role="status"`，内容 `"white to move"` / `"Game over"` |
| 消息条 | `role="status"` + 带 `aria-label="Dismiss message"` 的关闭按钮 |
| 弹窗 | `role="dialog"` + `aria-modal="true"` + `aria-label`，挂载即聚焦；Esc 关闭 |
| 表单错误 | `role="alert"` |
| 动效 | `@media (prefers-reduced-motion: reduce)` 关闭所有 transition/animation |

已知缺口：棋盘格**没有** `tabIndex`，也没有方向键移动/回车落子——键盘只能操作按钮、弹窗与快捷键。

### 键盘快捷键

| 键 | 动作 | 注册处 | 生效条件 |
|---|---|---|---|
| <kbd>U</kbd> | 撤销 | `GameControls.tsx:66` | 常驻 |
| <kbd>F</kbd> | 翻转棋盘 | `GameControls.tsx:67` | 常驻 |
| <kbd>C</kbd> | 复制 FEN | `GameControls.tsx:68` | 常驻 |
| <kbd>H</kbd> | 引擎提示 | `GameControls.tsx:69` | 常驻 |
| <kbd>N</kbd> | 新局弹窗 | `GameControls.tsx:70` | 常驻 |
| <kbd>Esc</kbd> | 取消拖拽 | `Board.tsx:83` | 仅拖拽中 |
| <kbd>Q</kbd>/<kbd>R</kbd>/<kbd>B</kbd>/<kbd>N</kbd> | 选升变子 | `PromotionDialog.tsx:27` | 仅升变待决 |
| <kbd>Esc</kbd> | 取消升变 | `PromotionDialog.tsx:23` | 仅升变待决 |
| <kbd>Esc</kbd> | 关闭弹窗 | `Modal.tsx:18` | 每个 Modal 各注册一个 |

**U/F/C/H/N 的守卫条件**：`event.target.tagName` 是 `INPUT`/`TEXTAREA`/`SELECT` 时忽略；带 `metaKey`/`ctrlKey`/`altKey` 时忽略；按键转小写后比较。**没有** `preventDefault`，也**不检查**是否有弹窗打开或升变待决。

> ⚠️ 因为每个 `Modal` 各自注册一个 window `keydown` 监听且都不 `stopPropagation`，**当多个弹窗同时打开时，一次 Esc 会把它们全部关掉**（`dialogStore` 没有互斥逻辑，多个弹窗可以并存）。

---

## 2. 四个 store

### 2.1 `useGameStore`（`store/gameStore.ts`，508 行）

**没有** persist 中间件——持久化是手写的 `persist()`。持有可变的 `Game` 实例 + 脱敏视图字段 + 时钟状态机。

| 分组 | 字段 |
|---|---|
| 棋局本体 | `game: Game`（可变，就地修改）、`version: number` |
| 脱敏视图 | `fen`、`turn`、`over`、`moveCount` |
| 棋盘交互 | `selected`、`legalMoves`、`promotion`、`orientation` |
| 对局设置 | `mode`（`'local' \| 'ai'`，默认 `'local'`）、`playerColor`（默认 `'white'`）、`aiLevel`（默认 `'medium'`） |
| 引擎联动 | `isAiThinking`、`hint`、`message` |
| 时钟 | `clock: { remaining: {white, black}, activeSince, baseMs, incrementMs }` |

**Action 分组：**

- **棋局**：`newGame(options)`、`restart`、`refresh`、`loadFen(fen)`
- **走子**：`selectSquare`、`setSelected`、`tryMove(from, to, promotion?)`、`completePromotion(role | null)`、`undo`、`resign(color?)`、`agreeDraw`、`claimDraw`
- **视图**：`flipBoard`、`setOrientation`、`setMode`、`setPlayerColor`、`setAiLevel`、`setThinking`、`setHint`、`setMessage`
- **时钟**：`setClock`、`resetClockForNextMove`、`restartClockForCurrentTurn`、`tickClock`、`pauseClock`、`resumeClock`
- **基础设施**：`syncView`、`persist`
- **只读查询**：`status`、`turnOf`、`isAiTurn`、`canHumanMove`、`legalMovesFrom`、`lastMove`、`fenString`、`pgn`、`snapshot`

**几个关键语义：**

- `syncView()` —— **唯一的版本号漏斗**：抄 `game.fen/turn/isOver/length` 到 store 并 `version += 1`。
- `selectSquare(square)` 会拒绝"没有己方棋子"的格子；AI 内部走 `setSelected`（跳过该检查）。
- `tryMove` 被 `canHumanMove()` 门禁：`over` 或升变待决 → 拒绝；本地模式其余情况放行；AI 模式额外要求 `!isAiThinking && turn === playerColor`。
- `undo()` 在 `isAiThinking` 时返回 0；AI 模式下若 `game.turn !== playerColor` 则退 **2 步**（让"又是你走"），否则 1 步；本地模式退 1 步。
- `setPlayerColor` 会**同时**设置 `orientation`（执黑即翻转棋盘）。
- `loadFen(fen)` 要求双方都有王，否则消息 `message.fenMissingKing`（"该 FEN 缺少王。"）；重建易位纵线用 `backRankFromFen(fen) ?? normalizeBackRank(底线行)`。

**模块级副作用（import 即执行）：**

```ts
useGameStore.getState().syncView();                    // 播种视图字段，version → 1
globalThis.__chess960 = { game: useGameStore };        // e2e 测试的钩子
```

**已知问题：** `hint` 字段与 `setHint` action **从未被赋过非空值**（提示实际走 `engineStore.hint`），是死状态。`currentStatus(game)` 的文档注释提到用历史判重复，实现其实只是 `return game.status`。`message` 字段存的是 **`MessageDescriptor`**（`{ key, params }`）而不是渲染好的字符串——见 [第 5 节](#5-多语言i18n)。

### 2.2 `useSettingsStore`（`store/settingsStore.ts`，142 行）

**唯一使用 zustand `persist` 中间件**的 store：`name: 'chess960:settings'`、`version: 2`、自定义 `merge` 走 `normalizeSettings` 逐字段校验（非法值一律回落到默认），因此**手改 localStorage 不会让应用进入非法状态**。

| 字段 | 默认值 |
|---|---|
| `mode` | `'local'` |
| `playerColor` | `'white'` |
| `aiLevel` | `'medium'` |
| `showCoordinates` | `true` |
| `showLegalMoves` | `true` |
| `soundEnabled` | `false` |
| `autoFlip` | `true` |
| `theme` | `'classic'` |
| `pieceStyle` | `'unicode'` |
| `timerEnabled` | `false` |
| `baseMinutes` | `10` |
| `incrementSeconds` | `0` |
| `language` | **`'zh'`**（中文为默认界面语言） |

Actions：`setMode`、`setPlayerColor`、`setAiLevel`、`toggle(key)`、`setTheme`、`setPieceStyle`、`setTimeControl`、`setLanguage`、`reset`。

**`normalizeSettings` 的校验规则**：`theme` 白名单 `green/blue/walnut`，否则 `classic`；`baseMinutes` 需为有限数且 `0 < x <= 180`，否则 `10`；`incrementSeconds` 限定 `0..60`；`aiLevel` 走 `isEngineLevelName`；`pieceStyle` 限 `merida/unicode`；`language` 走 `normalizeLanguage`（只认 `'en'`，其余一律 `'zh'`）。布尔字段用 `?? 默认值`，所以**持久化的非布尔值会原样通过**（一个小的健壮性缺口）。

**v1 → v2 迁移**：v1 就有 `language` 字段，但当时**没有任何 UI 能改它**（默认 `'en'`），所以凡是存过设置的用户都会留下一个 `'en'`。为了兑现"默认中文"，`persist` 的 `version` 升到 2，并在 `migrate` 里把 `version < 2` 的持久化状态强制改成 `DEFAULT_LANGUAGE`。`migrate` 返回的是 `Partial<SettingsState>`（带一处 `as SettingsState` 断言）——安全，因为紧接着的 `merge` 会跑 `normalizeSettings` 补全。

**⚠️ 智能体/读者请注意的重复来源问题：** `settings.mode` / `settings.playerColor` / `settings.aiLevel` **没有任何代码读取**——对局用的是 `gameStore` 里自己的一套 `mode`/`playerColor`/`aiLevel`。`GameControls` 的下拉框读写的是 `gameStore`。同理 `autoFlip` 也只存不用（有开关但没有实现自动翻转）。`language`/`setLanguage` **已经接线**（见第 5 节），不再是死字段。

### 2.3 `useEngineStore`（`store/engineStore.ts`，106 行）

引擎状态 + **模块级 `Engine` 单例的持有者**。

| 字段 | 说明 |
|---|---|
| `engine`、`name`、`ready` | 当前引擎种类与显示名 |
| `thinking`、`hintBusy` | 思考中 / 提示请求进行中 |
| `error` | 回退或错误信息，存为 `MessageDescriptor`（渲染时才翻译） |
| `hint` | 提示着法（供 `Board` 画 `--hint-from`/`--hint-to`） |
| `movesPlayed` | 已走步数，用作 `useAiPlayer` effect 的依赖项 |

模块级：`getEngine()`（惰性创建单例）、`disposeEngine()`（quit + 重置）。

**`defer()`**：两个引擎回调都经 `queueMicrotask` 包裹再写 store，因为回调可能在 React 渲染/初始化期间触发。`onFallback` 写入 `"Stockfish unavailable (<reason>). Using the built-in engine."`。

import 时把 `engine` 合并进 `globalThis.__chess960`。

### 2.4 `useDialogStore`（`store/dialogStore.ts`，22 行）

`{ newGame, settings, pgn }` 三个布尔值 + `open(name)` / `close(name)` / `closeAll()`。

`closeAll()` **从未被调用**；没有互斥逻辑（多个弹窗可同时打开）。

---

## 3. 两个 hook

### 3.1 `useAiPlayer`（`hooks/useAiPlayer.ts`，111 行）

导出 `useAiPlayer()` 与 `requestHint()`，以及 `AiStatus` 类型。

- **惰性初始化引擎**：第一次出现 `mode === 'ai'` 时才 `getEngine().init()`（`started` ref 保护）。纯本地对局不会创建 worker。
- **回合 effect** 依赖 `[mode, over, promotionPending, turn, playerColor, fen, aiLevel, movesPlayed]`；用 `pendingFen` ref **对同一 FEN 去重**，避免重复发起搜索。
- 结果回来先做**陈旧性检查**（`current.fen !== fen` 就丢弃），保证撤销/新局期间的过期结果不会落子。
- `requestHint()`：要求未结束且 `turn === playerColor`，`hintBusy` 去重，**固定用 `'hard'` 难度**。

详细的时序图见 [architecture.md](./architecture.md#4-一次-ai-走子的完整数据流)。

### 3.2 `useClock`（`hooks/useClock.ts`，47 行）

`useClock(enabled, onFlag)` + `formatClock(ms)`。

- `onFlag` 存在 ref 里每次渲染重新赋值，因此 interval effect **只依赖 `enabled`**（避免每次渲染重建定时器）。
- 启用时：若 `clock.baseMs === 0` 则先 `setClock(10, 0, true)` 兜底 10 分钟，否则 `resumeClock()`；然后 `setInterval(..., 250)` 调 `tickClock()`。
- 监听 `document.visibilitychange`：隐藏时 `pauseClock()`，回来 `resumeClock()`。
- 卸载时清 interval、移除监听、`pauseClock()`。
- `formatClock` 在 0 处截断，用 `Math.ceil`，返回 `m:ss` 或超过一小时时的 `h:mm:ss`。

---

## 4. 样式与主题（`styles/index.css`，768 行）

纯 CSS 单文件，**没有**框架/预处理器/`@import`。

### 主题机制：data 属性 + CSS 变量

主题**不是** class，而是挂在 `.app` div 上的 `data-` 属性（不在 `<html>`/`<body>` 上）：

```tsx
<div className="app" data-theme={settings.theme} data-pieces={settings.pieceStyle}>
```

`settingsStore` 把 `theme` 限制为 `'classic' | 'green' | 'blue' | 'walnut'`。

**`--square-*` 由主题覆盖：**

| 主题 | `--square-light` | `--square-dark` |
|---|---|---|
| `classic`（`:root` 默认，**没有** `[data-theme='classic']` 规则） | 默认值 | 默认值 |
| `green`（"Tournament"） | `#eeeed2` | `#769656` |
| `blue` | `#dee3e6` | `#788a9e` |
| `walnut` | `#e5c99a` | `#8b5a2b` |

**棋子风格**：`[data-pieces='merida']`（界面上叫 "Outline"）把棋子的多层 `text-shadow` 换成 `-webkit-text-stroke`。

### 全部 CSS 自定义属性（`:root`，21 个）

颜色：`--bg` `#14161a`、`--bg-elevated` `#1b1e24`、`--bg-input` `#23262d`、`--border` `#2f343d`、`--text` `#e8eaf0`、`--text-muted` `#9aa2b1`、`--accent` `#6ea8fe`、`--accent-contrast` `#0b1220`、`--danger` `#f2727f`、`--success` `#6fd08c`（**已定义但从未被 `var()` 引用**）。

棋盘专用：`--square-light`、`--square-dark`、`--square-selected`、`--square-last`、`--square-check`、`--square-target`、`--coordinate`。

尺寸/效果：`--radius` `10px`、`--radius-sm` `6px`、`--shadow`、`--board-max` `640px`。

此外 `:root { color-scheme: dark; }`；`@media (max-width: 900px)` 里把 `--board-max` 覆盖为 `100%`。

### 值得注意的规则

| 规则 | 为什么 |
|---|---|
| `.board { touch-action: none; user-select: none; aspect-ratio: 1/1; }` | 指针拖拽必需；`aspect-ratio` 保证棋盘永远是正方形 |
| `.piece--drag { position: absolute; z-index: 20; width/height: 12.5%; opacity: .92; pointer-events: none; }` | 拖拽浮层；`12.5%` = 1/8 格 |
| `.app { grid-template-columns: minmax(0, var(--board-max)) minmax(280px, 1fr); }` | 桌面双列；`≤900px` 变单列 |
| 覆盖层用 `.square--*` 的 `::before`/`::after` + `pointer-events: none` | 不干扰指针事件 |
| `.square--hint-from/--hint-to` 硬编码 `rgba(111,208,140,0.45)` | 提示色**没有**走 CSS 变量（与其他状态色不一致） |
| `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }` | 无障碍 |

主要类名前缀：`.app*`、`.board`/`.square`/`.coord`、`.piece--*`、`.controls`/`.button(--primary|--ghost|--link)`/`.field`、`.status`/`.badge`/`.clock`、`.movelist*`、`.dialog-backdrop`/`.dialog`/`.promotion*`、`.form*`/`.radio`/`.check`/`.pgn`、`.visually-hidden`、`kbd`。

---

## 5. 多语言（i18n）

界面支持 **中文 / English**，**默认中文**。没有引入任何 i18n 库——整套实现是 `src/i18n/` 下约 560 行自有代码，运行时开销接近零。

### 5.1 两级结构

| 层 | 文件 | 是否依赖 store |
|---|---|---|
| 叶子：语言类型、文案表、纯翻译函数 | `types.ts` · `messages.ts` · `translate.ts` | ❌ 完全不依赖 |
| 接入：React hook | `useI18n.ts` | ✅ 订阅 `settingsStore.language` |

这个划分不是洁癖，而是**为了打破循环依赖**：`settingsStore` 需要 `Language` 类型，而 hook 需要 `settingsStore`。把类型与文案放在零依赖的叶子里，两个方向就都成立了。

### 5.2 文案表与类型安全

`zh` 用 `as const` 声明，是**键集合的唯一真相**：

```ts
export const zh = { 'controls.newGame': '新对局', /* ... */ } as const;
export type MessageKey = keyof typeof zh;
export const en: Record<MessageKey, string> = { 'controls.newGame': 'New game', /* ... */ };
```

于是：

- 英文表**漏一个键或拼错一个键 = 编译错误**，不需要靠人盯。
- 组件里写 `t('controls.newGam')` 也是编译错误。
- `tests/unit/i18n.test.ts` 额外锁定：两张表的键集合相同、每个值都是非空字符串、**占位符集合必须一致**（否则切语言时参数会静默消失），并且只允许 5 个键在中英文里故意相同（`language.zh` / `language.en` / `pgn.title` / `engine.stockfish` / `board.square`）——这条断言会在有人忘了翻译时失败。

`translate()` 在找不到语言或键时**回落**：语言 → 中文，键 → 中文同键，最后才回落到键名本身。所以半翻译的目录也不会显示成空白。

### 5.3 关键设计：存描述符，不存字符串

状态栏的临时消息（"FEN 已复制到剪贴板。"）**不是**在产生时翻译好再存进 store 的，而是存一个与语言无关的描述符：

```ts
export interface MessageDescriptor { key: MessageKey; params?: MessageParams }

store.setMessage(asMessage('message.pgnExported', { name }));   // 存这个
// StatusBar 里：
const text = format(message);                                   // 渲染时才翻译
```

`gameStore.message` 与 `engineStore.error` 都是这个类型。它解决了一个具体的 bug：**切换语言时，切换之前就已经显示的消息也要跟着变**。如果存的是渲染好的字符串，那条消息会卡在旧语言里。

因此有一条硬规则：**`MessageDescriptor.params` 里不能放已经翻译过的文本**。需要区分颜色的消息（如超时）用两个键（`message.whiteTimeout` / `message.blackTimeout`），而不是把"白方"当参数传进去。

例外：`NewGameDialog` 的校验错误是**组件内的本地 state**，没有跨语言切换的需求，所以直接存渲染好的字符串；只有核心层抛出的英文解析错误会被塞进 `newGame.errStart` 的 `{detail}` 参数里（那本来就是英文技术细节）。

### 5.4 语言如何影响文档

`index.html` 自带中文默认值（`lang="zh-CN"`、中文 `<title>` 与 `meta description`）。`App.tsx` 里一个 effect 在语言变化时同步：

```ts
document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
document.title = t('app.title');
```

### 5.5 在哪里切换

**设置 → 界面 → 语言**（`data-testid="language-select"`），选项用**各语言自己的写法**（`中文` / `English`），所以看不懂当前语言的人也能找到出口。选择随 `settingsStore` 一起持久化。

### 5.6 哪些东西**不**翻译

| 不翻译 | 原因 |
|---|---|
| `src/core/**` 的注释、抛出的错误消息、`rules.ts` 的 `describeStatus()` | 规则层保持零 i18n 依赖；`describeStatus()` 本身是无人调用的死代码，界面用的是 `StatusBar.describeGameStatus()` |
| SAN / FEN / PGN 记谱 | 标准格式，翻译了就不再是国际象棋 |
| PGN 头（`Event "Chess960 Casual Game"`） | 同上；PGN 头是机器可读字段 |
| `difficulty.ts` 里的 `label` / `description` | 保留为英文元数据；界面改用 `difficulty.<level>.label` / `.desc` 键 |
| `ai.ts` 的引擎名 | 界面按 `engineKind` 取 `engine.builtin` / `engine.stockfish`，`name` 只用作回退时的 tooltip |

---

## 6. 工具层（`utils/storage.ts`，110 行）

**不 import 任何项目模块**（它是被 store 依赖的最底层）。

| 导出 | 说明 |
|---|---|
| `STORAGE_KEYS` | `{ game: 'game', settings: 'settings' }`；实际键会加前缀 `chess960:` |
| `storageAvailable()` | 写入 `chess960:probe` 后立刻删除 |
| `readJson<T>(key, fallback)` / `writeJson(key, value)` / `remove(key)` | 全部 try/catch 静默降级（隐私模式、配额用尽都不会崩） |
| `loadGame<T>()` / `saveGame(snapshot)` / `clearGame()` | 棋局快照的读写清 |
| `copyText(text)` | 先试 `navigator.clipboard.writeText`，失败回退到隐藏 `<textarea>` + `document.execCommand('copy')`；返回布尔 |
| `downloadText(filename, text, mime)` | Blob + `URL.createObjectURL` + `<a download>` 点击 + `setTimeout(revoke, 0)`；默认 mime `application/x-chess-pgn` |
| `PersistedGame` | 接口，但**仓库内无引用** |

### localStorage 键（全部真实键名）

| 键 | 写入方 | 内容 |
|---|---|---|
| `chess960:game` | `gameStore.persist()` | 进行中对局的 `GameSnapshot` |
| `chess960:settings` | `settingsStore` 的 zustand persist | 用户偏好 + 界面语言（version 2） |
| `chess960:probe` | `storageAvailable()` | 写入即删的探测键 |

> `STORAGE_KEYS.settings`（值 `'settings'`）**从未被读取**——settings 的持久化由 zustand persist 用自己的字面量键名完成，两者只是恰好都落在 `chess960:` 前缀下。

---

## 7. 调试与测试钩子

| 钩子 | 位置 | 用途 |
|---|---|---|
| `globalThis.__chess960.game` | `gameStore` import 时 | e2e 测试读取 `moveCount` 等状态 |
| `globalThis.__chess960.engine` | `engineStore` import 时 | e2e 测试读取引擎状态 |
| `globalThis.__debugEngine = true` | 运行时设置 | `ai.ts` 打印引擎探测/握手日志（惰性读取，可在页面加载后再设） |
| `globalThis.__castlingDebug = true` | 运行时设置 | `position.ts` 打印每次易位被**哪一条规则**拒绝 |

`tests/e2e/inspect-ai.spec.ts` 的 `localStorage.DSH_DEBUG_ENGINE` 是**死标志**——`src/` 里没有任何代码读它（只读 `__debugEngine`）。

---

## 8. 已知冗余与不一致（清理清单）

| 项 | 说明 |
|---|---|
| `components/Board/Piece.tsx` | `PieceView` 无任何引用，死组件 |
| `gameStore.hint` / `setHint` | 从未被赋非空值；提示实际走 `engineStore.hint` |
| `GameStatus` 的 `'timeout'` | 时钟超时走的是 `resign()`，该状态与 `StatusBar` 里对应分支不可达 |
| `settingsStore.autoFlip` | 有开关，无实现 |
| `settingsStore.mode` / `playerColor` / `aiLevel` | 无消费者（对局用 `gameStore` 的同名字段） |
| `settingsStore` 布尔字段 | 用 `?? 默认值` 校验，持久化的非布尔值会穿透 |
| `dialogStore.closeAll()` | 无调用方 |
| `utils/storage.ts` 的 `STORAGE_KEYS.settings`、`PersistedGame` | 无引用 |
| CSS `--success` | 定义但无 `var()` 引用 |
| `Board` 的 `flipped?: boolean` prop | 声明了但未解构、未使用（方向靠 `orientation` 与类名） |
| `gameStore` 的 `clock` 与 `SettingsPanel` 的联动 | 设置里任何改动（**包括切换语言**）都会 `setClock(...)`，把双方剩余时间**重置为基准时间** |
| 多弹窗并存 | 多个弹窗可同时打开，且一次 Esc 会全部关闭 |
| `difficulty.ts` 的 `label` / `description` | 界面改用 i18n 键后，这两个英文字段只剩元数据用途（`ai.ts`、`protocol.ts` 不再读它们） |
| `rules.ts` 的 `describeStatus()` | 无人调用的死代码，且是英文硬编码；界面用的是 `StatusBar.describeGameStatus()` |

> 已在本次多语言改造中清掉的：`GameControls.colorLabel()`（无引用的英文硬编码助手，被 `i18n.colorName()` 取代）、`settingsStore.language` 的死字段状态。

---

**相关文档**：[整体架构](./architecture.md) · [规则引擎](./rules-engine.md) · [AI 引擎](./engine.md) · [目录与文件说明](./project-structure.md)
