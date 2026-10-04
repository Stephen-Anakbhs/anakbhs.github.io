import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS === '1' });
const results = [];
async function clock(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('.hero-video'); return v && !v.paused && !v.error && v.readyState >= 2;
  }, null, { timeout: 15000 });
  const first = await page.locator('.hero-video').evaluate(v => v.currentTime);
  await page.waitForTimeout(700);
  const last = await page.locator('.hero-video').evaluate(v => ({ time: v.currentTime, frames: v.getVideoPlaybackQuality().totalVideoFrames, dropped: v.getVideoPlaybackQuality().droppedVideoFrames }));
  assert.ok(last.time > first + .3); assert.ok(last.frames > 0); return { first, ...last };
}
try {
  {
    const page = await browser.newPage(); let outage = true; let failedRequests = 0;
    // Keep the outage active until a real media error is observed; Chrome can
    // retry the first failed range request before a polling assertion sees it.
    await page.route('**/media/hero-background-1080p.mp4', route => { if (outage) { failedRequests++; return route.abort('failed'); } return route.continue(); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.hero-video')?.error != null);
    const errorCode = await page.locator('.hero-video').evaluate(v => v.error.code);
    assert.ok(failedRequests > 0);
    await page.evaluate(() => document.querySelector('#projects').scrollIntoView({ behavior: 'instant' }));
    await page.waitForFunction(() => scrollY > 1000);
    outage = false;
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Home', exact: true }).click();
    results.push({ name: 'transient media failure recovers on Home entry', failedRequests, errorCode, ...await clock(page) });
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.goto(`${base}/#projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => scrollY > 1000 && document.querySelector('.hero-video')?.paused);
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play; window.injectedPlayAborts = 0;
      HTMLMediaElement.prototype.play = function () {
        if (this.matches('.hero-video') && !window.injectedPlayAborts) {
          window.injectedPlayAborts++; return Promise.reject(new DOMException('Simulated interrupted play request', 'AbortError'));
        }
        return play.call(this);
      };
    });
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Home', exact: true }).click();
    const advanced = await clock(page);
    assert.equal(await page.evaluate(() => window.injectedPlayAborts), 1);
    results.push({ name: 'one interrupted play promise retries and decodes frames', ...advanced });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.push({ failure: error.stack }); process.exitCode = 1; console.error(error);
} finally {
  await mkdir('output/verification', { recursive: true });
  await writeFile('output/verification/video-recovery.json', JSON.stringify(results, null, 2));
  await browser.close();
}
