# 技术栈

> 一句话总结：**TypeScript 5.7 + React 19 + Zustand 5，由 Vite 6 构建，Vitest/Playwright 保障质量，纯静态部署，零后端、零棋类第三方库。**

本项目刻意把依赖压到最小：运行时的 `dependencies` 只有 **3 个包**。所有棋规、SAN/PGN、AI 搜索都是仓库内自己实现的。

---

## 1. 运行时依赖（`dependencies`）

| 包 | 声明版本 | 用途 |
|---|---|---|
| `react` | `^19.1.0` | UI 视图层 |
| `react-dom` | `^19.1.0` | DOM 渲染 |
| `zustand` | `^5.0.3` | 全局状态管理（game / settings / engine / dialog 四个 store） |

**这就是全部。** 没有路由库、没有 UI 组件库、没有 CSS 框架、没有 `chess.js` / `chessops` / `chessground` 之类的棋类库。

## 2. 开发依赖（`devDependencies`）

| 包 | 声明版本 | 用途 |
|---|---|---|
| `typescript` | `^5.7.3` | 类型检查（`tsc -b`，`noEmit`） |
| `vite` | `^6.2.0` | 开发服务器 + 生产构建 |
| `@vitejs/plugin-react` | `^4.3.4` | React JSX 转换与 Fast Refresh |
| `vitest` | `^3.0.7` | 单元测试运行器 |
| `jsdom` | `^26.0.0` | 已安装但**当前未被使用**：`vite.config.ts` 里测试环境是 `node`，没有任何测试文件声明 `@vitest-environment jsdom`。保留它是为了将来写 DOM 层测试。 |
| `@playwright/test` | `^1.51.0` | 端到端测试（真实 Chromium） |
| `@types/node` | `^22.13.0` | Node 类型（配置文件、脚本用） |
| `@types/react` / `@types/react-dom` | `^19.0.10` / `^19.0.4` | React 类型 |

**本机实测版本**（`node_modules` 中实际解析到的）：Node `20.20.0`、pnpm `10.24.0`、Vite `6.4.4`、Vitest `3.2.7`、esbuild `0.25.12`、zustand `5.0.15`、jsdom `26.1.0`。

## 3. 技术选型与理由

### 3.1 TypeScript（严格模式，只做类型检查不产出）

- 目标 `ES2022`，模块 `ESNext`，`moduleResolution: bundler`。
- 编译产物由 Vite/esbuild 负责，`tsc` 只做类型检查（`noEmit: true` + `composite: true` 做增量）。
- 打开的高价值开关：
  - `strict`、`noUncheckedIndexedAccess`（数组/索引访问强制判空，棋盘代码里非常关键）
  - `verbatimModuleSyntax` + `isolatedModules`（保证每个文件都能被单独转译，符合 esbuild 的假设）
  - `noUnusedLocals` / `noUnusedParameters` / `noImplicitOverride` / `noFallthroughCasesInSwitch`
- 项目被拆成两个 TS project：`tsconfig.app.json`（`src`，DOM 环境）和 `tsconfig.node.json`（配置文件、Node 环境），由根 `tsconfig.json` 用 project references 汇总。

### 3.2 React 19（无路由，单页单视图）

- 使用 `react-jsx` 自动运行时，组件文件里**不写** `import React`。
- 没有引入 react-router：应用只有一个界面，所有"页面切换"（新对局、设置、PGN、升变）都用弹窗（`Modal`）表达。
- 大量使用原始 DOM 事件（`onPointerDown` / `onPointerMove` / `onPointerUp`）来实现拖拽走子，而不是引入 dnd 库。

### 3.3 Zustand 5（状态管理）

- 选它的理由：无 Provider 包裹、无 reducer 样板、可在 React 之外（`getState()`）直接读写——这对"AI 走子""时钟"这类非组件逻辑非常方便。
- 四个 store 按职责切分（详见 [architecture.md](./architecture.md) 与 [ui-and-state.md](./ui-and-state.md)）：
  - `gameStore` —— 棋局与棋盘交互（最大的一个）
  - `settingsStore` —— 主题、棋盘翻转、音效、难度、时钟等偏好
  - `engineStore` —— 引擎状态、思考中标志、评估值、提示
  - `dialogStore` —— 弹窗开关与参数
- 只持久化需要的东西到 `localStorage`，不做整树 `persist` 序列化（棋局快照由 `utils/storage.ts` 显式写入）。

### 3.4 Vite 6（构建工具）

- `base: './'` —— **相对路径资源**，使 `dist/` 可以部署在任意子路径（GitHub Pages project site、S3 前缀等）。
- `build.target: 'es2022'`，`sourcemap: true`。
- `worker.format: 'es'` —— 引擎 Worker 以 ES module 形式打包（`builtin.worker.ts` 会被 Vite 切成独立 chunk）。
- 开发服务器固定 `port: 5173`。
- COOP/COEP 头**被注释掉**了：内置引擎与推荐的单线程 Stockfish 都不需要 `SharedArrayBuffer`；只有换成多线程 Stockfish 构建时才需要打开（并同步配置到托管平台）。

### 3.5 Vitest 3（单元测试）

- `environment: 'node'` —— 规则引擎不碰 DOM，因此测试跑在纯 Node 下，启动快（整个套件约 1.2 s）。
- `include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts']`，`testTimeout: 20000`。
- 配置直接写在 `vite.config.ts` 里（复用同一套别名/转译管线），没有单独的 `vitest.config.ts`。

### 3.6 Playwright（端到端测试）

- 跑的是**生产构建**（`vite preview`，端口 4173），而不是 dev server——这样连 worker、代码分割、相对路径都在测试范围内。
- 两个 project：`desktop-chromium`（Desktop Chrome）与 `mobile-chromium`（Pixel 7 视口）。
- 预先授予 `clipboard-read` / `clipboard-write` 权限，以便断言"复制 FEN"。
- CI 下：`retries: 1`、`workers: 1`、`forbidOnly`、额外输出 HTML 报告。
- `webServer` 用 `--host 127.0.0.1`，让就绪探针和 `baseURL` 落在同一地址上。

### 3.7 样式：一个纯 CSS 文件

- 只有 `src/styles/index.css`，**没有** Tailwind / CSS Modules / Sass / styled-components。
- 主题通过 **CSS 自定义属性（CSS variables）** 实现，切换主题只需改变量值（详见 [ui-and-state.md](./ui-and-state.md)）。
- 棋子用 Unicode 字符（♔♕♖♗♘♙ / ♚♛♜♝♞♟）配合系统字体渲染，因此**不附带任何字体文件**。

### 3.8 多语言：自研的轻量 i18n

- 支持 **中文 / English**，**默认中文**（`DEFAULT_LANGUAGE = 'zh'`）。
- **没有引入 i18n 库**（react-i18next、i18next、Lingui、FormatJS…），整套实现是 `src/i18n/` 下约 560 行自有代码：
  - 两级结构：`types.ts` / `messages.ts` / `translate.ts` 是**零依赖叶子**，`useI18n.ts` 是唯一的 React 接入点。这样拆分是为了打破"store 要 `Language` 类型、hook 要 store"的循环引用。
  - 中文表用 `as const` 作为键集合的唯一真相，英文表声明为 `Record<MessageKey, string>`，**漏译即编译错误**。
  - 插值用 `{name}` 占位符，`translate()` 在缺语言/缺键时逐级回落到中文。
- **状态里存的是 `MessageDescriptor`（`{ key, params }`）而不是渲染好的字符串**，所以切换语言时，切换之前就已经显示的消息也会跟着变。这是不用现成库时最容易踩空的一点（详见 [ui-and-state.md](./ui-and-state.md) 第 5 节）。
- 代价：两套文案表全部内联进主包，约 +14 kB 原始 / +5 kB gzip。换来零运行时依赖、零网络请求、零异步加载状态。
- 客户端双语（而非服务端按 `Accept-Language` 分流）是必然选择：这是个纯静态站点，没有服务端。

### 3.9 棋规与 AI：全部自研

- **不用 GPL 棋类库**是刻意决定：这样整个仓库可以保持 MIT 许可，不被 chessops/chessground 的 GPL 传染。规则代码从头实现，并用测试（而非信任）来保证正确性。
- **不打包 Stockfish**：Stockfish 是 GPL-3.0-or-later。仓库只留一个可选挂载点 `public/engines/stockfish/`，不放入引擎文件；缺失时自动回退到内置引擎，所以克隆下来开箱即用。
- 内置引擎是自研的 negamax 搜索（零依赖），跑在 Web Worker 里。

## 4. 技术栈边界（有意不做的事）

| 没做的事 | 原因 |
|---|---|
| 后端 / 数据库 / 账号 | 纯静态站点：无服务器、无登录、无网络请求 |
| 路由 | 单视图应用，弹窗即可表达所有次级界面 |
| CSS 框架 | 一个文件 + CSS 变量足够，且避免额外体积 |
| 棋类第三方库 | 保持 MIT 许可干净（见上） |
| 打包 Stockfish | 同上；改为可选挂载 + 静默回退 |
| 多语言 i18n 框架 | 只有中英两种语言、约 120 条文案；自有实现约 560 行即可覆盖，且能精确控制"存描述符"的行为。语言变多时再考虑换库。 |
| 服务端语言协商 | 纯静态站点，没有服务端；语言选择存在 localStorage，默认中文。 |

## 5. 环境要求

- **Node 20+**（`netlify.toml` 里同样固定 `NODE_VERSION = "20"`；本机实测 v20.20.0）
- **pnpm 9+**（本机实测 10.24.0）。理论上换 `npm` / `yarn` 也能装，只是锁文件不同；`package.json` 里配置了 `pnpm.onlyBuiltDependencies: ["esbuild"]`，允许 esbuild 执行安装脚本。
- 端到端测试额外需要下载一次 Chromium：`pnpm test:e2e:install`。

---

**相关文档**：[整体架构](./architecture.md) · [目录与文件说明](./project-structure.md) · [开发指南](./development.md) · [构建与部署](./deployment.md)
