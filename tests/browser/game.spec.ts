import { expect, test, type Page } from '@playwright/test';

const START_TIME = new Date(Date.UTC(2026, 9, 12, 0, 0, 0));

async function openPrototype(page: Page): Promise<void> {
  await page.clock.install({ time: START_TIME });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '技能工坊原型' })).toBeVisible();
  await expect(page.getByTestId('start-first-activity')).toBeVisible();
}

async function backdateMainSave(page: Page, lastSimulatedAt: number): Promise<void> {
  await page.evaluate(`(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('skill-prototype-v1-development', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      const store = transaction.objectStore('snapshots');
      const request = store.get('main');
      request.onsuccess = () => {
        const save = JSON.parse(String(request.result));
        store.put(JSON.stringify({ ...save, lastSimulatedAt: ${lastSimulatedAt} }), 'main');
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  })()`);
}

test('the first activity is discoverable in both supported compact window sizes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '技能工坊原型' })).toBeVisible();
  await expect(page.getByText('本地技能放置', { exact: true })).toBeVisible();
  const start = page.getByTestId('start-first-activity');
  const nextStep = page.getByTestId('next-step');
  const viewports = [
    { width: 420, height: 600 },
    { width: 360, height: 480 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate('window.scrollTo(0, 0)');
    await expect(nextStep).toBeInViewport();
    const nextStepBounds = await nextStep.boundingBox();
    expect(nextStepBounds).not.toBeNull();
    if (nextStepBounds === null) throw new Error('The next-step guidance has no visible layout.');
    expect(nextStepBounds.y + nextStepBounds.height).toBeLessThanOrEqual(viewport.height);
    const lockedSecondTier = page.getByTestId('activity-action-mine-advanced-ore');
    await lockedSecondTier.scrollIntoViewIfNeeded();
    await expect(lockedSecondTier).toHaveAccessibleName('需要采掘 Lv 3：采集进阶矿层');
    await page.evaluate('window.scrollTo(0, 0)');
    const bounds = await start.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error('The first mining action has no visible layout.');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  }
});

test('a material shortage suggests a gather activity that produces the missing item', async ({
  page,
}) => {
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(64_000);
  await page.getByTestId('activity-action-smelt-common-ingot').click();
  await page.clock.runFor(24_000);

  const suggestion = page.getByTestId('next-step');
  await expect(suggestion).toContainText('基础矿料 × 2');
  await expect(page.getByTestId('next-step-replenish')).toContainText(/切换到\s*采集富集矿层/);
  for (const viewport of [
    { width: 420, height: 600 },
    { width: 360, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate('window.scrollTo(0, 0)');
    await expect(page.getByRole('region', { name: '当前活动' })).toBeInViewport();
    await expect(suggestion).toBeInViewport();
    const bounds = await suggestion.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error('The active next-step guidance has no visible layout.');
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.getByTestId('next-step-replenish').click();
  await expect(page.getByRole('region', { name: '当前活动' })).toContainText('采集富集矿层');
});

test('switching activities discards the unfinished cycle and starts a fresh one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(64_000);

  const currentActivity = page.getByRole('region', { name: '当前活动' });
  await page.getByTestId('activity-action-mine-rich-common-ore').click();
  await page.clock.runFor(5_000);
  await expect(currentActivity).toContainText('切换会放弃未完成周期');
  await page.getByTestId('activity-action-mine-common-ore').click();
  await expect(page.getByTestId('inventory-common-ore').locator('output')).toHaveText('8');

  await page.clock.runFor(6_000);
  await expect(page.getByTestId('inventory-common-ore').locator('output')).toHaveText('8');
  await page.clock.runFor(2_000);
  await expect(page.getByTestId('inventory-common-ore').locator('output')).toHaveText('9');
});

test('offline return shows a persistent settlement receipt that can be confirmed once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(8_000);
  await page.locator('.skill-prototype-save-menu > summary').click();
  await page.getByRole('button', { name: '立即保存' }).click();
  await expect(page.getByText('存档已保存。')).toBeVisible();

  const backdatedTimestamp = START_TIME.getTime() + 8_000 - 10 * 60 * 1_000;
  await page.evaluate(`(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('skill-prototype-v1-development', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      const store = transaction.objectStore('snapshots');
      const request = store.get('main');
      request.onsuccess = () => {
        const save = JSON.parse(String(request.result));
        store.put(JSON.stringify({ ...save, lastSimulatedAt: ${backdatedTimestamp} }), 'main');
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  })()`);

  await page.reload();
  const report = page.getByTestId('return-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('+75');
  await expect(report).toContainText('经验');
  await expect(report).toContainText('采集富集矿层');
  await expect(report).toContainText('可在活动列表查看新开放活动');
  await expect(report.getByRole('link', { name: '采集富集矿层' })).toHaveAttribute(
    'href',
    '#activity-mine-rich-common-ore',
  );
  await expect(page.getByTestId('inventory-common-ore')).toContainText('76');

  await page.getByTestId('acknowledge-return-report').click();
  await expect(report).toHaveCount(0);
  await expect(page.getByTestId('inventory-common-ore')).toContainText('76');
  await page.reload();
  await expect(page.getByTestId('return-report')).toHaveCount(0);
  await expect(page.getByTestId('inventory-common-ore')).toContainText('76');
});

test('offline returns explain when the eight-hour settlement limit is reached', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.locator('.skill-prototype-save-menu > summary').click();
  await page.getByRole('button', { name: '立即保存' }).click();
  await expect(page.getByText('存档已保存。')).toBeVisible();

  await backdateMainSave(page, START_TIME.getTime() - 10 * 60 * 60 * 1_000);
  await page.reload();
  const report = page.getByTestId('return-report');
  await expect(report).toContainText('已达到离线时长上限');
  await expect(report).toContainText('剩余时间不会自动切换到其他活动');
  await expect(page.getByTestId('inventory-common-ore').locator('output')).toHaveText('3,600');
});

test('a zero-material save reaches Tool III, stops XP at the new cap, and restores', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(64_000);
  await expect(page.getByTestId('skill-progress-mining')).toContainText('16 XP');

  await page.getByTestId('activity-action-mine-rich-common-ore').click();
  await page.clock.runFor(70_000);
  await expect(page.getByTestId('skill-progress-mining')).toContainText('44 XP');

  await page.getByTestId('activity-action-smelt-common-ingot').click();
  await page.clock.runFor(12_000);
  await expect(page.getByTestId('inventory-common-ingot')).toContainText('2');
  await expect(page.getByTestId('skill-progress-metalworking')).toContainText('10 XP');

  await page.getByTestId('activity-action-forge-common-tool-blank').click();
  await page.clock.runFor(10_000);
  await expect(page.getByTestId('inventory-common-tool-blank')).toContainText('1');
  await expect(page.getByTestId('skill-progress-metalworking')).toContainText('16 XP');

  await page.getByTestId('upgrade-mining-tool-ii').click();
  await expect(page.getByTestId('upgrade-complete-mining-tool-ii')).toBeVisible();

  await page.getByTestId('activity-action-mine-advanced-ore').click();
  await page.clock.runFor(19_200);
  await expect(page.getByTestId('inventory-advanced-ore')).toContainText('2');
  await expect(page.getByTestId('skill-progress-mining')).toContainText('44 XP');

  await page.getByTestId('activity-action-smelt-common-ingot').click();
  await page.clock.runFor(54_000);
  await expect(page.getByTestId('inventory-common-ingot')).toContainText('9');
  await page.getByTestId('activity-action-smelt-advanced-ingot').click();
  await page.clock.runFor(9_000);
  await expect(page.getByTestId('skill-progress-metalworking')).toContainText('70 XP');
  await expect(page.getByTestId('next-step')).toContainText('进阶矿料 × 2');
  await expect(page.getByTestId('next-step-replenish')).toContainText(/切换到\s*采集进阶矿层/);
  await page.getByTestId('next-step-replenish').click();
  await expect(page.getByRole('region', { name: '当前活动' })).toContainText('采集进阶矿层');

  await page.getByTestId('activity-action-forge-composite-tool-blank').click();
  await page.clock.runFor(14_000);
  await expect(page.getByTestId('inventory-composite-tool-blank')).toContainText('1');
  await expect(page.getByTestId('skill-progress-metalworking')).toContainText('70 XP');
  await page.getByTestId('upgrade-mining-tool-iii').click();
  await expect(page.getByTestId('upgrade-complete-mining-tool-iii')).toBeVisible();
  await expect(page.getByTestId('inventory-common-ingot')).toContainText('7');
  await page.clock.runFor(14_000);
  await expect(
    page.getByRole('region', { name: '当前活动' }).getByText('缺少：进阶金属锭 × 1'),
  ).toBeVisible();

  await page.locator('.skill-prototype-save-menu > summary').click();
  await page.getByRole('button', { name: '立即保存' }).click();
  await expect(page.getByText('存档已保存。')).toBeVisible();

  const databases = await page.evaluate<string[]>(
    `indexedDB.databases().then((entries) => entries.map((database) => database.name))`,
  );
  expect(databases).toContain('skill-prototype-v1-development');
  expect(databases).not.toContain('outpost-web-development-v1');

  await page.reload();
  await expect(page.getByTestId('upgrade-complete-mining-tool-iii')).toBeVisible();
  await expect(page.getByTestId('inventory-common-ingot')).toContainText('7');

  await page.getByTestId('activity-action-mine-advanced-ore').click();
  await page.clock.runFor(15_600);
  await expect(page.getByTestId('skill-progress-mining')).toContainText('44 XP');
  await expect(page.getByTestId('inventory-advanced-ore')).toContainText('2');

  await page.getByTestId('activity-action-forge-common-tool-blank').click();
  await page.clock.runFor(30_000);
  await expect(page.getByTestId('skill-progress-metalworking')).toContainText('70 XP');
  await expect(page.getByTestId('inventory-common-tool-blank')).toContainText('3');
  await expect(page.getByText(/当前原型切片已到已定义的技能与工具上限/)).toBeVisible();
});
