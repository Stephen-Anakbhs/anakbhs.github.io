import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = 'output/verification';
const marker = 'MOBILE_AUTOPLAY_RESULT ';
const engines = (process.env.AUTOPLAY_ENGINES || (process.platform === 'win32' ? 'chrome' : 'chrome,webkit')).split(',');
assert(engines.length && engines.every(name => ['chrome', 'webkit'].includes(name)), 'Unknown autoplay test engine');
const report = { base, platform: process.platform, engines, cases: [], errors: [] };
if (process.platform === 'win32') console.log('WebKit media decoding is verified by the macOS CI job, not Windows emulation.');
await mkdir(output, { recursive: true });

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  if (!engines.includes(name)) continue;
  const browser = await engine.launch({ headless: true, ...(name === 'chrome' ? {
    channel: 'chrome', args: ['--autoplay-policy=document-user-activation-required'],
  } : {}) });
  try {
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const label = `${name}-${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ label, message: error.message }));
      // Record inside the page before any evaluation or input can grant activation.
      await page.addInitScript(() => {
        const start = performance.now();
        let firstTime = null;
        let inputs = 0;
        for (const event of ['pointerdown', 'touchend', 'keydown']) {
          document.addEventListener(event, e => { if (e.isTrusted) inputs++; }, true);
        }
        const timer = setInterval(() => {
          const v = document.querySelector('.hero-video');
          if (v && !v.paused && v.readyState >= 2 && firstTime === null) firstTime = v.currentTime;
          const advanced = firstTime !== null && v && v.currentTime > firstTime + 0.35;
          if (!advanced && performance.now() - start < 20000) return;
          clearInterval(timer);
          console.info('MOBILE_AUTOPLAY_RESULT ' + JSON.stringify({
            advanced, elapsedMs: performance.now() - start, inputs,
            activated: navigator.userActivation?.hasBeenActive ?? null,
            firstTime, time: v?.currentTime, paused: v?.paused, ready: v?.readyState,
            error: v?.error?.code ?? null, autoplay: v?.autoplay, muted: v?.muted,
            inline: v?.playsInline, loop: v?.loop, controls: v?.controls,
            opacity: v ? getComputedStyle(v).opacity : null,
            width: v?.videoWidth, height: v?.videoHeight,
            decoded: v?.getVideoPlaybackQuality().totalVideoFrames,
          }));
        }, 100);
      });
      try {
        let delayed = false;
        if (viewport.width === 390) {
          await page.route('**/media/hero-background-1080p.mp4', async route => {
            if (!delayed) { delayed = true; await new Promise(resolve => setTimeout(resolve, 900)); }
            await route.continue();
          });
        }
        for (const mode of ['fresh-entry', 'reload']) {
          const recording = page.waitForEvent('console', { predicate: m => m.text().startsWith(marker), timeout: 30000 });
          const response = mode === 'fresh-entry'
            ? await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
            : await page.reload({ waitUntil: 'domcontentloaded' });
          assert.equal(response.status(), 200);
          const result = JSON.parse((await recording).text().slice(marker.length));
          report.cases.push({ label, mode, delayedMedia: viewport.width === 390 && mode === 'fresh-entry', ...result });
          assert(result.advanced && result.decoded > 0, `${label} ${mode}: no decoded playback without input`);
          assert.equal(result.inputs, 0);
          assert.equal(result.activated, false, 'Startup test must not receive a user activation');
          assert(result.autoplay && result.muted && result.inline && result.loop && !result.controls);
          assert.equal(result.opacity, '1');
          assert.equal(result.width, 1920); assert.equal(result.height, 1080);
          console.log(`PASS ${label} ${mode}: ${result.elapsedMs.toFixed(0)}ms, no input or activation`);
        }
        if (viewport.width === 390) {
          await page.evaluate(() => document.querySelector('#projects').scrollIntoView({ behavior: 'instant' }));
          await page.waitForFunction(() => document.querySelector('.hero-video').paused);
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.waitForFunction(() => !document.querySelector('.hero-video').paused);
          await page.screenshot({ path: `${output}/mobile-autoplay-${name}.png` });
          report.cases.push({ label, mode: 'offscreen-pause-and-home-resume', passed: true });
        }
      } catch (error) {
        report.cases.push({ label, failure: error.stack });
        process.exitCode = 1;
        console.error(`${label}: ${error.message}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
report.passed = !report.cases.some(c => c.failure) && report.errors.length === 0;
if (!report.passed) process.exitCode = 1;
await writeFile(`${output}/mobile-autoplay.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, errors: report.errors }));
