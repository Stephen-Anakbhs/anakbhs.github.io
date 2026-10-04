import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:5173/';
const profile = await mkdtemp(join(tmpdir(), 'homepage-video-test-'));
const executable = process.env.CHROME_PATH || join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe');
// A fresh ordinary Chrome avoids Playwright's forced-visible page emulation.
const chrome = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let launchError;
chrome.on('error', error => { launchError = error; });
let browser;
const report = { base, checks: [] };
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    if (launchError) throw launchError;
    port = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').then(s => s.split('\n')[0]).catch(() => undefined);
    if (!port) await delay(100);
  }
  assert.ok(port, 'Chrome did not expose its test debugging port');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.hero-video')?.readyState >= 2);
  const session = await context.newCDPSession(page);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  const { targetId } = await session.send('Target.createTarget', { url: 'about:blank', newWindow: false });
  await session.send('Target.activateTarget', { targetId });
  await page.waitForFunction(() => document.hidden && document.querySelector('.hero-video').paused, null, { polling: 100, timeout: 8000 });
  report.checks.push({ name: 'actual background tab', hidden: true, paused: true });
  await session.send('Target.activateTarget', { targetId: targetInfo.targetId });
  await page.waitForFunction(() => !document.hidden && !document.querySelector('.hero-video').paused);
  const first = await page.locator('.hero-video').evaluate(v => v.currentTime);
  await delay(700);
  const last = await page.locator('.hero-video').evaluate(v => v.currentTime);
  assert.ok(last > first + .3);
  report.checks.push({ name: 'actual foreground tab', first, last });
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  await page.waitForFunction(() => !document.querySelector('.hero-video').paused);
  report.checks.push({ name: 'pageshow recovery handler', passed: true });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
  if (browser) {
    const session = await browser.newBrowserCDPSession();
    await session.send('Browser.close').catch(() => {});
    await browser.close();
  } else if (!launchError) chrome.kill();
  for (let i = 0; i < 50 && chrome.exitCode === null && !launchError; i++) await delay(100);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  await mkdir('output/verification', { recursive: true });
  await writeFile('output/verification/video-visibility.json', JSON.stringify(report, null, 2));
}
