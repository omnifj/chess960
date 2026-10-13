# 整体架构

> 一句话：**四层单向依赖的单页应用 —— `core`（纯规则）← `store`（状态与编排）← `hooks`（副作用）← `components`（视图）；唯一的异步边界是 Web Worker 里的 AI 引擎；唯一的持久化是 `localStorage`。**

没有后端、没有网络请求、没有路由。

---

## 1. 分层与依赖方向

```
┌──────────────────────────────────────────────────────────────┐
│  components/          React 视图（纯展示 + 事件上报）          │
│  App.tsx              外壳与布局、编排                        │
│  hooks/               useAiPlayer · useClock（副作用）        │
├──────────────────────────────────────────────────────────────┤
│  store/               zustand：game · settings · engine · dialog│
├──────────────────────────────────────────────────────────────┤
│  core/                纯 TypeScript，零 React、零 DOM          │
│    Board → Position → Game                                     │
│    rules · notation · history · chess960/generate              │
│    engine/            search · evaluate · ai · protocol · worker│
└──────────────────────────────────────────────────────────────┘
        依赖只能自上而下；core 从不反向 import store 或组件

  i18n/  ── 横切（中/英，默认中文）
     types · messages · translate   零依赖叶子：store 与组件都能引用
     useI18n                        唯一接触 store 的文件
     规则：core/ 里不出现任何界面文案；store 存描述符，不存渲染好的字符串
```

**为什么 i18n 是横切而不是一层**：`translate()` 是无状态纯函数，任何层都能安全调用；但它**必须**能读到当前语言，而语言是用户偏好（`settingsStore`）。把"零依赖的叶子"（类型 / 文案 / 纯函数）与"接触 store 的接入点"（`useI18n`）拆开，横切就不会引入循环依赖。详见 [ui-and-state.md](./ui-and-state.md) 第 5 节。

**这条方向性约束是整个架构的支点。** 因为 `core/` 不碰 DOM 也不碰 React，它可以在纯 Node 下被测试——这就是 5 个文件、156 个用例能在 1.2 秒内跑完的原因，也是"棋规正确性"这类高风险代码能被穷尽验证的前提。

---

## 2. 各层职责一览

| 层 | 目录 | 知道什么 | 不知道什么 |
|---|---|---|---|
| 规则层 | `src/core/` | 棋盘、走法、合法性、FEN/SAN/PGN、Chess960 易位、AI 搜索 | React、DOM、localStorage、UI 状态、**界面文案** |
| 状态层 | `src/store/` | 当前棋局、选中格、可走格、时钟、模式、偏好、引擎状态 | 组件长什么样、按钮在哪、**文案长什么样**（只存描述符） |
| 副作用层 | `src/hooks/` | "轮到 AI 了该走子"、"时间在流逝" | 具体渲染 |
| 视图层 | `src/components/` | 怎么画棋盘、怎么响应指针/键盘 | 棋规、棋局从哪来（全部经 props 或 store） |
| 多语言 | `src/i18n/` | 键 → 文案的映射、当前语言 | 棋规、棋局状态 |

### 视图层的一个刻意约束

`src/components/Board/Board.tsx` **不 import 任何 store**——它全部的输入都是 props（`placement`、`selected`、`destinations`、`locked`、`hint`、`orientation`…），全部输出都是回调（`onSelect`、`onMove`、`movesFor`）。

这样棋盘组件就成了一个可独立渲染、可独立测试的纯展示组件；"走这一子合不合法"完全由 store 决定。

---

## 3. 一次人类走子的完整数据流

```
① 指针按下 .square
     Board.tsx  onPointerDown（button 0 且未 locked）
       ├─ 已有 selected 且该格在 destinations 里 → onMove(selected, square)   ← 点动走子
       └─ 否则 select + movesFor(square)，若该子有可走格则 setPointerCapture 并进入 drag 状态
                    │
② App.handleMove(from, to)
     调用 gameStore.tryMove(from, to)
       ├─ 返回 null（目标非法）→ App 退化为 selectSquare(from)，重新选择
       └─ 成功 → App 播放走子音效（Web Audio，440 Hz / gain 0.04 / 60 ms）
                    │
③ gameStore.tryMove(from, to, promotion?)
     ├─ canHumanMove() 门禁：over、promotion pending、AI 思考中、非玩家回合 → 拒绝
     ├─ legalMoves(from) 里筛 move.to === to（含易位着法）
     ├─ 若候选是升变且未指定角色 → 设 promotion { from, to, options: [q,r,b,n] }，返回 null
     └─ game.play({from,to,promotion})       ← core 层
          └─ Game.play → Position.resolveMove → legalMoves → play()，产出 SAN 与 GameRecord
                    │
④ 收尾（都在 store 内，顺序固定）
     syncView()            把 game 的 fen/turn/over/length 抄进 store 字段，并 version += 1
     resetClockForNextMove()  给走子方扣时并加秒
     persist()             saveGame(game.toSnapshot()) → localStorage['chess960:game']
                    │
⑤ 重渲染
     组件订阅的是 version 计数器或已脱敏的原始字段（fen / turn / moveCount / over），
     所以一次 syncView 就能驱动整棵树更新
```

### 升变为什么是一次"两阶段"走子

`tryMove` 在发现候选是升变且未指定角色时**不落子**，只把 `promotion` 放进 store 并返回 `null`。`PromotionDialog` 因此出现；玩家选完后 `completePromotion(role)` 先清 `promotion`，再重新调用 `tryMove(from, to, role)` 才真正落子。按 <kbd>Esc</kbd> 则 `completePromotion(null)`，撤掉选择、放弃这步。

### 拖拽与点击共用一条通路

`Board` 用 `setPointerCapture` + 每个格子上的 `pointermove`/`pointerup` 实现拖拽，松手时用 `squareAt(clientX, clientY)` 把坐标换算回格子。**拖拽和点击最终都汇聚到同一个 `onMove(from, to)`**，所以 store 与棋规层完全不需要区分这两种输入方式。`pointerup` 落在棋盘外、或落回起点格，都视作无效。

---

## 4. 一次 AI 走子的完整数据流

```
① useAiPlayer 的 effect 触发
     依赖 [mode, over, promotionPending, turn, playerColor, fen, aiLevel, movesPlayed]
     提前返回条件：非 ai 模式 / 已结束 / 有升变待决 / turn === playerColor
     用 pendingFen ref 去重：同一个 FEN 已经在搜了就不再发起
                    │
② 置两处 thinking 标志
     gameStore.setThinking(true)   ← 用于 canHumanMove() 门禁，锁住棋盘
     engineStore.setThinking(true) ← 用于状态栏显示
                    │
③ getEngine().go(fen, { level: aiLevel })        ← 模块级单例 Engine
     把 { type:'go', requestId, fen, ... } postMessage 给 Web Worker
     ← 主线程在这里就空闲了，棋盘保持可交互
                    │
④ worker 内：searchMove(...) → postMessage({ type:'bestmove', requestId, move, uci, ... })
                    │
⑤ 回到主线程（useAiPlayer）
     ├─ 陈旧性检查：current.fen !== fen → 丢弃结果（用户期间撤销/开了新局）
     ├─ current.game.play(result.move)    ← 直接调 Game，绕过 canHumanMove/tryMove
     ├─ play 返回假值 → 消息 "The engine returned an illegal move; skipping it."
     ├─ syncView() → setSelected(null) → engineStore.setHint(null) → noteMovePlayed()
     ├─ resetClockForNextMove() → persist()
     └─ finally：清掉两处 thinking 标志 + pendingFen
```

几个值得注意的点：

- **引擎走子不播音效。** 音效只挂在 `App.handleMove` 的人类通路上。
- **引擎走子直接调 `game.play`**，不走 `tryMove`。因为 `tryMove` 的 `canHumanMove()` 门禁在 `turn === playerColor` 时必然为假，会把自己挡在门外。
- **`Engine.stop()` 会 reject 所有 pending 请求**，`useAiPlayer` 把错误信息里包含 `'stopped'` 的视为"用户取消"而静默吞掉。
- **AI 模式的初始化是懒的**：第一次出现 `mode === 'ai'` 时（`started` ref 保护）才 `getEngine().init()`，所以纯本地对局根本不会创建 worker。

---

## 5. 状态层：四个 store

| store | 中间件 | 职责 | 关键点 |
|---|---|---|---|
| `gameStore` | 无（手写持久化） | 棋局本体、棋盘交互、时钟、终局 | 最大的一个；持有**可变的 `Game` 实例** + 脱敏视图字段 + `version` 计数器 |
| `settingsStore` | `persist` | 用户偏好：模式、主题、坐标、提示、音效、时钟、默认难度 | 唯一的 zustand persist；`merge` 走 `normalizeSettings` 做字段校验 |
| `engineStore` | 无 | 引擎就绪状态、思考中、错误、提示、已走步数 | 同时是**模块级 `Engine` 单例的持有者** |
| `dialogStore` | 无 | 三个弹窗的开关（newGame / settings / pgn） | 22 行；无互斥逻辑 |

详细的字段与 action 清单见 [ui-and-state.md](./ui-and-state.md)。

### 5.1 `gameStore` 的"可变对象 + version 计数器"模式

这是本项目一个需要理解的**关键约定**：

```ts
game: Game              // 可变对象，被就地修改（game.play / game.undo ...）
version: number         // syncView() 每次 +1
fen, turn, over, moveCount   // 从 game 复制出来的脱敏字段
```

`Game` 是可变类，直接改它 React 察觉不到。于是：

- `syncView()` 是**唯一的漏斗**：把 `game.fen / turn / isOver / length` 抄进 store 字段并 `version += 1`。
- 组件要么订阅脱敏后的原始字段（`fen`、`turn`、`moveCount`、`over`），要么订阅 `version` 然后 `void version;` 把它丢弃——只为拿到"有些东西变了"这个信号。

```ts
const version = useGameStore((s) => s.version);
void version;                       // 只为触发重渲染
const pgn = game.toPgn();           // 然后重新计算派生值
```

> 代价：`version` 变化会让所有按此模式订阅的组件一起重渲染。在这个体量下完全够用（棋盘一次最多 64 个格子），换来的是"棋规层不必为 React 的不可变性让步"。如果将来需要细粒度更新，这里是最该动的地方。

### 5.2 时钟状态机

时钟状态是 `clock: { remaining: {white, black}, activeSince, baseMs, incrementMs }`，逻辑全部在 `gameStore` 的五个 action 里：

| action | 语义 |
|---|---|
| `setClock(min, inc, enabled)` | 重设基准时间；`enabled` 为假时 `baseMs = 0`（时钟整体隐藏） |
| `tickClock(now)` | 从**走子方**扣除流逝时间，重锚 `activeSince`；返回超时的一方 |
| `resetClockForNextMove()` | 给**刚走完**的一方扣时并加 `incrementMs`，重锚 |
| `restartClockForCurrentTurn()` | 只重锚、不加秒（撤销后使用） |
| `pauseClock()` / `resumeClock()` | 预扣流逝时间后冻结 / 重新锚定 |

驱动它的是 `useClock(clockEnabled && !over, onFlag)`：

- `setInterval(..., 250)` 调 `tickClock()`；把返回的颜色交给 `onFlag`。
- 监听 `document.visibilitychange`：页面隐藏时 `pauseClock()`，回来时 `resumeClock()`——**后台标签页不会偷偷跑掉玩家的时间**。
- `onFlag` 在 `App` 里实现为 `resign(color)` + 一条消息 `<side> ran out of time.`。

> ⚠️ 因为超时走的是 `resign()`，`GameStatus` 的 `'timeout'` 状态**永远不会被时钟路径产生**，`StatusBar.describeGameStatus` 里那个分支目前是死代码。

---

## 6. Worker 边界

引擎与 UI 之间**只有消息**：

```
主线程                                Worker
─────────────────────────────────────────────────────────
Engine.go(fen, opts)
  postMessage({type:'go', ...})  ──────────►  searchMove(...)
                                                │ 迭代加深 / alpha-beta / 静态搜索
                                                │ 可取消失效性：棋盘永远不卡
  ◄────────── {type:'info', ...}（每次根着法改进，当前被忽略）
  ◄────────── {type:'bestmove', ...}
  按 requestId 匹配 pending，resolve
```

- worker 的实例化集中在 `src/core/engine/workerFactory.ts` 一处，用 Vite 的 `?worker` 构造器（细节与原因见 [engine.md](./engine.md)）。
- worker 的构建产物是**独立 chunk**（`builtin.worker-*.js`），不进入首屏包。
- 超时保护：每次请求 `movetimeMs + 20 000 ms`；worker 的 `error` 事件一次性 reject 所有 pending。
- `requestId` 单调递增，用于在多个并发请求间配对。

`src/core/` 里唯一一处跨越到"外部世界"的代码就是 `engine/ai.ts` 里的 `Worker` / `fetch`，这也解释了两个 `new Game(...)` 之外唯一的命令式副作用为什么放在 `core/engine/` 而不是 `store/`。

---

## 7. 持久化边界

| 数据 | 机制 | 键 |
|---|---|---|
| 进行中的对局 | `gameStore.persist()` → `saveGame(game.toSnapshot())`，在 newGame/tryMove/undo/resign/agreeDraw/claimDraw/setMode/refresh/loadFen 末尾调用 | `chess960:game` |
| 用户偏好 | zustand `persist` 中间件，version 1，自定义 `merge` 做字段校验 | `chess960:settings` |
| 可用性探测 | 写入后立刻删除 | `chess960:probe` |

启动时的恢复逻辑：`loadGame<GameSnapshot>()` → 校验形状（`Array.isArray(moves) && typeof startFen === 'string'`）→ `Game.fromSnapshot()`；任何异常都 `clearGame()` 并退回随机布局。`fromSnapshot` 遇到第一个不一致的着法就**停止**，宁可截断也不污染棋局。

`saveGame` / `readJson` 全部 try/catch 静默降级，因此隐私模式、配额用尽都不会崩——最坏情况只是不持久化。

`utils/storage.ts` **不 import 任何项目模块**，是纯工具。

---

## 8. 关键设计决策与取舍

| 决策 | 取舍 |
|---|---|
| 规则层自研、不用 chessops/chessground | 多写了约 2000 行规则代码，换来整个仓库保持 MIT 干净（详见 [tech-stack.md](./tech-stack.md)） |
| 内部的 FEN 用 **Shredder 易位字段** | 与只看 `KQkq` 的外部工具交换数据时需要 `toFenWithStandardCastling()` 转换；换来 Chess960 布局可无歧义表达 |
| 撤销用**完整局面快照**而不是 FEN 往返 | 每条记录多占一点内存；换来"车已被吃但易位权仍需保留"这种状态的精确还原，且反复撤销 + 中间穿插合法性探测都不会错位 |
| `Position.play()` 只保留**一层**撤销 | 搜索速度最好；代价是任何合法性探测都必须显式保存/恢复 `previous`（`legalMoves()` 里那段 `try/finally` 就是在处理这件事） |
| 棋盘用 `Uint8Array(64)` | 可读性略降（要用 `encodePiece`/`codeToRole`）；换来克隆极便宜——搜索每个节点都克隆一次局面 |
| 每次搜索节点都 `clone()` 而非 make/unmake | 实现简单、不易出错；换来一些分配开销（在这个搜索深度下可接受） |
| `gameStore` 用可变对象 + `version` 计数器 | 放弃 React 的不可变数据流与细粒度更新；换来棋规层不必迁就 React |
| 引擎放 Web Worker | 多一层消息协议与超时/错误处理；换来棋盘在思考时保持响应 |
| Stockfish 只留挂载点、不打包 | 开箱即用、许可干净；代价是默认真实运行的是较弱的内置引擎 |
| 单视图 + 弹窗，不用路由 | 无法深链接到某个弹窗；换来零路由依赖 |
| 自研 i18n，不引入 i18n 库 | 约 560 行自有代码 + 两套内联文案（+14 kB 原始 / +5 kB gzip）；换来零运行时依赖、零网络请求，以及"状态里存描述符"这种对现成库不好表达的行为 |

---

## 9. 架构不变量（改动时请守住）

1. **依赖单向**：`core/` 不得 import React、DOM、store 或组件。
2. **`Position` 是合法性的唯一真相来源**；组件与 store 都不得直接改棋盘。
3. **所有棋局变更走 `Game`**；`gameStore` 里的 `game` 只在 action 内被修改，并在末尾调用 `syncView()` + `persist()`。
4. **`syncView()` 是唯一的版本号漏斗**；手动改 `game` 后忘记调用它，UI 就不会更新。
5. **worker 通信只用 `protocol.ts` 里的类型**；`ai.ts` 与 `builtin.worker.ts` 是唯一两端。
6. **时钟只在 `gameStore`；UI 只通过 `useClock` 驱动它**，不要另起定时器。
7. **`utils/storage.ts` 保持零项目依赖**（它是所有持久化的底层，被 store 依赖）。
8. **测试钩子 `globalThis.__chess960`**（`{ game, engine }`）与 `globalThis.__debugEngine` / `globalThis.__castlingDebug` 是公开的调试契约，e2e 测试依赖它们。
9. **`core/` 里不出现任何界面文案**；需要面向用户的文本一律由视图层通过 i18n 键渲染。
10. **store 里存 `MessageDescriptor`，不存渲染好的字符串**——否则切换语言时，切换前就已显示的消息会卡在旧语言。
11. **`src/i18n/` 的 `types.ts` / `messages.ts` / `translate.ts` 保持零项目依赖**（只有 `useI18n.ts` 可以 import store）。这是打破"store 要语言类型、hook 要 store"循环引用的前提。
12. **文案表新增键必须同时加到 `zh` 与 `en`**——`en` 的类型是 `Record<MessageKey, string>`，漏了会编译失败；`tests/unit/i18n.test.ts` 还会校验占位符集合一致。

---

**相关文档**：[规则引擎](./rules-engine.md) · [AI 引擎](./engine.md) · [UI 与状态](./ui-and-state.md) · [目录与文件说明](./project-structure.md)
