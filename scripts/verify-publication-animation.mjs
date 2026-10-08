import assert from 'node:assert/strict';
import { chromium, webkit, firefox, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:4182';
const output = process.env.ANIMATION_OUTPUT || 'output/performance-pass/animation';
const appOnly = process.env.ANIMATION_APP_ONLY === '1';
const onlyProfiles = process.env.ANIMATION_PROFILES?.split(',');
await mkdir(output, { recursive: true });
const report = { base, cases: [], errors: [] };
const prefix = '/media/derived/pub-lagrange-rotation';
const iphone = devices['iPhone 13'];
const profiles = [
  { engine: 'chrome', launcher: chromium, expected: 'avif' },
  { engine: 'webkit', launcher: webkit, expected: 'webp', options: iphone },
  { engine: 'firefox', launcher: firefox, expected: 'avif' },
  // Chromium can decode AVIF: this proves the app explicitly bypasses it for Apple browsers.
  { engine: 'ios-safari-routing', launcher: chromium, expected: 'webp', options: iphone, appOnly: true },
  { engine: 'ios-chrome-routing', launcher: chromium, expected: 'webp',
    options: { ...iphone, userAgent: iphone.userAgent.replace(/Version\/[^ ]+/, 'CriOS/154.0.0.0') }, appOnly: true, routingOnly: true },
  { engine: 'ipad-desktop-routing', launcher: chromium, expected: 'webp',
    options: { ...devices['Desktop Safari'], hasTouch: true }, appOnly: true, routingOnly: true },
  { engine: 'android-chrome-routing', launcher: chromium, expected: 'avif',
    options: devices['Pixel 7'], appOnly: true, routingOnly: true },
];

async function watchAnimation(page, selector, duration = 6600) {
  return page.locator(selector).evaluate(async (image, duration) => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 62;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const start = performance.now(), frames = [], samples = [];
    let last = start, sampled = start - 200;
    await new Promise(resolve => {
      const tick = now => {
        frames.push(now - last); last = now;
        if (now - sampled >= 200) {
          sampled = now;
          ctx.clearRect(0, 0, 160, 62);
          ctx.drawImage(image, 0, 0, 160, 62);
          const pixels = ctx.getImageData(0, 0, 160, 62).data;
          const models = [0, 0, 0, 0];
          let painted = 0;
          for (let y = 0; y < 62; y++) for (let x = 0; x < 160; x++) {
            const offset = (y * 160 + x) * 4;
            const alpha = pixels[offset + 3];
            painted += alpha > 0 ? 1 : 0;
            models[Math.floor(x / 40)] = (models[Math.floor(x / 40)] * 31 + pixels[offset] * alpha + pixels[offset + 1] + alpha) >>> 0;
          }
          samples.push({ at: now - start, models, painted, cornerAlpha: [pixels[3], pixels[159 * 4 + 3], pixels[(61 * 160) * 4 + 3], pixels[(62 * 160 - 1) * 4 + 3]] });
        }
        if (now - start < duration) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    frames.sort((a, b) => a - b);
    return { src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight,
      frames: { count: frames.length, p95Ms: frames[Math.floor(frames.length * .95)], maxMs: frames.at(-1), over50: frames.filter(n => n > 50).length },
      samples, modelStates: [0, 1, 2, 3].map(i => new Set(samples.map(s => s.models[i])).size),
      changingAfterLoop: new Set(samples.filter(s => s.at > 5900).map(s => s.models.join(','))).size };
  }, duration);
}

function verify(result) {
  assert(result.samples.every(s => s.painted > 100 && s.cornerAlpha.every(a => a === 0)), 'Transparent corners and visible model pixels');
}

// Canvas drawImage(animatedImage) exposes its default frame, not the painted animation.
// Sample compositor screenshots separately so capture cost cannot distort the RAF trace.
async function verifyPaintedAnimation(page, selector) {
  const samples = [], start = Date.now();
  for (let index = 0; index < 15; index++) {
    if (index) await page.waitForTimeout(500);
    const png = await page.locator(selector).screenshot();
    const models = await page.evaluate(async data => {
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 62;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 160, 62);
      const pixels = ctx.getImageData(0, 0, 160, 62).data, hashes = [0, 0, 0, 0];
      for (let y = 0; y < 62; y++) for (let x = 0; x < 160; x++) {
        const i = (y * 160 + x) * 4, quarter = Math.floor(x / 40);
        hashes[quarter] = (hashes[quarter] * 31 + pixels[i] + pixels[i + 1] * 3 + pixels[i + 2] * 7) >>> 0;
      }
      return hashes;
    }, `data:image/png;base64,${png.toString('base64')}`);
    samples.push({ at: Date.now() - start, models });
  }
  const modelStates = [0, 1, 2, 3].map(i => new Set(samples.map(s => s.models[i])).size);
  assert(modelStates.every(n => n >= 10), `All four painted models must animate: ${JSON.stringify(modelStates)}`);
  assert(new Set(samples.filter(s => s.at > 5900).map(s => s.models.join(','))).size >= 2, 'Painted animation must continue beyond its six-second loop');
  return { samples, modelStates };
}

try {
  for (const profile of profiles) {
    if (onlyProfiles && !onlyProfiles.includes(profile.engine)) continue;
    const { engine, launcher } = profile;
    const browser = await launcher.launch({ headless: true, ...(launcher === chromium ? { channel: 'chrome' } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...profile.options });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ engine, message: error.message }));
      await page.route('**/__perf_animation', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#d2d4d4"></body></html>' }));
      for (const format of appOnly || profile.appOnly ? [] : ['avif', 'webp']) for (const size of ['thumb', 'full']) {
        await page.goto(`${base}/__perf_animation`);
        await page.setContent(`<style>body{margin:0;background:#d2d4d4}img{display:block;max-width:100%;height:auto}</style><picture>${format === 'avif' ? `<source type="image/avif" srcset="${prefix}.${size}.avif">` : ''}<img id="animation" src="${prefix}.${size}.webp"></picture>`);
        await page.locator('#animation').evaluate(image => image.decode());
        let cdp;
        if (engine === 'chrome') {
          cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
        }
        const result = await watchAnimation(page, '#animation');
        report.cases.push({ engine, format, size, ...result });
        if (!result.src.endsWith(`.${format}`)) {
          const supportsAvif = await page.evaluate(async src => {
            const probe = new Image(); probe.src = src;
            return probe.decode().then(() => true, () => false);
          }, `${prefix}.${size}.avif`);
          assert(format === 'avif' && !supportsAvif && result.src.endsWith('.webp'), `${engine} must select AVIF or a working native WebP fallback`);
          result.nativeAvifUnsupported = true;
        }
        verify(result);
        await page.screenshot({ path: `${output}/${engine}-${format}-${size}.png` });
        if (cdp) {
          const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
          await cdp.send('Tracing.end');
          const { stream } = await done;
          let text = '';
          for (;;) { const part = await cdp.send('IO.read', { handle: stream }); text += part.data; if (part.eof) break; }
          await cdp.send('IO.close', { handle: stream });
          await writeFile(`${output}/chrome-${format}-${size}-trace.json`, text);
          const decodes = JSON.parse(text).traceEvents.filter(e => e.ph === 'X' && /Decode.*Image|Image.*Decode/i.test(e.name)).map(e => e.dur / 1000).sort((a, b) => a - b);
          result.decode = { count: decodes.length, medianMs: decodes[Math.floor(decodes.length / 2)], p95Ms: decodes[Math.floor(decodes.length * .95)], maxMs: decodes.at(-1) };
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          await cdp.detach();
        }
        result.painted = await verifyPaintedAnimation(page, '#animation');
        Object.assign(report.cases.at(-1), result);
        console.log(JSON.stringify({ engine, format, size, src: result.src, models: result.modelStates, frames: result.frames, decode: result.decode }));
      }
      await page.goto(`${base}/publications?glass=${profile.options ? 'lite' : 'full'}`, { waitUntil: 'domcontentloaded' });
      const button = page.locator('[data-publication-id="P1"] .publication-thumbnail');
      const fullRequests = [];
      const animationRequests = [];
      page.on('request', request => {
        if (request.url().includes(prefix)) animationRequests.push(request.url());
        if (/pub-lagrange-rotation\.full\.(avif|webp)/.test(request.url())) fullRequests.push(request.url());
      });
      await button.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector('[data-publication-id="P1"] img');
        return image?.complete && image.naturalWidth > 0;
      });
      await button.locator('img').evaluate(image => image.decode());
      const thumbnail = await watchAnimation(page, '[data-publication-id="P1"] img', 250);
      verify(thumbnail);
      assert(thumbnail.src.endsWith(`.thumb.${profile.expected}`), `${engine}: thumbnail must select ${profile.expected}`);
      assert.equal(await button.locator('source[type="image/avif"]').count(), profile.expected === 'avif' ? 1 : 0);
      if (!profile.routingOnly) thumbnail.painted = await verifyPaintedAnimation(page, '[data-publication-id="P1"] img');
      const frame = await button.evaluate(element => {
        const box = element.getBoundingClientRect();
        return { ratio: box.width / box.height, background: getComputedStyle(element).backgroundColor };
      });
      assert(Math.abs(frame.ratio - 504 / 300) < .005, 'Keep the fixed publication frame ratio');
      assert.equal(frame.background, 'rgba(0, 0, 0, 0)');
      await page.screenshot({ path: `${output}/${engine}-thumbnail.png` });
      await button.hover();
      await button.focus();
      await page.waitForTimeout(300);
      assert.deepEqual(fullRequests, [], 'P1 full image must not download before opening, including hover and focus');
      await button.click();
      await page.locator('.image-lightbox[open][data-settled]').waitFor();
      const result = await watchAnimation(page, '.image-lightbox[open] img', appOnly || profile.appOnly ? 250 : 6600);
      verify(result);
      assert(result.src.endsWith(`.full.${profile.expected}`), `${engine}: lightbox must select ${profile.expected}`);
      assert.equal(await page.locator('.image-lightbox[open] source[type="image/avif"]').count(), profile.expected === 'avif' ? 1 : 0);
      if (!profile.routingOnly) result.painted = await verifyPaintedAnimation(page, '.image-lightbox[open] img');
      if (profile.expected === 'webp') assert(animationRequests.every(url => !url.endsWith('.avif')), `${engine}: never request the incompatible animated AVIF`);
      assert.equal(await page.locator('.lightbox-paper').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)');
      await page.screenshot({ path: `${output}/${engine}-lightbox.png` });
      report.cases.push({ engine, size: 'lightbox', thumbnail, frame, animationRequests, ...result });
      console.log(JSON.stringify({ engine, thumbnail: thumbnail.src, full: result.src, transparent: true, models: result.painted?.modelStates, frame }));
      await context.close();
    } finally { await browser.close(); }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
