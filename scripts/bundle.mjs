// Tiny esbuild driver. The pnpm store here does not expose an `esbuild` CLI shim, so the
// JS API is used directly to bundle TypeScript entry points for quick standalone probes.
// Usage: node scripts/bundle.mjs <entry.ts> <out.mjs>
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function findEsbuildMain() {
  const pnpmDir = resolve(root, 'node_modules/.pnpm');
  for (const name of readdirSync(pnpmDir).filter((entry) => entry.startsWith('esbuild@'))) {
    const main = resolve(pnpmDir, name, 'node_modules/esbuild/lib/main.js');
    try {
      require.resolve(main);
      return main;
    } catch {
      // keep looking
    }
  }
  throw new Error('esbuild not found in node_modules/.pnpm');
}

const [entry, outfile] = process.argv.slice(2);
if (!entry || !outfile) {
  console.error('usage: node scripts/bundle.mjs <entry.ts> <out.mjs>');
  process.exit(2);
}

const esbuild = await import(pathToFileURL(findEsbuildMain()).href);
await esbuild.build({
  entryPoints: [resolve(process.cwd(), entry)],
  outfile: resolve(process.cwd(), outfile),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'warning',
});
console.log(`bundled ${entry} -> ${outfile}`);
