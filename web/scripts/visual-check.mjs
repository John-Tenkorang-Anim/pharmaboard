// Visual-verification script — see .claude/skills/run-web-console for the
// full workflow. Launches a real headless Chromium against the running dev
// server and screenshots key screens so a human (or an agent) can confirm
// the UI actually renders as intended, not just that it type-checks and
// builds. Requires the API server (and, for the notices flow, the worker)
// already running — see CLAUDE.md for how to start them.
import { chromium } from "playwright";
import fs from "node:fs";

const SHOT_DIR = process.env.SCREENSHOT_DIR || "/tmp/pharmaboard-shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const BASE = process.env.PHARMABOARD_WEB_BASE_URL || "http://localhost:5173";
// A fresh phone number each run avoids colliding with a previous run's
// account — registration 409s are otherwise harmless (see LoginPage), but a
// new account exercises the full register-then-login path every time.
const phone = "+2332" + Date.now().toString().slice(-8);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

console.log("== navigating to", BASE, "==");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForURL("**/login");
await page.waitForSelector("text=PharmaBoard");
await page.screenshot({ path: `${SHOT_DIR}/01-login.png` });
console.log("screenshot: 01-login.png, url:", page.url());

// Register + dev OTP login via the real form, not a shortcut, so this
// also proves the form actually submits correctly.
await page.fill("#displayName", "UI Verify User");
await page.fill("#phone", phone);
await page.click('button:has-text("Continue")');
await page.waitForSelector("#code", { timeout: 10000 });
await page.screenshot({ path: `${SHOT_DIR}/02-otp-step.png` });

const codeHint = await page.locator("#code").inputValue();
console.log("pre-filled dev OTP code:", codeHint);

await page.click('button:has-text("Verify and continue")');
// The console now lands on the community feed rather than the notices list.
await page.waitForURL("**/home", { timeout: 10000 });
await page.waitForSelector("text=All members");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500); // let entrance animations settle
await page.screenshot({ path: `${SHOT_DIR}/03-feed.png` });
console.log("screenshot: 03-feed.png, url:", page.url());

await page.click('a[href="/forum"]');
await page.waitForURL("**/forum");
await page.waitForSelector('h1:has-text("Rx Forum")');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500); // let entrance animations settle
await page.screenshot({ path: `${SHOT_DIR}/04-forum.png` });
console.log("screenshot: 04-forum.png, url:", page.url());

await page.click('a[href="/network"]');
await page.waitForURL("**/network");
await page.waitForSelector('h1:has-text("Directory")');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500); // let entrance animations settle
await page.screenshot({ path: `${SHOT_DIR}/05-directory.png` });
console.log("screenshot: 05-directory.png, url:", page.url());

await page.click('a[href="/notices"]');
await page.waitForURL("**/notices");
await page.waitForSelector('h1:has-text("Notices")');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500); // let entrance animations settle
await page.screenshot({ path: `${SHOT_DIR}/06-notices-list.png` });
console.log("screenshot: 06-notices-list.png, url:", page.url());

await page.click('a[href="/messaging"]');
await page.waitForURL("**/messaging");
await page.waitForSelector("h1:has-text(\"Messages\")");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500); // let entrance animations settle
await page.screenshot({ path: `${SHOT_DIR}/07-messaging.png` });
console.log("screenshot: 07-messaging.png, url:", page.url());

await page.click('a[href="/notices/compose"]');
await page.waitForURL("**/notices/compose");
await page.waitForSelector("h1:has-text(\"Compose a notice\")");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500); // let entrance animations settle
await page.screenshot({ path: `${SHOT_DIR}/08-compose.png` });
console.log("screenshot: 08-compose.png, url:", page.url());

await page.click('a[href="/admin"]');
await page.waitForURL("**/admin");
await page.waitForSelector("text=Bootstrap the first administrator");
// A fresh, non-admin test account gets a 403 on the audit trail query —
// expected, not a bug (see AdminPage's ErrorBanner). The query client
// retries once by default (reasonable for real transient failures), which
// extends past "networkidle" by its backoff delay — wait that out too so
// the screenshot shows the resolved error state, not a stuck skeleton.
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOT_DIR}/09-admin.png` });
console.log("screenshot: 09-admin.png, url:", page.url());

console.log("\n== console errors ==");
console.log(consoleErrors.length === 0 ? "(none)" : consoleErrors.join("\n"));

await browser.close();
console.log("\ndone. screenshots in", SHOT_DIR);
