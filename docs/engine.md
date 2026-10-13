# AI 引擎

本项目的 AI 对手有两套实现，通过**同一个门面**驱动：

| 引擎 | 实现位置 | 何时使用 |
|---|---|---|
| **内置引擎**（默认） | `src/core/engine/search.ts` + `evaluate.ts` + `builtin.worker.ts` | 始终可用。零依赖的自研 negamax 搜索。 |
| **Stockfish (WASM)**（可选） | 需自行放入 `public/engines/stockfish/` | 启动时探测到该文件才启用 |

两者都跑在 **Web Worker** 里，主线程只交换消息——所以引擎思考时棋盘不会卡住。

---

## 1. 难度分级

四个等级的参数集中在 `src/core/engine/difficulty.ts`，**两套引擎共用同一张表**（每级同时带内置引擎与 Stockfish 的旋钮，UI 无需知道当前跑的是哪个引擎）：

| 等级 | `depth` | `movetimeMs` | Stockfish `Skill` | `randomness`（随机走子概率） | `noiseCp`（评分噪声） |
|---|---|---|---|---|---|
| `easy` | 1 | 150 | 0 | **35 %** | ±90 cp |
| `medium` | 3 | 400 | 6 | 8 % | ±30 cp |
| `hard` | 4 | 1000 | 12 | 0 | ±8 cp |
| `master` | 6 | 3000 | 20 | 0 | 0 |

> ⚠️ 现有 README 把 easy 描述为"35 % random moves, ±90 cp noise"，与代码一致；但 medium 的 `randomness` 实际是 **8 %**（README 未提及）。

导出：`DIFFICULTIES`、`DIFFICULTY_ORDER = ['easy','medium','hard','master']`、`difficulty(name)`、`isEngineLevelName(value)`。

`difficulty()` 对未知名字**静默回退到 `medium`**（`?? DIFFICULTIES.medium`）。

---

## 2. 门面：`Engine`（`src/core/engine/ai.ts`）

UI 只跟这一个类打交道。

### 2.1 构造与生命周期

```ts
new Engine({
  stockfishPath?: string,       // 默认 './engines/stockfish/stockfish.js'
  forceBuiltin?: boolean,       // 跳过 Stockfish 探测
  onReady?: (info: { engine: 'builtin' | 'stockfish'; name: string }) => void,
  onFallback?: (reason: string) => void,
})
```

| 成员 | 说明 |
|---|---|
| `init()` | 幂等。并发调用共享同一个 `starting` promise。 |
| `go(fen, { level, movetimeMs?, depth? })` | 返回 `EngineMoveResult`。 |
| `stop()` | 让引擎放弃当前搜索；**同时 reject 掉所有 pending 请求**（`Error('Engine stopped')`）。 |
| `quit()` | `stop()` + `worker.terminate()`，清空 worker。 |
| `goUci(fen, options)` | 只要 UCI 字符串（棋局已结束时返回 `''`）。 |
| `engineKind` / `engineName` / `isReady` | 只读状态。 |
| `static toUci(position, move)` | 转发到 `moveToUci`。 |

`EngineMoveResult`：

```ts
{ move: Move | null; uci: string; scoreCp?: number; scoreMate?: number; depth?: number; engine: EngineKind }
```

事件**只有构造参数里的回调**（没有 EventEmitter）。其中 `onFallback` 只在 Stockfish 启动抛错时触发，且回调本身被 try/catch 包住——一个会抛错的回调不会破坏回退流程。

**注意：`forceBuiltin: true` 或环境里没有全局 `Worker` 时，`onFallback` 不会被调用**（直接走内置引擎）。

### 2.2 引擎选择：探测与静默回退

```
startInternal()
  ├─ forceBuiltin 或 没有全局 Worker  → startBuiltin()
  └─ 否则 try startStockfish()
            catch → onFallback(reason) → startBuiltin()
```

`probeEngine(url, 3000ms)` 用 `fetch(url, { headers: { Range: 'bytes=0-64' }, signal })` 先探文件是否存在，判定为**不存在**的情况：

- HTTP 状态非 2xx；
- `content-type` 匹配 `/text\/html/i`；
- 响应体前 64 字符（trim + 小写）匹配 `/^<(!doctype|html|\?xml)/`；
- 任何抛错。

> 这里专门处理了一个真实的部署陷阱：**SPA 托管方对不存在的文件常返回 `200 + index.html`**。如果只判断状态码，就会把一个 HTML 页面当成引擎去 `Worker()`，得到一个难以诊断的错误。3 秒超时保证"探测卡住"永远不会让应用失去引擎。

### 2.3 Stockfish 握手（UCI）

```
postMessage('uci')                              → 等 'uciok'   (5 s)
postMessage('setoption name UCI_Chess960 value true')   // Chess960 易位编码
postMessage('setoption name Threads value 1')
postMessage('setoption name Hash value 16')
postMessage('isready')                          → 等 'readyok' (5 s)
```

握手成功后 `kind = 'stockfish'`，`name = 'Stockfish (WASM)'`。

每次 `go()`：

```
setoption name Skill Level value <preset.skill>
position fen <fen>
go movetime <ms> depth <depth>
```

### 2.4 ⚠️ Stockfish 路径的已知缺口（重要）

`onMessage()` 只处理**JSON 形状**的响应：

```ts
if (message.type === 'bestmove') { ... this.pending.get(message.requestId) ... }
```

而一个普通的 `stockfish.js` worker 通过 `postMessage` 发出的是**纯 UCI 文本行**（`"bestmove e2e4 ponder e7e5"`），其 `message.type` 是 `undefined`，会被静默丢弃。仓库里**没有任何适配层**（不存在 Stockfish 适配 worker，也没有 `bestmove` 文本解析器）。

后果：

- **握手能成功**——因为 `waitForLine()` 对字符串做子串匹配（`text.includes('uciok')`），文本行是能匹配上的。
- **搜索会超时**——`go()` 在 `movetimeMs + 20 000 ms` 后 reject `Error('Engine timed out')`。
- 由于 `public/engines/` 目前**只有 `README.md`**（没有 `stockfish.js`），探测总是失败，因此**当前实际运行的永远是内置引擎**。

所以 README 里"放进 Stockfish 就能用"的说法，在响应适配层补上之前是**不完全成立**的。要真正接上，需要新增一个把 UCI 文本流转成 `EngineResponse` JSON 的适配 worker（或在 `ai.ts` 里加一个文本解析分支）。

### 2.5 请求相关细节

- `pending: Map<number, { resolve, reject, timer, level }>`，`requestId` 从 1 单调递增。
- 每次请求的超时是 `(movetimeMs ?? preset.movetimeMs) + 20 000 ms`。
- worker 的 `error` 事件调用 `failAll(message)`，一次性 reject 所有 pending。
- `info` 消息（内置 worker 每次刷新根着法时都会发）**被静默丢弃**，UI 没有接 PV / 分数面板。`EngineMoveResult` 上的 `scoreCp` / `scoreMate` / `depth` 字段目前也没有调用方读取——`useAiPlayer` 与 `requestHint` 只看 `result.move`。
- `go()` 返回的 `move` **不做二次合法性校验**（不会拿 `fen` 重新 resolve）。

---

## 3. 内置引擎

### 3.1 搜索（`src/core/engine/search.ts`）

`searchMove(position, options): SearchResult`

**已实现的技术：**

- **迭代加深**（深度 1..`max(1, options.depth)`）
- **Alpha-beta negamax**（fail-soft 式返回）
- **静态搜索（quiescence）**：只搜吃子（`legalMoves({ capturesOnly: true })`），带 stand-pat beta 剪枝、`ply > 12` 兜底、**没有** delta pruning
- **MVV-LVA 着法排序**（每个内部节点与静态搜索中都会排序）
- **置换表**：`Map<string, { depth, score }>`，`cached.depth >= depth` 时复用
- **将杀评分**：`position.isCheck() ? -MATE_SCORE + ply : 0`，逼和记 0
- **和棋检测**：重复 → 0；`halfmoves >= 100` → 0；子力不足 → 0
- **时间管理**：单个 deadline，每 1024 个节点检查一次，每个根着法后与每轮迭代完成后也检查
- **根着法排序**：把上一轮最优着法加权 `+1_000_000`，其次是上一轮分数，再是 MVV-LVA
- **可选弱化**：`noiseCp` / `rng`
- **进度回调**：`onRootMove(move, score, depth)`

**没有实现的技术**（如果想增强引擎，这里是清单）：aspiration window、PVS / null-window 重搜、null-move pruning、LMR、任何形式的延伸（含将军延伸）、killer move、history heuristic、futility / delta pruning、SEE、PV 收集、开局库、Multi-PV、节点数上限、软/硬时限分离、时间增益。

常量：`MATE_SCORE = 100_000`、`MATE_THRESHOLD = 99_000`、`INFINITY = 1_000_000`。

控制流要点：

- 根着法为空 → 直接返回 `{ move: null, scoreCp: 0, depth: 0, nodes: 0 }`。
- 只有**一个**合法着法 → 直接返回它，**完全不搜索**。
- 根节点调用 `-negamax(next, depth - 1, -INFINITY, -alpha, 1, ...)`，全窗口，等价于没有 aspiration。
- 每个节点都 `position.clone()` + `play`，**不是** make/unmake——这就是为什么棋盘要用 `Uint8Array(64)` 让克隆足够便宜。
- 将杀/逼和的判定在 `depth <= 0` 检查**之前**，所以深度 0 也能先发现将杀。

**已知弱点（读代码时的观察，非文件内注释）：**

1. 搜到一半被 deadline 打断时，`negamax` 返回传入的 `alpha`；根节点传入的是 `-INFINITY`，于是被打断的那个根着法会记成 `+INFINITY`。而 `noiseCp > 0` 时（easy 90 / medium 30 / hard 8）噪声挑选的是 `scored` 里 `score + noise` 的最大值——**一个 `+INFINITY` 条目必然胜出**。也就是说：超时打断可能导致选出一个从未被完整搜索的着法。
2. 置换表把 `best` 当作精确值存储，即使该节点是因 beta 截断（fail-high，其实只是一个边界）或因 `context.aborted` 而退出；没有 bound 标志、没有 generation/aging、**没有容量上限**（表在 `searchMove` 内部新建，每次 `go` 都会重新增长）。
3. `context.history` 是由 `options.history` 构建一次的 `Set`，搜索过程中**不追加**。因此**搜索树内部新产生的重复局面检测不到**，只有调用方传入的那些会被识别。
4. 文档与实现不符：`noiseCp` 的注释说"乘到根着法分数上的乘数"，实际是加均匀噪声 `±noiseCp`；`scoreForWhite` 的注释说"返回**非**走子方的分数"，实现返回的是白方分数。

`matesIn` 用的是**干净分数**（噪声只用于挑选着法），所以报出的将杀步数不受噪声影响。

### 3.2 静态评估（`src/core/engine/evaluate.ts`）

- **子力价值**：`p 100, n 320, b 330, r 500, q 900, k 0`
- **棋子-格子表（PST）**：兵/马/象/车/后各一张，王有中局与残局两张；都是 a1..h8 顺序的 64 元素扁平数组；黑方通过 `63 - square` **镜像**读取。
- **象对**：`±30`；**先手（tempo）**：`±8`。
- 最终结果按 `turn` 取负，使返回值是**走子方视角**。
- **残局判定**：`nonPawns <= 6 || (双方都没有后)`，仅用于**切换王表**（没有渐变插值、没有独立残局评估）。

**没有实现**：机动性、兵形（叠兵/孤兵/通路兵/落后兵）、王安全/兵盾、通路兵奖励、车占开放线、威胁项。

`evaluate()` 是纯函数、零依赖，因此可以在 Node 里直接测试。

辅助导出：`moveOrderScore()`（MVV-LVA：`10 * 受害者价值 - 攻击者价值`，吃过路兵按 `1000-100`，升变加 `PIECE_VALUE[promotion]`，易位 `+60`）、`positionKey()`（= `repetitionKeyWithoutEp()`，**不含过路兵格**）、`moveKey()`、`kingCapturable()`、`applyMove()`（已导出但仓库中无调用方）。

### 3.3 Worker 与消息协议

**`protocol.ts`** —— 主线程与 worker 之间的**纯类型**契约：

```ts
// 请求
{ type: 'start',    fen }
{ type: 'position', fen, moves?: string[] }
{ type: 'go',       requestId, fen, moves?, level, movetimeMs?, depth?, skill? }
{ type: 'stop' }
{ type: 'quit' }

// 响应
{ type: 'ready',    engine: 'builtin' | 'stockfish', name }
{ type: 'bestmove', requestId, move: {from,to,promotion?,castle?} | null, uci, scoreCp?, scoreMate?, depth? }
{ type: 'info',     requestId, depth?, scoreCp?, scoreMate?, pv? }
{ type: 'error',    message, requestId? }
```

**`workerFactory.ts`** —— 唯一实例化 worker 的地方：

- `createBuiltinWorker()` 用 Vite 的 `?worker` 构造器（`import BuiltinWorker from './builtin.worker?worker'`），**不是** `new Worker(new URL(...))`。
  文件头注明了原因：把 `new Worker(...)` 单独放在一个模块里，Vite 才会产出 `.js` 资产；直接写 `new URL('./builtin.worker.ts', import.meta.url)` 会把 **`.ts` 文件**发出去，而浏览器拒绝把 `.ts` 当 module worker 执行。
- `createExternalWorker(url, name)` 用 `new Worker(url, { type: 'module', name })`。

**`builtin.worker.ts`** —— worker 入口，无导出（副作用模块，注册 `message` 监听）：

| 请求 | 行为 |
|---|---|
| `start` | 回 `{ type: 'ready', engine: 'builtin', name: 'Built-in engine (alpha-beta)' }` |
| `position` | **空操作**（搜索只认 `go` 里带的 FEN） |
| `go` | 见下 |
| `stop` | **空操作**（搜索对 worker 而言是同步的；只能在两次搜索之间响应，**无法真正取消进行中的搜索**） |
| `quit` | **空操作**（不清状态、不关闭 worker） |

`go` 流程：

1. `Position.fromFen(request.fen)` → `difficulty(request.level)`
2. `history = repetitionKeysFromRequest(fen, moves ?? [])`
3. 没有合法着法 → 回 `{ type: 'error', message: 'No legal moves in <fen>' }`（注意是 **error**，不是 `move: null`）
4. **随机走子捷径**：若 `preset.randomness > 0 && Math.random() < preset.randomness`，直接均匀随机选一个合法着法返回，`scoreCp: 0, depth: 0`
5. 否则 `searchMove(...)`，过程中每次根着法改进都 `postMessage({ type: 'info', ... })`；最终回 `bestmove`

细节：worker **不保存任何跨消息状态**（没有缓存的局面、没有 stop 标志）。异常被外层 try/catch 捕获，回 `{ type: 'error', message }`（**不带 requestId**）。`nodes` 字段**不通过协议传输**。

> 由于 `ai.ts` 从不发送 `start` / `position` / `moves`，通过门面实际可达的分支只有 `go` 和 `stop`；`EngineGoRequest.moves` 与 worker 里的重复局面重放路径在运行时是死代码。

---

## 4. 谁来调用引擎

- `src/store/engineStore.ts` —— 模块级单例 `Engine`（`getEngine()` 惰性创建），持有 `{ ready, name, thinking, error, score }`；写 store 用 `queueMicrotask` 延后，避免在渲染期触发更新。
- `src/hooks/useAiPlayer.ts` —— 监听 `gameStore`，轮到 AI 时调 `instance.go(fen, { level: aiLevel })`；提示功能调 `{ level: 'hard' }`。**从不传 `movetimeMs` / `depth` / `moves`**，所以永远由难度预设驱动。把 reject 信息里含 `'stopped'` 的视为用户取消。

---

**相关文档**：[规则引擎](./rules-engine.md) · [整体架构](./architecture.md) · [测试策略](./testing.md) · [放入 Stockfish 的说明](../public/engines/README.md)
