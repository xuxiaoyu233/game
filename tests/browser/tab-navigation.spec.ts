import { expect, test, type Page } from '@playwright/test';

const START_TIME = new Date(Date.UTC(2026, 9, 12, 0, 0, 0));
const SAVE_DATABASE = 'skill-prototype-v1-development';

async function openPrototype(page: Page): Promise<void> {
  await page.clock.install({ time: START_TIME });
  await page.goto('/');
  await expect(page.getByTestId('start-first-activity')).toBeVisible();
}

async function selectTab(page: Page, tab: 'training' | 'warehouse' | 'growth'): Promise<void> {
  await page.getByTestId(`tab-${tab}`).click();
  await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
}

async function runTabCycle(page: Page, cycles: number): Promise<void> {
  for (let index = 0; index < cycles; index += 1) {
    await selectTab(page, 'warehouse');
    await selectTab(page, 'growth');
    await selectTab(page, 'training');
  }
}

async function inventoryQuantity(page: Page, itemId: string): Promise<string> {
  await selectTab(page, 'warehouse');
  const quantity = await page.getByTestId(`inventory-${itemId}`).locator('output').innerText();
  await selectTab(page, 'training');
  return quantity;
}

async function readMainSave(page: Page): Promise<string> {
  return page.evaluate<string>(
    `(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open('${SAVE_DATABASE}', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const save = await new Promise((resolve, reject) => {
        const transaction = database.transaction('snapshots', 'readonly');
        const request = transaction.objectStore('snapshots').get('main');
        request.onsuccess = () => resolve(String(request.result));
        request.onerror = () => reject(request.error);
      });
      database.close();
      return save;
    })()`,
  );
}

test('switching tabs leaves a paused game state untouched', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(20_000);
  await page.getByRole('button', { name: '暂停活动' }).click();

  const currentActivity = page.getByRole('region', { name: '当前活动' });
  await expect(currentActivity).toContainText('活动已暂停');
  await page.locator('.skill-prototype-save-menu > summary').click();
  await page.getByRole('button', { name: '立即保存' }).click();
  await expect(page.getByText('存档已保存。')).toBeVisible();

  const saveBefore = await readMainSave(page);
  const oreBefore = await inventoryQuantity(page, 'common-ore');
  const skillBefore = await page.getByTestId('skill-progress-mining').innerText();
  const progressBefore = await page.locator('.skill-prototype-progress').getAttribute('value');

  await runTabCycle(page, 3);

  expect(await inventoryQuantity(page, 'common-ore')).toBe(oreBefore);
  expect(await page.getByTestId('skill-progress-mining').innerText()).toBe(skillBefore);
  expect(await page.locator('.skill-prototype-progress').getAttribute('value')).toBe(
    progressBefore,
  );
  await expect(page.getByRole('region', { name: '当前活动' })).toContainText('活动已暂停');
  expect(await readMainSave(page)).toBe(saveBefore);
});

test('equal advances before and after tab switching yield equal output', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();

  await page.clock.runFor(24_000);
  const firstAdvance = Number(await inventoryQuantity(page, 'common-ore'));

  await runTabCycle(page, 2);
  const afterSwitching = Number(await inventoryQuantity(page, 'common-ore'));
  expect(afterSwitching).toBe(firstAdvance);

  await page.clock.runFor(24_000);
  const secondAdvance = Number(await inventoryQuantity(page, 'common-ore')) - afterSwitching;
  expect(secondAdvance).toBe(firstAdvance);
});

test('the tab list supports keyboard navigation and exposes tab semantics', async ({ page }) => {
  await openPrototype(page);

  const tablist = page.getByRole('tablist', { name: '游戏页面' });
  await expect(tablist).toBeVisible();
  const training = page.getByRole('tab', { name: '训练' });
  const warehouse = page.getByRole('tab', { name: '仓库' });
  const growth = page.getByRole('tab', { name: '成长' });
  await expect(training).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    'prototype-tab-training',
  );

  await training.focus();
  await page.keyboard.press('ArrowRight');
  await expect(warehouse).toHaveAttribute('aria-selected', 'true');
  await expect(warehouse).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    'prototype-tab-warehouse',
  );

  await page.keyboard.press('ArrowRight');
  await expect(growth).toHaveAttribute('aria-selected', 'true');
  await expect(growth).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(training).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(growth).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(growth).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(training).toHaveAttribute('aria-selected', 'true');
  await expect(training).toBeFocused();

  await expect(training).toHaveAttribute('tabindex', '0');
  await expect(warehouse).toHaveAttribute('tabindex', '-1');
  await expect(growth).toHaveAttribute('tabindex', '-1');
});

test('next-step and return links move to the target page and scroll it into view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(64_000);
  await page.getByTestId('activity-action-mine-rich-common-ore').click();
  await page.clock.runFor(70_000);
  await page.getByTestId('activity-action-smelt-common-ingot').click();
  await page.clock.runFor(12_000);
  await page.getByTestId('activity-action-forge-common-tool-blank').click();
  await page.clock.runFor(10_000);
  await page.getByTestId('activity-action-mine-rich-common-ore').click();

  const upgradeLink = page.getByTestId('next-step').getByRole('link').first();
  await expect(upgradeLink).toContainText('采掘工具 II');
  await upgradeLink.click();
  await expect(page.getByRole('tab', { name: '成长' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('upgrade-mining-tool-ii')).toBeInViewport();

  // 同一锚点在目标页已打开时重复点击，仍要定位到目标，而不是回到面板顶部。
  await page.evaluate('document.querySelector(".skill-prototype-tab-panel").scrollTop = 0');
  await upgradeLink.click();
  await expect(page.getByRole('tab', { name: '成长' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('upgrade-mining-tool-ii')).toBeInViewport();
});
