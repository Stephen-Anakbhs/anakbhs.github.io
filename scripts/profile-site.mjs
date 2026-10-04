import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const label = process.argv[2] || 'current';
const url = process.argv[3] || 'http://127.0.0.1:4173/';
const viewport = { width: Number(process.argv[4] || 1440), height: 900 };
const out = new URL('../output/playwright/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: process.argv.includes('--headless') });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  const originalRAF = window.requestAnimationFrame.bind(window);
  const p = window.__sitePerf = { rafCalls: 0, longtasks: [], videoEvents: [], inputs: [], originalRAF };
  for (const type of ['wheel', 'pointerdown', 'keydown']) {
    window.addEventListener(type, () => p.inputs.push({ type, at: performance.now() }), { passive: true });
  }
  window.requestAnimationFrame = cb => originalRAF(t => { p.rafCalls++; cb(t); });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) p.longtasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: 'longtask', buffered: true });
  for (const name of ['play', 'playing', 'pause', 'waiting', 'error', 'ended', 'canplay']) {
    document.addEventListener(name, event => {
      if (event.target instanceof HTMLVideoElement) p.videoEvents.push({ name, at: performance.now(), time: event.target.currentTime, hidden: document.hidden });
    }, true);
  }
});
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const report = { label, url, browser: browser.version(), headless: process.argv.includes('--headless'), viewport, samples: [], errors };
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
async function sample(name, duration = 4000, scrollDistance = 0) {
  const first = await metrics();
  const observed = await page.evaluate(async ({ duration, scrollDistance }) => {
    const p = window.__sitePerf, start = performance.now(), rafBefore = p.rafCalls, scrollStart = scrollY;
    const frames = [];
    let last = start;
    await new Promise(resolve => {
      const tick = time => {
        frames.push(time - last); last = time;
        if (scrollDistance) window.scrollTo({ top: scrollStart + scrollDistance * Math.min(1, (time - start) / duration), behavior: 'instant' });
        if (time - start >= duration) resolve(); else p.originalRAF(tick);
      };
      p.originalRAF(tick);
    });
    const elapsed = performance.now() - start;
    frames.sort((a, b) => a - b);
    const video = document.querySelector('.hero-video');
    const renderer = window.__liquidGLRenderer__;
    return {
      elapsed, fps: frames.length * 1000 / elapsed,
      p95FrameMs: frames[Math.floor(frames.length * .95)], maxFrameMs: frames.at(-1),
      framesOver50ms: frames.filter(x => x > 50).length, appRAFCallbacks: p.rafCalls - rafBefore,
      longTaskMs: p.longtasks.filter(x => x.start >= start).reduce((s, x) => s + x.duration, 0),
      video: video ? { paused: video.paused, time: video.currentTime, ready: video.readyState, error: video.error?.code,
        frames: video.getVideoPlaybackQuality().totalVideoFrames, dropped: video.getVideoPlaybackQuality().droppedVideoFrames } : null,
      canvases: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })),
      texture: renderer ? [renderer.textureWidth, renderer.textureHeight] : null,
      nodes: document.querySelectorAll('*').length,
      inputsDuringSample: p.inputs.filter(e => e.at >= start),
      optics: { surfaces: document.querySelectorAll('.liquid-surface').length, hidden: document.querySelectorAll('[data-glass-visible="false"]').length,
        displacementPasses: document.querySelectorAll('feDisplacementMap').length },
      scrollY,
    };
  }, { duration, scrollDistance });
  const last = await metrics();
  const delta = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(k => [k, last[k] - first[k]]));
  const result = { name, ...observed, delta, heapMB: last.JSHeapUsedSize / 1048576, domCounters: await cdp.send('Memory.getDOMCounters') };
  report.samples.push(result);
  console.log(JSON.stringify(result));
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#projects').waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2000);
  await sample('home-idle');
  await page.screenshot({ path: fileURLToPath(new URL(`${label}-home.png`, out)) });
  await sample('scroll-to-publications', 5000, 2800);
  await sample('publications-idle');
  await page.screenshot({ path: fileURLToPath(new URL(`${label}-publications.png`, out)) });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Home', exact: true }).click();
    await page.waitForTimeout(1800);
    await sample(`home-return-${i + 1}`, 2200);
    if (i < 2) {
      await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Projects', exact: true }).click();
      await page.waitForTimeout(1800);
    }
  }
  report.videoEvents = await page.evaluate(() => window.__sitePerf.videoEvents);
  report.resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /\.(js|tsx|mp4|webp|woff2)/.test(e.name)).map(e => ({ name: e.name, bytes: e.transferSize, duration: e.duration })));
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(new URL(`${label}.json`, out), JSON.stringify(report, null, 2));
  await browser.close();
}
