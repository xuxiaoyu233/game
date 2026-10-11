import { expect, test, type Page } from '@playwright/test';
import { EXPEDITION_V13_DEFINITION } from '../../src/content/expedition-v13';
import {
  advanceExpedition,
  applyExpeditionCommand,
  createExpedition,
} from '../../src/domain/expedition/engine';
import type { ExpeditionCommand, SaveBundle } from '../../src/domain/expedition/types';
import { encodeExpeditionSave } from '../../src/persistence/expedition-codec';

const definition = EXPEDITION_V13_DEFINITION;
const worldId = 'world-unlisted-city';
const fixtureTime = Date.UTC(2026, 9, 7, 12, 0, 0);

function command(state: SaveBundle, value: ExpeditionCommand): SaveBundle {
  const result = applyExpeditionCommand(state, definition, value);
  if (!result.ok) throw new Error(`Browser fixture rejected ${value.kind}: ${result.error}`);
  return result.state;
}

function createCoreReturn(): SaveBundle {
  let state = createExpedition(definition, fixtureTime);
  state = command(state, { kind: 'enter-world', worldId, seed: 18 });
  state = advanceExpedition(state, definition, fixtureTime + 90_000);
  state = command(state, { kind: 'build', buildingId: 'shelter' });
  state = command(state, { kind: 'fight-wave' });
  state = command(state, {
    kind: 'choose-event',
    eventId: 'event-anchor-tower-failure',
    optionId: 'option-repair-main-anchor',
  });
  state = advanceExpedition(state, definition, fixtureTime + 210_000);
  state = command(state, { kind: 'fight-wave' });
  return command(state, { kind: 'return' });
}

function createActiveRun(): SaveBundle {
  return command(createExpedition(definition, fixtureTime), {
    kind: 'enter-world',
    worldId,
    seed: 18,
  });
}

async function openSaveMenu(page: Page): Promise<void> {
  const menu = page.locator('.save-menu');
  if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
}

async function importContents(page: Page, contents: string): Promise<void> {
  await openSaveMenu(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入存档', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'v13-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
}

async function importFixture(page: Page, state: SaveBundle): Promise<void> {
  await page.clock.setSystemTime(new Date(state.lastSimulatedAt));
  await importContents(page, encodeExpeditionSave(state));
  await expect(page.locator('.notice[role="status"]')).toHaveText('存档已导入。');
}

async function saveNow(page: Page): Promise<void> {
  await openSaveMenu(page);
  await page.getByRole('button', { name: '立即保存', exact: true }).click();
  await expect(page.locator('.notice[role="status"]')).toHaveText('进度已保存。');
}

async function enterRecommendedWorld(page: Page): Promise<void> {
  await page
    .locator('.recommended-world')
    .getByRole('button', { name: '进入失籍城·第七避难环', exact: true })
    .click();
  await expect(
    page.locator('.run-heading').getByRole('heading', { name: '失籍城·第七避难环' }),
  ).toBeVisible();
}

async function buildShelter(page: Page): Promise<void> {
  const build = page.getByRole('button', { name: '建造临时避难所', exact: true });
  await expect(build).toBeEnabled();
  await build.click();
  await expect(build).toHaveText('已建满');
}

async function chooseDifficulty(page: Page, name: string): Promise<void> {
  const selector = page.locator('.recommended-world .difficulty-selector');
  if ((await selector.getAttribute('open')) === null) await selector.locator('summary').click();
  const option = page.locator('.difficulty-option').filter({ hasText: name });
  const checkbox = option.locator('input');
  if (!(await checkbox.isChecked())) await option.click();
  await expect(checkbox).toBeChecked();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(fixtureTime - 60_000) });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('诸界救援局');
  await expect(
    page
      .locator('.recommended-world')
      .getByRole('button', { name: '进入失籍城·第七避难环', exact: true }),
  ).toBeEnabled();
  await page.clock.pauseAt(new Date(fixtureTime));
});

test('the compact hub keeps the next action visible at both target window sizes', async ({
  page,
}) => {
  const action = page
    .locator('.recommended-world')
    .getByRole('button', { name: '进入失籍城·第七避难环', exact: true });
  const box = await action.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
  await expect(page.locator('.recommended-world')).toContainText('稳住第七环');

  await page.setViewportSize({ width: 360, height: 480 });
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
    true,
  );
  await expect(action).toBeVisible();
});

test('outpost crafting is queued, saved, and completed by background progression', async ({
  page,
}) => {
  await page.getByRole('tab', { name: '成长', exact: true }).click();
  const buildFacility = page.getByRole('button', { name: '建造扩容回收货栈', exact: true });
  for (const viewport of [
    { width: 420, height: 600 },
    { width: 360, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await buildFacility.scrollIntoViewIfNeeded();
    const bounds = await buildFacility.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error('Outpost facility action is not laid out.');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  }
  await page.setViewportSize({ width: 420, height: 600 });
  await page.getByRole('button', { name: '建造扩容回收货栈', exact: true }).click();
  await expect(page.getByLabel('驻地回访摘要')).toBeVisible();
  const start = page.getByRole('button', { name: '制作精制结构板5批', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.locator('[aria-label="当前制作任务"]')).toContainText('剩余 5 批');
  await page.getByLabel('回收金属库存目标').selectOption('20');
  await saveNow(page);

  await page.reload();
  await page.getByRole('tab', { name: '成长', exact: true }).click();
  await expect(page.getByText('14 / 400 仓储')).toBeVisible();
  await expect(page.locator('[aria-label="当前制作任务"]')).toContainText('剩余 5 批');
  await expect(page.getByLabel('回收金属库存目标')).toHaveValue('20');
  await page.clock.runFor(180_000);
  await expect(page.getByTestId('outpost-resource-structural-panel')).toHaveText('1 / 120 块');
  await expect(page.getByRole('region', { name: '驻地回访摘要' })).toContainText(
    /回收金属 \+0\.[3-9] 块/,
  );
  await page.getByRole('button', { name: '标记已读', exact: true }).click();
  await expect(page.getByRole('region', { name: '驻地回访摘要' })).toContainText('暂无新产出');
});

test('the first rescue returns its clue and opens the fixed story review', async ({ page }) => {
  await enterRecommendedWorld(page);
  await expect(page.getByTestId('anchor-stability')).toContainText('100 / 100');
  await page.clock.runFor(90_000);
  await buildShelter(page);
  await page.getByRole('button', { name: '确认迎战第 1 次界潮', exact: true }).click();

  await page.locator('.task-alert').click();
  await expect(page.getByRole('heading', { name: '第七环锚塔失稳' })).toBeVisible();
  await expect(page.locator('.event-panel').filter({ hasText: '第七环求援' })).toBeVisible();
  await expect(page.getByRole('button', { name: /优先抢修锚塔.*锚材 1/ })).toBeVisible();
  await page.getByRole('button', { name: /优先抢修锚塔/ }).click();

  await page.getByRole('tab', { name: '行动', exact: true }).click();
  await page.clock.runFor(120_000);
  await page.getByRole('button', { name: '确认迎战第 2 次界潮', exact: true }).click();
  const returnButton = page.getByRole('button', { name: /回归寰门总台/ });
  await expect(returnButton).toBeEnabled();
  await returnButton.click();

  await page.getByRole('tab', { name: '档案', exact: true }).click();
  await expect(page.locator('.settlement-story-response')).toContainText('第七环回执已归档');
  await page.getByRole('tab', { name: '出发', exact: true }).click();
  await expect(page.getByRole('heading', { name: '系统记录先于派遣' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重开救援委托' })).toBeVisible();
});

test('early battle forecasts the actual damage and exposes its extra anchor cost', async ({
  page,
}) => {
  await enterRecommendedWorld(page);
  await page.clock.runFor(72_000);
  await buildShelter(page);
  const earlyBattle = page.getByRole('button', { name: /提前压线 · 第 1 次界潮/ });
  await expect(earlyBattle).toBeEnabled();
  await expect(page.locator('.early-yield-cost')).toContainText('放弃这段产出');
  await earlyBattle.click();

  await expect(page.locator('.battle-report')).toContainText('提前 18 秒');
  await expect(page.getByTestId('anchor-stability')).toContainText('78 / 100');
});

test('the audit contract can finish its random side project and archive its evidence', async ({
  page,
}) => {
  await importFixture(page, createCoreReturn());
  await expect(page.getByRole('button', { name: '重开救援委托' })).toBeVisible();
  await page.getByRole('button', { name: '重开救援委托' }).click();
  const contractSelector = page.locator(
    '.recommended-world select[aria-label="失籍城·第七避难环本次契约"]',
  );
  await expect(contractSelector).toBeEnabled();
  await contractSelector.selectOption('contract-audit-missing-district');
  await enterRecommendedWorld(page);
  await expect(page.getByTestId('wood')).toHaveText('14');
  await saveNow(page);
  await page.reload();
  await expect(
    page.locator('.run-heading').getByRole('heading', { name: '失籍城·第七避难环' }),
  ).toBeVisible();

  await page.clock.runFor(90_000);
  await buildShelter(page);
  await page.getByRole('button', { name: '确认迎战第 1 次界潮', exact: true }).click();
  await page.locator('.task-alert').click();
  await expect(page.getByRole('heading', { name: '空屋里的求援灯' })).toBeVisible();
  await expect(
    page.locator('.event-panel').filter({ hasText: '被登记为空屋的街区' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /启用备用锚/ }).click();
  await page.getByRole('button', { name: /派队核查/ }).click();

  const project = page.locator('.project-panel').filter({
    has: page.getByRole('heading', { name: '空屋灯号复核' }),
  });
  await expect(project).toBeVisible();
  await project.getByRole('button').first().click();
  await page.clock.runFor(45_000);
  await expect(page.getByRole('heading', { name: '空屋灯号复核' })).toBeVisible();
  await expect(
    page.locator('.resolved-event').filter({
      has: page.getByRole('heading', { name: '空屋灯号复核' }),
    }),
  ).toContainText('记录已经装入临时行李');

  await page.getByRole('tab', { name: '行动', exact: true }).click();
  await page.clock.runFor(75_000);
  await page.getByRole('button', { name: '确认迎战第 2 次界潮', exact: true }).click();
  await page.getByRole('button', { name: /回归寰门总台/ }).click();
  await page.getByRole('tab', { name: '档案', exact: true }).click();
  await expect(page.locator('.settlement')).toContainText('+20 界点');
  await expect(page.locator('.journal-panel')).toContainText('住户灯号记录');
});

test('difficulty clauses show their story source, combined score, and reward before departure', async ({
  page,
}) => {
  await chooseDifficulty(page, '临时拨款冻结');
  await chooseDifficulty(page, '界潮提前');
  await chooseDifficulty(page, '锚点暴露');
  await expect(page.locator('.difficulty-selector summary')).toContainText('难度 5');
  await expect(page.locator('.difficulty-selector')).toContainText('基础契约额外 +12 界点');
  await expect(page.locator('.difficulty-selector')).toContainText('来源：第七环求援');

  await enterRecommendedWorld(page);
  await expect(page.getByTestId('wood')).toHaveText('6');
  await expect(page.getByTestId('stone')).toHaveText('3');
  await expect(page.locator('.wave-heading')).toContainText('1:12');
  await expect(page.locator('.run-difficulty-summary')).toContainText('+12 界点');
});

test('the new app refuses an old v0.7.1 save without replacing the active journey', async ({
  page,
}) => {
  await importFixture(page, createActiveRun());
  await expect(
    page.locator('.run-heading').getByRole('heading', { name: '失籍城·第七避难环' }),
  ).toBeVisible();
  await importContents(
    page,
    JSON.stringify({ schemaVersion: 7, contentVersion: '12.0.0', profile: {} }),
  );

  await expect(page.locator('.notice[role="status"]')).toContainText('请使用旧版 v0.7.1 打开');
  await expect(
    page.locator('.run-heading').getByRole('heading', { name: '失籍城·第七避难环' }),
  ).toBeVisible();
  await expect(page.getByTestId('anchor-stability')).toContainText('100 / 100');
});
