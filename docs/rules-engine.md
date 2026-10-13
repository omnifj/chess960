# 规则引擎与 Chess960 王车易位

本文件说明 `src/core/` 里的**纯规则层**：棋盘如何表示、合法性如何判定、Chess960 的王车易位规则、以及 FEN / SAN / PGN 互转。

这一层**完全不 import React、不触碰 DOM**，因此可以在纯 Node 下被测试（这正是 `pnpm test` 跑得飞快的原因）。

---

## 1. 数据表示约定

| 概念 | 表示 | 说明 |
|---|---|---|
| `Square` | `0..63` 整数，`file + 8 * rank` | a1 = 0，h1 = 7，a8 = 56，h8 = 63。走子与攻击判定因此全是整数算术。 |
| `Piece` | `{ color, role }` | `role` 是 `'p' \| 'n' \| 'b' \| 'r' \| 'q' \| 'k'` |
| 棋盘格子 | `Uint8Array(64)` 中的 `colorBit + roleCode` | 白 = `0 + code`，黑 = `8 + code`，`0` 表示空格。克隆一个局面只需复制 64 字节。 |
| `Move` | `{ from, to, promotion?, castle?, enPassant?, doublePush? }` | `to` **永远是棋子的真实落点**；王车易位的 `to` 是王的目标格（g1/c1）。 |

`roleCode`：`p=1, n=2, b=3, r=4, q=5, k=6`。定义在 `src/core/board.ts`。

---

## 2. 分层：`Board` → `Position` → `Game`

```
Board          纯数据结构：64 格 Uint8Array、FEN 摆放字段读写、查王、按颜色取子
  ↑
Position       唯一知道"国际象棋怎么下"的地方：走子生成、合法性、攻击判定、
               王车易位、FEN 解析/序列化、重复局面键、子力不足判定
  ↑
Game           在一串 Position 之上加入历史：SAN、重复局面列表、撤销、认输、
               状态缓存、PGN 导入导出、localStorage 快照
```

### 2.1 `Board`（`src/core/board.ts`）

- 持有 `Uint8Array(64)`；`clone()` 用 `slice()` 复制。
- `toFenPlacement()` / `fromFenPlacement()` —— FEN 的棋子摆放字段（第 1 段）与棋盘互转，非法输入抛错。
- `castlingSideFromLetter()` —— 把一个易位字母解释成 `'king'` / `'queen'`：`K`/`Q` 表示"王相对的外侧车"，`A`..`H` 表示**直接点名车所在的纵线**（Shredder-FEN / X-FEN）。
- `boardToDebugString()` —— 人类可读的棋盘转储，用于测试与报错。

### 2.2 `Position`（`src/core/position.ts`，977 行，核心中的核心）

**是合法性的唯一真相来源。** UI 永远只调用 `legalMoves` / `resolveMove` / `play`，绝不自己改棋盘。

关键成员：

| 成员 | 作用 |
|---|---|
| `board`, `turn`, `epSquare`, `halfmoves`, `fullmoves` | 局面本体 |
| `castlingFiles` | **每种颜色王与两车的原始纵线**（整局固定）。这是 Chess960 的关键：仅凭棋盘无法知道哪两个车是易位车。 |
| `rights` | 当前还剩哪些易位权（白/黑 × 王翼/后翼） |
| `lastMove` | 产生当前局面的着法（起始局面为 `null`） |
| `generateMoves({only, capturesOnly, includeCastling})` | 生成**候选**着法（伪合法），`only` 限定某个起点的子（UI 与搜索的大幅加速），`capturesOnly` 供静态搜索用 |
| `legalMoves({only, capturesOnly})` | 真正合法的着法：逐个试走着法再问"我的王是否被攻击" |
| `resolveMove({from,to,promotion?,castle?})` | 把外部着法描述（点击、PGN、UCI）规范化成合法内部着法或 `null` |
| `play(move)` / `undo()` | 走子 / 撤销，**只保留一层**撤销状态 |
| `toFen()` / `toFenWithStandardCastling()` | Shredder-FEN / 传统 KQkq FEN |
| `repetitionKey()` | 棋盘 + 走子方 + 易位权 + 过路兵格（FIDE 的重复局面定义） |
| `toState()` / `fromState()` | **精确局面快照**（见下） |
| `hasInsufficientMaterial()` | K vs K、K+轻子 vs K、K+N vs K+N、同色格象的 K+B vs K+B |
| `isAttacked(square, byColor)` | 兵的斜吃是精确判定（不是近似） |

#### 攻击判定

- `kingAttackedByOffsets()` 处理马、王、滑行子（象/车/后）。
- `attackedByPawns()` 单独处理兵，因为兵的吃子方向不对称（白兵在 `(f,r)` 攻击 `(f±1, r+1)`）。
- `rayTarget()` 有一个 `stopAtKing` 参数：为 `true` 时**敌方的王不被算作攻击者，但仍然阻挡射线**。这正是判断"王车易位路径是否被攻击"时需要的语义（`isAttackedIgnoringKing()`）。

#### `play()` 只保留一层撤销 —— 一个容易被忽略的坑

`play()` 会把上一局面存进 `previous`，`undo()` 取回。这**只够**搜索和"这一步会不会让自己的王被将"的探测使用。

于是 `legalMoves()` 内部在试用 `play`/`undo` 做前瞻时，会**先保存再恢复**调用方的 `previous` 与 `lastMove`：

```ts
const savedPrevious = this.previous;
const savedLastMove = this.lastMove;
try {
  for (const move of this.generateMoves(...)) {
    this.play(move);
    if (!this.isCheck(us)) legal.push(move);
    this.undo();
  }
} finally {
  this.previous = savedPrevious;
  this.lastMove = savedLastMove;   // 否则"探测合法性"会静默吃掉 Game.undo() 依赖的那层撤销
}
```

完整的走子历史在 `Game` 里，而不是 `Position` 里。

#### `toState()` / `fromState()`：为什么不用 FEN 做快照

FEN **无法表达"车已经被吃掉了，但易位权字段仍需保留"**这种状态。因此 `Game` 的每条记录都保存 `stateBefore: PositionStateData`（棋盘摆放字段 + 走子方 + `castlingFiles` + `rights` + 过路兵格 + 回合数）。`Game.undo()` 从这份快照重建局面，所以**反复撤销、中间穿插任意合法性探测，都不会让历史错位**。

### 2.3 `Game`（`src/core/game.ts`）

- 构造方式（`GameOptions`）：`{ standard }` / `{ startFen, castlingFiles? }` / `{ backRank }` / `{ index }` / 什么都不给（随机 960）。
- `records: GameRecord[]` —— 每条含 `{ index, move, san, fen, before, after, stateBefore }`。
- `repetitionKeys: string[]` —— 含起始局面在内的所有重复局面键，直接喂给 `evaluatePosition` 即可得到三次/五次重复判定。
- `play()` —— 返回 `GameRecord` 或 `null`（非法或棋局已结束）；内部先算 SAN、记录 `before`/`stateBefore`，再真正走子。
- `undo()` / `undoMany(n)` —— 撤销 n 步（引擎模式下退两步，让"又是你走"）。
- `resign()` / `agreeDraw()` —— 认输与协议和棋。
- `status` —— 带缓存（局面变化时置空），认输优先级最高。
- `toPgn()` —— 非标准布局时自动加上 `Chess960Index` / `Chess960BackRank` 头。
- `toSnapshot()` / `fromSnapshot()` —— `localStorage` 快照（`version: 1`）。`fromSnapshot` 在遇到第一个不一致的着法时**停止**而不是污染棋局。
- `static fromPgn(startFen, sans)` —— 从头文件 + SAN 文本重建对局，返回 `{ game, failedAt }`。

### 2.4 状态判定（`src/core/rules.ts`）

`evaluatePosition(position, history)` 的判定顺序（顺序本身很重要）：

1. 无合法着法 + 被将 → **checkmate**
2. 无合法着法 + 未被将 → **stalemate**
3. 重复 ≥ 5 次 → **draw（fivefold）**
4. `halfmoves >= 150` → **draw（seventy-five-move）**
5. 子力不足 → **draw（insufficient-material）**
6. 重复 ≥ 3 次 → **draw（threefold）**
7. 被将 → **check**；否则 **playing**

配套的 `claimableDraw()` 只返回**棋手可以主动主张**的和棋（50 步 / 三次重复），与上面自动生效的阈值（75 步 / 五次重复）区分开——这正是 FIDE 规则的区别。

### 2.5 重复局面记账（`src/core/history.ts`）

四个小函数：`countRepetitions` / `nextRepetitionCount` / `repetitionCounts` / `mostRepeated`。`nextRepetitionCount` 的含义是"该键已有的出现次数 **+ 1**（即即将形成的局面）"。

---

## 3. Chess960 王车易位（本项目的重点与难点）

### 3.1 与标准象棋的三个根本差异

1. **王与车的起始纵线不固定**，因此必须记住"哪两个车是易位车"（`castlingFiles`）。
2. **`KQkq` 无法描述 Chess960 布局**（例如王在 b1、车在 a1 和 h1 时，`KQ` 有歧义）。因此内部一律使用 **Shredder-FEN**：用车的纵线字母，如 `AHah` 表示 a1 和 h1 上的车。
3. **王和车可能"互相穿过"**：王可能已经在 g1（此时只有车动），车也可能落在王的起始格上。

### 3.2 `castlingMove(side)` 的完整判定链

实现遵循 FIDE Chess960 规则，七条依次检查（`src/core/position.ts`）：

1. 该侧易位权仍然存在（王和该车都没动过）。
2. 王和**指定的那个车**都必须还在原始格子上。
3. 王与车之间的所有格子必须为空。
4. 王当前**不能**被将。
5. 王从起点到终点（含终点）经过的每一格都**不能被攻击**，且**只能跨越那个易位车**。
6. 王的落点只能被"参与易位的王/车"占据；车的落点必须为空，或是"王的起点格"（王 b1 → g1、车 h1 → f1 时两者交叉）。
7. 目标格**永远是** g1/f1（O-O）与 c1/d1（O-O-O），与起始位置无关。若王本来就站在目标格上，则**王不动、只有车动**。

> **只有王"穿过被攻击格"是非法的；车可以穿过甚至停在被攻击格上。** 这是最容易被写错的一条（FIDE 法律，Chess960 易位）。

被拒绝的分支全部经由一个 `guard(reason)` 单点返回 `null`。在浏览器控制台（或 Node 探针）里设置 `globalThis.__castlingDebug = true`，就能看到**具体是哪一条规则拒绝了这次易位**：

```js
__castlingDebug = true;
position.castlingMove('king');   // 控制台打印 [castling] rejected: attacked d1
```

### 3.3 易位权的丧失

在 `updateRights()` 中，用**真实格子**（而非纵线编号）比较，因为两种颜色共享纵线索引：

- 王移动 → 该方两侧易位权全部丧失。
- 车离开它的原始格 → 丧失对应一侧。
- **车在原始格上被吃** → 丧失对应一侧。

### 3.4 易位的三种输入编码

`resolveMove()` 同时接受（因为 UI、PGN、引擎各用一种）：

| 编码 | 例子 | 来源 |
|---|---|---|
| 王的真实目标格 | `e1g1` | 常规 UCI / 点击 |
| **王吃自己的车**（UCI/Stockfish 的 Chess960 写法） | `e1h1` | Stockfish、`moveToUci()` 输出 |
| 显式 `castle` 字段 | `{ from, to, castle: 'king' }` | 内部 / 测试 |

反过来，`moveToUci()` 在 `move.castle` 为真时输出"王 → 车原始格"的形式（Chess960 约定）。

### 3.5 SAN 中的易位

SAN **永远**写作 `O-O` / `O-O-O`（`moveToSan()` 在 `move.castle` 分支直接返回），不会写成"王吃车"。易位权本身不影响记谱。

---

## 4. FEN、SAN、PGN、UCI（`src/core/notation.ts`）

### 4.1 FEN

- **内部交换格式一律是 Shredder-FEN**（易位字段用车的纵线字母）。
- `toFenWithStandardCastling()` 在**双方都还是 a1/h1 式标准车**（`canUseTraditionalCastling()`）时改印经典的 `KQkq`，用于对外兼容。
- `fromFen()` 解析很宽容：
  - 易位字段为空或部分缺失时，**从棋盘反推**车的原始纵线（这让"只给一个起始摆放的 FEN"也能正常工作）。
  - 调用方可通过 `castlingFiles` 直接给出权威的纵线信息（存档的中局局面必需，因为此时王已不在原始格）。
  - `strictCastling: false`（默认）时，**悬空的易位权会被静默丢弃**（与多数引擎一致），而不会抛错。
  - Shredder 字母点名具体车线，因而具有**权威性**；`K`/`Q` 只表达"哪一侧"，因此绝不覆盖已知的车线。
  - 过路兵格只有在"目标格为空**且**其后方确实是对方刚双步推进的兵"时才被接受。

### 4.2 SAN

- `moveToSan(position, move)` —— 必须在**走子之前**调用。王兵升变写 `=Q`，将军/将死加 `+` / `#`。
- `disambiguate()` —— 给出**最小**的消歧信息：优先纵线，其次横线，都不够时"纵线+横线"。
- `sanToMove(position, san)` —— 解析容错，且有意处理一个真实存在的歧义：
  > `Bxc6` 与 `bxc6` 只差大小写，却指不同的子。因此先按严格读法解析（大写 = 棋子，小写纵线 = 兵吃），失败后再尝试另一种读法，避免手写或导入的棋谱因为大小写被拒。
  - 支持 `0-0` / `O-O-O`（含 `+`）、剥离 `!?` 与 en/em dash、缺省 `=Q` 时默认后（仅在没有其他升变候选时）。
- `uciToMove()` / `moveToUci()` —— UCI 双向转换（见 3.4）。

### 4.3 PGN

- `buildPgn()` —— 表头 `Event/Site/Date/Round/White/Black/Result`；`isChess960StartFen()` 判定为非标准布局时补上 `Variant: "Chess960"`、`SetUp: "1"`、`FEN`；再追加 `extraHeaders`（`Chess960Index`、`Chess960BackRank`，使起始布局可完整还原）。movetext 默认按 80 列折行（`lineWidth: 0` 关闭）。
- `parsePgn()` —— 最小可用读取器：表头、起始 FEN、SAN movetext；**剥离** `{注释}`、`; 行注释`、`$N NAG`、`(变例)`（支持一层嵌套括号）。
- `replaySans()` —— 从起始 FEN 重放 SAN，返回已成功应用的着法与 `failedAt`。

---

## 5. Chess960 起始局面生成（`src/core/chess960/generate.ts`）

使用 **Reinhard Scharnagl 编号**（0..959，Chess960 文献与多数引擎/库采用的编号）。构造公式：

| 步骤 | 放什么 | 由编号的哪一部分决定 |
|---|---|---|
| 1 | 白格象 → b1/d1/f1/h1 之一 | `n % 4` |
| 2 | 黑格象 → a1/c1/e1/g1 之一 | `⌊n / 4⌋ % 4` |
| 3 | 后 → 剩余 6 格之一 | `⌊n / 16⌋ % 6` |
| 4 | 双马 → 剩余 5 格中的 2 格 | `⌊n / 96⌋ % 10`（10 个字典序数对） |
| 5 | 剩余 3 格，从左到右 | 车、王、车 |

由构造保证：象必在异色格、王必在两车之间，因此 **0..959 每一个编号都是合法布局，且映射是双射**。

导出的 API：

| 函数 | 作用 |
|---|---|
| `backRankFromIndex(index)` | 编号 → 底线布局（如 `"nrbbqknr"`） |
| `indexFromBackRank(backRank)` | 布局 → 编号（`backRankFromIndex` 的逆） |
| `normalizeBackRank(s)` / `isValidBackRank(s)` | 校验并规范化（恰好 1 王 1 后 2 车 2 象 2 马、象异色、王在两车之间） |
| `backRankFiles(s)` | 取出 `{ king, kingRook, queenRook }` 三条纵线 |
| `backRankToStartFen(s)` | 生成起始 FEN（Shredder 易位字段） |
| `randomIndex()` | 随机编号，**优先使用 `crypto.getRandomValues`** |
| `generatePosition({index?, rng?})` | 构造完整 `Chess960Position`；`rng` 可注入以便测试确定性 |
| `generateAll()` | 全部 960 个布局，按 Scharnagl 序 |
| `referenceBackRanks()` | **独立暴力参考实现**：枚举 `{r,r,n,n,b,b,q,k}` 的全部 5040 个排列，筛出 960 个合法布局。测试用它做交叉验证。 |
| `startBoard(s)` / `startCastlingContext(s)` | 生成起始棋盘 / 起始易位上下文 |
| `backRankFromFen(fen)` | 从 FEN 提取白方底线（若合法） |
| `backRankFromSeed(seed)` | 由数字种子得到确定布局（xorshift），供测试/回放 |

已知锚点（测试中锁定）：`0 = "bbqnnrkr"`、`518 = "rnbqkbnr"`（即标准象棋）、`959 = "rkrnnqbb"`。

---

## 6. 不变量清单（改代码时请守住）

1. `Position` 是合法性的唯一来源；UI 不得直接改棋盘。
2. 内部 FEN 用 Shredder 易位字段；`KQkq` 只在 `canUseTraditionalCastling()` 成立时对外输出。
3. `castlingFiles` 是**权威**的车线信息，不能靠棋盘反推（王可能已离开底线）。
4. 只有王的路径受"被攻击格"限制，车不受限。
5. `Position.play()` 只有一层撤销；任何合法性探测都必须像 `legalMoves()` 那样保存并恢复 `previous` / `lastMove`。
6. 撤销必须从 `stateBefore` 快照重建，不能依赖 FEN 往返。
7. `src/core/**` 不得 import React 或任何 DOM API。

---

**相关文档**：[整体架构](./architecture.md) · [AI 引擎](./engine.md) · [测试策略](./testing.md)
