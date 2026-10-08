import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv[2] || 'baseline';
const base = process.argv[3] || 'http://127.0.0.1:4181';
const mode = process.argv[4] || 'all';
const out = `output/performance-pass/${label}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { label, base, browser: browser.version(), viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 4, slowNetwork: { bytesPerSecond: 300 * 1024, rttMs: 150 }, routes: [], dialogs: [], errors: [] };

async function setup(slow = false) {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: report.dpr });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => {
    window.__perfPass = { frames: [], longtasks: [], headingInkReady: null, headingAligned: null, recording: false, last: null };
    const state = window.__perfPass;
    new PerformanceObserver(list => state.longtasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true });
    const tick = time => {
      if (state.recording && state.last !== null) state.frames.push({ at: time, gap: time - state.last });
      state.last = time;
      if (!state.headingInkReady || !state.headingAligned) {
        const heading = document.querySelector('.section-heading h1, .section-heading h2');
        if (heading) {
          const css = getComputedStyle(heading);
          const wallpaper = document.querySelector('.site-backdrop img');
          const backgroundReady = wallpaper?.complete && wallpaper.naturalWidth > 0;
          if (!state.headingInkReady && (backgroundReady || !['rgba(0, 0, 0, 0)', 'transparent'].includes(css.backgroundColor))) state.headingInkReady = time;
          if (!state.headingAligned && css.getPropertyValue('--wall-position').trim()) state.headingAligned = time;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (slow) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 300 * 1024, uploadThroughput: 300 * 1024 });
  return { context, page, cdp };
}

async function startTrace(cdp) {
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8.execute', transferMode: 'ReturnAsStream' });
}

async function stopTrace(cdp, name) {
  const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let text = '';
  for (;;) {
    const part = await cdp.send('IO.read', { handle: stream });
    text += part.data;
    if (part.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  await writeFile(`${out}/${name}-trace.json`, text);
  return JSON.parse(text).traceEvents;
}

function traceSummary(events, startMark, endMark) {
  const start = events.find(e => e.name === startMark);
  const end = events.find(e => e.name === endMark);
  if (!start || !end) return { missingMarks: [startMark, endMark] };
  const work = events.filter(e => e.ph === 'X' && e.pid === start.pid && e.tid === start.tid && e.ts >= start.ts && e.ts < end.ts);
  const tasks = work.filter(e => /RunTask|ThreadControllerImpl::RunTask/.test(e.name));
  const longest = tasks.sort((a, b) => b.dur - a.dur).slice(0, 8).map(e => ({ durationMs: e.dur / 1000, sources: work.filter(x => x !== e && x.ts >= e.ts && x.ts < e.ts + e.dur && ['FunctionCall', 'Layout', 'UpdateLayoutTree', 'Paint', 'ImageDecodeTask', 'Decode Image'].includes(x.name)).sort((a, b) => b.dur - a.dur).slice(0, 8).map(x => ({ name: x.name, durationMs: x.dur / 1000, data: x.args?.data })) }));
  return { durationMs: (end.ts - start.ts) / 1000, maxTaskMs: Math.max(0, ...tasks.map(e => e.dur / 1000)), tasksOver30: tasks.filter(e => e.dur > 30000).length, longest };
}

async function frames(page, since = 0) {
  return page.evaluate(since => {
    const data = window.__perfPass;
    const gaps = data.frames.filter(f => f.at >= since).map(f => f.gap).sort((a, b) => a - b);
    return { count: gaps.length, p95Ms: gaps[Math.floor(gaps.length * .95)] || 0, maxMs: gaps.at(-1) || 0, over50: gaps.filter(x => x > 50).length, longtasks: data.longtasks.filter(t => t.start >= since) };
  }, since);
}

async function routeMeasurement(route) {
  const { context, page, cdp } = await setup(true);
  const requests = new Map();
  let measuring = true;
  cdp.on('Network.requestWillBeSent', e => { if (measuring) requests.set(e.requestId, { url: e.request.url, type: e.type, priority: e.request.initialPriority, bytes5s: 0 }); });
  cdp.on('Network.dataReceived', e => { if (measuring && requests.has(e.requestId)) requests.get(e.requestId).bytes5s += e.encodedDataLength; });
  await startTrace(cdp);
  const start = Date.now();
  await page.goto(`${base}${route}?glass=full`, { waitUntil: 'commit', timeout: 120000 });
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 5000 - (Date.now() - start))));
  measuring = false;
  const first5s = { elapsedMs: Date.now() - start, bytes: [...requests.values()].reduce((n, e) => n + e.bytes5s, 0), requests: [...requests.values()] };
  await page.locator('.section-heading').first().waitFor({ state: 'attached', timeout: 120000 });
  await page.waitForFunction(() => window.__perfPass.headingInkReady !== null, { timeout: 120000 });
  const heading = await page.evaluate(() => ({ inkReadyMs: window.__perfPass.headingInkReady, alignedMs: window.__perfPass.headingAligned }));
  await page.evaluate(() => performance.mark('scroll-start'));
  const scrollStart = await page.evaluate(async () => {
    const state = window.__perfPass;
    state.recording = true;
    const begin = performance.now();
    const top = scrollY;
    await new Promise(resolve => {
      const tick = now => {
        scrollTo({ top: top + Math.min(1, (now - begin) / 3000) * 2400, behavior: 'instant' });
        if (now - begin >= 3000) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    state.recording = false;
    return begin;
  });
  await page.evaluate(() => performance.mark('scroll-end'));
  const scroll = await frames(page, scrollStart);
  const trace = await stopTrace(cdp, route === '/' ? 'home' : 'publications');
  const item = { route, first5s, heading, scroll, scrollTrace: traceSummary(trace, 'scroll-start', 'scroll-end') };
  report.routes.push(item);
  console.log(JSON.stringify({ route, first5sBytes: first5s.bytes, requests: first5s.requests.length, heading, scroll }));
  await context.close();
}

async function dialogMeasurements() {
  const { context, page, cdp } = await setup();
  await page.goto(`${base}/publications?glass=full`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const ids = await page.locator('[data-publication-id]').evaluateAll(es => es.map(e => e.dataset.publicationId));
  await startTrace(cdp);
  async function measure(id, button, dialog, close) {
    await button.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await button.locator('img').evaluate(i => i.decode().catch(() => {}));
    // Warm the full image and browser cache, then measure the next ordinary interaction.
    await button.hover();
    await button.click();
    await dialog.locator('[data-unused]').count();
    await page.waitForFunction(() => !!document.querySelector('dialog[open][data-settled]'));
    await dialog.locator('img').first().evaluate(i => i.decode().catch(() => {}));
    await close.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForTimeout(700);
    await page.mouse.move(2, 880);
    const start = await page.evaluate(id => { window.__perfPass.recording = true; performance.mark(`${id}:open-start`); return performance.now(); }, id);
    await button.click();
    await dialog.waitFor({ state: 'visible' });
    const appeared = await page.evaluate(() => performance.now());
    await page.waitForFunction(() => !!document.querySelector('dialog[open][data-settled]'));
    await page.waitForTimeout(180);
    await page.evaluate(id => performance.mark(`${id}:open-end`), id);
    const openFrames = await frames(page, start);
    const closeStart = await page.evaluate(id => { performance.mark(`${id}:close-start`); return performance.now(); }, id);
    await close.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForTimeout(180);
    await page.evaluate(id => { performance.mark(`${id}:close-end`); window.__perfPass.recording = false; }, id);
    const closeFrames = await frames(page, closeStart);
    const item = { id, appearedMs: appeared - start, openFrames, closeFrames };
    report.dialogs.push(item);
    console.log(JSON.stringify(item));
  }
  for (const id of ids) await measure(id, page.locator(`[data-publication-id="${id}"] .publication-thumbnail`), page.locator('.image-lightbox'), page.getByRole('button', { name: 'Close image preview', exact: true }));
  await page.goto(`${base}/?glass=full#projects`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const projectButtons = page.locator('.showcase-image');
  for (let i = 0; i < await projectButtons.count(); i++) await measure(`project-${i}`, projectButtons.nth(i), page.locator('.project-dialog'), page.getByRole('button', { name: 'Close project', exact: true }));
  const trace = await stopTrace(cdp, 'dialogs');
  for (const item of report.dialogs) {
    item.openTrace = traceSummary(trace, `${item.id}:open-start`, `${item.id}:open-end`);
    item.closeTrace = traceSummary(trace, `${item.id}:close-start`, `${item.id}:close-end`);
  }
  await context.close();
}

try {
  if (mode === 'all' || mode === 'network') for (const route of ['/', '/publications']) await routeMeasurement(route);
  if (mode === 'all' || mode === 'dialogs') await dialogMeasurements();
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(`${out}/${mode}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
