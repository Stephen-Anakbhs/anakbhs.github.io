import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const fixtureBase = (process.argv[3] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = 'output/verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS === '1' });
const report = { base, browser: browser.version(), checks: [], errors: [] };
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
const nav = name => page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name, exact: true });
async function check(name, run) {
  const result = await run(); report.checks.push({ name, result: result ?? 'passed' });
  console.log(`PASS ${name}: ${JSON.stringify(result ?? true)}`);
}
async function playing(target = page) {
  await target.waitForFunction(() => {
    const v = document.querySelector('.hero-video');
    return v && !v.paused && v.readyState >= 2 && !v.error;
  }, null, { timeout: 15000 });
  const start = await target.locator('.hero-video').evaluate(v => v.currentTime);
  await target.waitForTimeout(600);
  const end = await target.locator('.hero-video').evaluate(v => v.currentTime);
  assert.ok(end > start + .25 || end < start, `Video clock did not advance: ${start} -> ${end}`);
  return { start, end };
}
async function settledHome() {
  await page.waitForFunction(() => scrollY < 2);
  return playing();
}
try {
  await page.goto(`${base}/#projects`, { waitUntil: 'domcontentloaded' });
  await page.locator('#projects').waitFor({ state: 'visible' });
  await check('direct section entry, then Home resumes video', async () => {
    await page.waitForFunction(() => scrollY > 1000);
    await page.waitForFunction(() => document.querySelector('.hero-video')?.paused);
    await nav('Home').click(); return settledHome();
  });
  await check('click selects navigation before scroll finishes', async () => {
    await nav('Projects').click();
    assert.equal(await nav('Projects').getAttribute('aria-current'), 'location');
    const y = await page.evaluate(() => scrollY);
    await page.waitForFunction(() => {
      const section = document.querySelector('#projects');
      return Math.abs(section.getBoundingClientRect().top - parseFloat(getComputedStyle(section).scrollMarginTop)) < 2;
    });
    return { scrollAtSelection: y };
  });
  await check('project hover, open, close and white foreground', async () => {
    const button = page.getByRole('button', { name: 'Open project: LEGO Technic Bus', exact: true });
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => {
      const overlay = document.querySelector('.showcase-overlay');
      return getComputedStyle(overlay).opacity === '1' && getComputedStyle(overlay).transform === 'none';
    }, null, { timeout: 5000 });
    const glass = await page.locator('.showcase-card').first().evaluate(e => ({
      opacity: getComputedStyle(e.querySelector('.showcase-overlay')).opacity,
      blur: getComputedStyle(e.querySelector('.glass__warp')).backdropFilter,
      ink: [...e.querySelectorAll('.showcase-title,.showcase-summary,.showcase-overlay-content>svg')].map(x => getComputedStyle(x).color),
    }));
    assert.equal(glass.opacity, '1');
    assert.match(glass.blur, /blur\(7px\)/);
    assert.ok(glass.ink.every(x => x === glass.ink[0]));
    await page.screenshot({ path: `${output}/projects.png` });
    await button.click(); assert.equal(await page.getByRole('dialog').isVisible(), true);
    await page.getByRole('button', { name: 'Close project', exact: true }).click();
    assert.equal(await page.getByRole('dialog').isVisible(), false);
    return glass;
  });
  await check('rapid section changes and repeated Home return', async () => {
    for (let i = 0; i < 4; i++) {
      await nav('Home').click(); await page.waitForTimeout(80);
      await nav('About').click(); await page.waitForTimeout(80);
      await nav('Home').click(); await settledHome();
      await nav('Projects').click(); await page.waitForTimeout(700);
    }
    await nav('Home').click(); return settledHome();
  });
  await check('video loop, original dimensions and no pause control', async () => {
    const info = await page.locator('.hero-video').evaluate(v => {
      v.currentTime = v.duration - .25;
      return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, loop: v.loop, controls: v.controls, muted: v.muted };
    });
    await page.waitForFunction(() => document.querySelector('.hero-video').currentTime < 2, null, { timeout: 6000 });
    assert.equal(info.width, 1920); assert.equal(info.height, 1080); assert.equal(info.loop, true); assert.equal(info.controls, false);
    await playing(); return info;
  });
  await check('route round trip and browser history', async () => {
    await page.goto(`${base}/publications`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Publications', exact: true }).waitFor();
    await nav('Home').click(); await settledHome();
    await page.goBack(); await page.getByRole('heading', { name: 'Publications', exact: true }).waitFor();
    await page.goForward(); return settledHome();
  });
  await check('reduced motion and return to normal playback', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.hero-video').waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'no-preference' }); return playing();
  });
  await check('menu collapse and expand retains selected lens', async () => {
    await page.getByRole('button', { name: 'Collapse menu', exact: true }).click();
    await page.waitForFunction(() => window.__liquidGLRenderer__?.suspended);
    await page.getByRole('button', { name: 'Expand menu', exact: true }).click();
    await page.waitForFunction(() => window.__liquidGLRenderer__?.hasTexture && !window.__liquidGLRenderer__.suspended && window.__liquidGLRenderer__.lenses.length === 1);
    const rect = await page.locator('.nav-lens').boundingBox(); assert.ok(rect.width > 30 && rect.height > 30);
    const optics = await page.evaluate(() => {
      const renderer = window.__liquidGLRenderer__;
      const options = renderer.lenses[0].options;
      return {
        refraction: options.refraction, bevelDepth: options.bevelDepth, bevelWidth: options.bevelWidth,
        interaction: options.interaction, interactionStrength: options.interactionStrength, magnify: options.magnify,
        genericSelectionSurfaces: document.querySelectorAll('.nav-lens .liquid-surface').length,
        extraRims: [...document.querySelectorAll('.header-navigation > span,.header-toggle > span')].filter(e => getComputedStyle(e).display !== 'none').length,
      };
    });
    assert.equal(optics.refraction, .012); assert.equal(optics.bevelDepth, .01); assert.equal(optics.bevelWidth, .055);
    assert.equal(optics.interaction, 'fluid'); assert.equal(optics.interactionStrength, .22); assert.equal(optics.magnify, 1.035);
    assert.equal(optics.genericSelectionSurfaces, 0); assert.equal(optics.extraRims, 0);
    await page.screenshot({ path: `${output}/navigation-restored.png` });
    return { rect, optics };
  });
  await check('desktop layout and matching adaptive button icons', async () => {
    const results = [];
    for (const width of [1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 }); await nav('Publications').click();
      await page.locator('.publication-links').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(350);
      const values = await page.evaluate(() => ({
        width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
        buttons: [...document.querySelectorAll('.publication-links .glass-action')].map(e => ({ ink: getComputedStyle(e).color, icon: getComputedStyle(e.querySelector('svg')).stroke })),
        renderers: document.querySelectorAll('canvas').length,
        navBlur: getComputedStyle(document.querySelector('.header-navigation')).backdropFilter,
      }));
      assert.equal(values.overflow, false); assert.ok(values.buttons.every(b => ['rgb(255, 255, 255)', 'rgb(32, 36, 40)'].includes(b.ink) && b.icon === b.ink));
      assert.equal(values.renderers, 1); assert.match(values.navBlur, /blur\(0.5px\)/); results.push(values);
    }
    await page.screenshot({ path: `${output}/publications.png` }); return results;
  });
  await check('glass configuration, actual refraction and resize', async () => {
    await page.goto(`${fixtureBase}/tests/browser/glass.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#fixture-glass[data-glass-visible="true"]').waitFor();
    const surface = page.locator('#fixture-glass');
    await surface.screenshot({ path: `${output}/glass-flat.png` });
    await page.evaluate(() => window.updateGlassFixture({ blurPx: 0, displacementScale: 60, highlightOpacity: 0, fill: 'transparent', cornerRadius: 24 }));
    await page.waitForTimeout(250); await surface.screenshot({ path: `${output}/glass-refracted.png` });
    assert.equal(await surface.locator('feDisplacementMap').count(), 1);
    await page.evaluate(() => window.updateGlassFixture({ blurPx: 7, saturation: 110, displacementScale: 20, aberrationIntensity: .3, cornerRadius: 16, fill: 'rgba(100, 180, 200, 0.1)', ink: '#ffffff', padding: '6px', highlightOpacity: .25, shadow: '0 2px 3px rgba(0,0,0,.1)' }));
    await page.waitForTimeout(250);
    const customized = await surface.evaluate(e => ({ radius: getComputedStyle(e).borderRadius, blur: getComputedStyle(e.querySelector('.glass__warp')).backdropFilter, padding: getComputedStyle(e.querySelector('.glass')).padding, passes: e.querySelectorAll('feDisplacementMap').length }));
    assert.equal(customized.radius, '16px'); assert.match(customized.blur, /blur\(7px\)/); assert.equal(customized.padding, '6px'); assert.equal(customized.passes, 3);
    await page.evaluate(() => window.resizeGlassFixture({ width: 430, height: 200 }));
    await page.waitForTimeout(250);
    const sizes = await surface.evaluate(e => ({ outer: e.getBoundingClientRect().width, filter: e.querySelector('.liquid-engine > svg').getBoundingClientRect().width }));
    assert.ok(Math.abs(sizes.outer - sizes.filter) < 2);
    const standardMap = await surface.locator('feImage').getAttribute('href');
    await page.evaluate(() => window.updateGlassFixture({ mode: 'polar', elasticity: .25, overLight: true, hoverFill: 'rgba(255, 0, 0, 0.25)' }));
    await page.waitForTimeout(250);
    assert.notEqual(await surface.locator('feImage').getAttribute('href'), standardMap);
    assert.equal(await surface.evaluate(e => getComputedStyle(e.firstElementChild).display), 'block');
    const rect = await surface.boundingBox();
    await page.mouse.move(rect.x + 35, rect.y + 40); await page.waitForTimeout(300);
    const transform = await surface.locator('.liquid-engine').evaluate(e => getComputedStyle(e).transform);
    assert.notEqual(transform, 'none'); assert.notEqual(transform, 'matrix(1, 0, 0, 1, 0, 0)');
    assert.equal(await surface.locator('.glass-action').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(255, 0, 0, 0.25)');
    await page.evaluate(() => window.updateGlassFixture({ mode: 'prominent', ink: '#e0f0ff', fill: 'rgba(100, 180, 200, 0.1)', highlightOpacity: .25 }));
    await page.waitForTimeout(250);
    assert.equal(await surface.locator('.glass-action').evaluate(e => getComputedStyle(e).color), 'rgb(224, 240, 255)');
    assert.equal(await surface.evaluate(e => getComputedStyle(e).getPropertyValue('--glass-fill').trim()), 'rgba(100, 180, 200, 0.1)');
    assert.equal(await surface.evaluate(e => getComputedStyle(e.querySelector(':scope > span:last-of-type')).opacity), '0.25');
    assert.notEqual(await surface.locator('feImage').getAttribute('href'), standardMap);
    await page.evaluate(() => window.updateGlassFixture({ mode: 'shader' }));
    await page.waitForFunction(() => document.querySelector('#fixture-glass feImage')?.getAttribute('href')?.startsWith('data:image/png'));
    await page.evaluate(() => window.updateGlassFixture({ enabled: false }));
    assert.equal(await surface.locator('.glass__warp').count(), 0);
    return { customized, sizes, elasticTransform: transform };
  });
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack; process.exitCode = 1; console.error(error);
  report.state = await page.evaluate(() => ({ url: location.href, y: scrollY, visibility: document.visibilityState,
    video: document.querySelector('.hero-video') ? { paused: document.querySelector('.hero-video').paused, error: document.querySelector('.hero-video').error?.code } : null }));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
