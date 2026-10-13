# 目录与文件说明

本文件逐个说明**每个文件夹和每个文件**的作用。行数来自实际统计（含空行）。

```
chess960/
├── index.html                  20 行    Vite HTML 入口（中文为默认语言）
├── package.json                39 行    依赖、脚本、pnpm 配置
├── tsconfig.json                7 行    TS project references 汇总
├── tsconfig.app.json           24 行    src/ 的编译选项（严格模式）
├── tsconfig.node.json          15 行    配置文件与脚本的编译选项
├── vite.config.ts              33 行    Vite + Vitest 配置
├── playwright.config.ts        38 行    E2E 配置
├── vercel.json                 25 行    Vercel 部署与缓存头
├── netlify.toml                29 行    Netlify 部署与缓存头
├── .gitignore                  29 行    忽略规则
├── LICENSE                     28 行    MIT + Stockfish 第三方声明
├── README.md                  310 行    项目首页
├── pnpm-lock.yaml            1854 行    锁文件
│
├── src/                        42 个文件，250 KB
├── tests/                       7 个文件，103 KB
├── public/                      1 个文件
├── scripts/                     1 个文件
├── docs/                       10 个文件，152 KB（本目录）
├── dist/                        构建产物（已被 .gitignore 忽略）
└── node_modules/                依赖（已被忽略）
```

---

## 1. 根目录

| 文件 | 作用 |
|---|---|
| `index.html` | Vite 的 HTML 入口。只有一个 `<div id="root">`、一个 `<noscript>` 提示、`theme-color`/`description` meta，以及 `<script type="module" src="/src/main.tsx">`。**没有任何在 HTML 里的界面结构**——全部由 React 渲染。`lang="zh-CN"` 与中文的 `<title>`/`description` 体现"默认中文"；切到英文时由 `App.tsx` 的 effect 在运行期改写 `lang` 与标题。 |
| `package.json` | 名称 `chess960-web`、`"type": "module"`、MIT、说明字段；8 个脚本（`dev` / `build` / `preview` / `test` / `test:watch` / `test:e2e` / `test:e2e:install` / `typecheck`）；`pnpm.onlyBuiltDependencies: ["esbuild"]`；3 个运行时依赖 + 9 个开发依赖。 |
| `tsconfig.json` | 空 `files` + 两个 project reference，本身不编译任何东西，只把 `tsc -b` 分派到下面两个配置。 |
| `tsconfig.app.json` | `src/` 的配置：`target ES2022`、`lib` 含 DOM、`moduleResolution: bundler`、`jsx: react-jsx`、`types: ["vite/client"]`；**严格模式全家桶**（`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`、`verbatimModuleSyntax`、`isolatedModules`）；`noEmit` + `composite`（增量类型检查）。 |
| `tsconfig.node.json` | 只覆盖 `vite.config.ts` / `vitest.config.ts` / `playwright.config.ts`；`lib: ["ES2023"]`（无 DOM）、`types: ["node"]`。`vitest.config.ts` 列在 include 里但**该文件并不存在**（Vitest 配置内嵌在 `vite.config.ts`），属于无害的预留。 |
| `vite.config.ts` | `base: './'`（相对路径资源，任意子路径可部署）、`@vitejs/plugin-react`、dev server 端口 5173、`build.target: es2022` + `outDir: dist` + `sourcemap: true`、`worker.format: 'es'`；**内嵌 Vitest 配置**（`environment: 'node'`、`include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts']`、`testTimeout: 20000`）；COOP/COEP 头写好但**被注释掉**。 |
| `playwright.config.ts` | `testDir: './tests/e2e'`、`fullyParallel`、CI 下 `retries: 1` / `workers: 1` / `forbidOnly`；两个 project：`desktop-chromium`（Desktop Chrome）与 `mobile-chromium`（Pixel 7）；`baseURL: http://127.0.0.1:4173`；授予剪贴板读写权限；`trace: retain-on-failure`；`webServer` 用 `npx vite preview --port 4173 --strictPort --host 127.0.0.1`（跑**生产构建**）。 |
| `vercel.json` | Vercel 部署：`buildCommand: pnpm build`、`outputDirectory: dist`、`framework: vite`、`cleanUrls: true`；`/assets/*` 一年不可变缓存、`/engines/*` 一周；全局 `X-Content-Type-Options: nosniff` 与 `Referrer-Policy: strict-origin-when-cross-origin`。 |
| `netlify.toml` | Netlify 部署：`command = "pnpm build"`、`publish = "dist"`、`NODE_VERSION = "20"`；同样的三级缓存策略；文件末尾注释块给出启用 COOP/COEP 的写法。 |
| `.gitignore` | 忽略 `node_modules/`、`dist/`、`dist-ssr/`、测试产物（`coverage/`、`playwright-report/`、`test-results/`、`blob-report/`、`.playwright/`）、本地环境文件、编辑器目录、日志。 |
| `LICENSE` | **MIT**，版权行 `Copyright (c) 2026 Chess960 web contributors`。分隔线后追加**第三方声明**：本仓库不打包 Stockfish；Stockfish 是 GPL-3.0-or-later，放入 `public/engines/` 后由使用者自行遵守其许可。 |
| `README.md` | 项目首页：特性、快速开始、技术栈、整体架构、目录结构、规则引擎与 Chess960 易位要点、引擎、持久化、测试、部署、已知问题、许可。本目录是它的展开版。 |
| `pnpm-lock.yaml` | pnpm 锁文件。 |
| `.write-probe.txt` | ⚠️ **不是项目文件**——内容只有一行 `probe`，是工具沙箱的写入探测残留，可以直接删除。 |

---

## 2. `src/` —— 应用源码（42 个文件）

```
src/
├── main.tsx                    13 行   React 挂载入口
├── App.tsx                    245 行   应用外壳与编排
├── vite-env.d.ts               10 行   Vite/worker 的环境类型声明
│
├── core/                               ★ 纯规则层：零 React、零 DOM
│   ├── types.ts                92 行   全部领域类型
│   ├── squares.ts              73 行   格子代数（0..63 ↔ "e4"）
│   ├── board.ts               193 行   Uint8Array 棋盘 + FEN 摆放字段
│   ├── position.ts            977 行   ★ 合法性唯一真相来源
│   ├── rules.ts                99 行   胜负与和棋判定
│   ├── history.ts              31 行   重复局面计数
│   ├── notation.ts            374 行   SAN / UCI / PGN
│   ├── game.ts                389 行   历史、撤销、认输、快照
│   ├── chess960/
│   │   └── generate.ts        290 行   0–959 Scharnagl 编号生成
│   └── engine/                          AI 引擎
│       ├── ai.ts              324 行    ★ 引擎门面（Stockfish + 回退）
│       ├── difficulty.ts       59 行   四档难度参数表
│       ├── evaluate.ts        152 行   静态评估 + MVV-LVA
│       ├── search.ts          245 行   内置 negamax 搜索
│       ├── protocol.ts        124 行   worker 消息类型契约
│       ├── workerFactory.ts    16 行   worker 实例化（唯一一处）
│       └── builtin.worker.ts  139 行   内置引擎的 worker 入口
│
├── store/                              zustand 状态层
│   ├── gameStore.ts           508 行   棋局 + 交互 + 时钟 + 持久化
│   ├── settingsStore.ts       142 行   偏好 + 界面语言（唯一用 persist 的 store）
│   ├── engineStore.ts         106 行   引擎状态 + Engine 单例持有者
│   └── dialogStore.ts          22 行   三个弹窗的开关
│
├── i18n/                               界面多语言（中/英，默认中文）
│   ├── types.ts                23 行   Language / MessageParams（零依赖叶子模块）
│   ├── messages.ts            390 行   zh + en 两套文案表
│   ├── translate.ts            65 行   纯函数 t() + 键名助手
│   ├── useI18n.ts              56 行   React hook（唯一依赖 store 的文件）
│   └── index.ts                24 行   统一出口
│
├── hooks/                              副作用
│   ├── useAiPlayer.ts         111 行   AI 回合驱动 + 提示请求
│   └── useClock.ts             47 行   时钟循环 + mm:ss 格式化
│
├── components/                         React 视图
│   ├── Board/
│   │   ├── Board.tsx          222 行   棋盘网格 + 拖拽/点击
│   │   ├── Piece.tsx           27 行   ⚠️ 死代码，无引用
│   │   └── PromotionDialog.tsx 78 行   升变选择
│   ├── Controls/
│   │   ├── GameControls.tsx   256 行   操作栏 + 快捷键
│   │   ├── Modal.tsx           47 行   通用弹窗外壳
│   │   ├── NewGameDialog.tsx  198 行   新局设置
│   │   ├── PgnDialog.tsx       42 行   PGN 查看/复制
│   │   └── SettingsPanel.tsx  156 行   偏好设置 + 语言切换
│   ├── MoveList/
│   │   └── MoveList.tsx        68 行   记谱表
│   └── Status/
│       └── StatusBar.tsx      127 行   状态行/编号徽章/双时钟
│
├── styles/
│   └── index.css              768 行   全部样式 + 主题 CSS 变量
└── utils/
    └── storage.ts             110 行   localStorage / 剪贴板 / 下载
```

### 2.1 入口与外壳

| 文件 | 作用 |
|---|---|
| `main.tsx` | `createRoot(document.getElementById('root'))` → `<StrictMode><App/></StrictMode>`；**全局样式只在这里 import**。找不到 `#root` 时抛 `#root is missing from index.html`。 |
| `App.tsx` | 布局外壳（左棋盘 / 右信息栏）。把四个 store 与两个 hook 接到组件上；实现 `handleMove`（走子 + 音效）、`undoToPly`、走子音效（Web Audio 振荡器 440 Hz / gain 0.04 / 60 ms）、主题 data 属性、时钟同步 effect、超时处理、无障碍实时播报区、页脚快捷键说明、棋盘下方的翻转/认输按钮。 |
| `vite-env.d.ts` | `/// <reference types="vite/client" />` + 声明 `module '*?worker'`，使 `import W from './builtin.worker?worker'` 有类型。 |

### 2.2 `src/core/` —— 规则层（详见 [rules-engine.md](./rules-engine.md)）

| 文件 | 作用 |
|---|---|
| `types.ts` | 全部领域类型：`Color`、`Role`、`Square`、`Piece`、`Move`、`CastlingRights`、`GameOutcome`、`DrawReason`、`GameStatus`、`Chess960Position`、`PositionKeyFields`。 |
| `squares.ts` | 格子代数：`fileOf`/`rankOf`/`squareFrom`（位运算）、`algebraic` ↔ `squareFromAlgebraic`、`isLightSquare`、`backRankSquare`、`roleFromLetter`、`colorOfFile`、`fileFromCastlingLetter`（Shredder 字母 → 纵线）。 |
| `board.ts` | `Board` 类：`Uint8Array(64)`，编码为 `colorBit + roleCode`（白 0–6 / 黑 8–14 / 0 = 空）。提供 `clone`、`at`/`set`/`clear`、`roleAt`/`colorAt`、`findKing`、`piecesOf`、`toFenPlacement`/`fromFenPlacement`。另有 `encodePiece`/`pieceLetter`/`castlingSideFromLetter` 与调试转储 `boardToDebugString`。 |
| `position.ts` | **整个项目最重要的文件（977 行）**。`Position` 类持有棋盘、走子方、`castlingFiles`（王与两车的原始纵线）、`rights`、过路兵格、回合数。实现攻击判定、候选走法生成、**完整 Chess960 易位合法性**、真正的合法走法过滤、`resolveMove`（三种易位编码）、`play`/`undo`（一层）、FEN 双向、重复局面键、子力不足判定、精确快照 `toState`/`fromState`。 |
| `rules.ts` | `evaluatePosition`（判定顺序：将死 → 逼和 → 五次重复 → 75 步 → 子力不足 → 三次重复 → 将军/进行中）、`claimableDraw`（棋手可主张的 50 步 / 三次重复）、`isGameOver`、`winnerOf`、`describeStatus`（英文状态文案）。 |
| `history.ts` | 4 个小函数：`countRepetitions`、`nextRepetitionCount`（已有次数 +1）、`repetitionCounts`、`mostRepeated`。 |
| `notation.ts` | `moveToSan`（含最小消歧）、`sanToMove`（容错 + `Bxc6`/`bxc6` 大小写歧义双向试读）、`uciToMove`/`moveToUci`（易位用"王吃己车"编码）、`buildPgn`（Chess960 自动加 `Variant`/`SetUp`/`FEN`）、`parsePgn`（剥离注释/变例/NAG）、`replaySans`、`isChess960StartFen`、`resultFromStatus`。 |
| `game.ts` | `Game` 类：在 `Position` 之上加**历史**。`GameRecord[]`（含 SAN、走子前后 FEN、前后重复键、`stateBefore` 精确快照）、`play`/`undo`/`undoMany`、`resign`/`agreeDraw`、带缓存的 `status`、`result`、`toPgn`/`fromPgn`、`toSnapshot`/`fromSnapshot`、`toMovetext`。 |
| `chess960/generate.ts` | Scharnagl 编号生成与逆映射、校验 `normalizeBackRank`/`isValidBackRank`、`backRankFiles`、`backRankToStartFen`、`randomIndex`（优先 `crypto`）、`generatePosition`/`generateAll`、**独立暴力参考实现** `referenceBackRanks`（5040 排列筛出 960）、`startBoard`/`startCastlingContext`、`backRankFromFen`、`backRankFromSeed`。 |

### 2.3 `src/core/engine/` —— AI 引擎（详见 [engine.md](./engine.md)）

| 文件 | 作用 |
|---|---|
| `ai.ts` | UI 面向的 `Engine` 门面：单 worker、Stockfish 可选 + 静默回退、`init`/`go`/`goUci`/`stop`/`quit`、`requestId` 配对、每请求超时、`probeEngine`（用 Range 请求 + 拒绝 HTML 响应来识别 SPA 的 200 兜底页）、UCI 握手。⚠️ 只处理 JSON 形状响应，因此真实 Stockfish 文本流会超时（详见 [engine.md](./engine.md) 的「Stockfish 路径的已知缺口」一节）。 |
| `difficulty.ts` | `DIFFICULTIES` 四档参数表（depth / movetimeMs / skill / randomness / noiseCp）、`DIFFICULTY_ORDER`、`difficulty(name)`（未知名字回落到 medium）、`isEngineLevelName`。 |
| `evaluate.ts` | 零依赖静态评估：`PIECE_VALUE`（p100/n320/b330/r500/q900）、7 张棋子-格子表、象对 ±30、tempo ±8、残局切换王表；以及 `squareBonus`、`moveOrderScore`（MVV-LVA）、`positionKey`、`moveKey`、`kingCapturable`、`applyMove`。 |
| `search.ts` | 内置引擎：迭代加深 + alpha-beta negamax + 吃子静态搜索 + MVV-LVA + 置换表 + 将杀评分 + 和棋检测 + 时间管理 + 根着法排序 + 可选噪声弱化 + `onRootMove` 进度回调。导出 `searchMove`、`mateInFromScore`、`scoreForWhite`、`MATE_SCORE`/`MATE_THRESHOLD`/`INFINITY`。 |
| `protocol.ts` | 主线程 ↔ worker 的**纯类型**契约：`EngineStartRequest`/`EnginePositionRequest`/`EngineGoRequest`/`EngineStopRequest`/`EngineQuitRequest`、`EngineReadyResponse`/`EngineBestMoveResponse`/`EngineInfoResponse`/`EngineErrorResponse`、`DifficultyPreset`、`moveToEnginePayload`。 |
| `workerFactory.ts` | 仅 16 行，但是**唯一实例化 worker 的地方**：`createBuiltinWorker()` 用 Vite 的 `?worker` 构造器（这样 Vite 才会产出 `.js` 资产而不是发出 `.ts`），`createExternalWorker(url, name)` 用 `new Worker(url, { type: 'module', name })`。 |
| `builtin.worker.ts` | worker 入口（无导出，副作用模块）：处理 `go`（解析 FEN → 难度 → 重复键 → 随机走子捷径 → `searchMove` → 回 `bestmove`），`start` 回 `ready`，`position`/`stop`/`quit` 均为空操作。异常回 `{type:'error'}`（不带 requestId）。 |

### 2.4 `src/store/`（详见 [ui-and-state.md](./ui-and-state.md)）

| 文件 | 作用 |
|---|---|
| `gameStore.ts` | 最大的 store（502 行），**不用 persist 中间件**，手写 `persist()`。持有可变 `Game` + `version` 计数器 + 脱敏字段（`fen`/`turn`/`over`/`moveCount`）+ 交互状态（`selected`/`legalMoves`/`promotion`/`orientation`）+ 模式与难度 + 引擎联动标志 + 完整的**时钟状态机**（5 个 action）。import 时执行 `syncView()` 并挂 `globalThis.__chess960.game`。 |
| `settingsStore.ts` | 唯一用 zustand `persist` 的 store（键 `chess960:settings`，version 1，自定义 `merge` → `normalizeSettings` 逐字段校验）。13 个偏好字段 + 9 个 action。注意其中有若干字段当前无消费者（见 [ui-and-state.md](./ui-and-state.md#8-已知冗余与不一致清理清单)）。 |
| `engineStore.ts` | 引擎状态（`engine`/`name`/`ready`/`thinking`/`error`/`hint`/`hintBusy`/`movesPlayed`）+ 模块级 `Engine` 单例（`getEngine()` / `disposeEngine()`）。回调经 `queueMicrotask` 延后写 store。import 时挂 `globalThis.__chess960.engine`。 |
| `dialogStore.ts` | 22 行：`{ newGame, settings, pgn }` + `open`/`close`/`closeAll`（后者无调用方）。 |

### 2.5 `src/hooks/`

| 文件 | 作用 |
|---|---|
| `useAiPlayer.ts` | 惰性初始化引擎、AI 回合 effect（依赖 9 项、`pendingFen` 去重、陈旧结果丢弃、直接 `game.play` 落子、收尾同步与持久化、把含 `'stopped'` 的错误视为取消）；另导出 `requestHint()`（固定 `'hard'` 难度）与 `AiStatus` 类型。 |
| `useClock.ts` | `useClock(enabled, onFlag)`：`onFlag` 存 ref（effect 只依赖 `enabled`）、250 ms interval 调 `tickClock()`、监听 `visibilitychange` 暂停/恢复、卸载时清理；`formatClock(ms)` 输出 `m:ss` / `h:mm:ss`。 |

### 2.6 `src/components/`

见 [ui-and-state.md](./ui-and-state.md#1-界面结构) 的组件清单表（含每个组件的 props、data-testid 与交互细节）。

### 2.7 `src/i18n/` —— 界面多语言（详见 [ui-and-state.md](./ui-and-state.md)）

| 文件 | 作用 |
|---|---|
| `types.ts` | `Language`（`'zh' \| 'en'`）、`LANGUAGES`、`DEFAULT_LANGUAGE`（`'zh'`）、`normalizeLanguage()`。**零依赖叶子模块**——store 与 messages 都从它取类型，所以不会产生循环引用。 |
| `messages.ts` | `zh`（as const，键集合的唯一真相）与 `en`（类型为 `Record<MessageKey, string>`，因此漏译/拼错键会**编译报错**）、`CATALOGS`，以及 `MessageDescriptor` 类型。 |
| `translate.ts` | 纯函数：`translate(lang, key, params)`（`{name}` 插值）、`formatMessage(lang, descriptor)`、`asMessage(key, params)`，以及 `colorKey` / `pieceKey` / `difficultyLabelKey` / `difficultyDescriptionKey` / `promotionRoleKey` 这些把领域值映射成键的助手。 |
| `useI18n.ts` | 唯一的 React 接入点：订阅 `settingsStore.language`，返回 `{ language, setLanguage, t, format, colorName }`；另有非 React 的 `tNow()` / `currentLanguage()`。 |
| `index.ts` | 统一出口，应用代码只 `import { useI18n } from '../../i18n'`。 |

### 2.8 样式与工具

| 文件 | 作用 |
|---|---|
| `styles/index.css` | 全部样式（768 行，纯 CSS）。21 个 CSS 自定义属性、4 套主题（靠 `data-theme` 属性选择器）、2 种棋子风格（`data-pieces`）、响应式断点 900px、`prefers-reduced-motion` 支持。 |
| `utils/storage.ts` | **零项目依赖**的底层工具：安全的 localStorage JSON 读写、棋局快照读写清、剪贴板（含 `execCommand` 回退）、文件下载。 |

---

## 3. `tests/` —— 测试（7 个文件，详见 [testing.md](./testing.md)）

```
tests/
├── unit/                               Vitest（Node 环境，156 个用例）
│   ├── generate.test.ts       194 行   15 个用例：960 布局、双射、暴力交叉验证
│   ├── castling.test.ts       584 行   53 个用例：★ 易位矩阵 + 过路兵 + 记账
│   ├── notation.test.ts       509 行   40 个用例：SAN / UCI / PGN
│   ├── game.test.ts           518 行   32 个用例：Game 门面、终局、快照
│   └── i18n.test.ts           148 行   16 个用例：两套文案表对齐、插值、描述符
└── e2e/                                Playwright（真实 Chromium，生产构建）
    ├── chess960.spec.ts       345 行   15 个验收流程（桌面 + 手机各跑一次）
    └── inspect-ai.spec.ts      92 行   1 个诊断探针（只有 1 个断言）
```

`tests/` 里**只有这 7 个文件**。Vitest 的 `include` 只匹配 `tests/unit/**`（以及 `src/**` 下的测试），所以 `tests/e2e` 永远不会被 `pnpm test` 收集。

---

## 4. `public/` —— 静态资产

```
public/
└── engines/
    └── README.md               44 行   可选 Stockfish 的放置说明 + GPL 许可提醒
```

Vite 会把 `public/` 的内容**原样复制**到 `dist/` 根下。目录里**故意只有说明文件**：应用启动时会探测 `./engines/stockfish/stockfish.js`，缺失就静默回退到内置引擎，因此默认检出开箱即用且保持 MIT 干净。

---

## 5. `scripts/`

| 文件 | 作用 |
|---|---|
| `bundle.mjs` | 44 行的 esbuild 小驱动：因为本地的 pnpm store 没有暴露 esbuild CLI shim，所以直接用 JS API 打包 TypeScript 入口，用于快速做独立探针。用法 `node scripts/bundle.mjs <entry.ts> <out.mjs>`。它会扫 `node_modules/.pnpm` 找 `esbuild@*` 并 `require.resolve` 定位 `lib/main.js`。**不属于构建流程**（`pnpm build` 不使用它），是留给开发者的调试工具。 |

---

## 6. `dist/` —— 构建产物（已被 `.gitignore` 忽略）

实测 `pnpm build` 的产物：

```
dist/
├── index.html                              1.16 kB   (gzip 0.79 kB)
├── assets/
│   ├── index-DtSNK49t.js                 311.32 kB   (gzip 97.29 kB)   主包
│   ├── index-DtSNK49t.js.map            1,405.20 kB                     sourcemap
│   ├── index-C2ybFMtL.css                 10.20 kB   (gzip  2.81 kB)   样式
│   └── builtin.worker-Cf16DDs4.js         22.48 kB                     引擎 worker（独立 chunk）
└── engines/
    └── README.md                                                       从 public/ 复制
```

文件名中的哈希是内容哈希（可长期缓存）。去掉 `sourcemap` 只需把 `vite.config.ts` 里的 `build.sourcemap` 改为 `false`。

---

## 7. `node_modules/`

pnpm 的依赖树（`node_modules/.pnpm/` 下按 `包名@版本` 平铺）。已被 `.gitignore` 忽略，不需要了解内容。唯一的实践影响是 `scripts/bundle.mjs` 需要从中定位 esbuild。

---

## 8. 一张"我该改哪个文件"的对照表

| 我想…… | 改这里 |
|---|---|
| 修棋规 / 易位判定 | `src/core/position.ts`（慎改——`tests/unit/castling.test.ts` 覆盖得很密） |
| 改胜负与和棋判定顺序 | `src/core/rules.ts` |
| 改 SAN / PGN 格式 | `src/core/notation.ts` |
| 改起始布局生成 / Scharnagl 编号 | `src/core/chess960/generate.ts` |
| 让 AI 更强 / 更快 | `src/core/engine/search.ts`（搜索）、`evaluate.ts`（评估） |
| 改难度档位数值 | `src/core/engine/difficulty.ts` |
| 改引擎选择 / 超时 / 探测 | `src/core/engine/ai.ts` |
| 改 worker 消息格式 | `src/core/engine/protocol.ts` + 两端（`ai.ts`、`builtin.worker.ts`） |
| 改走子交互（点击/拖拽） | `src/components/Board/Board.tsx` |
| 改走子规则之外的对局逻辑（撤销步数、门禁） | `src/store/gameStore.ts` |
| 改时钟行为 | `gameStore` 的时钟 action + `src/hooks/useClock.ts` |
| 改 AI 回合时序 | `src/hooks/useAiPlayer.ts` |
| 加设置项 | `src/store/settingsStore.ts`（字段 + `normalizeSettings` + 默认值）+ `SettingsPanel.tsx` |
| 改配色 / 主题 | `src/styles/index.css` 的 `:root` 变量与 `[data-theme='*']` 块 |
| **加一条界面文案 / 加一门语言** | `src/i18n/messages.ts`（两套表同时加，`en` 漏了会编译报错） |
| 改界面语言的默认值 | `src/i18n/types.ts` 的 `DEFAULT_LANGUAGE` |
| 加新弹窗 | `src/components/Controls/Modal.tsx` 起手 + `dialogStore` 加字段 |
| 改部署配置 / 缓存头 | `vercel.json` / `netlify.toml`（两处保持一致） |
| 改构建输出 / 别名 / 测试环境 | `vite.config.ts` |
| 加严 / 放松类型检查 | `tsconfig.app.json` |

---

**相关文档**：[整体架构](./architecture.md) · [技术栈](./tech-stack.md) · [规则引擎](./rules-engine.md) · [AI 引擎](./engine.md) · [UI 与状态](./ui-and-state.md) · [开发指南](./development.md) · [测试策略](./testing.md) · [构建与部署](./deployment.md)
