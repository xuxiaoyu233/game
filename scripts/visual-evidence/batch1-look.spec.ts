import { test } from '@playwright/test';

// Batch 1 visual evidence: glass/era style, shrunken fixed header, status-bar next step,
// and the new 记录 tab. Saved under gitignored artifacts/batch1 as local review scratch;
// the evidence that must survive for review (seven eras x two windows) goes to the tracked
// docs/证据/时代演进/ via era-evidence.spec.ts.
test('capture batch 1 UI for review', async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 420, height: 600 });
  await page.goto('/');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/batch1/01-训练-未开始.png' });

  await page.getByTestId('start-first-activity').click();
  await page.clock.runFor(30_000);
  await page.screenshot({ path: 'artifacts/batch1/02-训练-运行中.png' });

  await page.getByTestId('skill-card-mining').click();
  await page.screenshot({ path: 'artifacts/batch1/03-技能详情.png' });

  await page.getByTestId('skill-detail-back').click();
  await page.getByTestId('tab-warehouse').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/batch1/04-仓库.png' });

  await page.getByTestId('tab-growth').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/batch1/05-成长.png' });

  await page.getByTestId('tab-records').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/batch1/06-记录.png' });

  await page.setViewportSize({ width: 360, height: 480 });
  await page.getByTestId('tab-training').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/batch1/07-小窗训练.png' });
});
