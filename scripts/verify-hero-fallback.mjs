import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const engines = (process.env.AUTOPLAY_ENGINES || 'chrome').split(',');
const output = 'output/verification';
await mkdir(output, { recursive: true });
const report = { base, headed: process.env.FALLBACK_HEADED === '1', cases: [], errors: [] };
for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  if (!engines.includes(name)) continue;
  const browser = await engine.launch({ headless: process.env.FALLBACK_HEADED !== '1', ...(name === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    for (const scenario of ['denied', 'pending', 'resolved-but-stalled', 'full-loop']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      await page.bringToFront();
      if (process.env.FALLBACK_BACKEND === 'webgl') await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
      page.on('pageerror', e => report.errors.push({ name, scenario, message: e.message }));
      await page.addInitScript((scenario) => {
        const NativeWorker = Worker;
        window.heroFrameWorkerUrls = [];
        window.Worker = class extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            if (String(url).includes('heroFrameWorker')) window.heroFrameWorkerUrls.push(String(url));
          }
        };
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
        let inputs = 0, unreadyPlayerExposed = false;
        for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, e => { if (e.isTrusted) inputs++; }, true);
        const sample = document.createElement('canvas'); sample.width = 32; sample.height = 18;
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        let first, frame = 0, differences = 0;
        const started = performance.now();
        const timer = setInterval(() => {
          const video = document.querySelector('.hero-video');
          if (video && video.dataset.ready !== 'true') {
            const poster = document.querySelector('.hero-photo');
            const vr = video.getBoundingClientRect(), pr = poster?.getBoundingClientRect();
            const covered = poster && getComputedStyle(poster).opacity === '1'
              && Number(getComputedStyle(poster).zIndex) > Number(getComputedStyle(video).zIndex)
              && pr.left <= vr.left && pr.right >= vr.right && pr.top <= vr.top && pr.bottom >= vr.bottom;
            unreadyPlayerExposed ||= getComputedStyle(video).opacity !== '0' && !covered;
          }
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
            inputs, activated: navigator.userActivation?.hasBeenActive, unreadyPlayerExposed,
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
        assert.equal(result.unreadyPlayerExposed, false, 'The waiting native player must stay hidden before fallback');
        assert.equal(result.videoElements, 0, 'No blocked native player or start button may remain');
        assert.equal(result.width, 1920); assert.equal(result.height, 1080);
        assert.equal(result.reason, ['denied', 'full-loop'].includes(scenario) ? 'autoplay-denied' : 'no-frame-progress');
        await page.getByRole('button', { name: 'Expand menu', exact: true }).tap();
        await page.waitForFunction(() => window.__liquidGLRenderer__?.hasTexture && window.__liquidGLRenderer__._videoNodes.some(e => e.classList.contains('hero-fallback')));
        assert(await page.evaluate(() => window.__liquidGLRenderer__._videoIsOpaque(document.querySelector('.hero-fallback'))), 'Opaque video canvas must use the cropped live backdrop path');
        assert(await page.evaluate(() => document.querySelector('.hero-fallback').liquidVideoFrame instanceof VideoFrame), 'Glass must sample a decoded frame without reading back the displayed canvas');
        await page.screenshot({ path: `${output}/fallback-${name}-${scenario}.png` });
        const first = await page.locator('.header-navigation').screenshot();
        await page.waitForTimeout(750);
        const second = await page.locator('.header-navigation').screenshot();
        assert(!first.equals(second), 'Glass must continue reflecting the animated background');
        if (scenario === 'full-loop') {
          assert.equal(result.mode, 'canvas');
          const timing = await page.evaluate(async () => {
            const media = document.querySelector('canvas.hero-fallback');
            const renderer = window.__liquidGLRenderer__;
            const costs = {};
            const instrument = (object, prefix) => {
              for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(object))) {
                if (key === 'constructor' || typeof object[key] !== 'function') continue;
                const fn = object[key];
                object[key] = function (...args) {
                  const start = performance.now();
                  try { return fn.apply(this, args); }
                  finally {
                    const duration = performance.now() - start;
                    const cost = costs[prefix + key] ||= { calls: 0, ms: 0, max: 0 };
                    cost.calls++; cost.ms += duration; cost.max = Math.max(cost.max, duration);
                  }
                };
              }
            };
            instrument(renderer, 'renderer.'); instrument(renderer.backend, 'backend.');
            for (const key of ['clone', 'close']) {
              const fn = VideoFrame.prototype[key];
              VideoFrame.prototype[key] = function (...args) {
                const start = performance.now();
                try { return fn.apply(this, args); }
                finally {
                  const duration = performance.now() - start;
                  const cost = costs['frame.' + key] ||= { calls: 0, ms: 0, max: 0 };
                  cost.calls++; cost.ms += duration; cost.max = Math.max(cost.max, duration);
                }
              };
            }
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
                  decodeWaitMs: Number(media.dataset.decodeWaitMs), drawMs: Number(media.dataset.drawMs),
                  backend: renderer.backend.kind, texture: [renderer.textureWidth, renderer.textureHeight],
                  visible: document.visibilityState, focused: document.hasFocus(),
                  costs: Object.fromEntries(Object.entries(costs).filter(([, c]) => c.ms > 20).sort((a, b) => b[1].ms - a[1].ms)),
                  elapsed: performance.now() - start, sourceTimes: times,
                  medianMs: gaps[Math.floor(gaps.length * .5)], p95Ms: gaps[Math.floor(gaps.length * .95)] });
              };
              const timeout = setTimeout(() => { document.removeEventListener('hero-media-frame', capture); resolve({ timeout: true }); }, 65000);
              document.addEventListener('hero-media-frame', capture);
            });
          });
          const { sourceTimes, ...frameTiming } = timing;
          report.cases.push({ name, scenario, fullLoop: frameTiming });
          console.log(`TIMING ${name}: ${JSON.stringify(frameTiming)}`);
          if (process.env.FALLBACK_BACKEND === 'webgl') assert.equal(timing.backend, 'webgl');
          assert(!timing.timeout, 'Full-length fallback must loop');
          assert.equal(timing.frame, 1331, 'Every original frame must be drawn before the next loop');
          assert(sourceTimes.slice(0, -1).every((t, i, a) => !i || Math.abs(t - a[i - 1] - 1 / 30) < .001));
          assert(Math.abs(timing.elapsed / 1000 - (44.333333 - timing.initialTime)) < 2, 'Fallback must not slow the timeline');
          assert(timing.medianMs >= 25 && timing.medianMs <= 42, 'Frames must be paced, not delivered in bursts');
          assert(timing.p95Ms < 85, 'Decoded-frame delivery must remain smooth');
          const boundary = await page.evaluate(async () => {
            const url = window.heroFrameWorkerUrls[0];
            if (!url) throw new Error('The actual frame-worker URL was not observed');
            return new Promise((resolve, reject) => {
              const worker = new Worker(url, { type: 'module' });
              const frames = [];
              const stop = () => { clearTimeout(timeout); worker.terminate(); };
              const timeout = setTimeout(() => { stop(); reject(new Error('End-of-file resume timed out')); }, 15000);
              worker.onerror = event => { stop(); reject(new Error(event.message)); };
              worker.onmessage = ({ data }) => {
                if ('error' in data) { stop(); reject(new Error(data.error)); return; }
                frames.push({ time: data.time, width: data.frame.displayWidth, height: data.frame.displayHeight });
                data.frame.close();
                if (frames.length === 3) { stop(); resolve(frames); }
              };
              worker.postMessage({ type: 'start', src: new URL('/media/hero-background-1080p.mp4', location.href).href,
                start: 1330 / 30, capacity: 3 });
            });
          });
          assert(boundary.every((frame, i) => Math.abs(frame.time - i / 30) < .001
            && frame.width === 1920 && frame.height === 1080), 'Resume at the original end timestamp must restart at frame zero');
          report.cases.push({ name, scenario: 'resume-at-end', frames: boundary, passed: true });
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
    if (name === 'webkit' && process.platform === 'darwin') {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      try {
        await page.addInitScript(() => {
          Object.defineProperty(window, 'VideoDecoder', { value: undefined, configurable: true });
          const set = Element.prototype.setAttribute;
          Element.prototype.setAttribute = function (key, value) {
            if (this instanceof HTMLVideoElement && key.toLowerCase() === 'autoplay') return;
            return set.call(this, key, value);
          };
          HTMLMediaElement.prototype.play = function () {
            return Promise.reject(new DOMException('Test host requires input', 'NotAllowedError'));
          };
          const started = performance.now();
          let inputs = 0;
          for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, e => { if (e.isTrusted) inputs++; }, true);
          const timer = setInterval(() => {
            const mode = document.querySelector('.hero-fallback-layer')?.dataset.mode;
            const img = document.querySelector('.hero-photo');
            const loaded = Boolean(img?.complete && img?.naturalWidth > 0);
            if (!(mode === 'poster' && loaded) && performance.now() - started < 20000) return;
            clearInterval(timer);
            console.info('POSTER_RESULT ' + JSON.stringify({ mode, loaded, inputs, activated: navigator.userActivation.hasBeenActive,
              videoElements: document.querySelectorAll('.hero-video').length }));
          }, 100);
        });
        const recording = page.waitForEvent('console', { predicate: m => m.text().startsWith('POSTER_RESULT '), timeout: 30000 });
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
        const result = JSON.parse((await recording).text().slice('POSTER_RESULT '.length));
        assert.equal(result.mode, 'poster'); assert.equal(result.loaded, true);
        assert.equal(result.videoElements, 0); assert.equal(result.inputs, 0); assert.equal(result.activated, false);
        report.cases.push({ name, scenario: 'decoder-unavailable', ...result, passed: true });
        console.log('PASS webkit decoder-unavailable: static poster, not an animation claim');
      } catch (error) {
        report.cases.push({ name, scenario: 'decoder-unavailable', failure: error.stack });
        process.exitCode = 1;
        console.error(error.message);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
report.passed = report.errors.length === 0 && !report.cases.some(c => c.failure);
if (!report.passed) process.exitCode = 1;
await writeFile(`${output}/hero-fallback.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
