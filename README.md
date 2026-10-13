# Chess960 (Fischer Random) — 浏览器对弈

浏览器里一副完整的 Chess960 棋盘：全部 **960 种合法起始布局**、完整的 Chess960 王车易位规则、本地双人对局，以及完全在客户端运行的"人机对战"模式。**没有服务端、没有账号、没有构建期服务**——构建产物就是一堆静态文件。

界面**中英双语，默认中文**（设置 → 界面 → 语言 可切换）。

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

> 📚 **详细文档在 [docs/](./docs/README.md)**：[技术栈](./docs/tech-stack.md) · [整体架构](./docs/architecture.md) · [目录与文件说明](./docs/project-structure.md) · [规则引擎](./docs/rules-engine.md) · [AI 引擎](./docs/engine.md) · [UI 与状态](./docs/ui-and-state.md) · [开发指南](./docs/development.md) · [测试策略](./docs/testing.md) · [构建与部署](./docs/deployment.md)

---

## 目录

- [功能](#功能)
- [快速开始](#快速开始)
- [技术栈](#技术栈)
- [整体架构](#整体架构)
- [目录结构](#目录结构)
- [规则引擎](#规则引擎)
- [Chess960 王车易位](#chess960-王车易位)
- [AI 引擎](#ai-引擎)
- [持久化、FEN 与 PGN](#持久化fen-与-pgn)
- [测试](#测试)
- [部署](#部署)
- [已知问题](#已知问题)
- [许可](#许可)

---

## 功能

**规则** —— 随机 Chess960 布局及其 Scharnagl 编号（0–959）；可从编号、底线布局或 FEN 开局；完整合法性判定；将军 / 将死 / 逼和；升变、吃过路兵、三次与五次重复、50 步与 75 步规则、子力不足；SAN 记谱与带 `Variant: Chess960` 头的 PGN 导出。

**对弈** —— 本地双人与人机两种模式；**点击走子**与**拖拽走子**都支持；合法着法提示；上一步与将军高亮；升变弹窗（也可用 <kbd>Q</kbd>/<kbd>R</kbd>/<kbd>B</kbd>/<kbd>N</kbd>）；撤销（人机模式下退两步，让"又是你走"）；重开、认输、和棋、主张和棋（50 步 / 三次重复）；翻转棋盘；复制 FEN；导出 PGN。

**引擎** —— 把 Stockfish WASM 放进 `public/engines/stockfish/` 就用它，否则用内置的 alpha-beta 引擎；两者都跑在 Web Worker 里，所以思考时棋盘不会卡住。四档难度（简单 / 中等 / 困难 / 大师）、引擎提示、评估值读出。

**其它** —— 对局能扛住刷新（localStorage）；可选带加秒的时钟；四种棋盘主题；无障碍语义（ARIA 标签、键盘快捷键、`prefers-reduced-motion` 支持）；从手机到桌面的自适应布局。

**多语言** —— 界面中英双语，**默认中文**，在设置里即时切换、无需刷新，选择会持久化。状态栏里已经显示的消息也会跟着切换语言；`<html lang>` 与页面标题同步更新。整套 i18n 是自研的约 560 行代码，**没有引入任何 i18n 库**。

## 快速开始

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 带 HMR 的开发服务器，<http://localhost:5173> |
| `pnpm build` | 类型检查并构建静态站点到 `dist/` |
| `pnpm preview` | 伺服构建产物，<http://localhost:4173> |
| `pnpm test` | 单元测试（Vitest，纯 Node 环境） |
| `pnpm test:watch` | 单元测试 watch 模式 |
| `pnpm typecheck` | 只跑 `tsc -b` |
| `pnpm test:e2e:install` | 下载 Playwright 的 Chromium（只需一次） |
| `pnpm test:e2e` | 端到端测试，跑的是生产构建（需先 `pnpm build`） |

需要 **Node 20+** 与 **pnpm 9+**（`npm install -g pnpm`；用 `npm`/`yarn` 也可以，只是锁文件不同）。

### 键盘快捷键

<kbd>U</kbd> 撤销 · <kbd>F</kbd> 翻转 · <kbd>C</kbd> 复制 FEN · <kbd>H</kbd> 提示 · <kbd>N</kbd> 新对局 ·
<kbd>Esc</kbd> 取消拖拽 / 取消选择 / 关闭弹窗；升变弹窗打开时 <kbd>Q</kbd>/<kbd>R</kbd>/<kbd>B</kbd>/<kbd>N</kbd> 直接选子。

### 界面语言

**默认中文**。切换路径：**设置 → 界面 → 语言**（`中文` / `English`），即时生效、无需刷新，选择会被记住。切换时 `<html lang>`、页面标题、以及**状态栏里已经显示的消息**都会一起变。

## 技术栈

| 类别 | 选择 | 说明 |
|---|---|---|
| 语言 | **TypeScript 5.7** | 严格模式全开（含 `noUncheckedIndexedAccess`、`verbatimModuleSyntax`）；`tsc` 只做类型检查，转译交给 esbuild |
| UI | **React 19** | JSX 自动运行时；无路由（单视图 + 弹窗） |
| 状态 | **Zustand 5** | 四个 store：game / settings / engine / dialog |
| 构建 | **Vite 6** | `base: './'` 相对路径资源、ES module worker、`target: es2022` |
| 单元测试 | **Vitest 3** | 纯 Node 环境，156 个用例约 1.2 s |
| E2E | **Playwright 1.51** | 真实 Chromium，桌面 + 手机双 project，跑生产构建 |
| 样式 | **纯 CSS** | 单文件 768 行，主题靠 CSS 自定义属性 + `data-theme` 属性 |
| 多语言 | **自研轻量 i18n** | 中英双语、默认中文；`src/i18n/` 约 560 行，无 i18n 库依赖 |
| 棋规 / AI | **完全自研** | 无 `chess.js`/`chessops`/`chessground`，无打包的引擎文件 |

**运行时依赖只有 3 个：`react`、`react-dom`、`zustand`。**

不用 GPL 棋类库是刻意决定：这样整个仓库可以保持 MIT 许可。Stockfish 也没有打包——只留一个可选挂载点，缺失时静默回退，所以克隆下来开箱即用。

👉 完整的选型理由、每个依赖的版本、以及有意不做的事：[docs/tech-stack.md](./docs/tech-stack.md)

## 整体架构

```
components/ + App.tsx     React 视图（展示 + 事件上报）
hooks/                    useAiPlayer（AI 回合）· useClock（时钟）
store/                    zustand：game · settings · engine · dialog
core/                     ★ 纯规则层：零 React、零 DOM
   Board → Position → Game
   rules · notation · history · chess960/generate
   engine/  search · evaluate · ai · protocol · workerFactory · builtin.worker

i18n/  ── 横切：中/英双语，默认中文
   types · messages · translate   零依赖叶子，谁都能引用
   useI18n                        唯一接触 store 的文件
```

**依赖只能自上而下**——`core/` 从不反向 import store 或组件。这条约束是整个架构的支点：因为规则层不碰 DOM，它能在纯 Node 下被测试，这正是"棋规正确性"这种高风险代码能被穷尽验证的前提。

i18n 刻意做成横切：`translate()` 是无状态纯函数，但"当前语言"来自用户偏好，所以把零依赖的叶子（类型 / 文案 / 纯函数）与接触 store 的接入点（`useI18n`）拆开——这样横切不会引入循环依赖。另一个关键约定是**状态里存 `MessageDescriptor`（`{ key, params }`）而不是渲染好的字符串**，否则切换语言时，切换之前就已经显示的消息会卡在旧语言。

一次走子的数据流（简化）：

```
指针事件 → Board → App.handleMove → gameStore.tryMove → Game.play → Position
                                          │
                        syncView()（bump version）→ resetClockForNextMove() → persist()
                                          ↓
                        订阅了 version 或脱敏字段的组件重渲染
```

AI 走子走的是另一条路：`useAiPlayer` 的 effect → `Engine.go` → Web Worker → `bestmove` → 陈旧性检查 → `game.play` → 同样的收尾流程。

👉 完整的分层说明、两条数据流的逐步时序、四个 store、worker 边界、关键设计取舍：[docs/architecture.md](./docs/architecture.md)

## 目录结构

```
chess960/
├── index.html              Vite HTML 入口（只有 #root）
├── package.json            依赖与脚本
├── vite.config.ts          Vite + Vitest 配置（内嵌）
├── playwright.config.ts    E2E 配置（桌面 + 手机）
├── tsconfig.{json,app,node}.json   严格模式的 TS project references
├── vercel.json / netlify.toml      两套部署配置（含缓存头）
├── LICENSE                 MIT + Stockfish 第三方声明
│
├── src/                    37 个文件，约 228 KB
│   ├── main.tsx            React 挂载入口
│   ├── App.tsx             应用外壳与编排
│   ├── core/               纯规则层（16 个文件）
│   │   ├── types.ts squares.ts board.ts
│   │   ├── position.ts     ★ 977 行，合法性的唯一真相来源
│   │   ├── rules.ts history.ts notation.ts game.ts
│   │   ├── chess960/generate.ts     0–959 Scharnagl 编号生成
│   │   └── engine/         AI：ai · difficulty · evaluate · search · protocol · workerFactory · builtin.worker
│   ├── store/              gameStore · settingsStore · engineStore · dialogStore
│   ├── i18n/               界面多语言：types · messages · translate · useI18n
│   ├── hooks/              useAiPlayer · useClock
│   ├── components/         Board/ · Controls/ · MoveList/ · Status/
│   ├── styles/index.css    全部样式 + 主题变量
│   └── utils/storage.ts    localStorage / 剪贴板 / 下载
│
├── tests/
│   ├── unit/               5 个文件 / 156 个用例（Vitest，纯 Node）
│   └── e2e/                2 个文件 / 16 个用例 × 2 project = 32 次运行（Playwright）
├── public/engines/         放入 Stockfish 的地方（默认只有说明文件）
├── scripts/bundle.mjs      esbuild 探针工具（不参与构建）
└── docs/                   ★ 详细文档（见下方索引）
```

👉 **逐文件说明（每个文件的行数与作用）+ "我该改哪个文件"对照表**：[docs/project-structure.md](./docs/project-structure.md)

## 规则引擎

国际象棋规则是这类项目里最容易出错的部分，所以规则代码**从零写起**（不用 GPL 库），并且靠测试而不是靠信任来保证正确。

- **格子**是 `0..63` 整数（`file + 8 * rank`），所以走子与攻击判定都是朴素的整数算术。
- **棋子**打包进一个 `Uint8Array`（`color * 8 + role`），让克隆一个局面非常便宜——搜索要克隆成千上万个。
- **`Position`**（`src/core/position.ts`）持有棋盘、易位栅格、过路兵格与回合数，是**唯一**知道国际象棋怎么下的地方。`legalMoves` 的做法是逐个试走伪合法着法，再问走子方的王是否被攻击。
- **`Game`**（`src/core/game.ts`）在其上加入历史：SAN、重复局面键、撤销、认输与状态。撤销从**存储的局面快照**重建，所以无论调用多少次、中间穿插了什么合法性探测，都精确无误。
- **FEN 是交换格式。** 内部序列化用的是 **Shredder-FEN** 易位字段（`AHah` 表示 a1 与 h1 上的车），因为 `KQkq` 无法描述 Chess960 布局；当易位权允许时，`toFenWithStandardCastling()` 会输出经典拼写。

### Chess960 王车易位

易位是与标准象棋差别最大、也最容易被写错的部分。实现遵循 FIDE 的 Chess960 规则：

1. 王与所引用的车都必须站在原始格上，且易位权未丧失。
2. 王不能处于被将状态。
3. 王与车之间的每一格都必须为空。
4. 王不能穿过或落在被攻击的格子上——**但车可以**（只有王的路径重要），并且王可以穿过车正在离开的那一格。
5. 王与车的目标格只能由参与易位的棋子本身占据。这一条同时覆盖了"王已经在 g1"（只有车动）与"车落在王的起始格上"（王 b1 → g1、车 h1 → f1，两者交叉而过）两种情况。
6. 目标格永远是 g1/f1（O-O）与 c1/d1（O-O-O），与棋子起始位置无关。

易位权在王移动、车离开原始格、或**车在原始格上被吃**时丧失。`tests/unit/castling.test.ts` 用 53 个用例把这些逐条钉死，包括"王在 f1 长易位"、"王在 b1 短易位"、"车穿过被攻击格"与"车在原始格上被吃"。

排查"这步易位为什么不合法"时，控制台里设 `__castlingDebug = true`，`castlingMove()` 会打印**具体是哪一条规则拒绝了它**。

👉 攻击判定、七条易位判定链、FEN/SAN/PGN/UCI 双向转换、Scharnagl 生成算法：[docs/rules-engine.md](./docs/rules-engine.md)

## AI 引擎

难度档位对两套引擎同时生效（参数集中在 `src/core/engine/difficulty.ts`）：

| 等级 | 内置引擎 depth | 内置随机走子 | 内置评分噪声 | Stockfish `Skill` | movetime |
|---|---|---|---|---|---|
| 简单 | 1 | **35 %** | ±90 cp | 0 | 150 ms |
| 中等 | 3 | 8 % | ±30 cp | 6 | 400 ms |
| 困难 | 4 | 0 | ±8 cp | 12 | 1000 ms |
| 大师 | 6 | 0 | 0 | 20 | 3000 ms |

### 内置引擎

`src/core/engine/search.ts` 是一个紧凑的 negamax 搜索：迭代加深、alpha-beta、MVV-LVA 着法排序、吃子静态搜索、置换表、重复局面检测、将杀评分，配合"子力 + 棋子-格子表"的静态评估。它刻意做成零依赖，所以 AI 通路能在纯 Node 里测试，且没有 WASM 时应用也有对手。更深的档位在 Worker 里也远低于一秒。

### 加入 Stockfish（可选）

Stockfish **没有**随仓库提供，以保持仓库精简且许可干净。要用它：

1. 挑一个浏览器构建——例如 [`stockfish.js`](https://www.npmjs.com/package/stockfish.js)、官方的 [Stockfish WASM 构建](https://github.com/niklasf/stockfish.wasm) 或 [lichess-org/stockfish.wasm](https://github.com/lichess-org/stockfish.wasm)。
2. 把**单线程**构建复制到 `public/engines/stockfish/`，使 `public/engines/stockfish/stockfish.js` 存在（以及它附带的 `.wasm` 与 worker 包装文件）。
3. 刷新。状态栏会从 "Built-in engine" 变成 "Stockfish (WASM)"；没有其他开关。

应用启动时会探测该文件，**缺失时静默回退**到内置引擎，所以全新克隆永远可玩。两套引擎都通过同一个 `Engine` 门面（`src/core/engine/ai.ts`）驱动，都跑在 Worker 里——UI 只交换消息，这就是棋盘在引擎思考时依然可交互的原因。

UCI 层会设置 `UCI_Chess960 true`、发送 `position fen …` / `go movetime … depth …`、通过 `Skill Level` 表达难度，并在两种走子编码之间翻译：Stockfish 把 Chess960 易位报成"王吃自己的车"（`e1h1`），而 `Position.resolveMove` 直接接受这种写法，与 `e1g1` 和显式 `castle` 侧并列。

> ⚠️ **注意**：门面目前只识别 **JSON 形状**的 `bestmove` 响应（`{ type: 'bestmove', requestId, ... }`），而普通 `stockfish.js` 发出的是纯 UCI 文本行。仓库里没有适配层，因此**放入原版 Stockfish 后搜索会超时**，实际运行的仍是内置引擎。细节与修法见 [docs/engine.md](./docs/engine.md) 的「Stockfish 路径的已知缺口」一节。

> **多线程构建**：它们需要 `SharedArrayBuffer`，因此需要这两个响应头：`Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`。`vite.config.ts`、`netlify.toml` 与 `vercel.json` 里都写好但被注释掉了；只在用这种构建时才启用（并三处保持一致）。单线程构建什么都不需要。

## 持久化、FEN 与 PGN

- 对局快照（起始 FEN、易位栅格与走子列表）在每步之后写入 `localStorage`，所以刷新会继续同一盘棋。设置也会持久化。
- **复制 FEN** 把当前局面放进剪贴板（Shredder 易位字段）。
- **导出 PGN** 下载带 `Variant`/`SetUp`/`FEN` 头、外加 `Chess960Index` 与 `Chess960BackRank` 的 PGN，因此确切的起始布局可以还原；**显示 PGN** 就地查看。
- **新对局 → 自定义 FEN** 接受任何合法 FEN，包括只给了部分易位字段的。

localStorage 键：`chess960:game`（进行中的对局）与 `chess960:settings`（偏好 + 界面语言）。设置封套的 `version` 已升到 2，专门用于把老版本里那个"没人能改的 `language: 'en'`"迁移成新的中文默认值。

## 测试

```bash
pnpm test         # 单元测试：5 个文件 / 156 个用例（纯 Node，约 1.2 s）
pnpm build        # E2E 的前置条件
pnpm test:e2e     # E2E：16 个用例 × 2 个 project = 32 次运行（约 22 s）
```

`pnpm test:e2e` 需要已构建的站点（它伺服 `dist/`），浏览器只需安装一次（`pnpm test:e2e:install`）。

单元测试覆盖出错代价最高的部分：

- **`generate.test.ts`** —— 0–959 恰好 960 个互不相同的布局；生成结果等于一份**独立暴力枚举**的全部合法底线；每个布局的象在异色格且王在两车之间；`编号 → 布局 → 编号` 对全部 960 个往返成立；公开的 Scharnagl 锚点（0 = `bbqnnrkr`、518 = `rnbqkbnr`、959 = `rkrnnqbb`）；FEN 往返。
- **`castling.test.ts`** —— 完整的易位矩阵（标准与 Chess960）、王与车的被攻击格规则、占位规则、权利丧失（王移动、车移动、车被吃）、Shredder-FEN 解析与序列化、吃过路兵（含钉住的情形）、升变、将/将死/逼和、子力不足、撤销保真度。
- **`notation.test.ts`**、**`game.test.ts`** —— SAN 生成与解析（含 `Bxc6` 与 `bxc6` 的歧义）、易位记谱、Chess960 易位的 UCI 转换、PGN 构建/解析往返，以及完整的对局生命周期：撤销、认输、和棋、重复与快照。
- **`i18n.test.ts`** —— 中英两张文案表的键集合与占位符必须一致、每个值非空、两表必须真的有差异（只允许 5 个键相同）、默认语言是中文且非法值回落到中文、插值语义与未知占位符、领域键助手是全函数、描述符的渲染与空值语义。

E2E 在真实 Chromium 里跑生产构建（桌面与手机视口），走一遍验收流程：加载时随机布局、本地对弈、易位、撤销、认输、升变、FEN/PGN 分享、指定 Chess960 编号开局、引擎应答、提示、移动端布局，以及**语言的默认值与中英切换**（含"切换后已显示的消息也跟着变"）。

👉 逐文件覆盖内容、E2E 用例清单、以及**诚实的覆盖缺口清单**：[docs/testing.md](./docs/testing.md)

## 部署

`pnpm build` 产出静态的 `dist/`，使用**相对**资源 URL（`base: './'`），所以放在任何路径下都能工作——包括 GitHub Pages 的 project site。

| 托管方 | 配置 |
|---|---|
| **Vercel** | 导入仓库即可；框架预设会识别 Vite。仓库自带的 `vercel.json` 设置了构建命令、输出目录与长期资源缓存。 |
| **Netlify** | `netlify.toml` 设置了 `pnpm build`、发布 `dist/`，并缓存带哈希的资源。 |
| **GitHub Pages** | 用 action 推送 `dist/`，或 `pnpm build && npx gh-pages -d dist`。相对 URL 意味着**不需要**改 `base`。 |
| **任意静态主机** | 上传 `dist/`。将来若加了前端路由，需要把未知路径回退到 `index.html`。 |

把 `assets/*` 激进缓存（文件名带内容哈希）、让 `index.html` 短缓存——仓库里附带的两份配置就是这么做的。只有用多线程 Stockfish 构建时才需要启用 COOP/COEP 头。

👉 实测构建产物体积、缓存策略、发布前检查清单：[docs/deployment.md](./docs/deployment.md)

## 已知问题

这些是读代码得到的结论（不是猜测），集中在 [docs/README.md](./docs/README.md#文档里记录的已知问题) 里并附了详情链接。最值得关注的三条：

1. **Stockfish 响应适配层缺失**——`ai.ts` 只认 JSON 形状的 `bestmove`，原版 Stockfish 的 UCI 文本流会让搜索超时；因此当前实际永远跑内置引擎。
2. **`src/core/engine/` 7 个文件完全没有单元测试**——而它们都是纯函数，是最容易补测的部分。
3. **`inspect-ai.spec.ts` 是诊断探针**（只有 1 个断言，引擎坏了也会通过），但没有被 skip，会给 CI 增加 2 次无实质断言的运行。

> 做多语言时顺手修掉了 **3 个既有的 E2E 失败**（撤销用例断言错了走子方、升变用例误用了会等待落子的助手、引擎用例依赖了会被拼成 `"1.e4b5"` 的 DOM 文本）。这套 E2E 此前从未完整跑过，现在 32 次运行全绿。

## 许可

**本项目使用 MIT 许可**（见 [`LICENSE`](./LICENSE)）。两个刻意的选择让它保持如此：

- **不使用 GPL 棋类库。** 规则代码是本仓库原创的，因此没有 chessops/chessground 的 GPL 义务。这是一个取舍——那些库很优秀——做出它是为了让项目可以被自由使用和重新许可。
- **不打包 Stockfish。** Stockfish 是 **GPL-3.0-or-later**。如果你把 Stockfish 构建放进 `public/engines/`，你就在随你的站点分发 GPL 软件：请公开该构建对应的源码与许可（引擎自己的仓库通常是答案），并在你自己的致谢里注明。这个挂载点刻意做成 opt-in，好让默认检出保持 MIT 干净。如果你需要宽松许可的引擎，保留内置引擎，或接入你有权使用的引擎。

棋子字形是 Unicode 国际象棋字符（♔♕♖♗♘♙ / ♚♛♜♝♞♟），由系统字体渲染——**没有再分发任何字体文件**。

---

## 文档

| 文档 | 内容 |
|---|---|
| [docs/tech-stack.md](./docs/tech-stack.md) | 技术栈全表与选型理由 |
| [docs/architecture.md](./docs/architecture.md) | 分层、数据流、状态管理、设计取舍 |
| [docs/project-structure.md](./docs/project-structure.md) | **逐目录逐文件说明** + "我该改哪个文件" |
| [docs/rules-engine.md](./docs/rules-engine.md) | 规则引擎与 Chess960 易位 |
| [docs/engine.md](./docs/engine.md) | AI 引擎、难度、worker 协议 |
| [docs/ui-and-state.md](./docs/ui-and-state.md) | 组件、交互、快捷键、四个 store、**多语言实现**、主题 |
| [docs/development.md](./docs/development.md) | 开发流程、代码约定、**加文案 / 加语言**、调试钩子、踩坑清单 |
| [docs/testing.md](./docs/testing.md) | 测试策略与覆盖边界 |
| [docs/deployment.md](./docs/deployment.md) | 构建与部署 |

---

## 当前验证状态

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 无错误 |
| `pnpm test` | ✅ 5 个文件 / **156 个用例**全通过（约 1.2 s） |
| `pnpm build` | ✅ 66 个模块 → 主包 311.32 kB（gzip 97.29 kB）+ worker 22.48 kB + CSS 10.20 kB，2.08 s |
| `pnpm test:e2e` | ✅ **32 次运行全通过**（约 22 s，桌面 + 手机两个 project） |
