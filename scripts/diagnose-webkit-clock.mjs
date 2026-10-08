import { mkdir, writeFile } from 'node:fs/promises';
import { webkit } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const results = [];
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

async function sample(label) {
  const result = await page.evaluate(async () => {
    const rafs = [], timers = [], frames = [];
    let raf = 0;
    const start = performance.now();
    const tick = () => { rafs.push(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const timer = setInterval(() => timers.push(performance.now()), 33);
    const frame = () => frames.push(performance.now());
    document.addEventListener('hero-media-frame', frame);
    await new Promise(resolve => setTimeout(resolve, 5000));
    cancelAnimationFrame(raf);
    clearInterval(timer);
    document.removeEventListener('hero-media-frame', frame);
    const summarize = values => {
      const gaps = values.slice(1).map((value, i) => value - values[i]).sort((a, b) => a - b);
      return { count: values.length, median: gaps[Math.floor(gaps.length / 2)], p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1) };
    };
    return { elapsed: performance.now() - start, raf: summarize(rafs), timer: summarize(timers), frames: summarize(frames),
      visible: document.visibilityState, focused: document.hasFocus(), ua: navigator.userAgent,
      renderer: window.__liquidGLRenderer__ && { suspended: window.__liquidGLRenderer__.suspended, backend: window.__liquidGLRenderer__.backend.kind } };
  });
  results.push({ label, ...result });
  console.log('CLOCK ' + JSON.stringify(results.at(-1)));
}

try {
  await page.bringToFront();
  await page.goto('about:blank');
  await sample('blank-before');
  await page.addInitScript(() => {
    const set = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this instanceof HTMLVideoElement && name.toLowerCase() === 'autoplay') return;
      return set.call(this, name, value);
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.matches('.hero-video')) return play.call(this);
      this.pause();
      return Promise.reject(new DOMException('Diagnostic: blocked autoplay', 'NotAllowedError'));
    };
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.hero-fallback[data-media-ready="true"]').waitFor();
  await sample('canvas-menu-closed');
  await page.getByRole('button', { name: 'Expand menu', exact: true }).tap();
  await page.waitForFunction(() => window.__liquidGLRenderer__?.hasTexture);
  await sample('canvas-menu-open');
  // Diagnostic only: isolate compositor sampling without changing the application source.
  await page.evaluate(() => { window.__liquidGLRenderer__.suspended = true; });
  await sample('canvas-glass-suspended');
  await page.goto('about:blank');
  await sample('blank-after');
} finally {
  await browser.close();
  await mkdir('output/verification', { recursive: true });
  await writeFile('output/verification/webkit-clock.json', JSON.stringify(results, null, 2));
}
