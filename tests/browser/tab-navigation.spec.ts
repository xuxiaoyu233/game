import { expect, test, type Page } from '@playwright/test';

const START_TIME = new Date(Date.UTC(2026, 9, 12, 0, 0, 0));
const SAVE_DATABASE = 'skill-prototype-v1-development';

async function openPrototype(page: Page): Promise<void> {
  await page.clock.install({ time: START_TIME });
  await page.goto('/');
  await expect(page.getByTestId('start-first-activity')).toBeVisible();
}

async function selectTab(page: Page, tab: 'skill' | 'bank' | 'shop'): Promise<void> {
  await page.getByTestId(`tab-${tab}`).click();
  await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
}

async function runTabCycle(page: Page, cycles: number): Promise<void> {
  for (let index = 0; index < cycles; index += 1) {
    await selectTab(page, 'bank');
    await selectTab(page, 'shop');
    await selectTab(page, 'skill');
  }
}

async function selectSkill(page: Page, skillId: string): Promise<void> {
  await page.getByTestId(`skill-chip-${skillId}`).click();
}

async function runActivity(page: Page, skillId: string, activityId: string): Promise<void> {
  await selectSkill(page, skillId);
  await page.getByTestId(`activity-action-${activityId}`).click();
}

async function inventoryQuantity(page: Page, itemId: string): Promise<string> {
  await selectTab(page, 'bank');
  const quantity = await page.getByTestId(`inventory-${itemId}`).locator('output').innerText();
  await selectTab(page, 'skill');
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
  const skill = page.getByRole('tab', { name: '技能' });
  const bank = page.getByRole('tab', { name: '银行' });
  const shop = page.getByRole('tab', { name: '商店' });
  const more = page.getByTestId('tab-more');
  await expect(skill).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    'prototype-tab-skill',
  );
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tab', { name: '装备' })).toHaveCount(0);

  await skill.focus();
  await page.keyboard.press('ArrowRight');
  await expect(bank).toHaveAttribute('aria-selected', 'true');
  await expect(bank).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'prototype-tab-bank');

  await page.keyboard.press('ArrowRight');
  await expect(shop).toHaveAttribute('aria-selected', 'true');
  await expect(shop).toBeFocused();

  // 方向键继续进入二级入口：自动展开并选中。
  await page.keyboard.press('ArrowRight');
  const equipment = page.getByRole('tab', { name: '装备' });
  await expect(equipment).toHaveAttribute('aria-selected', 'true');
  await expect(equipment).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    'prototype-tab-equipment',
  );

  const mastery = page.getByRole('tab', { name: '熟练' });
  await page.keyboard.press('ArrowRight');
  await expect(mastery).toHaveAttribute('aria-selected', 'true');
  await expect(mastery).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(skill).toHaveAttribute('aria-selected', 'true');
  await expect(skill).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(mastery).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(mastery).toHaveAttribute('aria-selected', 'true');
  await expect(mastery).toBeFocused();
  await page.keyboard.press('Home');
  await expect(skill).toHaveAttribute('aria-selected', 'true');
  await expect(skill).toBeFocused();

  await expect(skill).toHaveAttribute('tabindex', '0');
  await expect(bank).toHaveAttribute('tabindex', '-1');
  await expect(shop).toHaveAttribute('tabindex', '-1');
});

test('the more toggle reveals the secondary entries without moving the current page', async ({
  page,
}) => {
  await openPrototype(page);

  const more = page.getByTestId('tab-more');
  const skill = page.getByRole('tab', { name: '技能' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tab', { name: '装备' })).toHaveCount(0);

  await more.click();
  const equipment = page.getByRole('tab', { name: '装备' });
  await expect(equipment).toBeVisible();
  await expect(page.getByRole('tab', { name: '熟练' })).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  // 展开只揭示入口，不改变当前页面。
  await expect(skill).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('skill-progress-mining')).toBeVisible();

  await equipment.click();
  await expect(equipment).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('placeholder-equipment')).toBeVisible();
  await expect(page.getByTestId('placeholder-equipment')).toContainText('尚未接入');

  // 收起时若停留在二级入口，回到技能页，避免选中项不可见。
  await more.click();
  await expect(skill).toHaveAttribute('aria-selected', 'true');
  await expect(equipment).toHaveCount(0);
  await expect(page.getByTestId('placeholder-equipment')).toHaveCount(0);
});

test('next-step and return links move to the target page and scroll it into view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openPrototype(page);
  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(64_000);
  await runActivity(page, 'mining', 'mine-rich-common-ore');
  await page.clock.runFor(70_000);
  await runActivity(page, 'metalworking', 'smelt-common-ingot');
  await page.clock.runFor(12_000);
  await runActivity(page, 'metalworking', 'forge-common-tool-blank');
  await page.clock.runFor(10_000);
  await runActivity(page, 'mining', 'mine-rich-common-ore');

  const upgradeLink = page.getByTestId('next-step').getByRole('link').first();
  await expect(upgradeLink).toContainText('采掘工具 II');
  await upgradeLink.click();
  await expect(page.getByRole('tab', { name: '商店' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('upgrade-mining-tool-ii')).toBeInViewport();

  // 同一锚点在目标页已打开时重复点击，仍要定位到目标，而不是回到面板顶部。
  await page.evaluate('document.querySelector(".skill-prototype-tab-panel").scrollTop = 0');
  await upgradeLink.click();
  await expect(page.getByRole('tab', { name: '商店' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('upgrade-mining-tool-ii')).toBeInViewport();
});
