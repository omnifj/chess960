# Engine binaries go here (optional)

The app looks for `stockfish.js` in this directory at startup:

```
public/engines/stockfish/stockfish.js     <- required for the Stockfish engine
public/engines/stockfish/stockfish.wasm   <- if the build ships a wasm file
```

If the file is missing the app **falls back to the built-in engine**, logs nothing scary, and
shows "Built-in engine" in the status bar. Nothing breaks — Stockfish is purely an upgrade.

## Adding a build

1. Download a **browser/wasm** build of Stockfish, for example:
   - <https://www.npmjs.com/package/stockfish.js>
   - <https://github.com/lichess-org/stockfish.wasm>
   - <https://github.com/niklasf/stockfish.wasm>
2. Copy the single-threaded build in here so the path above exists.
3. Reload the page. The status bar should read "Stockfish (WASM)".

The worker wrapper sets `UCI_Chess960 true` before the first search, which is what makes
Chess960 castling work — Stockfish encodes it as "king captures its own rook" (`e1h1`), and the
app translates that back into a castling move.

## Licence warning

**Stockfish is GPL-3.0-or-later.** Adding it to a deployed site means you are distributing GPL
software: keep the licence file that ships with the build, make the corresponding source
available, and mention it in your credits. This directory is empty in the repository so the
default checkout stays MIT-clean.

## Multi-threaded builds

Multi-threaded builds need `SharedArrayBuffer`, which requires these response headers on the
whole site:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`vite.config.ts`, `netlify.toml` and `vercel.json` all contain them commented out for that
reason. Enable them in all three if you use such a build.
