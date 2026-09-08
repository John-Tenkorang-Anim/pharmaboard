import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/pharmaboard-shots';
import fs from 'node:fs';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

const email = `channels-${Date.now()}@example.com`;

// Sign up a fresh account.
await page.goto('http://127.0.0.1:5174/notices');
await page.getByRole('button', { name: 'Create an account', exact: true }).click();
await page.getByLabel('Full name', { exact: true }).fill('Akosua Test');
await page.getByLabel('School or organisation').fill('University of Ghana');
await page.getByLabel('Email address').fill(email);
await page.getByLabel('Password', { exact: true }).fill('a memorable secure phrase');
await page.getByRole('button', { name: 'Create account', exact: true }).click();
await page.waitForURL('**/notices');
console.log('signed up as', email);

// --- Community: compact composer trigger + modal ---
await page.goto('http://127.0.0.1:5174/community');
await page.locator('h1').waitFor();
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${SHOT_DIR}/community-compact-composer.png` });
// The composer should be a compact trigger, not an expanded textarea.
const inlineTextarea = await page.locator('textarea[aria-label="Create a post"]').count();
assert.equal(inlineTextarea, 0, 'expected no inline textarea on the feed');

await page.getByRole('button', { name: 'Write a post', exact: true }).click();
await page.getByRole('dialog').waitFor();
await page.screenshot({ path: `${SHOT_DIR}/community-post-modal.png` });

// Formatting toolbar should be present inside the modal.
await page.getByRole('button', { name: 'Bold', exact: true }).waitFor();
await page.getByRole('button', { name: /Emoji/ }).click();
await page.getByRole('menu', { name: 'Insert emoji' }).waitFor();
await page.screenshot({ path: `${SHOT_DIR}/community-post-modal-emoji.png` });
await page.locator('[role="menu"] button', { hasText: '🔥' }).click();
const textareaValue = await page.locator('textarea#notice-body').inputValue();
assert(textareaValue.includes('🔥'), 'expected emoji inserted into post body');
await page.locator('textarea#notice-body').fill(`${textareaValue}Testing **bold** formatting and an emoji.`);
await page.getByRole('button', { name: 'Publish post', exact: true }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${SHOT_DIR}/community-post-published.png` });
assert(await page.locator('strong', { hasText: 'bold' }).count() > 0, 'expected bold text rendered in the feed');
console.log('community composer modal + emoji + formatting OK');

// --- "Ask in RxForum" navigates and opens the ask dialog ---
await page.goto('http://127.0.0.1:5174/community');
await page.locator('h1').waitFor();
await page.getByRole('link', { name: /Ask in/ }).click();
await page.waitForURL('**/forum**');
await page.getByRole('dialog', { name: 'Start a study discussion' }).waitFor();
await page.screenshot({ path: `${SHOT_DIR}/forum-ask-autoopen.png` });
console.log('Ask in RxForum auto-opens the ask dialog OK');
await page.keyboard.press('Escape');

// --- Forum channels: create, filter, post into a channel ---
await page.goto('http://127.0.0.1:5174/forum');
await page.locator('h1').waitFor();
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${SHOT_DIR}/forum-channels-sidebar.png` });
await page.getByRole('button', { name: 'Create a channel' }).click();
await page.getByRole('dialog', { name: 'Create a channel' }).waitFor();
const channelName = `Test Channel ${Date.now().toString().slice(-6)}`;
await page.getByLabel('Channel name').fill(channelName);
await page.getByLabel('Description').fill('A channel created by the visual check.');
await page.getByRole('button', { name: 'Create channel', exact: true }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await page.waitForLoadState('networkidle');
await page.getByRole('button', { name: new RegExp(channelName) }).click();
await page.screenshot({ path: `${SHOT_DIR}/forum-channel-selected.png` });

await page.getByRole('button', { name: 'Start discussion', exact: true }).first().click();
await page.getByRole('dialog', { name: 'Start a study discussion' }).waitFor();
const channelSelectValue = await page.locator('#thread-channel').inputValue();
const channelSelectLabel = await page.locator(`#thread-channel option[value="${channelSelectValue}"]`).textContent();
assert.equal(channelSelectLabel, channelName, 'expected the ask modal to default to the selected channel');
await page.getByLabel('Question', { exact: true }).fill('A question filed under the new channel?');
await page.locator('textarea#notice-body').fill('Body of a question filed into a channel via the UI.');
await page.getByRole('button', { name: 'Publish discussion', exact: true }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${SHOT_DIR}/forum-channel-thread.png` });
assert(await page.getByText('A question filed under the new channel?').count() > 0, 'expected the new thread to show while the channel is selected');

await page.getByRole('button', { name: 'All channels' }).click();
await page.waitForLoadState('networkidle');
assert(await page.getByText(channelName).count() > 0, 'expected the channel chip to show on the thread in the all-channels view');
console.log('forum channels create/filter/post OK');

assert.deepEqual(errors, [], 'expected no browser console/page errors: ' + JSON.stringify(errors));
await browser.close();
console.log('ALL CHECKS PASSED');
