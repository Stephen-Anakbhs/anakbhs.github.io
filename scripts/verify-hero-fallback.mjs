import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const engines = (process.env.AUTOPLAY_ENGINES || 'chrome').split(',');
const output = 'output/verification';
await mkdir(output, { recursive: true });
const report = { base, cases: [], errors: [] };
for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  if (!engines.includes(name)) continue;
  const browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    for (const scenario of ['denied', 'pending', 'resolved-but-stalled', 'image-unavailable']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      page.on('pageerror', e => report.errors.push({ name, scenario, message: e.message }));
      if (scenario === 'image-unavailable') {
        await page.route('**/media/hero-background-1080p.mp4', route => route.request().resourceType() === 'image' ? route.abort('failed') : route.continue());
      }
      await page.addInitScript((scenario) => {
        const originalSet = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name, value) {
          if (this instanceof HTMLVideoElement && name.toLowerCase() === 'autoplay') return;
          return originalSet.call(this, name, value);
        };
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          if (!this.matches('.hero-video')) return originalPlay.call(this);
          this.pause();
          if (scenario === 'pending') return new Promise(() => {});
          if (scenario === 'resolved-but-stalled') return Promise.resolve();
          return Promise.reject(new DOMException('Test host requires a user gesture', 'NotAllowedError'));
        };
        let inputs = 0;
        for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, e => { if (e.isTrusted) inputs++; }, true);
        const sample = document.createElement('canvas'); sample.width = 32; sample.height = 18;
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        let first, frame = 0, differences = 0;
        const started = performance.now();
        const timer = setInterval(() => {
          const media = document.querySelector('.hero-fallback[data-media-ready="true"]');
          if (media) {
            try {
              ctx.drawImage(media, 0, 0, 32, 18);
              const pixels = ctx.getImageData(0, 0, 32, 18).data;
              if (first && pixels.some((v, i) => Math.abs(v - first[i]) > 8)) differences++;
              first = pixels;
              frame = Number(media.dataset.frame || 0);
            } catch {}
          }
          if (differences < 3 && performance.now() - started < 25000) return;
          clearInterval(timer);
          console.info('FALLBACK_RESULT ' + JSON.stringify({
            mode: document.querySelector('.hero-fallback-layer')?.dataset.mode,
            reason: document.querySelector('.hero')?.dataset.mediaFallback,
            inputs, activated: navigator.userActivation?.hasBeenActive,
            elapsedMs: performance.now() - started, differences, frame,
            videoElements: document.querySelectorAll('.hero-video').length,
            width: media?.naturalWidth || media?.width, height: media?.naturalHeight || media?.height,
          }));
        }, 200);
      }, scenario);
      try {
        const resultPromise = page.waitForEvent('console', { predicate: m => m.text().startsWith('FALLBACK_RESULT '), timeout: 30000 });
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
        const result = JSON.parse((await resultPromise).text().slice('FALLBACK_RESULT '.length));
        report.cases.push({ name, scenario, ...result });
        assert(result.differences >= 3, 'Fallback must visibly animate, not just fire load/playing');
        assert.equal(result.inputs, 0); assert.equal(result.activated, false);
        assert.equal(result.videoElements, 0, 'No blocked native player or start button may remain');
        assert.equal(result.width, 1920); assert.equal(result.height, 1080);
        assert.equal(result.reason, ['denied', 'image-unavailable'].includes(scenario) ? 'autoplay-denied' : 'no-frame-progress');
        await page.getByRole('button', { name: 'Expand menu', exact: true }).tap();
        await page.waitForFunction(() => window.__liquidGLRenderer__?.hasTexture && window.__liquidGLRenderer__._videoNodes.some(e => e.classList.contains('hero-fallback')));
        await page.screenshot({ path: `${output}/fallback-${name}-${scenario}.png` });
        const first = await page.locator('.header-navigation').screenshot();
        await page.waitForTimeout(750);
        const second = await page.locator('.header-navigation').screenshot();
        assert(!first.equals(second), 'Glass must continue reflecting the animated background');
        if (scenario === 'image-unavailable') {
          assert.equal(result.mode, 'canvas');
          const timing = await page.evaluate(async () => {
            const media = document.querySelector('canvas.hero-fallback');
            const times = [];
            const walls = [];
            const initialFrame = Number(media.dataset.frame);
            const initialTime = Number(media.dataset.time);
            const start = performance.now();
            return new Promise(resolve => {
              const capture = () => {
                times.push(Number(media.dataset.time)); walls.push(performance.now());
                if (Number(media.dataset.loop) < 1) return;
                document.removeEventListener('hero-media-frame', capture);
                clearTimeout(timeout);
                const gaps = walls.slice(1).map((t, i) => t - walls[i]).sort((a, b) => a - b);
                resolve({ loop: Number(media.dataset.loop), frame: Number(media.dataset.frame), initialFrame, initialTime,
                  elapsed: performance.now() - start, sourceTimes: times,
                  medianMs: gaps[Math.floor(gaps.length * .5)], p95Ms: gaps[Math.floor(gaps.length * .95)] });
              };
              const timeout = setTimeout(() => { document.removeEventListener('hero-media-frame', capture); resolve({ timeout: true }); }, 65000);
              document.addEventListener('hero-media-frame', capture);
            });
          });
          assert(!timing.timeout, 'Full-length fallback must loop');
          assert.equal(timing.frame, 1331, 'Every original frame must be drawn before the next loop');
          assert(timing.sourceTimes.slice(0, -1).every((t, i, a) => !i || Math.abs(t - a[i - 1] - 1 / 30) < .001));
          assert(Math.abs(timing.elapsed / 1000 - (44.333333 - timing.initialTime)) < 2, 'Fallback must not slow the timeline');
          delete timing.sourceTimes;
          report.cases.push({ name, scenario, fullLoop: timing });
        }
        await page.evaluate(() => document.querySelector('#projects').scrollIntoView({ behavior: 'instant' }));
        await page.waitForFunction(() => !document.querySelector('.hero-fallback'));
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForFunction(() => document.querySelector('.hero-fallback[data-media-ready="true"]'));
        console.log(`PASS ${name} ${scenario}: ${JSON.stringify(result)}`);
      } catch (error) {
        report.cases.push({ name, scenario, failure: error.stack }); process.exitCode = 1;
        console.error(error.message);
        await page.screenshot({ path: `${output}/fallback-${name}-${scenario}-failure.png` }).catch(() => {});
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
report.passed = report.errors.length === 0 && !report.cases.some(c => c.failure);
if (!report.passed) process.exitCode = 1;
await writeFile(`${output}/hero-fallback.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
