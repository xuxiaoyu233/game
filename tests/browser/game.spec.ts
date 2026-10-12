import { expect, test, type Page } from '@playwright/test';

const START_TIME = new Date(Date.UTC(2026, 9, 12, 0, 0, 0));

async function openPrototype(page: Page): Promise<void> {
  await page.clock.install({ time: START_TIME });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '技能工坊原型' })).toBeVisible();
  await expect(page.getByTestId('start-first-activity')).toBeVisible();
}

test('the first activity is discoverable in both supported compact window sizes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '技能工坊原型' })).toBeVisible();
  const start = page.getByTestId('start-first-activity');
  const viewports = [
    { width: 420, height: 600 },
    { width: 360, height: 480 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
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

test('a zero-material save reaches Tool II, saves, and restores through the prototype profile', async ({
  page,
}) => {
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(32_000);
  await expect(page.getByTestId('inventory-common-ore')).toContainText('4');

  await page.getByTestId('activity-action-smelt-common-ingot').click();
  await page.clock.runFor(12_000);
  await expect(page.getByTestId('inventory-common-ingot')).toContainText('2');
  await expect(page.getByTestId('skill-progress-metalworking')).toContainText('10 XP');

  await page.getByTestId('activity-action-forge-common-tool-blank').click();
  await page.clock.runFor(10_000);
  await expect(page.getByTestId('inventory-common-tool-blank')).toContainText('1');
  await expect(page.getByTestId('skill-progress-metalworking')).toContainText('10 XP');

  await page.getByTestId('upgrade-mining-tool-ii').click();
  await expect(page.getByTestId('upgrade-complete-mining-tool-ii')).toBeVisible();
  await page.locator('.skill-prototype-save-menu > summary').click();
  await page.getByRole('button', { name: '立即保存' }).click();
  await expect(page.getByText('存档已保存。')).toBeVisible();

  const databases = await page.evaluate<string[]>(
    `indexedDB.databases().then((entries) => entries.map((database) => database.name))`,
  );
  expect(databases).toContain('skill-prototype-v1-development');
  expect(databases).not.toContain('outpost-web-development-v1');

  await page.reload();
  await expect(page.getByTestId('upgrade-complete-mining-tool-ii')).toBeVisible();
  await expect(page.getByTestId('inventory-common-tool-blank')).toContainText('0');
  await expect(page.getByTestId('inventory-common-ingot')).toContainText('0');

  await page.getByTestId('activity-action-mine-common-ore').click();
  await page.clock.runFor(25_600);
  await expect(page.getByTestId('skill-progress-mining')).toContainText('16 XP');
  await expect(page.getByTestId('inventory-common-ore')).toContainText('4');

  await page.clock.runFor(6_400);
  await expect(page.getByTestId('skill-progress-mining')).toContainText('16 XP');
  await expect(page.getByTestId('inventory-common-ore')).toContainText('5');
  await expect(page.getByText(/当前原型切片已到已定义的技能与工具上限/)).toBeVisible();
});
