import { webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const browser = await webkit.launch({ headless: false });
const results = [];
try {
  for (const variant of ['baseline', 'cpu-canvas', 'software-decode', 'copied-frame', 'no-optics']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    try {
      await page.addInitScript(variant => {
        const set = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (key, value) {
          if (this instanceof HTMLVideoElement && key.toLowerCase() === 'autoplay') return;
          return set.call(this, key, value);
        };
        HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('Diagnostic denial', 'NotAllowedError')); };
        if (variant === 'cpu-canvas') {
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, options) {
            return get.call(this, kind, kind === '2d' && this.classList.contains('hero-fallback') ? { ...options, willReadFrequently: true } : options);
          };
        }
      }, variant);
      if (['software-decode', 'copied-frame'].includes(variant)) {
        await page.route('**/heroFrameWorker-*.js', async route => {
          const response = await route.fetch();
          const prefix = variant === 'software-decode' ? `
            const configure = VideoDecoder.prototype.configure;
            VideoDecoder.prototype.configure = function (config) { return configure.call(this, { ...config, hardwareAcceleration: 'prefer-software' }); };
          ` : `
            const send = self.postMessage.bind(self);
            let pending = Promise.resolve();
            self.postMessage = (message, transfer) => {
              if (!message.frame) return send(message, transfer);
              const frame = message.frame;
              pending = pending.then(async () => {
                try {
                  const bytes = new Uint8Array(frame.allocationSize({ format: 'RGBA' }));
                  const layout = await frame.copyTo(bytes, { format: 'RGBA' });
                  const cpu = new VideoFrame(bytes, { format: 'RGBA', codedWidth: frame.codedWidth, codedHeight: frame.codedHeight,
                    timestamp: frame.timestamp, duration: frame.duration, layout });
                  send({ ...message, frame: cpu }, [cpu]);
                } catch (error) { send({ error: error.message }); }
                finally { frame.close(); }
              });
            };
          `;
          await route.fulfill({ response, body: prefix + await response.text() });
        });
      }
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('.hero-fallback[data-media-ready="true"]'), null, { timeout: 25000 });
      await page.getByRole('button', { name: 'Expand menu', exact: true }).tap();
      await page.waitForFunction(() => window.__liquidGLRenderer__?.hasTexture);
      if (variant === 'no-optics') await page.evaluate(() => {
        window.__liquidGLRenderer__.setSuspended(true);
        const style = document.createElement('style');
        style.textContent = '.liquid-surface, .nav-lens { visibility:hidden!important; } * { -webkit-backdrop-filter:none!important;backdrop-filter:none!important;filter:none!important; }';
        document.head.append(style);
      });
      const timing = await page.evaluate(async () => {
        const media = document.querySelector('.hero-fallback');
        const initialFrame = Number(media.dataset.frame);
        const initialTime = Number(media.dataset.time);
        const start = performance.now(), times = [];
        const record = () => times.push(performance.now());
        document.addEventListener('hero-media-frame', record);
        await new Promise(resolve => setTimeout(resolve, 10000));
        document.removeEventListener('hero-media-frame', record);
        const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
        return { initialFrame, initialTime, finalTime: Number(media.dataset.time), frames: Number(media.dataset.frame) - initialFrame,
          elapsed: performance.now() - start, median: gaps[Math.floor(gaps.length * .5)], p95: gaps[Math.floor(gaps.length * .95)] };
      });
      results.push({ variant, ...timing });
      console.log('TRANSFER_DIAGNOSTIC ' + JSON.stringify(results.at(-1)));
    } catch (error) {
      results.push({ variant, error: error.message });
      console.log('TRANSFER_DIAGNOSTIC ' + JSON.stringify(results.at(-1)));
    } finally { await page.close(); }
  }
} finally {
  await browser.close();
  await mkdir('output/verification', { recursive: true });
  await writeFile('output/verification/hero-transfer-diagnostic.json', JSON.stringify(results, null, 2));
}
