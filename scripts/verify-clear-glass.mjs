import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const width = Number(process.argv[3] || 1440);
const output = 'output/playwright';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width, height: 900 } });
const report = { url, width, browser: browser.version(), errors: [], checks: [] };
page.on('pageerror', error => report.errors.push(error.message));
const screenshot = name => page.screenshot({ path: `${output}/refined-${width}-${name}.png` });
const nav = page.getByRole('navigation', { name: 'Sections' });
const toggle = page.locator('.header-toggle button');
const ready = () => page.waitForFunction(() => window.__liquidGLRenderer__?.hasTexture && typeof window.__liquidGLRenderer__.invalidate === 'function');
const settled = () => page.waitForFunction(() => {
  const lens = document.querySelector('.nav-lens')?.getBoundingClientRect();
  const link = document.querySelector('.nav-links a[aria-current]')?.getBoundingClientRect();
  return lens && link && Math.abs(lens.left - link.left) < 0.6 && Math.abs(lens.width - link.width) < 0.6;
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready();
  await page.waitForFunction(() => document.querySelector('.site-backdrop img')?.naturalWidth > 0);
  assert.equal(await page.locator('.site-backdrop img').getAttribute('src'), '/media/cold-stone.webp');
  assert.equal(await page.locator('.site-backdrop').evaluate(element => getComputedStyle(element, '::after').content), 'none');
  await page.waitForTimeout(800);
  report.capabilities = await page.evaluate(() => ({ webgpu: !!navigator.gpu, htmlInCanvas: 'drawElementImage' in CanvasRenderingContext2D.prototype }));
  await page.evaluate(() => { window.__originalGlassRenderer = window.__liquidGLRenderer__; });
  assert.equal(await page.locator('.showcase-card').count(), 3);
  assert.equal(await page.locator('h1 .liquid-surface, h2 .liquid-surface').count(), 0);
  assert.deepEqual(await nav.locator('a').allTextContents(), ['Home', 'About', 'Publications', 'Projects']);
  assert.equal(await page.locator('#blog, a[href*="blog"], .post-card').count(), 0);
  assert.match(await page.locator('.site-footer').innerText(), /^Renjun Gao © \d{4}\. All rights reserved\.$/);
  const foreground = () => page.locator('.nav-links a, .header-toggle button').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
  assert((await foreground()).every(color => color === 'rgb(255, 255, 255)'));
  await page.waitForTimeout(600);
  assert((await foreground()).every(color => color === 'rgb(255, 255, 255)'));
  report.checks.push('four-navigation-links-no-blog', 'concise-footer', 'stable-Home-foreground');
  report.homeOptics = await page.evaluate(() => ({ blur: getComputedStyle(document.querySelector('.header-navigation')).getPropertyValue('--glass-blur'), options: window.__liquidGLRenderer__.lenses[0].options }));
  assert.equal(report.homeOptics.options.frost, 0);
  assert.equal(report.homeOptics.options.aberration, 0);
  await screenshot('home');

  const toggleBounds = await toggle.boundingBox();
  await page.mouse.move(toggleBounds.x + toggleBounds.width / 2, toggleBounds.y + toggleBounds.height / 2);
  await page.waitForTimeout(220);
  assert.equal(await page.locator('.header-toggle').evaluate(element => getComputedStyle(element).transform), 'none');
  assert.equal((await toggle.boundingBox()).y, toggleBounds.y);
  await page.mouse.down();
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.header-toggle')).transform).a < 0.97);
  await page.mouse.up();
  await page.waitForTimeout(60);
  const intermediate = await page.locator('.header-navigation').evaluate(element => ({ opacity: Number(getComputedStyle(element).opacity), transform: getComputedStyle(element).transform }));
  assert(intermediate.opacity > 0 && intermediate.opacity < 1, 'Menu closing must have an intermediate frame');
  await screenshot('menu-closing');
  await page.waitForFunction(() => window.__liquidGLRenderer__.suspended && getComputedStyle(document.querySelector('.header-navigation')).visibility === 'hidden');
  assert.equal(await page.locator('#site-navigation').evaluate(element => element.inert), true);
  await toggle.click();
  await page.waitForTimeout(60);
  const openingOpacity = await page.locator('.header-navigation').evaluate(element => Number(getComputedStyle(element).opacity));
  assert(openingOpacity > 0 && openingOpacity < 1, 'Menu opening must have an intermediate frame');
  await toggle.click();
  await page.waitForTimeout(60);
  await toggle.click();
  await page.waitForFunction(() => !window.__liquidGLRenderer__.suspended && getComputedStyle(document.querySelector('.header-navigation')).opacity === '1');
  assert.equal(await page.evaluate(() => window.__originalGlassRenderer === window.__liquidGLRenderer__), true);
  await nav.getByRole('link', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('Escape');
  assert.equal(await toggle.evaluate(element => document.activeElement === element), true);
  await toggle.click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.header-navigation')).opacity === '1');
  report.checks.push('animated-open-and-close', 'no-hover-lift-retained-press', 'rapid-toggle-reversal', 'inert-and-Escape-focus', 'renderer-retained');

  await nav.getByRole('link', { name: 'About', exact: true }).click();
  await page.waitForTimeout(1300);
  await page.locator('.about-portrait img').evaluate(image => image.decode());
  await settled();
  assert((await page.locator('.social-glass .glass-action').evaluateAll(elements => elements.map(element => getComputedStyle(element).color))).every(color => color === 'rgb(32, 36, 40)'));
  await screenshot('about');

  await nav.getByRole('link', { name: 'Publications', exact: true }).click();
  assert.equal(await nav.getByRole('link', { name: 'Publications', exact: true }).getAttribute('aria-current'), 'location');
  await page.waitForTimeout(1400);
  await settled();
  report.bodyOptics = await page.evaluate(() => ({ blur: getComputedStyle(document.querySelector('.header-navigation')).getPropertyValue('--glass-blur'), options: window.__liquidGLRenderer__.lenses[0].options }));
  assert.equal(report.homeOptics.blur, report.bodyOptics.blur);
  assert.equal(report.bodyOptics.options.frost, 0);
  assert.equal(report.bodyOptics.options.frameloop, 'demand');
  await screenshot('publications');
  const capturedBackdrop = await page.evaluate(() => {
    const renderer = window.__liquidGLRenderer__;
    const rect = document.querySelector('.header-navigation').getBoundingClientRect();
    const crop = Object.assign(document.createElement('canvas'), { width: Math.round(rect.width), height: Math.round(rect.height) });
    const scale = renderer.scaleFactor;
    crop.getContext('2d').drawImage(renderer.staticSnapshotCanvas, (rect.left + scrollX) * scale, (rect.top + scrollY) * scale, rect.width * scale, rect.height * scale, 0, 0, crop.width, crop.height);
    return crop.toDataURL('image/png').split(',')[1];
  });
  await writeFile(`${output}/refined-${width}-captured-backdrop.png`, Buffer.from(capturedBackdrop, 'base64'));
  report.checks.push('immediate-selection', 'matching-clear-materials');

  const bodyForeground = await foreground();
  assert(bodyForeground.every(color => color === 'rgb(32, 36, 40)'));
  for (const background of ['#fff', '#111', '#777']) {
    await page.evaluate(background => {
      const fixture = document.getElementById('contrast-test') || Object.assign(document.createElement('div'), { id: 'contrast-test' });
      fixture.style.cssText = `position:fixed;inset:0 0 auto;height:115px;background:${background};z-index:19;`;
      document.body.append(fixture);
      window.dispatchEvent(new Event('scroll'));
    }, background);
    await page.waitForTimeout(300);
    assert.deepEqual(await foreground(), bodyForeground, 'Backdrop changes must not recolor individual controls');
    assert.equal(await page.locator('[data-glass-contrast]').count(), 0);
    const colors = await toggle.evaluate(element => ({ text: getComputedStyle(element).color, icon: getComputedStyle(element.querySelector('svg')).color }));
    assert.equal(colors.text, colors.icon);
  }
  await page.evaluate(() => { document.getElementById('contrast-test').remove(); window.dispatchEvent(new Event('scroll')); });
  report.checks.push('no-backdrop-recoloring', 'matching-text-and-icons');

  const paperControl = page.locator('.publication-links .liquid-surface').first();
  await paperControl.scrollIntoViewIfNeeded();
  const paperBounds = await paperControl.boundingBox();
  await page.mouse.move(paperBounds.x + paperBounds.width / 2, paperBounds.y + paperBounds.height / 2);
  await page.waitForTimeout(220);
  assert.equal(await paperControl.evaluate(element => getComputedStyle(element).transform), 'none');
  assert.equal((await paperControl.boundingBox()).y, paperBounds.y);
  assert.notEqual(await paperControl.locator('.glass-action').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.mouse.move(0, 115);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.publication-links .liquid-surface')).transform === 'none');
  report.checks.push('stationary-highlight-only-hover', 'unmasked-selected-stone-background');

  await nav.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.waitForTimeout(1300);
  await settled();
  const card = await page.locator('.showcase-card').first().boundingBox();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.showcase-overlay')).opacity === '1');
  const projectInks = await page.locator('.showcase-glass').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
  assert.deepEqual(projectInks, ['rgb(255, 255, 255)', 'rgb(32, 36, 40)', 'rgb(32, 36, 40)']);
  await screenshot('projects');
  await page.locator('.showcase-image').first().click();
  await page.locator('.project-dialog[open]').waitFor();
  await page.getByRole('button', { name: 'Close project', exact: true }).click();

  const bar = page.locator('.os-scrollbar-vertical.os-theme-glass');
  const handle = bar.locator('.os-scrollbar-handle');
  await page.mouse.move(300, 200);
  await page.mouse.wheel(0, 160);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.os-scrollbar-vertical')).opacity === '1');
  const handleBounds = await handle.boundingBox();
  assert.equal(handleBounds.width, 6);
  const fade = await page.evaluate(async () => {
    const bar = document.querySelector('.os-scrollbar-vertical');
    const start = performance.now();
    let sawIntermediate = false;
    await new Promise((resolve, reject) => {
      const check = () => {
        const opacity = Number(getComputedStyle(bar).opacity);
        if (bar.classList.contains('os-scrollbar-auto-hide-hidden') && opacity > 0 && opacity < 1) sawIntermediate = true;
        if (opacity === 0) return resolve();
        if (performance.now() - start > 4000) return reject(new Error('Scrollbar did not fade after idle'));
        requestAnimationFrame(check);
      };
      check();
    });
    return { elapsedMs: performance.now() - start, sawIntermediate };
  });
  assert(fade.sawIntermediate, 'Idle scrollbar must fade, not disappear abruptly');
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.os-scrollbar-vertical')).opacity === '1');
  const dragBounds = await handle.boundingBox();
  const beforeDrag = await page.evaluate(() => scrollY);
  await page.mouse.move(dragBounds.x + dragBounds.width / 2, dragBounds.y + dragBounds.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1400);
  assert.equal(await bar.evaluate(element => getComputedStyle(element).opacity), '1');
  await page.mouse.move(dragBounds.x + dragBounds.width / 2, dragBounds.y + dragBounds.height / 2 + 35, { steps: 8 });
  await page.mouse.up();
  assert(await page.evaluate(() => scrollY) > beforeDrag + 20, 'Thin scrollbar must remain draggable');
  await page.mouse.move(300, 200);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.os-scrollbar-vertical')).opacity === '0');
  await page.keyboard.press('Tab');
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1500);
  assert.equal(await bar.evaluate(element => getComputedStyle(element).opacity), '1');
  await page.locator('main').focus();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.os-scrollbar-vertical')).opacity === '0');
  report.scrollbar = { visualWidth: handleBounds.width, trackWidth: (await bar.boundingBox()).width, fade };
  report.checks.push('6px-scrollbar-idle-fade', 'scrollbar-drag-visible', 'scrollbar-keyboard-focus');

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await screenshot('footer');
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await page.waitForFunction(() => { const video = document.querySelector('.hero-video'); return video && !video.paused && video.readyState >= 2 && scrollY < 2; });
  assert.equal(await page.evaluate(() => window.__originalGlassRenderer === window.__liquidGLRenderer__), true);
  assert.equal(await page.locator('canvas').count(), 1);
  report.checks.push('project-hover-and-dialog', 'Home-video-return', 'single-retained-canvas');
  for (const path of ['/blog', '/blog/first-signal', '/blog/lego-bus-mechanical-system', '/blog/three-dimensional-homepage']) {
    await page.goto(new URL(path, url).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Page not found.');
    assert.equal(await page.locator('.post-card, .markdown-body').count(), 0);
  }
  report.checks.push('retired-blog-index-and-article-routes');
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/refined-${width}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
}
