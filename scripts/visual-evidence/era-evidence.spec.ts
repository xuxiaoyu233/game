import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Evidence lands in a git-tracked directory: reviewers must be able to see the seven eras without
// re-running the injection. `artifacts/` is gitignored and only used for local scratch.
const ARTIFACTS_DIR = 'docs/证据/时代演进';

const DB_NAME = 'skill-prototype-v1-development';
const STORE = 'snapshots';
const MAIN = 'main';

const SKILL_IDS = [
  'mining',
  'metalworking',
  'woodcutting',
  'fishing',
  'firemaking',
  'cooking',
  'crafting',
  'herbalism',
  'herblore',
  'farming',
  'agility',
  'thieving',
] as const;

const TOOL_IDS = [
  'mining-tool',
  'woodcutting-tool',
  'fishing-tool',
  'metalworking-tool',
  'crafting-tool',
] as const;

// Every skill shares one curve (content 10.0.0: 30 levels, ceiling 56,548 XP), and eras are read
// from the cumulative share of that curve (bands at 0/1/5/15/35/60/85%), so each mid-game case
// gives every skill the same XP. We round the band's lower bound UP (ceil) rather than to nearest:
// getEraId requires `percent >= band`, and rounding to nearest can land a hair below the bound
// (e.g. 56548*0.01 = 565.48 -> round 565 -> 0.9989% < 1%), which would map bronze to primitive.
// ceil guarantees the injected XP meets the band's lower bound exactly; the gaps between bands
// (>=4%) are far larger than the <0.002% overshoot, so no case spills into the next era.
const XP_CEILING = 56_548;
const bandXp = (percent: number): number => Math.ceil((XP_CEILING * percent) / 100);

interface EraCase {
  readonly id: string;
  readonly skillXp: Record<string, number> | number;
  readonly toolLevels: Record<string, number> | number;
}

const ALL_TOOLS_1 = Object.fromEntries(TOOL_IDS.map((id) => [id, 1]));

const CASES: readonly EraCase[] = [
  { id: 'primitive', skillXp: 0, toolLevels: ALL_TOOLS_1 },
  { id: 'bronze', skillXp: bandXp(1), toolLevels: ALL_TOOLS_1 },
  { id: 'verdant', skillXp: bandXp(5), toolLevels: ALL_TOOLS_1 },
  { id: 'industrial', skillXp: bandXp(15), toolLevels: ALL_TOOLS_1 },
  { id: 'precision', skillXp: bandXp(35), toolLevels: ALL_TOOLS_1 },
  { id: 'aurora', skillXp: bandXp(60), toolLevels: ALL_TOOLS_1 },
  {
    id: 'synthetic',
    skillXp: XP_CEILING,
    toolLevels: {
      'mining-tool': 5,
      'woodcutting-tool': 5,
      'fishing-tool': 5,
      'metalworking-tool': 5,
      'crafting-tool': 5,
    },
  },
];

test('capture screenshots for all seven eras at both compact sizes', async ({ page }) => {
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await page.goto('/');

  for (const eraCase of CASES) {
    const skillXpMap =
      typeof eraCase.skillXp === 'number'
        ? Object.fromEntries(SKILL_IDS.map((id) => [id, eraCase.skillXp]))
        : eraCase.skillXp;
    const toolLevelsMap =
      typeof eraCase.toolLevels === 'number'
        ? Object.fromEntries(TOOL_IDS.map((id) => [id, eraCase.toolLevels]))
        : eraCase.toolLevels;

    // Inject a mutated save into IndexedDB, then reload so the app derives the target era.
    await page.evaluate(
      (args) => {
        const { dbName, storeName, mainKey, skillXp, toolLevels, skillIds, toolIds } = args;
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName, 1);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(storeName)) {
              request.result.createObjectStore(storeName);
            }
          };
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const getRequest = store.get(mainKey);
            getRequest.onsuccess = () => {
              const raw: unknown = getRequest.result;
              if (typeof raw !== 'string') {
                reject(new Error(`IndexedDB main save is not a string: ${typeof raw}`));
                return;
              }
              const save = JSON.parse(raw) as Record<string, unknown>;
              for (const id of skillIds) {
                (save.skillXp as Record<string, number>)[id] = skillXp[id] ?? 0;
              }
              for (const id of toolIds) {
                (save.toolLevels as Record<string, number>)[id] = toolLevels[id] ?? 1;
              }
              save.currentActivity = null;
              save.returnReport = null;
              save.buffs = [];
              const putRequest = store.put(JSON.stringify(save), mainKey);
              putRequest.onsuccess = () => resolve();
              putRequest.onerror = () => reject(putRequest.error ?? new Error('IDB put failed'));
            };
            getRequest.onerror = () => reject(getRequest.error ?? new Error('IDB get failed'));
          };
          request.onerror = () => reject(request.error ?? new Error('IDB open failed'));
        });
      },
      {
        dbName: DB_NAME,
        storeName: STORE,
        mainKey: MAIN,
        skillXp: skillXpMap,
        toolLevels: toolLevelsMap,
        skillIds: SKILL_IDS,
        toolIds: TOOL_IDS,
      },
    );

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('main.skill-prototype')).toHaveAttribute('data-era', eraCase.id, {
      timeout: 10_000,
    });

    // `data-era` is written on the first render, before the skill list and the tab strip exist;
    // waiting for the era alone once produced screenshots with an empty body (only the header and
    // the status card in frame). So also wait for the full list, the tab strip, webfonts, and one
    // settled frame before capturing, and re-wait two frames after each viewport resize.
    const skillCards = page.locator('[data-testid^="skill-card-"]');
    await expect(skillCards).toHaveCount(12, { timeout: 10_000 });
    await expect(skillCards.first()).toBeVisible();
    await expect(page.getByTestId('tab-training')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    for (const { width, height, suffix } of [
      { width: 420, height: 600, suffix: '420x600' },
      { width: 360, height: 480, suffix: '360x480' },
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      // Two frames: one for the resize layout, one so the aurora and progress bars paint at the
      // final size instead of mid-transition.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
          }),
      );
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, `era-${eraCase.id}-${suffix}.png`),
        fullPage: false,
      });
    }
  }
});
