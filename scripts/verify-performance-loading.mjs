import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://127.0.0.1:4182';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base, checks: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pendingImages = [];
  await page.addInitScript(() => {
    window.__snapshotImages = [];
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      if (source instanceof HTMLImageElement && /pub-/.test(source.currentSrc)) window.__snapshotImages.push(source.currentSrc);
      return draw.call(this, source, ...args);
    };
  });
  page.on('request', request => { if (request.resourceType() === 'image') pendingImages.push(request.url()); });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`${base}/?glass=full`, { waitUntil: 'commit' });
  await page.waitForTimeout(5000);
  const belowFold = pendingImages.filter(url => /pub-|lc4dvit|\/logos\//.test(url));
  assert.deepEqual(belowFold, [], 'Unvisited publications and logos must not download on the first screen');
  report.checks.push({ name: 'native-lazy-loading', belowFoldRequests: belowFold, imageRequests: [...pendingImages] });

  await page.locator('#publications').scrollIntoViewIfNeeded();
  await page.locator('#publications img').first().evaluate(image => image.decode());
  await page.waitForTimeout(900);
  const loaded = await page.evaluate(() => {
    const renderer = window.__liquidGLRenderer__;
    const image = document.querySelector('#publications img');
    return { image: image.currentSrc, complete: image.complete, texture: [renderer?.textureWidth, renderer?.textureHeight], capturing: renderer?._capturing, drawn: window.__snapshotImages.includes(image.currentSrc) };
  });
  assert(loaded.complete && loaded.drawn && loaded.texture.every(v => v > 0));
  report.checks.push({ name: 'lazy-image-followup-snapshot', ...loaded });

  const messages = [];
  page.on('console', message => messages.push({ type: message.type(), text: message.text() }));
  const retry = await page.evaluate(async () => {
    const renderer = window.__liquidGLRenderer__;
    while (renderer._capturing) await new Promise(resolve => setTimeout(resolve, 50));
    const upload = renderer._uploadTexture;
    let attempts = 0;
    renderer._uploadTexture = function (...args) { attempts++; return attempts === 1 ? false : upload.apply(this, args); };
    try { await renderer.captureSnapshot(); return { attempts, texture: [renderer.textureWidth, renderer.textureHeight] }; }
    finally { renderer._uploadTexture = upload; }
  });
  assert(retry.attempts >= 2 && retry.texture.every(v => v > 0));
  assert(messages.some(m => m.type === 'error' && m.text.includes('snapshot failed on attempt')));
  assert(!messages.some(m => m.text.includes('Retrying snapshot capture')));
  report.checks.push({ name: 'snapshot-retry-after-log-removal', ...retry });
  await page.close();

  const original = execFileSync('git', ['show', 'e44b6b7:src/styles/global.css'], { encoding: 'utf8' });
  const current = await readFile('src/styles/global.css', 'utf8');
  const fixture = await browser.newPage();
  for (const width of [390, 1440]) {
    await fixture.setViewportSize({ width, height: 900 });
    const readStyles = async css => {
      await fixture.setContent('<style></style><div class="post-grid"><article class="post-card"><div class="post-card-meta">Meta</div><h3>Title</h3><p>Body</p></article></div>');
      return fixture.evaluate(css => {
        document.querySelector('style').textContent = css;
        return [...document.querySelectorAll('.post-grid,.post-card,.post-card-meta,.post-card h3')].map(element => {
          const style = getComputedStyle(element);
          return Object.fromEntries(['border', 'borderRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'lineHeight', 'textTransform', 'minHeight', 'margin', 'padding', 'gridTemplateColumns'].map(p => [p, style[p]]));
        });
      }, css);
    };
    assert.deepEqual(await readStyles(current), await readStyles(original));
    report.checks.push({ name: 'shadowed-css-removal', width, identical: true });
  }
  await fixture.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  await mkdir('output/performance-pass', { recursive: true });
  await writeFile('output/performance-pass/loading-checks.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
