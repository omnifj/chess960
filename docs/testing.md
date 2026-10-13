# 测试策略

> **当前状态：`pnpm test` → 5 个文件 / 156 个用例全绿，约 1.2 秒；`pnpm test:e2e` → 32 次运行全绿，约 22 秒；`pnpm typecheck` 无错误。**

测试的重点放在**出错代价最高的地方**：棋规与 Chess960 易位。UI 的行为由 Playwright 在真实浏览器里跑生产构建来验证。

---

## 1. 两套测试，两套工具

| | 单元测试 | 端到端测试 |
|---|---|---|
| 工具 | Vitest 3 | Playwright 1.51 |
| 位置 | `tests/unit/` | `tests/e2e/` |
| 环境 | **纯 Node**（`environment: 'node'`） | 真实 Chromium |
| 跑什么 | `src/core/**` 的规则与记谱 | **生产构建**（`vite preview`，端口 4173） |
| 命令 | `pnpm test` / `pnpm test:watch` | `pnpm test:e2e`（首次需 `pnpm test:e2e:install`） |
| 规模 | 5 文件 / 156 用例 / ~1.2 s | 2 文件 / 16 用例 × 2 project = 32 次运行 / ~22 s |

单元测试能跑在纯 Node 下，正是 [架构分层](./architecture.md) 的直接收益：`src/core/` 不 import React、不碰 DOM。**如果哪天有人往 `core/` 里引入了 DOM 依赖，这套测试会立刻失败**——这也是这条分层约束的执行机制。

### 为什么 E2E 跑生产构建而不是 dev server

`playwright.config.ts` 的 `webServer` 用的是 `npx vite preview`，不是 `vite dev`。这样测试覆盖的是**真正会被部署的资产**：代码分割、worker 的独立 chunk、`base: './'` 的相对路径、内容哈希文件名。dev server 下这些都不同，会漏掉一整类问题。

代价：**跑 E2E 之前必须先 `pnpm build`**（否则 `vite preview` 会因为没有 `dist/` 而报错）。

### 为什么每个用例跑两遍

`playwright.config.ts` 定义了两个 project：

```ts
{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
{ name: 'mobile-chromium',  use: { ...devices['Pixel 7'] } },
```

所以 `chess960.spec.ts` 的 15 个验收用例加上 `inspect-ai.spec.ts` 的 1 个探针，共执行 **32 次**（最近一次全绿，约 22 秒）。移动端不是"额外测一次"，而是**同一批验收标准在触摸视口下必须同样成立**。注意 `renders a usable board on a phone viewport` 这个用例**没有 project 守卫**，它在桌面 project 下也会跑（只是断言棋盘是正方形且宽度不超过视口 1 px）。

---

## 2. 单元测试清单

### 2.1 `tests/unit/generate.test.ts`（194 行，15 用例）

`describe`：`Chess960 layout generation`（14）、`board helpers used by the Chess960 tests`（1）。

覆盖：

- **恰好 960 个互不相同的布局**（索引 0–959）。
- **与独立暴力实现交叉验证**：`referenceBackRanks()` 枚举 `{r,r,n,n,b,b,q,k}` 的全部 `8!/(2!2!2!) = 5040` 个排列并筛出合法的 960 个。生成器的结果与它比较（按**排序后的集合**比较，因为暴力枚举走字典序而构造法走 Scharnagl 序；编号本身由下面那条往返测试锁定）。
- **每个布局的不变量**：象在异色格、王严格在两车之间、子力数量恰为 `{r:2, n:2, b:2, q:1, k:1}`。
- **`index → layout → index` 全量往返**（0..959）。
- **非法布局的拒绝**：同色格象、缺王、王在两车之外、长度不足。
- **`RangeError`**：索引 960 与 −1。
- **大小写不敏感归一化**（`NRBBQKNR` → `nrbbqknr`）。
- **Scharnagl 锚点**：`0 = "bbqnnrkr"`、`1 = "bqnbnrkr"`、`959 = "rkrnnqbb"`、标准布局 `rnbqkbnr` = **518**。
- **起始 FEN 形状**：兵在第 2/7 横线；Shredder 易位字母与车的纵线一致。
- **注入确定性 RNG**：`0 → 索引 0`，`0.999999 → 索引 959`。
- **起始 FEN → `Position` 往返**：19–21 个合法首着；`canUseTraditionalCastling()` 仅对标准布局为真。
- `toFenWithStandardCastling()` 能重新印出经典的 `w KQkq` 拼写。

### 2.2 `tests/unit/castling.test.ts`（584 行，53 用例）★ 最重要

`describe`：`standard castling (sanity check before the Chess960 cases)`（4）、`Chess960 castling: king and rook placement`（11）、`Chess960 castling: legality conditions`（20）、`en passant and pawn rules`（5）、`position bookkeeping`（13）。

**易位矩阵**（棋盘上的每一个边界情况）：

- 标准象棋双方 K/Q 易位；王与车的落点、腾空的起始格；黑方易位。
- 拒绝：被将时、穿过被攻击格、落在被攻击格、路径被挡、易位权已失、完全没有易位权。
- **Chess960 特例**：王已在 g1（`from === to`，只有车动）、王已在 c1；王在 f1 → g1/f1 与 f1 → c1/d1；王在 b1 → g1（车 h1→f1）与 b1 → c1（车 a1→d1）。
- **敌方车钉住易位车**（h1 有敌车）⇒ 非法。
- **车的落点被第三方棋子占据** ⇒ 非法；但**易位车自己停在落点上**是合法的。
- **只有"车穿过被攻击格"是合法的**（h5 的象攻击 d1，用 `A` 侧易位）——最锋利的一条规则用例。
- 王不在"正确那一侧车"旁边时，即使写 `KA` 王翼也非法，但后翼仍然可用。
- **权利丧失的三种途径**：王走过又回来、车走过又回来（另一侧的权利保留）、**车在原始格上被吃**（Shredder `HDhd` 下 `d1xd8` 只杀掉黑方后翼权利，王翼保留）；易位后 FEN 易位字段变 `-`。
- **Shredder 字段解析**：`HFhf`；部分字段（`Hh` ⇒ 双方仅王翼）；**指向不存在的子的权利被静默丢弃**，而 `Position.fromFen(fen, { strictCastling: true })` 会抛 `/castling right/`。
- **序列化**：`toFenWithStandardCastling()` 输出 `KQkq`/`KQ`/`kq`，Shredder 按升序列出车的纵线（`AHah`）。
- **三种易位编码都接受**（王→车原始格、王→目标格、显式 `{castle:'king'}`）；权利已失时"王→车格"这个编码被拒绝；没有权利时王走到空的 g1 返回 null。
- **易位只在请求王所在格时生成**（`legalMoves({only: e1})` 有 2 个易位，`{only: h1})` 有 0 个）。
- 王不能易位到敌方王的旁边；王相邻性生成（Kd3 vs Kd5 → 恰好 5 个合法王着法）。

**过路兵与兵**：过路兵格只在双步推进后出现、被马的移动清除；吃过路兵会移除 d5 的兵并落在 d6；**过路兵钉住**（e8 有车在同一纵线）被 `resolveMove` 与 `legalMoves({only})` **双双拒绝**；升变恰好提供 `['b','n','q','r']`，显式与默认升后都测，吃子升变也有 4 个着法。

**记账与撤销保真度**：

- FEN 计数器（e4/c5/Nf3 之后）与两种易位拼写。
- `repetitionKey()` 对"回到起始局面的转换"相等；过路兵格出现后不同。
- 吃过路兵后撤销、易位后撤销，FEN 精确还原。
- **`undoes repeatedly, even after intervening legality probes`** —— 这条是回归测试，锁定了"`Position.legalMoves` 内部的 play/undo 会吃掉 `Game.undo` 依赖的那层撤销"这个曾经的 bug。
- 反复撤销直到起始局面；`undoMany(n)` / `undoMany(0)` / 到起始局面即停止；`undo()` 会清除认输或协议和棋而不是撤销一步。
- `toState`/`fromState` 往返保留 fen、`repetitionKey`、`castlingFiles` 与 `rights`。
- 将/将死/逼和通过合法着法数判定；子力不足（K vs K、K+B vs K、K+N vs K、**同色格象为真 / 异色格象为假**、有兵或有车为假）。
- `debugAt` / `kingSquare` 的调试输出。

### 2.3 `tests/unit/notation.test.ts`（509 行，40 用例）

12 个 `describe`：`moveToSan: pawn moves and captures`（4）、`moveToSan: disambiguation`（4）、`moveToSan: promotion`（2）、`moveToSan: check and mate suffixes`（3）、`moveToSan: castling in Chess960 positions`（4）、`sanToMove`（5）、`sanToMove: round-trips a real Chess960 game`（2）、`uciToMove`（4）、`moveToUci`（2）、`buildPgn`（6）、`parsePgn and Game.fromPgn`（2）、`isChess960StartFen`（2）。

高价值用例：

- **消歧的最小性**：`Nde4`/`Nfe4`（纵线）、`N1c3`/`N5c3`（横线）、`Qa1b2`（纵线+横线，而 `Q3b2`/`Qcb2` 各只需一项）。
- **`Bxc3` vs `bxc3`**：同一局面下两者都合法，靠大小写区分——这正是 `sanToMove` 需要"双向试读"的原因。
- **升变记谱**：`a8=Q/R/B/N`、吃子升变 `axb8=Q+`（带将军后缀）、升变将死 `a8=Q#`（并且真的走一遍验证）；写成 `a8` 时默认为后。
- **Chess960 易位 SAN**：王不动时写 `O-O`；`g1→c1` 写 `O-O-O`；王穿过车的落点（b1→h1 / b1→a1）写 `O-O` / `O-O-O`；`O-O+`。
- **容错的易位拼写**：`O-O`、`0-0`、`o-o`、`O-O+!?`、en dash `O–O`。
- **非法/畸形 SAN 拒绝清单**：`''`、`'   '`、`Zz9`、`xyz`、`e9`、`Ke9`、`Qh9`、`Qq4`、`Nf3x`、`Kxh8`、`Nf6`、`exd5`、`Bb5`，以及权利不可用时的 `O-O`。
- **UCI 往返**：大小写不敏感 `E2E4`；升变 `e7e8q`/`d7d8n`、裸写 `d7d8` ⇒ 后；**标准局的 `e1h1`/`e1a1`** 与 **Chess960 的 `b1h1`/`b1a1`**（王吃己车编码）；`e1g1` 也接受；`0000`/`(none)`/`null`/`''`/`e2e9`/`zz`/`e2`/`e2e4q2`/`e2e5` 全部返回 null；`moveToUci` 在王已站在易位目标格时输出 `g1h1`。
- **PGN 头**：仅 Chess960 才有 `Variant`/`SetUp`/`FEN`；标准局没有；奇数步的 movetext（`1. e4 *`）与空 movetext（`*`）；自定义起始 FEN 原样保留并可重新解析。
- **折行**：`lineWidth: 20` 时每行 ≤20 且拼回来等于未折行文本；`lineWidth: 0` 关闭折行。
- **头文件引号转义**（双引号变单引号）；**注释/变例/NAG 剥离**（`{comment}`、`; trailing`、`$1`、`(2. Bc4 Nf6)`）且结果标记保留。
- **完整 Chess960 PGN 往返**：`Chess960Index "0"`；`Game.fromPgn` 还原 fen / sans / length / startIndex / startBackRank / `standard === false`。
- **快照往返**与"遇到第一个不一致的着法就截断"。
- `resign()` 默认认输方是走子方；结果字符串 `1-0` / `0-1` / `1/2-1/2` / `*`。

> `SHORT_GAME` / `SHORT_GAME_SANS`（`bbqnnrkr` 上的 8 步、双方都在王不动的情况下易位）在 `notation.test.ts` 与 `game.test.ts` 里**逐字重复**。这是有意的：它是一个真实的 Chess960 序列，作为两个文件各自的独立夹具。

### 2.4 `tests/unit/game.test.ts`（518 行，32 用例）

8 个 `describe`：`Game construction`（6）、`Game.play`（3）、`Game move accessors`（2）、`Game.undo / Game.undoMany`（7）、`Game endings`（4）、`Game draw rules`（4）、`Game snapshots`（2）、`Game.toPgn`（4）。

- **构造**：从 index / backRank / startFen / standard 四种方式；`nrbbqknr` 断言为索引 **229**。
- **两种标准 FEN 拼写都被锁定**：`STANDARD_FEN` 用 Shredder 拼写 `w AHah`（`Position` 的序列化形式），`STANDARD_START_FEN` 用 `w KQkq`（PGN 保留的形式）。
- **易位后的 FEN**：`bbqn2kr/ppppprpp/5n2/5p2/5P2/5N2/PPPPPRPP/BBQN1RK1 b h - 5 4`（白方 O-O 后只剩 `h` 权利）。
- **终局**：将死、逼和、认输、协议和棋。
- **和棋规则**：三次重复、50 步（可主张）、75 步（自动）、子力不足——注意测试同时用 `claimableDraw` 与 `evaluatePosition`/`evaluateStatus` 两个入口。
- **快照**：`version: 1`；往返；不一致着法的截断。
- **`Game.toPgn`**：Chess960 头、结果串、空对局。

### 2.5 `tests/unit/i18n.test.ts`（148 行，16 用例）

3 个 `describe`：`message catalogs`（6）、`translate`（7）、`message descriptors`（3）。

这一份测试的价值几乎全在**防漂移**——它不需要跑浏览器就能挡住多语言最容易出的几类错：

- **两张表的键集合必须完全相同**。`en` 的类型是 `Record<MessageKey, string>`，所以漏译本来就编译不过；这条断言额外覆盖运行期（比如有人用 `as` 断言绕过了类型）。
- **每个值都是非空字符串**，两张表逐键检查（挡住"翻译时手滑清空"）。
- **占位符集合必须一致**：`zh` 里声明了 `{count}` 而 `en` 里漏了，切到英文时参数会静默消失。这条断言逐键比对 `{...}` 集合。
- **两张表必须真的不同**：只允许 5 个键在中英文里完全相同（`language.zh` / `language.en` / `pgn.title` / `engine.stockfish` / `board.square`）。有人复制粘贴忘了翻译，这条会失败。
- **默认语言是中文**：`DEFAULT_LANGUAGE === 'zh'`，且 `normalizeLanguage` 对 `undefined` 和任意垃圾值都回落到 `'zh'`，只认 `'en'`。
- **插值语义**：已命名的参数被替换；**未知占位符原样保留**（不会打印 `undefined`）；未知语言回落到中文。
- **领域键助手是全函数**：6 种棋子、2 种颜色、4 档难度（标签 + 描述）、4 种升变选择都能取到文案；`promotionRoleKey('k')` 这种非法输入回落到棋子名而不崩。
- **描述符语义**：`asMessage` 保留 key + params、省略空 params；`formatMessage` 对同一描述符分别渲染出中英文；`null`/`undefined` → `null`。

> 这条"两张表必须真的有差异"的断言在写完后**立刻抓到了两个我漏掉预期的键**（`board.square`、`engine.stockfish`）——测试先于文档发现了遗漏，这正是它存在的意义。

---

## 3. 端到端测试清单

### 3.1 `tests/e2e/chess960.spec.ts`（345 行，15 用例）

`test.describe('Chess960 board')`：

| 用例 | 走过的流程 |
|---|---|
| `loads with a random Chess960 starting position` | 加载、棋盘渲染、随机布局 |
| `plays a local game with click-to-move and updates the score sheet` | 点击走子、记谱表更新 |
| `completes a castling move in a Chess960 position` | 易位 |
| `undo restores the previous position` | 撤销 |
| `flips the board` | 翻转（`board--white` → `board--black`） |
| `resigns a game` | 认输（`window.confirm`） |
| `copies the FEN and exports a PGN with Chess960 headers` | 剪贴板 + PGN 导出 |
| `starts a game from a specific Chess960 index` | 按编号开新局 |
| `promotes a pawn through the dialog` | 升变弹窗 |
| `renders a usable board on a phone viewport` | 移动端布局（棋盘正方形、宽度 ≤ 视口） |

`test.describe('human vs engine')`：`the engine answers a human move`、`offers a hint in AI mode`（都用 `easy` 难度 + 30 s 轮询）。

`test.describe('interface language')`：

| 用例 | 走过的流程 |
|---|---|
| `defaults to Chinese` | 不预置任何设置打开应用，断言按钮文案、状态行、模式行都是中文，`<html lang="zh-CN">`，标题是中文 |
| `switches to English without a reload` | 设置 → 界面 → 语言选 English，断言按钮/弹窗立刻变英文、`lang`/`title` 同步，并读回 localStorage 确认已持久化 |
| `renders a status message that was produced before the switch in the new language` | 先用中文触发一条状态消息（复制 FEN），再切英文，断言**那条已存在的消息**也变成英文 |

最后一条是这个功能里最关键的回归测试：它锁定了"store 存 `MessageDescriptor` 而不是渲染好的字符串"这个设计决策（见 [ui-and-state.md](./ui-and-state.md) 第 5.3 节）。

**测试与应用的耦合点：**

- **语言必须显式预置**。界面默认中文，而本文件原来的断言都是按英文写的，所以 `openApp()` 会往 `localStorage` 写一个 `chess960:settings` 封套把语言固定成 `en`；要测真实默认值就传 `{ language: null }`。**这是新增语言时最容易忽略的一步**：否则整个套件会因为文案变化而集体失败。
- 大量 `data-testid`：`board`（带 `data-placement`）、`square-<alg>`、`piece-<alg>`、`fen-text`、`new-game`、`new-game-dialog`、`fen-input`、`dialog-mode-select`、`dialog-level-select`、`start-game`、`index-input`、`index-preview`、`index-badge`、`status-text`、`status-message`、`movelist`、`undo`、`flip`、`resign`、`copy-fen`、`show-pgn`、`pgn-text`、`promotion-dialog`、`promote-n`、`engine-label`、`hint`、`hint-label`、`open-settings`、`settings-dialog`、`language-select`。
- **选择器一律用 value 或 testid，不用可见文案**（`selectOption('ai')`、`selectOption('easy')`），所以它们对语言切换免疫。只有 3 处 `getByRole` 依赖文案，都是 `radio`（`/Custom FEN/i`、`/index/i`），可访问名来自 `NewGameDialog` 的 label——**这两处是新增语言时需要同步检查的**。
- **直接读 store**：`playMove`/`undo` 用 `expect.poll` 轮询 `globalThis.__chess960.game.getState().moveCount`（5 s 超时）。这就是 `gameStore` 在 import 时挂载调试全局的原因。
- 剪贴板断言依赖 `playwright.config.ts` 预先授予的 `clipboard-read`/`clipboard-write` 权限。

**几个值得知道的测试缺口：**

- `completes a castling move in a Chess960 position` 实际用的是 `r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1`——这是一个**标准象棋**的易位栅格（没有 Chess960 底线、没有 `Variant` 头）。所以**非标准的易位栅格从未在 E2E 里被走过**（它由 53 个单元用例覆盖）。
- **拖拽走子从未被 E2E 覆盖**，只有点击走子。
- 以下 `data-testid` 存在于 `src/` 但没有任何 E2E 触碰：`restart`、`draw`、`claim-draw`、`export-pgn`、`copy-pgn`、`pgn-dialog`、`dialog-color-select`、`color-select`、`level-select`、`mode-select`、`flip-under-board`、`resign-under-board`、`promote-q/r/b`、`drag-piece`。
- 撤消用例断言的是应用规范化后的 FEN `...RNBQKBNR w AHah - 0 1`（Shredder 字母），而不是它启动时用的 `KQkq`——这条断言其实顺带锁定了"内部一律用 Shredder 字段"这个约定。

**本次多语言改造顺手修掉的 3 个既有失败**（它们与语言无关，是套件本身的 bug；这套测试此前从未完整跑过）：

| 用例 | 原来的问题 | 修法 |
|---|---|---|
| `undo restores the previous position` | 本地模式撤销 1 步后是**黑方**走棋，断言却写 `' w '` 与 `White to move` | 改成断言 `' b '` 与 `Black to move`——这才符合"只退一步"的实际语义 |
| `promotes a pawn through the dialog` | 用 `playMove()` 走 a7–a8，而该助手会等 `moveCount` 增加；升变会先弹窗、不落子，于是超时失败 | 改用两次 `clickSquare()`，再显式等待升变弹窗 |
| `the engine answers a human move` | 断言记谱表文本匹配 `/1\. e4 \S+/`，但每步是独立 `<button>`，`textContent` 拼出来是 `"1.e4b5"`（无分隔符） | 改为断言 store 里的 SAN 列表（`sansFromStore`），不再依赖 DOM 文本拼接 |

### 3.2 `tests/e2e/inspect-ai.spec.ts`（92 行，1 用例）⚠️ 诊断探针

文件头注释写着 `/** Temporary: exercise the engine worker directly in the browser. */`。

**它没有 `test.skip` / `test.only` / `test.fixme`，因此会被正常收集并在两个 project 下各跑一次。** 但它的性质是**探针而非断言**：

- 证据全部通过 `console.log` 输出（假 worker 构造、引擎 store 是否存在、从 bundle 里正则提取 worker 资源 URL、直接与 worker 握手、引擎 store 状态、捕获的页面日志）。
- **只有一个断言**：`expect(page.getByTestId('new-game-dialog')).toBeHidden()`。
- 引擎失败或超时只记录、从不断言，所以**引擎全坏了它也能通过**。

它做的事：拦截 console/pageerror/requestfailed → 清 localStorage → `goto('/')` → `page.evaluate` 设 `globalThis.__debugEngine = true` → 用一个目录 URL 构造一次性 worker（错误不断言）→ 读 `globalThis.__chess960.engine` → 从 `index.html` 与主 bundle 里正则抓出 `builtin.worker-*.js` 的 URL 并 `fetch` 它检查状态与 content-type → 以 `{type:'module'}` 起 worker、`postMessage('uci')`、等首条消息或 8 s 超时 → 通过 UI 开一局 `ai`/`easy` → 等 2.5 s 后读引擎状态。

> 它设的 `localStorage.DSH_DEBUG_ENGINE = '1'` 是**死标志**：`src/` 里没有任何代码读它（只读 `globalThis.__debugEngine`）。

建议：把它改名成 `*.probe.ts` 或加 `test.skip`，否则它会给 CI 增加 2 次无实质断言的运行，并让"测试全绿"这个信号失真。

---

## 4. 运行

```bash
pnpm test              # 单元测试（Vitest，纯 Node）
pnpm test:watch        # 单元测试 watch 模式
pnpm typecheck         # tsc -b，只做类型检查

pnpm build             # E2E 的前置条件：必须先产出 dist/
pnpm test:e2e:install  # 首次：下载 Chromium
pnpm test:e2e          # E2E（vite preview 起在 127.0.0.1:4173）
```

- E2E 的 `webServer` 是 `npx vite preview --port 4173 --strictPort --host 127.0.0.1`。`reuseExistingServer: !process.env.CI`，所以本地如果已经开着 4173 会直接复用。
- 用 `--host 127.0.0.1` 是为了让就绪探针与 `baseURL` 落在同一个地址上（preview 默认打印 `localhost`，与 `baseURL` 的 `127.0.0.1` 不是同一个字符串）。
- 失败时保留 trace 与截图（`trace: 'retain-on-failure'`、`screenshot: 'only-on-failure'`），视频关闭。
- CI 下额外行为：`retries: 1`、`workers: 1`、`forbidOnly: true`、输出 HTML 报告（`open: 'never'`）。

---

## 5. 覆盖边界（诚实清单）

| 有测试 | 没有测试 |
|---|---|
| 规则层：走法生成、合法性、易位、过路兵、升变、和棋判定、重复局面 | `src/core/engine/` 的**全部 7 个文件**（无单元测试） |
| 记谱层：SAN / UCI / PGN 双向 | `src/store/`、`src/hooks/`、`src/utils/storage.ts` |
| `Game` 门面：历史、撤销、快照、终局 | 拖拽走子（E2E 只覆盖点击） |
| 起始布局生成：960 布局、双射、暴力交叉验证 | 非标准 Chess960 易位栅格的 E2E |
| i18n：两张表对齐、占位符一致、插值、描述符、默认语言 | 除中英以外的语言（尚未存在）；`Intl` 数字/日期格式化（未使用） |
| E2E：主要验收流程 + 移动端视口 + **语言默认值与切换** | 时钟（`useClock` / 时钟 action）、设置面板其余项、PGN 弹窗、和棋主张、重开、弃权等 |
| | 引擎的真实强度与搜索质量（只测了 worker 握手） |

**给引擎补测试是最明显的空白**。好消息是 `search.ts` / `evaluate.ts` 都是纯函数且零依赖，可以直接在 Node 下测：例如断言"一步杀能被找到"、"必输局面下的走法不送后"、"同分走法在固定 `rng` 下可复现"。

**i18n 的测试已相当密**（16 个用例），因为它恰好是"纯函数 + 静态数据"这种最容易、也最值得穷尽验证的形态。仪表盘上唯一没被覆盖的是"新增一种语言"——那需要先把语言加进 `LANGUAGES` 与 `CATALOGS`，`tests/unit/i18n.test.ts` 的"语言数量"断言会提醒你是否忘了同步。

---

**相关文档**：[开发指南](./development.md) · [规则引擎](./rules-engine.md) · [AI 引擎](./engine.md) · [整体架构](./architecture.md)
