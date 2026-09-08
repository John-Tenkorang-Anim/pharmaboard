import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/pharmaboard-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
// Google's own GSI "Continue with" button iframe 403s under this headless
// test origin (127.0.0.1:5174 isn't an authorized JS origin for the app's
// client ID) — unrelated to this app's code, so it's not a failure here.
const KNOWN_NOISE = [/GSI_LOGGER/, /Failed to load resource/];
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error' && !KNOWN_NOISE.some((re) => re.test(text))) errors.push(text);
});

const email = `overview-${Date.now()}@example.com`;

await page.goto('http://127.0.0.1:5174/notices');
await page.getByRole('button', { name: 'Create an account', exact: true }).click();
await page.getByLabel('Full name', { exact: true }).fill('Kojo Test');
await page.getByLabel('School or organisation').fill('University of Ghana');
await page.getByLabel('Email address').fill(email);
await page.getByLabel('Password', { exact: true }).fill('a memorable secure phrase');
await page.getByRole('button', { name: 'Create account', exact: true }).click();
await page.waitForURL('**/notices');
console.log('signed up as', email);

// --- Community is no longer a separate nav item ---
await page.goto('http://127.0.0.1:5174/home');
await page.locator('h1').waitFor();
await page.waitForLoadState('networkidle');
const navCommunityLinks = await page.locator('nav a', { hasText: 'Community' }).count();
assert.equal(navCommunityLinks, 0, 'expected no standalone "Community" nav item');
await page.screenshot({ path: `${SHOT_DIR}/overview-default.png` });

// --- /community redirects to /home ---
await page.goto('http://127.0.0.1:5174/community');
await page.waitForURL('**/home');
console.log('/community redirects to /home OK');

// --- Communities tab: create a channel via Forum first (Community tab itself doesn't create) ---
await page.goto('http://127.0.0.1:5174/forum');
await page.locator('h1').waitFor();
await page.getByRole('button', { name: 'Create a channel' }).click();
await page.getByRole('dialog', { name: 'Create a channel' }).waitFor();
const communityName = `Overview Community ${Date.now().toString().slice(-6)}`;
await page.getByLabel('Channel name').fill(communityName);
await page.getByLabel('Description').fill('Created to verify the Overview communities tab.');
await page.getByRole('button', { name: 'Create channel', exact: true }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });

// --- Overview: Communities tab shows the directory, join, and post ---
await page.goto('http://127.0.0.1:5174/home');
await page.locator('h1').waitFor();
await page.getByRole('button', { name: 'Communities', exact: true }).click();
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${SHOT_DIR}/overview-communities-directory.png` });

// The directory row's button has a longer accessible name (name + description
// + counts); an exact-name role match instead resolves unambiguously to the
// right-rail "Your communities" quick link, whose accessible name is bare.
await page.getByRole('button', { name: communityName, exact: true }).click();
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${SHOT_DIR}/overview-community-detail.png` });

// The creator was auto-joined, so this community should show "Joined".
await page.getByRole('button', { name: 'Joined', exact: true }).waitFor();
console.log('creator auto-joined their own community OK');

// Post into this community from its own composer.
await page.getByRole('button', { name: 'Write a post', exact: true }).click();
await page.getByRole('dialog', { name: 'Write a post' }).waitFor();
const communitySelectValue = await page.locator('#post-community').inputValue();
const communitySelectLabel = await page
  .locator(`#post-community option[value="${communitySelectValue}"]`)
  .textContent();
assert.equal(communitySelectLabel, communityName, 'expected the post modal to default to the open community');
await page.locator('textarea#notice-body').fill('A post filed into a community from Overview.');
await page.getByRole('button', { name: 'Publish post', exact: true }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await page.waitForLoadState('networkidle');
assert(
  (await page.getByText('A post filed into a community from Overview.').count()) > 0,
  'expected the new post to appear in the community feed',
);
await page.screenshot({ path: `${SHOT_DIR}/overview-community-post.png` });
console.log('post into a specific community OK');

// --- "Your communities" quick access in the right rail ---
await page.getByRole('button', { name: 'All communities' }).click();
await page.getByRole('button', { name: 'Discover', exact: true }).click();
await page.waitForLoadState('networkidle');
await page.getByRole('button', { name: new RegExp(communityName) }).first().click();
await page.waitForLoadState('networkidle');
assert(
  (await page.getByText('A post filed into a community from Overview.').count()) > 0,
  '"Your communities" quick link did not open the right community feed',
);
console.log('"Your communities" quick access OK');

// Post card should show a community chip.
assert((await page.getByText(communityName, { exact: true }).count()) >= 2, 'expected a community chip on the post card');

assert.deepEqual(errors, [], 'expected no browser console/page errors: ' + JSON.stringify(errors));
await browser.close();
console.log('ALL CHECKS PASSED');
