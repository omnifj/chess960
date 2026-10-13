# 开发指南

## 1. 环境要求

- **Node 20+**（`netlify.toml` 也固定了 `NODE_VERSION = "20"`）
- **pnpm 9+**（仓库用 `pnpm-lock.yaml`；`package.json` 里允许 esbuild 执行安装脚本）
- 端到端测试额外需要下载一次 Chromium

```bash
pnpm install
pnpm test:e2e:install   # 只有要跑 E2E 时才需要
```

---

## 2. 命令速查

| 命令 | 做什么 |
|---|---|
| `pnpm dev` | 开发服务器 + HMR，<http://localhost:5173> |
| `pnpm build` | `tsc -b`（类型检查）→ `vite build` → `dist/` |
| `pnpm preview` | 静态伺服 `dist/`，<http://localhost:4173>（`--strictPort`） |
| `pnpm test` | Vitest 单元测试（纯 Node，约 1.2 s） |
| `pnpm test:watch` | 同上，watch 模式 |
| `pnpm typecheck` | 只跑 `tsc -b --pretty false` |
| `pnpm test:e2e` | Playwright，跑**生产构建**（需先 `pnpm build`） |
| `pnpm test:e2e:install` | 下载 Chromium |

### 推荐的开发循环

```bash
pnpm dev                        # 开着 HMR 手玩
pnpm test:watch                 # 另一个终端：改 core/ 立刻看到单测结果
pnpm typecheck && pnpm test     # 提交前
pnpm build && pnpm test:e2e     # 改动涉及交互/worker/构建时
```

改 `src/core/**` 时 `pnpm test:watch` 的反馈几乎是即时的，**先让它绿再看浏览器**是效率最高的路径。

---

## 3. 代码约定

### 3.1 分层纪律（最重要）

| 层 | 允许 import | 禁止 import |
|---|---|---|
| `src/core/**` | 同层模块、`src/core/types.ts` | **React、DOM API、`src/store`、`src/components`、`src/utils`** |
| `src/utils/**` | 无（`storage.ts` 目前零项目依赖） | 其他任何项目模块 |
| `src/store/**` | `core/**`、`utils/**` | `components/**`、`hooks/**` |
| `src/hooks/**` | `store/**`、`core/**` | `components/**` |
| `src/components/**` | `core/types` 与少量纯函数、`store/**`、`hooks/**` | 直接改棋盘 |

**`core/` 里出现 `import React` 或 `document.` 就是 bug**——它会让 156 个单元测试失去纯 Node 的运行环境。

### 3.2 领域约定

| 约定 | 说明 |
|---|---|
| `Square` 是 `0..63` | `file + 8 * rank`。a1 = 0，h8 = 63。用 `./squares` 里的辅助函数换算，别手写算术。 |
| 棋子编码 | `colorBit + roleCode`：白 `0..6`，黑 `8..14`，`0` = 空。用 `encodePiece`/`codeToRole`/`codeColor`，别用魔法数字。 |
| `Move.to` 永远是真实落点 | 易位时 `to` 是王的最终格（g1/c1），不是车的起始格。 |
| 内部 FEN 一律 Shredder 易位字段 | 需要经典拼写时用 `toFenWithStandardCastling()`。 |
| 合法性只问 `Position` | 组件与 store 都不许自己判断走子是否合法。 |
| 棋局变更只走 `Game` | 改完必须 `syncView()` + `persist()`（见下）。 |
| 组件不直接改棋盘 | 走 props 回调 → store action → `Game`。 |

### 3.3 TypeScript 风格

- **严格模式全开**，包括 `noUncheckedIndexedAccess`。所以数组/Map 取值要判空或 `!`——项目里大量使用 `!` 断言，只在"刚刚检查过"的地方用。
- `verbatimModuleSyntax` 打开：**类型导入必须写 `import type { ... }`**（或 `import { type X }`）。
- `noUnusedLocals` / `noUnusedParameters` 打开：故意的未使用参数要加 `_` 前缀或 `void x;`。
- 项目里有一处刻意的 `void version;` 惯用法（订阅 `version` 只为触发重渲染），`noUnusedLocals` 需要它。
- **`core/` 里不出现界面文案**。需要给用户看的文本由视图层用 i18n 键渲染；`core` 抛出的错误消息是英文技术细节，只能作为 `{detail}` 参数嵌进本地化外壳里。
- **store 里存 `MessageDescriptor`（`asMessage(key, params)`），不存渲染好的字符串**。用了字符串，切换语言时那条消息就会卡在旧语言——`tests/e2e/chess960.spec.ts` 里有一条专门测这个的用例。
- **`MessageDescriptor.params` 里不能放已经翻译过的文本**。需要区分颜色就加两个键（`message.whiteTimeout` / `message.blackTimeout`），不要把 `t('color.white')` 当参数传进去。
- **`src/i18n/` 的 `types.ts` / `messages.ts` / `translate.ts` 保持零项目依赖**（只有 `useI18n.ts` 可以 import store）。否则会出现"store 要语言类型、hook 要 store"的循环引用。
- 注释用**英文**，解释**为什么**而不是**做了什么**。现有代码的注释密度偏高且质量很好，请保持这个风格。
- 错误信息也是英文（`throw new Error(\`Invalid FEN rank "${row}": ${file} files\`)`）——它们是技术细节，不是面向用户的文案。

### 3.4 React 风格

- `react-jsx` 自动运行时：**不要写 `import React`**，需要类型时 `import type { ReactNode } from 'react'`。
- 组件是函数式 + hooks，没有类组件。
- 展示组件通过 props 拿全部输入（`Board` 连 store 都不 import）。
- 派生值就地计算（`PgnDialog` 每次渲染都重算 `game.toPgn()`），配合 `version` 计数器保证新鲜。
- `data-testid` 是**公开契约**：E2E 依赖它们，改名等于改测试。

### 3.5 CSS 风格

- 一个文件：`src/styles/index.css`。新增样式写在这里，用已有的类名前缀（`.app__*`、`.board`、`.square--*`、`.dialog__*`）。
- **颜色/尺寸优先用 CSS 变量**（`var(--accent)`、`var(--radius)`），新增主题只需加一个 `[data-theme='x']` 块。
- 类名是 BEM-ish 的 `block__element--modifier`。
- 覆盖层用伪元素 + `pointer-events: none`，不要插入真实 DOM。

---

## 4. 常用改动怎么做

### 4.1 加一个难度档位

1. `src/core/engine/protocol.ts` 的 `EngineLevelName` 加联合成员。
2. `src/core/engine/difficulty.ts` 的 `DIFFICULTIES` 加一项（同时给内置引擎与 Stockfish 的旋钮）+ `DIFFICULTY_ORDER` 加名字。
3. UI 会自动出现（下拉框遍历 `DIFFICULTY_ORDER`）。
4. `settingsStore.normalizeSettings` 用 `isEngineLevelName` 校验，无需改动。

### 4.2 加一个设置项

1. `src/store/settingsStore.ts`：`SettingsState` 加字段、`DEFAULT_SETTINGS` 加默认值、`normalizeSettings` 加校验、需要的话加 setter。
2. `src/components/Controls/SettingsPanel.tsx`：加控件，写回 store。
3. 在真正读取它的地方消费（`App.tsx` / `Board.tsx`）。
4. 注意：`persist` 的 `version` 是 1，新增字段靠 `merge` 里的 `...current` 自动获得默认值，**不需要**写 migration。

### 4.3 加一个弹窗

1. `src/store/dialogStore.ts`：`DialogName` 加名字，state 加布尔字段（`open`/`close` 用计算键，不用改）。
2. `src/components/Controls/XxxDialog.tsx`：基于 `Modal` 写（自带 Esc 关闭、遮罩点击关闭、初始聚焦、`role="dialog"`）。
3. `src/App.tsx`：`{dialogs.xxx && <XxxDialog onClose={() => dialogs.close('xxx')} />}`。

### 4.4 改棋盘交互

`src/components/Board/Board.tsx` 的 `onPointerDown` 是唯一的入口，同时处理点击与拖拽。改动时注意：

- 拖拽浮层的定位用 `rect.width / 8` 作为格宽。
- `squareAt()` 用棋盘矩形换算，天然对翻转免疫。
- 变更后请同时更新 `tests/e2e/chess960.spec.ts` 里依赖的 `data-testid`。

### 4.5 加一条界面文案 / 加一门语言

**加一条文案：**

1. 在 `src/i18n/messages.ts` 的 `zh` 里加键（中文用**全角标点**，占位符写作 `{name}`）。
2. 在同文件的 `en` 里加同名键。**漏了会编译报错**（`en` 的类型是 `Record<MessageKey, string>`），不会静默漏译。
3. 组件里 `const { t } = useI18n();` 然后 `t('your.key')`。需要参数就 `t('your.key', { name })`。
4. 如果要存进 store（`setMessage` / `setError`），用 `asMessage('your.key', params)`，**不要**传渲染好的字符串。

命名约定：`<区域>.<用途>`，例如 `controls.newGame`、`status.drawThreefold`、`message.fenCopied`。领域值的键用助手生成（`colorKey('white')`、`pieceKey('q')`、`difficultyLabelKey('hard')`、`promotionRoleKey('n')`），不要手写字符串。

**加一门语言（例如日语）：**

1. `src/i18n/types.ts`：`Language` 联合加 `'ja'`，`LANGUAGES` 加 `'ja'`，`normalizeLanguage` 加一条分支。
2. `src/i18n/messages.ts`：加 `export const ja: Record<MessageKey, string> = { ... }`，并把 `CATALOGS` 扩成三语。
3. `src/i18n/types.ts` 的 `DEFAULT_LANGUAGE` 保持 `'zh'`（除非要改默认）。
4. 语言选择器会自动出现（它遍历 `LANGUAGES`）。
5. `App.tsx` 里的 `document.documentElement.lang` 目前是 `language === 'zh' ? 'zh-CN' : 'en'` 的三元式——加语言时要改成映射表。

### 4.6 修棋规

改 `src/core/position.ts` **之前先读 `tests/unit/castling.test.ts`**——易位的每条规则都有对应用例，53 个用例就是这份代码的规格说明。改完先跑 `pnpm test`。

如果发现某条规则没有用例覆盖：**先加用例，再改代码**。

---

## 5. 调试钩子

项目暴露了三个全局钩子，浏览器控制台里直接可用：

| 钩子 | 用法 | 作用 |
|---|---|---|
| `__chess960.game` | `__chess960.game.getState().moveCount` | 读取/操作棋局 store（`globalThis.__chess960.game`） |
| `__chess960.engine` | `__chess960.engine.getState().name` | 读取引擎 store |
| `__debugEngine` | `__debugEngine = true` | 打印引擎探测与握手日志。**惰性读取**，页面加载后再设也生效 |
| `__castlingDebug` | `__castlingDebug = true; position.castlingMove('king')` | 打印这次易位**被哪一条规则拒绝**（如 `[castling] rejected: attacked d1`） |

`__castlingDebug` 在排查"为什么这步易位不合法"时特别有用——`guard(reason)` 是所有拒绝分支的唯一出口。

想快速在两种语言之间来回切，用 **设置 → 界面 → 语言** 最快；也可以直接在控制台改持久化再刷新：

```js
localStorage.setItem('chess960:settings', JSON.stringify({ state: { language: 'en' }, version: 2 }));
location.reload();
```

### 在 Node 里直接玩规则层

因为 `core/` 是纯的，可以用 `scripts/bundle.mjs` 打一个探针：

```bash
node scripts/bundle.mjs probe.ts probe.mjs
node probe.mjs
```

或者更快：直接在 `tests/unit/` 下临时写一个 `.test.ts`，用 `pnpm test:watch` 跑——这个路径更短，而且不用清理。

---

## 6. 需要留意的坑

| 坑 | 说明 |
|---|---|
| **`Position.play()` 只有一层撤销** | 任何"试走一步看看"的代码都必须保存/恢复 `previous` 与 `lastMove`（照抄 `legalMoves()` 里的 `try/finally`）。否则会静默破坏 `Game.undo()`。 |
| **`gameStore` 的可变 `Game`** | 手动改 `game` 后忘记 `syncView()`，UI 就不会更新。所有变更都应在 action 内完成并收尾。 |
| **`syncView()` 会 bump `version`** | 它会让所有订阅 `version` 的组件重渲染。不要在高频路径（如 `tickClock`）里调用它。 |
| **`SettingsPanel` 会重置时钟** | 该组件里任何一个设置变更（**包括切换语言**）都会调用 `setClock(...)`，把双方剩余时间**重置为基准时间**——它和时钟共用一个 `useEffect` 依赖组。 |
| **全局快捷键没有弹窗守卫** | U/F/C/H/N 在弹窗打开时也会触发（只忽略输入框/文本域/下拉框内的按键）。 |
| **多弹窗 + Esc** | `dialogStore` 没有互斥；多个弹窗并存时一次 Esc 会全部关闭。 |
| **Stockfish 响应适配缺失** | `ai.ts` 只认 JSON 形状的 `bestmove`，真实 Stockfish 的 UCI 文本流会导致搜索超时。详见 [engine.md](./engine.md) 的「Stockfish 路径的已知缺口」一节。 |
| **加文案时忘了同步两张表** | `en` 漏键会编译报错，但**占位符不一致不会**（`{count}` 只在一边出现会静默丢参数）。`tests/unit/i18n.test.ts` 会抓，但先跑一次 `pnpm test` 更省事。 |
| **在 store 里存了渲染好的字符串** | 切语言时那条消息不会跟着变。用 `asMessage(key, params)`。 |
| **E2E 断言依赖可见文案** | 默认语言是中文，英文断言会失败。已有用例通过 `openApp()` 预置 `language: 'en'` 规避；新增断言请优先用 `data-testid` 与 `selectOption(value)`。 |
| **`SettingsPanel` 里改任何设置都会重置时钟** | 见上一行——切换语言同样会触发。 |
| **E2E 需要先构建** | `pnpm test:e2e` 跑的是 `vite preview`，没有 `dist/` 会失败。 |
| **`sourcemap: true`** | 构建默认产出 `.map` 文件（1.3 MB，比 JS 本身还大）。不想公开源码就关掉。 |

---

## 7. 提交前自查

- [ ] `pnpm typecheck` 无错误
- [ ] `pnpm test` 全绿（156 个用例）
- [ ] 改动了 `src/core/**` → 确认它没有引入 DOM、React 或 i18n 依赖
- [ ] 新增/修改了界面文案 → `zh` 与 `en` 两张表都改了，且占位符一致
- [ ] 往 store 里写了消息 → 用的是 `asMessage(key, params)` 而不是字符串
- [ ] 改动了 `data-testid` 或可访问名 → 同步更新 `tests/e2e/`
- [ ] 改动了交互/worker/构建配置 → `pnpm build && pnpm test:e2e`
- [ ] 新增棋规分支 → 先补单元用例
- [ ] 注释解释了"为什么"，不是"做了什么"

---

**相关文档**：[技术栈](./tech-stack.md) · [整体架构](./architecture.md) · [规则引擎](./rules-engine.md) · [测试策略](./testing.md) · [构建与部署](./deployment.md)
