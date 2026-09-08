import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/pharmaboard-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone 12-ish
const errors = [];
const KNOWN_NOISE = [/GSI_LOGGER/, /Failed to load resource/];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error' && !KNOWN_NOISE.some((re) => re.test(text))) errors.push(text);
});

const email = `mobile-${Date.now()}@example.com`;

await page.goto('http://127.0.0.1:5174/notices');
await page.getByRole('button', { name: 'Create an account', exact: true }).click();
await page.getByLabel('Full name', { exact: true }).fill('Mobile Test');
await page.getByLabel('School or organisation').fill('University of Ghana');
await page.getByLabel('Email address').fill(email);
await page.getByLabel('Password', { exact: true }).fill('a memorable secure phrase');
await page.getByRole('button', { name: 'Create account', exact: true }).click();
await page.waitForURL('**/notices');

await page.goto('http://127.0.0.1:5174/home');
await page.locator('h1').waitFor();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOT_DIR}/mobile-home-tabs.png` });

const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
assert(noOverflow, `page overflows horizontally on mobile (scrollWidth > innerWidth)`);
console.log('no horizontal page overflow on mobile OK');

// The tab strip itself should be independently scrollable, not clipped.
const tabStrip = page.locator('button[aria-pressed]').first().locator('..');
const strip = await tabStrip.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
console.log('tab strip scrollWidth/clientWidth:', strip);

// Every tab should still be reachable/clickable via scroll.
for (const label of ['Discover', 'Following', 'Communities', 'Official notices']) {
  const btn = page.getByRole('button', { name: label, exact: true });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(150);
}
console.log('all four tabs reachable and clickable on mobile OK');

assert.deepEqual(errors, [], 'expected no browser console/page errors: ' + JSON.stringify(errors));
await browser.close();
console.log('ALL CHECKS PASSED');
