# Chess960 Web —— 文档目录

这里是 [README](../README.md) 的展开版。README 给概览，本目录给细节。

按你的目的选一条路线：

| 我想…… | 读这个 |
|---|---|
| 快速跑起来、知道有哪些功能 | [../README.md](../README.md) |
| 知道用了哪些库、为什么这么选 | [tech-stack.md](./tech-stack.md) |
| 理解代码怎么组织、数据怎么流动 | [architecture.md](./architecture.md) |
| 知道**每个文件夹每个文件**是干什么的 | [project-structure.md](./project-structure.md) |
| 搞清楚棋规与 Chess960 易位怎么实现的 | [rules-engine.md](./rules-engine.md) |
| 搞清楚 AI 引擎怎么工作、怎么调 | [engine.md](./engine.md) |
| 改界面、加设置项、理解状态管理 | [ui-and-state.md](./ui-and-state.md) |
| 改界面文案 / 加一门语言 | [development.md](./development.md) §4.5 + [ui-and-state.md](./ui-and-state.md) §5 |
| 上手改代码、调试、避免踩坑 | [development.md](./development.md) |
| 知道测了什么、没测什么 | [testing.md](./testing.md) |
| 部署上线 | [deployment.md](./deployment.md) |

---

## 文档清单

| 文档 | 内容 |
|---|---|
| [tech-stack.md](./tech-stack.md) | 技术栈全表（运行时 3 个依赖 + 9 个开发依赖）、每一项的选型理由、有意不做的事、环境要求 |
| [architecture.md](./architecture.md) | 四层单向依赖、各层职责、**一次人类走子与一次 AI 走子的完整数据流**、四个 store、worker 边界、持久化边界、关键设计决策与取舍、架构不变量 |
| [project-structure.md](./project-structure.md) | 逐目录逐文件说明（含行数），`src/` 全部 37 个文件、`tests/` 6 个、根目录全部配置，以及一张"我该改哪个文件"的对照表 |
| [rules-engine.md](./rules-engine.md) | 数据表示约定、`Board → Position → Game` 三层、攻击判定、**Chess960 易位的七条判定链**、FEN/SAN/PGN/UCI、Scharnagl 编号生成算法、不变量清单 |
| [engine.md](./engine.md) | 四档难度参数表、`Engine` 门面 API、Stockfish 探测与回退、UCI 握手、**Stockfish 路径的已知缺口**、内置搜索已实现/未实现的技术清单、静态评估、worker 消息协议 |
| [ui-and-state.md](./ui-and-state.md) | 界面结构与组件清单、棋盘拖拽/点击的实现、无障碍与键盘快捷键、四个 store 的完整字段与 action、**多语言（i18n）的实现与"存描述符"约定**、两个 hook、CSS 变量与主题机制、localStorage 键、调试钩子、**已知冗余与不一致清理清单** |
| [development.md](./development.md) | 环境与命令、推荐的开发循环、分层纪律与代码约定、**加一条文案 / 加一门语言**、常见改动怎么做、调试钩子、需要留意的坑、提交前自查清单 |
| [testing.md](./testing.md) | 两套测试的分工、单元测试逐文件覆盖内容、E2E 用例清单与耦合点、运行方式、**覆盖边界（诚实清单）** |
| [deployment.md](./deployment.md) | 构建产物实测数据、本地预览、Vercel / Netlify / GitHub Pages / 任意静态主机的配置、缓存策略、多线程 Stockfish 的 COOP/COEP 配置、发布前检查清单、许可注意事项 |

---

## 三句话概括这个项目

1. **技术栈**：TypeScript 5.7（严格模式）+ React 19 + Zustand 5，Vite 6 构建，Vitest + Playwright 测试，纯静态部署，运行时只有 3 个依赖。
2. **架构**：`src/core`（纯规则，零 React/DOM）← `src/store`（zustand 状态与编排）← `src/hooks`（副作用）← `src/components`（视图），依赖单向；`src/i18n` 横切提供中英双语（默认中文）；唯一的异步边界是 Web Worker 里的 AI 引擎。
3. **特色**：完整的 Chess960 规则（含全部易位边界情况）、自研的 Scharnagl 编号生成、自研的 negamax 引擎 + 可选 Stockfish 挂载点、SAN/PGN/FEN 双向转换、自研的轻量 i18n，全部用 156 个单元测试 + 32 次 E2E 运行守着。

---

## 当前验证状态

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 无错误 |
| `pnpm test` | ✅ 5 个文件 / **156 个用例**全通过（约 1.2 s） |
| `pnpm build` | ✅ 66 个模块，主包 311.32 kB（gzip 97.29 kB），2.08 s |
| `pnpm test:e2e` | ✅ **32 次运行全通过**（约 22 s，桌面 + 手机两个 project） |

---

## 文档里记录的已知问题

这些不是猜测，都是读代码得到的结论，集中列在这里方便排期：

| 问题 | 严重度 | 详见 |
|---|---|---|
| Stockfish 响应适配层缺失：`ai.ts` 只认 JSON 形状的 `bestmove`，真实 Stockfish 的 UCI 文本流会让搜索超时；因此当前实际永远跑内置引擎 | **高** | [engine.md](./engine.md) §2.4 |
| 搜索超时打断可能选中一个从未被完整搜索的着法（`+INFINITY` 条目会被噪声挑选胜出） | 中 | [engine.md](./engine.md) §3.1 |
| `src/core/engine/` 7 个文件完全没有单元测试（而它们都是纯函数、易测） | 中 | [testing.md](./testing.md#5-覆盖边界诚实清单) |
| `inspect-ai.spec.ts` 是诊断探针但未被 skip，只有 1 个断言，引擎坏了也会通过 | 中 | [testing.md](./testing.md) §3.2 |
| 时钟超时走 `resign()`，`GameStatus` 的 `'timeout'` 与 `StatusBar` 对应分支不可达 | 低 | [ui-and-state.md](./ui-and-state.md#8-已知冗余与不一致清理清单) |
| `settingsStore` 的 `mode`/`playerColor`/`aiLevel`/`autoFlip` 无消费者；对局另用 `gameStore` 的同名字段 | 低 | [ui-and-state.md](./ui-and-state.md) §2.2 |
| 多处死代码：`Piece.tsx`、`gameStore.hint`、`dialogStore.closeAll`、`STORAGE_KEYS.settings`、CSS `--success` | 低 | [ui-and-state.md](./ui-and-state.md#8-已知冗余与不一致清理清单) |
| `build.sourcemap: true` 会发布 1.3 MB 的源码映射 | 低 | [deployment.md](./deployment.md#1-构建流程) |
| 全局快捷键不检查弹窗；多弹窗并存时一次 Esc 全部关闭 | 低 | [development.md](./development.md#6-需要留意的坑) |
| 根目录有一个工具残留文件 `.write-probe.txt`（内容只有 `probe`） | 低 | [project-structure.md](./project-structure.md#1-根目录) |

### 本次多语言改造中已修掉

| 项 | 说明 |
|---|---|
| 3 个**既有的 E2E 失败** | 撤销用例断言错了走子方、升变用例误用了会等待落子的助手、引擎用例依赖了会被拼成 `"1.e4b5"` 的 DOM 文本。此前这套 E2E 从未完整跑过。详见 [testing.md](./testing.md) §3.1。 |
| `GameControls.colorLabel()` | 无引用的英文硬编码助手，被 `i18n.colorName()` 取代并删除。 |
| `settingsStore.language` / `setLanguage` | 原本是"存了但没人读"的死字段，现已接线并有设置项、E2E 覆盖与 v1→v2 迁移。 |
