import { expect, test, type Locator } from '@playwright/test';

// Smoke set: the milestone gate runs this single boot journey only. All rule, save and
// content behaviour is verified by the manual checklist in PLAN.md (no automated tests
// before the first playable milestone, per the 2026-10-14 decision).
test('the prototype boots and exposes the first action in both compact window sizes', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    // Dev-server resource noise (favicon probes, HMR 404s) is not an app defect.
    if (message.type() === 'error' && !message.text().includes('Failed to load resource'))
      consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '技能工坊原型' })).toBeVisible();
  await expect(page.getByTestId('start-first-activity')).toBeVisible();

  // Training home is the skill grid: twelve cards, and no flat list of every activity.
  await expect(page.locator('[data-testid^="skill-card-"]')).toHaveCount(12);
  await expect(page.getByTestId('activity-action-mine-common-ore')).toHaveCount(0);

  // The activity line stays visible while the player browses other tabs.
  await expect(page.getByTestId('activity-status')).toBeVisible();
  await page.getByTestId('tab-warehouse').click();
  await expect(page.getByTestId('activity-status')).toBeVisible();
  await page.getByTestId('tab-training').click();

  for (const viewport of [
    { width: 420, height: 600 },
    { width: 360, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate('window.scrollTo(0, 0)');
    await expect(page.getByTestId('tab-training')).toBeInViewport();
    await expectFullyInViewport(page.getByTestId('start-first-activity'), viewport.height);
    await expectFullyInViewport(page.getByTestId('skill-card-mining'), viewport.height);
  }

  // A wide window pairs the list with the detail instead of swapping them, so picking a skill
  // no longer costs a list -> detail -> back round trip.
  await page.setViewportSize({ width: 960, height: 720 });
  await page.getByTestId('skill-card-mining').click();
  await expect(page.locator('.skill-prototype-training-list')).toBeVisible();
  await expect(page.locator('.skill-prototype-training-detail')).toBeVisible();

  // The idle strip crops the same tree rather than mounting another one, so coming back keeps the
  // opened skill (the detail is still showing after the round trip).
  await page.setViewportSize({ width: 320, height: 120 });
  await page.getByTestId('window-mode-toggle').click();
  await expect(page.locator('main.skill-prototype')).toHaveAttribute('data-mode', 'idle');
  await expect(page.getByTestId('tab-panel')).toBeHidden();
  await page.getByTestId('window-mode-restore').click();
  await expect(page.locator('main.skill-prototype')).toHaveAttribute('data-mode', 'active');
  await expect(page.getByTestId('skill-detail-back')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

async function expectFullyInViewport(element: Locator, viewportHeight: number) {
  const bounds = await element.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error('Expected visible content has no layout bounds.');
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewportHeight);
}
