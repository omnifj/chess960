import { expect, test } from '@playwright/test';

/** Temporary: exercise the engine worker directly in the browser. */
test('engine worker handshake', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (message) => logs.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => logs.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));

  await page.addInitScript(() => {
    globalThis.localStorage.clear();
    globalThis.localStorage.setItem('DSH_DEBUG_ENGINE', '1');
  });
  await page.goto('/');
  await page.evaluate(() => {
    // Surface the engine's own start-up logging.
    (globalThis as unknown as { __debugEngine: boolean }).__debugEngine = true;
  });

  // Which worker assets exist and what does the page try to load?
  const workerUrls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('worker')) workerUrls.push(request.url());
  });

  const result = await page.evaluate(async () => {
    const worker = new Worker(new URL('./assets/', location.href).href, { type: 'module' });
    void worker;
    return 'ok';
  });
  console.log('dummy worker:', result, 'requests:', JSON.stringify(workerUrls));

  // Now the real thing: drive the app's engine store.
  const driven = await page.evaluate(async () => {
    const store = (globalThis as unknown as { __chess960?: { engine?: { getState: () => Record<string, unknown> } } })
      .__chess960?.engine;
    return store ? 'engine store present' : 'no engine store';
  });
  console.log('engine store:', driven);

  // Does the built-in worker module even exist at the URL the app will use?
  const assets = await page.evaluate(async () => {
    const response = await fetch('./', { method: 'GET' });
    const html = await response.text();
    const script = /src="([^"]+index-[^"]+\.js)"/.exec(html)?.[1] ?? 'not found';
    // The worker asset name is baked into the bundle; find it there.
    const bundle = await (await fetch(script)).text();
    const workerPath = /assets\/builtin\.worker-[A-Za-z0-9_-]+\.js/.exec(bundle)?.[0] ?? 'not found';
    const workerResponse = workerPath === 'not found' ? null : await fetch(`./${workerPath}`);
    return { script, workerPath, workerStatus: workerResponse?.status ?? null, workerType: workerResponse?.headers.get('content-type') ?? null };
  });
  console.log('assets:', JSON.stringify(assets));

  const direct = await page.evaluate(async () => {
    const response = await fetch('./', { method: 'GET' });
    const html = await response.text();
    const script = /src="([^"]+index-[^"]+\.js)"/.exec(html)?.[1] ?? '';
    const bundle = await (await fetch(script)).text();
    const workerPath = /assets\/builtin\.worker-[A-Za-z0-9_-]+\.js/.exec(bundle)?.[0] ?? '';
    if (!workerPath) return 'worker path not found in bundle';
    return new Promise<string>((resolve) => {
      const worker = new Worker(`./${workerPath}`, { type: 'module', name: 'probe' });
      const timer = setTimeout(() => resolve('TIMEOUT: no message from worker'), 8000);
      worker.addEventListener('message', (event) => {
        clearTimeout(timer);
        resolve(`worker said: ${JSON.stringify(event.data)}`);
      });
      worker.addEventListener('error', (event) => {
        clearTimeout(timer);
        resolve(`worker error: ${(event as ErrorEvent).message}`);
      });
      worker.postMessage('uci');
    });
  });
  console.log('direct worker:', direct);

  await page.getByTestId('new-game').click();
  await page.getByTestId('dialog-mode-select').selectOption('ai');
  await page.getByTestId('dialog-level-select').selectOption('easy');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('new-game-dialog')).toBeHidden();

  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => {
    const store = (globalThis as unknown as { __chess960?: { engine?: { getState: () => Record<string, unknown> } } })
      .__chess960?.engine?.getState();
    return { name: store?.['name'], ready: store?.['ready'], thinking: store?.['thinking'], error: store?.['error'] };
  });
  console.log('engine state:', JSON.stringify(state));
  console.log('worker requests:', JSON.stringify(workerUrls));
  console.log('logs:', JSON.stringify(logs.slice(0, 20), null, 1));
});
