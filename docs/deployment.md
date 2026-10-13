# 构建与部署

本项目产出的是**纯静态文件**：没有服务端、没有 API、没有数据库、没有环境变量。`pnpm build` 之后把 `dist/` 上传到任意静态托管即可。

---

## 1. 构建流程

```
pnpm build
  └─ tsc -b            # 只做类型检查（noEmit），两个 project：app + node
  └─ vite build        # esbuild 转译 + Rollup 打包 → dist/
```

### 实测产物（本机 `pnpm build`，Node 20.20.0 / pnpm 10.24.0）

```
✓ 66 modules transformed
dist/index.html                           1.16 kB │ gzip:  0.79 kB
dist/assets/builtin.worker-Cf16DDs4.js   22.48 kB
dist/assets/index-C2ybFMtL.css           10.20 kB │ gzip:  2.81 kB
dist/assets/index-DtSNK49t.js           311.32 kB │ gzip: 97.29 kB │ map: 1,405.20 kB
✓ built in 2.08s
```

要点：

- **只有一个 JS chunk**（`index-*.js`），外加**一个独立的 Worker chunk**（`builtin.worker-*.js`）。引擎被 Vite 自动切出去，不阻塞首屏。
- 中英双语的两套文案表全部内联在主包里，代价约 **+14 kB 原始 / +5 kB gzip**（对比单语言时的 296.85 kB / 92.47 kB）。这点体积换来零 i18n 运行时依赖与零网络请求，是划算的；如果将来语言变多，再考虑按需加载。
- 文件名带内容哈希（`-DtSNK49t`），所以可以放心地做长期缓存。
- `sourcemap: true` 会额外产出 `.map` 文件（体积比 JS 本身大得多）。**如果不想公开源码**，请在 `vite.config.ts` 里把 `build.sourcemap` 改为 `false` 后再发布。
- `base: './'` 让所有资源引用是**相对路径**，因此 `dist/` 可以放在任意子路径下（GitHub Pages 的 project site、S3 前缀、反向代理的子目录）而无需改配置。

---

## 2. 本地预览构建产物

```bash
pnpm build
pnpm preview        # http://localhost:4173
```

`pnpm preview` 使用 `--port 4173 --strictPort`。Playwright 的端到端测试也正是跑在这个地址上（见 [testing.md](./testing.md)）。

---

## 3. 部署到各托管平台

### 3.1 Vercel

仓库已含 [`vercel.json`](../vercel.json)：

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "installCommand": "pnpm install",
  "framework": "vite",
  "cleanUrls": true,
  "headers": [
    { "source": "/assets/(.*)",  "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/engines/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800" }] },
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
    ]}
  ]
}
```

操作：把仓库导入 Vercel 即可，框架预设会自动识别 Vite。

### 3.2 Netlify

仓库已含 [`netlify.toml`](../netlify.toml)：

```toml
[build]
  command = "pnpm build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
```

缓存策略与 Vercel 一致：`/assets/*` 一年不可变，`/engines/*` 一周，`/index.html` 必须重新验证。

### 3.3 GitHub Pages

因为资源是相对路径，**不需要**改 `base`：

```bash
pnpm build
npx gh-pages -d dist
```

或者用 GitHub Actions 把 `dist/` 作为 artifact 发布。

### 3.4 任意静态主机（S3 / OSS / Nginx / 对象存储）

直接上传 `dist/` 的内容即可。若将来引入前端路由，需要把未知路径回退到 `index.html`（当前是单视图应用，**不需要**这条规则）。

---

## 4. 缓存策略

| 路径 | 建议 | 原因 |
|---|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` | 文件名含内容哈希，内容变了文件名就变 |
| `/engines/*` | `public, max-age=604800` | 引擎文件不带哈希，用一周的折中值 |
| `/index.html` | `public, max-age=0, must-revalidate` | 入口必须立刻拿到新的哈希引用，否则用户会一直用旧版 |

---

## 5. 换成多线程 Stockfish 时需要额外配置

内置引擎与**单线程** Stockfish 构建都不需要特殊响应头。只有当你要换成使用 `SharedArrayBuffer` 的**多线程**构建时，才需要这两个头：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

它们在三处都**已经写好但被注释掉**，用到时打开并保持三处一致：

1. `vite.config.ts` → `server.headers`（开发期）
2. `netlify.toml` → 文件末尾的注释块
3. `vercel.json` → 需要自行补上 `headers` 条目

漏配的典型症状：引擎可以加载但线程数始终为 1，或浏览器控制台报 `SharedArrayBuffer is not defined`。

---

## 6. 发布前检查清单

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全绿（当前 156 个用例）
- [ ] `pnpm build` 通过
- [ ] `pnpm test:e2e` 全绿（首次需 `pnpm test:e2e:install`）
- [ ] `pnpm preview` 里手动走一遍：随机布局 → 走子 → 易位 → 撤销 → 导出 PGN
- [ ] 确认默认界面语言是中文，且"设置 → 界面 → 语言"能切到 English
- [ ] 确认 `dist/engines/` 下**没有**意外提交的 Stockfish（若有，需遵守 GPL-3.0-or-later 并公开对应源码）
- [ ] 决定是否保留 `sourcemap`
- [ ] 如用了多线程引擎，确认 COOP/COEP 三处一致

---

## 7. 许可注意事项

- 本项目自身是 **MIT**（见 [`LICENSE`](../LICENSE)）。
- **Stockfish 不随仓库分发。** 它是 **GPL-3.0-or-later**。一旦你把 Stockfish 构建放进 `public/engines/` 并部署，就等于在分发 GPL 软件——你需要公开对应源码与许可，并在自己的致谢里注明。这个挂载点被刻意做成"可选"，就是为了让默认检出保持 MIT 干净。
- 棋子使用 Unicode 字符 + 系统字体渲染，因此**没有字体文件**被再分发。

---

**相关文档**：[技术栈](./tech-stack.md) · [开发指南](./development.md) · [测试策略](./testing.md)
