import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * End-to-end coverage of the acceptance criteria: generate a Chess960 position, play moves in
 * both modes, castle, undo, resign, and export/share the game.
 *
 * Each test starts from a clean slate (localStorage cleared) so a running dev server and a
 * previous test cannot leak state into the next one.
 */

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * A tiny endgame where **both** colours can castle immediately, so the castling test does not
 * need to shuffle pieces out of the way first. Note the black rooks on a8/h8 — `4k3` would be a
 * king on its own.
 */
const CASTLING_FEN = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

/**
 * Open the app on a clean slate.
 *
 * The interface ships bilingual with Chinese as the default, while the assertions in this file are
 * written against the English wording — so the persisted settings are seeded with `language: 'en'`
 * unless a test asks for something else. Pass `{ language: null }` to exercise the real default.
 */
async function openApp(page: Page, options: { language?: 'zh' | 'en' | null } = {}): Promise<void> {
  const language = options.language === undefined ? 'en' : options.language;
  await page.addInitScript((seeded) => {
    globalThis.localStorage.clear();
    if (seeded) {
      // Mirrors the zustand `persist` envelope for the `chess960:settings` key (version 2).
      globalThis.localStorage.setItem(
        'chess960:settings',
        JSON.stringify({ state: { language: seeded }, version: 2 }),
      );
    }
  }, language);
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
}

/** Click a square by its algebraic name (works for both orientations). */
async function clickSquare(page: Page, square: string): Promise<void> {
  await page.getByTestId(`square-${square}`).click();
}

/** Read the FEN the app is currently showing. */
async function currentFen(page: Page): Promise<string> {
  return (await page.getByTestId('fen-text').textContent()) ?? '';
}

/** Current SAN list, straight from the store (used for failure messages). */
async function sansFromStore(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as { __chess960?: { game: { getState: () => { game: { sans: string[] } } } } })
      .__chess960?.game;
    return store?.getState().game.sans ?? [];
  });
}

/**
 * Play a move with two clicks and wait until the ply counter advances. Waiting here keeps the
 * tests deterministic: React must re-render the click targets between moves, so the assertion is
 * what makes the click sequence reliable rather than an arbitrary sleep.
 */
async function playMove(page: Page, from: string, to: string): Promise<void> {
  const before = await page.evaluate(() => {
    const store = (
      globalThis as unknown as { __chess960?: { game: { getState: () => { moveCount: number } } } }
    ).__chess960?.game;
    return store?.getState().moveCount ?? 0;
  });
  await clickSquare(page, from);
  await clickSquare(page, to);
  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const store = (
              globalThis as unknown as { __chess960?: { game: { getState: () => { moveCount: number } } } }
            ).__chess960?.game;
            return store?.getState().moveCount ?? 0;
          }),
        { timeout: 5_000, message: `${from}${to} should be played` },
      )
      .toBeGreaterThan(before);
  } catch (error) {
    throw new Error(
      `${from}${to} was not played. Moves so far: ${JSON.stringify(await sansFromStore(page))}. ${String(error)}`,
    );
  }
}

/** Undo and wait until the ply counter decreases. */
async function undo(page: Page): Promise<void> {
  const before = await page.evaluate(() => {
    const store = (
      globalThis as unknown as { __chess960?: { game: { getState: () => { moveCount: number } } } }
    ).__chess960?.game;
    return store?.getState().moveCount ?? 0;
  });
  await page.getByTestId('undo').click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const store = (
            globalThis as unknown as { __chess960?: { game: { getState: () => { moveCount: number } } } }
          ).__chess960?.game;
          return store?.getState().moveCount ?? 0;
        }),
      { timeout: 5_000 },
    )
    .toBeLessThan(before);
}

/** Start a game from an explicit FEN through the New game dialog. */
async function startFromFen(page: Page, fen: string, mode: 'local' | 'ai' = 'local', level?: string): Promise<void> {
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('new-game-dialog')).toBeVisible();
  await page.getByRole('radio', { name: /Custom FEN/i }).check();
  await page.getByTestId('fen-input').fill(fen);
  await page.getByTestId('dialog-mode-select').selectOption(mode);
  if (level) await page.getByTestId('dialog-level-select').selectOption(level);
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('new-game-dialog')).toBeHidden();
}

test.describe('Chess960 board', () => {
  test('loads with a random Chess960 starting position', async ({ page }) => {
    await openApp(page);

    // A random position: the app shows its index and the corresponding back rank.
    await expect(page.getByTestId('index-badge')).toContainText('Chess960 #');
    const badge = await page.getByTestId('index-badge').textContent();
    const index = Number(/Chess960 #(\d+)/.exec(badge ?? '')?.[1]);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThanOrEqual(959);

    await expect(page.getByTestId('status-text')).toContainText('White to move');
    await expect(page.getByTestId('fen-text')).toContainText(' w ');

    // Pawns on the second/seventh ranks and mirrored back ranks.
    const placement = await page.getByTestId('board').getAttribute('data-placement');
    const ranks = (placement ?? '').split('/');
    expect(ranks).toHaveLength(8);
    expect(ranks[1]).toBe('pppppppp');
    expect(ranks[6]).toBe('PPPPPPPP');
    expect(ranks[7]?.toLowerCase()).toBe(ranks[0]);
  });

  test('plays a local game with click-to-move and updates the score sheet', async ({ page }) => {
    await openApp(page);
    await startFromFen(page, STANDARD_START_FEN);

    await playMove(page, 'e2', 'e4');
    await expect(page.getByTestId('movelist')).toContainText('e4');
    await expect(page.getByTestId('status-text')).toContainText('Black to move');

    await playMove(page, 'e7', 'e5');
    await expect(page.getByTestId('movelist')).toContainText('e5');

    await playMove(page, 'g1', 'f3');
    await expect(page.getByTestId('movelist')).toContainText('Nf3');
    await expect(page.getByTestId('status-text')).toContainText('Black to move');
  });

  test('completes a castling move in a Chess960 position', async ({ page }) => {
    await openApp(page);
    await startFromFen(page, CASTLING_FEN);

    await playMove(page, 'e1', 'g1');
    await expect(page.getByTestId('movelist')).toContainText('O-O');
    // Both pieces ended up on their castling squares.
    await expect(page.getByTestId('square-g1').getByTestId('piece-g1')).toBeVisible();
    await expect(page.getByTestId('square-f1').getByTestId('piece-f1')).toBeVisible();

    await playMove(page, 'e8', 'c8');
    await expect(page.getByTestId('movelist')).toContainText('O-O-O');
    await expect(page.getByTestId('square-c8').getByTestId('piece-c8')).toBeVisible();
    await expect(page.getByTestId('square-d8').getByTestId('piece-d8')).toBeVisible();
  });

  test('undo restores the previous position', async ({ page }) => {
    await openApp(page);
    await startFromFen(page, STANDARD_START_FEN);

    await playMove(page, 'd2', 'd4');
    await playMove(page, 'd7', 'd5');
    await expect(page.getByTestId('movelist')).toContainText('d5');
    const afterTwoPlies = await currentFen(page);
    expect(afterTwoPlies, `unexpected FEN: ${afterTwoPlies}`).toContain(' w ');

    await undo(page);
    // One ply back in local mode: d5 is gone and it is Black's move again.
    await expect(page.getByTestId('fen-text')).toContainText(' b ');
    const afterFirstUndo = await currentFen(page);
    expect(afterFirstUndo).not.toBe(afterTwoPlies);
    await expect(page.getByTestId('status-text')).toContainText('Black to move');
    await expect(page.getByTestId('movelist')).toContainText('d4');

    await undo(page);
    await expect(page.getByTestId('movelist')).toContainText('No moves yet');
    expect(await currentFen(page)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w AHah - 0 1');
  });

  test('flips the board', async ({ page }) => {
    await openApp(page);
    const board = page.getByTestId('board');
    await expect(board).toHaveClass(/board--white/);
    await page.getByTestId('flip').click();
    await expect(board).toHaveClass(/board--black/);
  });

  test('resigns a game', async ({ page }) => {
    await openApp(page);
    page.on('dialog', (dialog) => void dialog.accept());
    await playMove(page, 'e2', 'e4');
    // In local mode the side to move resigns.
    await page.getByTestId('resign').click();
    await expect(page.getByTestId('status-text')).toContainText('wins by resignation');
  });

  test('copies the FEN and exports a PGN with Chess960 headers', async ({ page }) => {
    await openApp(page);
    await playMove(page, 'e2', 'e4');

    await page.getByTestId('copy-fen').click();
    await expect(page.getByTestId('status-message')).toContainText('FEN copied');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const shown = await currentFen(page);
    expect(clipboard).toBe(shown);
    expect(clipboard.endsWith(' e3 0 1')).toBe(true);

    await page.getByTestId('show-pgn').click();
    const pgn = await page.getByTestId('pgn-text').inputValue();
    expect(pgn).toContain('[Variant "Chess960"]');
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain('[FEN "');
    expect(pgn).toContain('1. e4');
  });

  test('starts a game from a specific Chess960 index', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('new-game').click();
    await page.getByRole('radio', { name: /index/i }).check();
    await page.getByTestId('index-input').fill('518');
    await expect(page.getByTestId('index-preview')).toHaveText('rnbqkbnr');
    await page.getByTestId('start-game').click();

    await expect(page.getByTestId('index-badge')).toHaveText(/Chess960 #518/);
    await expect(page.getByTestId('fen-text')).toContainText('rnbqkbnr/pppppppp');
  });

  test('promotes a pawn through the dialog', async ({ page }) => {
    await openApp(page);
    await startFromFen(page, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    // The move is deliberately *not* played yet: it opens the promotion dialog, so `playMove`
    // (which waits for the ply counter to advance) cannot be used here.
    await clickSquare(page, 'a7');
    await clickSquare(page, 'a8');
    await expect(page.getByTestId('promotion-dialog')).toBeVisible();
    await page.getByTestId('promote-n').click();
    await expect(page.getByTestId('promotion-dialog')).toBeHidden();
    await expect(page.getByTestId('movelist')).toContainText('=N');
  });

  test('renders a usable board on a phone viewport', async ({ page }) => {
    await openApp(page);
    const board = await page.getByTestId('board').boundingBox();
    const viewport = page.viewportSize();
    expect(board).not.toBeNull();
    expect(viewport).not.toBeNull();
    // The board fits the viewport width and stays square.
    expect(Math.abs((board?.width ?? 0) - (board?.height ?? 0))).toBeLessThan(2);
    expect(board?.width ?? 0).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
    await expect(page.getByTestId('new-game')).toBeVisible();
  });
});

test.describe('human vs engine', () => {
  test('the engine answers a human move', async ({ page }) => {
    await openApp(page);
    await startFromFen(page, STANDARD_START_FEN, 'ai', 'easy');
    await expect(page.getByTestId('engine-label')).toBeVisible();

    await playMove(page, 'e2', 'e4');
    // The engine plays within its time budget (the built-in fallback is fast). Assert on the SAN
    // list rather than the score sheet's text: the moves are separate buttons, so `textContent`
    // concatenates them without separators ("1.e4b5").
    await expect
      .poll(async () => (await sansFromStore(page)).length, { timeout: 30_000 })
      .toBeGreaterThan(1);
    const sans = await sansFromStore(page);
    expect(sans[0]).toBe('e4');
    expect(sans[1]).toBeTruthy();
    await expect(page.getByTestId('status-text')).toContainText('White to move');
  });

  test('offers a hint in AI mode', async ({ page }) => {
    await openApp(page);
    await startFromFen(page, STANDARD_START_FEN, 'ai', 'easy');
    await page.getByTestId('hint').click();
    await expect(page.getByTestId('hint-label')).toContainText('Hint:', { timeout: 30_000 });
  });
});

test.describe('interface language', () => {
  test('defaults to Chinese', async ({ page }) => {
    await openApp(page, { language: null });

    await expect(page.getByTestId('new-game')).toHaveText('新对局');
    await expect(page.getByTestId('status-text')).toContainText('走棋');
    await expect(page.getByTestId('mode-label')).toContainText('本地双人对弈');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page).toHaveTitle(/Fischer Random 国际象棋/);
  });

  test('switches to English without a reload', async ({ page }) => {
    await openApp(page, { language: null });
    await expect(page.getByTestId('new-game')).toHaveText('新对局');

    await page.getByTestId('open-settings').click();
    await page.getByTestId('language-select').selectOption('en');

    await expect(page.getByTestId('new-game')).toHaveText('New game');
    await expect(page.getByTestId('settings-dialog')).toContainText('Settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(/play Fischer Random chess/);

    // The choice is persisted. (`openApp`'s init script clears localStorage on every navigation,
    // so a reload cannot be used to prove persistence — read the stored envelope instead.)
    const stored = await page.evaluate(() => globalThis.localStorage.getItem('chess960:settings') ?? '');
    expect(stored).toContain('"language":"en"');
  });

  test('renders a status message that was produced before the switch in the new language', async ({ page }) => {
    await openApp(page, { language: null });

    // Produce a message while the interface is Chinese...
    await page.getByTestId('copy-fen').click();
    await expect(page.getByTestId('status-message')).toContainText('已复制', { timeout: 10_000 });

    // ...then switch: the message must re-render in English, because the store keeps a descriptor
    // rather than a rendered string.
    await page.getByTestId('open-settings').click();
    await page.getByTestId('language-select').selectOption('en');
    await expect(page.getByTestId('status-message')).toContainText('FEN copied');
  });
});
