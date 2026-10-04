import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = 'output/responsive-review';
const only = process.env.RESPONSIVE_CASES?.split(',');
await mkdir(output, { recursive: true });
const report = { base, cases: [], errors: [], performance: [] };
const viewports = [320, 360, 375, 390, 430, 600, 640, 641, 740, 768, 1024, 1440, 1920, 2560]
  .map(width => ({ width, height: width <= 640 ? 844 : 900 }));
viewports.push({ width: 844, height: 390 });

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    for (const viewport of viewports) {
      const label = `${name}-${viewport.width}x${viewport.height}`;
      if (only && !only.includes(label)) continue;
      const touch = viewport.width <= 768 || viewport.height < 500;
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ label, message: error.message, stack: error.stack, url: page.url() }));
      await page.addInitScript(() => {
        window.layoutPerf = { callbacks: 0, raf: requestAnimationFrame.bind(window) };
        window.requestAnimationFrame = callback => window.layoutPerf.raf(t => { window.layoutPerf.callbacks++; callback(t); });
      });
      const result = { label, touch, routes: [] };
      try {
        for (const route of ['/', '/publications']) {
          await page.goto(base + route, { waitUntil: 'domcontentloaded' });
          await page.locator(route === '/' ? '#about' : '.publication-item').first().waitFor({ state: 'attached' });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => window.__liquidGLRenderer__?.hasTexture);
          if (route === '/') assert.equal(await page.locator('.site-header .brand').count(), 0, 'Home must not repeat the name in the header');
          const toggle = page.locator('.header-toggle button');
          if (await toggle.getAttribute('aria-expanded') !== 'true') await (touch ? toggle.tap() : toggle.click());
          await page.waitForTimeout(400);
          const navigation = await page.evaluate(() => {
            const nav = document.querySelector('.header-navigation'), button = document.querySelector('.header-toggle');
            const n = nav.getBoundingClientRect(), b = button.getBoundingClientRect();
            return { left: n.left, right: n.right, top: n.top, toggleTop: b.top, toggleLeft: b.left, toggleRight: b.right,
              viewport: visualViewport.width, height: n.height,
              links: [...nav.querySelectorAll('a')].map(e => {
                const r = e.getBoundingClientRect(), text = e.querySelector('.nav-label').getBoundingClientRect();
                return { label: e.textContent, left: r.left, right: r.right, top: r.top, width: r.width, height: r.height,
                  textFits: text.left >= r.left - 1 && text.right <= r.right + 1 };
              }) };
          });
          assert(Math.abs(navigation.top - navigation.toggleTop) < 1, `${label}: navigation wrapped onto a second row`);
          assert(navigation.left >= 0 && navigation.right <= navigation.toggleLeft - 5 && navigation.toggleRight <= navigation.viewport + 1, `${label}: header overlaps or exceeds viewport`);
          assert(navigation.links.every(l => l.height >= 43.95 && l.width >= 43.95 && l.textFits), `${label}: navigation label or touch target does not fit: ${JSON.stringify(navigation.links)}`);
          assert(navigation.links.every(l => Math.abs(l.top - navigation.links[0].top) < 1), `${label}: links must share a row`);
          if ([320, 390, 640, 1440].includes(viewport.width)) await page.screenshot({ path: `${output}/${label}-${route === '/' ? 'home' : 'publications'}-open.png` });
          await (touch ? toggle.tap() : toggle.click());
          await page.waitForFunction(() => window.__liquidGLRenderer__?.suspended && getComputedStyle(document.querySelector('.header-navigation')).visibility === 'hidden');
          assert(await page.evaluate(() => document.querySelector('.header-navigation').contains(window.__liquidGLRenderer__.canvas)));
          const sections = route === '/' ? ['about', 'news', 'publications', 'projects', 'experience', 'education', 'awards', 'membership'] : [];
          const alignment = [];
          for (const id of sections) {
            await page.locator(`#${id}`).evaluate(e => e.scrollIntoView({ behavior: 'instant', block: 'start' }));
            await page.waitForTimeout(100);
            alignment.push(await page.locator(`#${id} .section-heading`).evaluate(e => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })));
            if (viewport.width === 390 && ['about', 'projects', 'experience', 'membership'].includes(id)) {
              await page.waitForTimeout(300);
              await page.screenshot({ path: `${output}/${label}-${id}.png` });
            }
          }
          const text = await page.evaluate(() => {
            const candidates = [...document.querySelectorAll('main h1, main h2, main h3, main p, main .career-heading, main .membership-heading, main .social-row')];
            // Mobile WebKit can expose horizontal scrolling even when clientWidth equals scrollWidth.
            scrollTo({ left: 1000, top: scrollY, behavior: 'instant' });
            const horizontalScroll = scrollX;
            scrollTo({ left: 0, top: scrollY, behavior: 'instant' });
            return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
              horizontalScroll,
              clipped: candidates.filter(e => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 2);
              }).map(e => ({ tag: e.tagName, className: e.className, text: e.textContent.slice(0, 100) })),
              paragraphSize: getComputedStyle(document.querySelector('main p')).fontSize };
          });
          assert(text.scrollWidth <= text.clientWidth + 1, `${label}: horizontal page overflow`);
          assert(Math.abs(text.horizontalScroll) < 1, `${label}: horizontal scrolling is possible`);
          assert.deepEqual(text.clipped, [], `${label}: clipped text`);
          if (viewport.width <= 640 && route === '/') {
            assert(alignment.every(r => Math.abs(r.left - alignment[0].left) < 1), `${label}: mobile section headings are not aligned`);
          }
          if ([320, 390].includes(viewport.width) && route === '/') {
            for (const button of await page.locator('.showcase-image').all()) {
              await button.tap();
              const dialog = page.locator('.project-dialog[open]');
              await dialog.waitFor();
              await page.waitForFunction(() => getComputedStyle(document.querySelector('.project-dialog[open]')).opacity === '1');
              assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Project detail must not scroll sideways');
              const close = page.getByRole('button', { name: 'Close project', exact: true });
              const r = await close.boundingBox();
              assert(r.y >= 0 && r.x >= 0 && r.width >= 43.95 && r.height >= 43.95, `Close target: ${JSON.stringify(r)}`);
              await close.tap();
            }
          }
          if ([320, 390].includes(viewport.width) && route === '/publications') {
            const thumbnail = page.locator('.publication-thumbnail').first();
            await thumbnail.tap();
            const dialog = page.locator('.image-lightbox[open]');
            await dialog.waitFor();
            assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
            await page.keyboard.press('Escape');
            await dialog.waitFor({ state: 'hidden' });
          }
          result.routes.push({ route, navigation, text, alignment });
        }
        if (name === 'chrome' && viewport.width === 390) {
          await page.locator('.header-toggle button').click();
          await page.waitForTimeout(1800);
          const performance = await page.evaluate(async () => {
            const { raf } = window.layoutPerf;
            const before = window.layoutPerf.callbacks;
            await new Promise(resolve => setTimeout(resolve, 1200));
            const idleCallbacks = window.layoutPerf.callbacks - before;
            const frames = [];
            let previous;
            const startY = scrollY;
            await new Promise(resolve => {
              const start = performance.now();
              const tick = time => {
                if (previous) frames.push(time - previous);
                previous = time;
                scrollTo({ top: startY + Math.min(1, (time - start) / 3000) * 1800, behavior: 'instant' });
                if (time - start < 3000) raf(tick); else resolve();
              };
              raf(tick);
            });
            frames.sort((a, b) => a - b);
            return { idleCallbacks, medianMs: frames[Math.floor(frames.length * .5)], p95Ms: frames[Math.floor(frames.length * .95)], framesOver50ms: frames.filter(n => n > 50).length, count: frames.length };
          });
          report.performance.push({ label, ...performance });
        }
        result.passed = true;
        console.log(`PASS ${label}`);
      } catch (error) {
        result.failure = error.stack;
        await page.screenshot({ path: `${output}/${label}-failure.png` }).catch(() => {});
        console.error(`${label}: ${error.message}`);
        process.exitCode = 1;
      } finally {
        report.cases.push(result);
        await context.close();
      }
    }
  } finally { await browser.close(); }
}
report.passed = report.cases.every(c => c.passed) && report.errors.length === 0;
if (!report.passed) process.exitCode = 1;
await writeFile(`${output}/layout-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, errors: report.errors, performance: report.performance }));
