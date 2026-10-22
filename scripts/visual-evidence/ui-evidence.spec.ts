import { expect, test } from '@playwright/test';

/**
 * UI evidence for the layout batch: the same screens at the four widths the contract names, plus
 * the tree view and the idle strip. Images land in the tracked docs/证据/UI升级/ folder so a
 * reviewer can see them without running the app.
 */
const VIEWPORTS = [
  { name: '360x480', width: 360, height: 480 },
  { name: '420x600', width: 420, height: 600 },
  { name: '960x720', width: 960, height: 720 },
  { name: '1280x800', width: 1280, height: 800 },
] as const;

test('capture the four viewports, the tree and the idle strip', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByTestId('skill-card-mining')).toBeVisible();
    await page.screenshot({ path: `docs/证据/UI升级/训练-${viewport.name}.png` });
  }

  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/');
  await expect(page.getByTestId('open-tree')).toBeVisible();
  await page.getByTestId('open-tree').click();
  await expect(page.locator('main[data-mode="tree"]')).toBeVisible();
  await page.locator('[data-testid^="tree-node-"]').nth(1).click();
  await expect(page.getByRole('button', { name: '去训练' })).toBeVisible();
  await page.screenshot({ path: 'docs/证据/UI升级/树视图-960x720.png' });

  // Tree mode hides the tab strip, so leave the tree before reaching for another tab.
  await page.locator('.skill-prototype-tree-bar button').first().click();
  await page.getByTestId('tab-warehouse').click();
  await expect(page.getByTestId('inventory-search')).toBeVisible();
  await page.screenshot({ path: 'docs/证据/UI升级/仓库-960x720.png' });

  await page.setViewportSize({ width: 320, height: 120 });
  await page.goto('/');
  await expect(page.getByTestId('window-mode-toggle')).toBeVisible();
  await page.getByTestId('window-mode-toggle').click();
  await expect(page.locator('main[data-mode="idle"]')).toBeVisible();
  await page.screenshot({ path: 'docs/证据/UI升级/迷你窗-320x120.png' });
});
