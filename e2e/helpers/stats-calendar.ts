import {expect, type Page} from '@playwright/test';

export async function showStatsDateControls(page: Page): Promise<void> {
  const toggle = page.getByRole('button', {name: 'Compare dates', exact: true});
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await expect(page.getByRole('button', {name: 'Ranking date', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Compare with', exact: true})).toBeVisible();
}

/** Uses the actual keyboard opener and eligible date controls, never component access or forced clicks. */
export async function chooseStatsDate(page: Page, target: 'ranking' | 'comparison', date: string): Promise<void> {
  await showStatsDateControls(page);
  await page.getByRole('button', {name: target === 'ranking' ? 'Ranking date' : 'Compare with', exact: true}).press('Enter');
  const dialog = page.getByRole('dialog', {name: target === 'ranking' ? 'VIEW SNAPSHOT' : 'COMPARE SNAPSHOT', exact: true});
  await expect(dialog).toBeVisible();
  if (date === 'current') await dialog.getByRole('button', {name: 'Today', exact: true}).click();
  else await dialog.locator(`button[data-date="${date}"]`).click();
  await expect(dialog).toHaveCount(0);
}
