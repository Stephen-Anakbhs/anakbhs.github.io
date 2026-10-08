import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4182';
const report = { base, cases: [], errors: [] };
for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    page.on('pageerror', error => report.errors.push({ browser: name, message: error.message }));
    await page.goto(`${base}/publications?glass=full`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Publications', exact: true }).waitFor();
    await page.locator('[data-publication-id="P2"]').waitFor({ state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    const scrollbar = page.getByRole('scrollbar', { name: 'Page scroll' });
    await scrollbar.focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)) < 3);
    const bottom = await page.evaluate(() => scrollY);
    assert(bottom > 900, `${name} page did not reach the publication list bottom: ${bottom}`);
    await page.keyboard.press('PageUp');
    await page.waitForFunction(bottom => scrollY < bottom - 600, bottom);
    await page.keyboard.press('Home');
    await page.waitForFunction(() => scrollY === 0);
    await page.waitForFunction(() => {
      const handle = document.querySelector('[role="scrollbar"][aria-label="Page scroll"]');
      return Math.abs(handle.getBoundingClientRect().top - handle.parentElement.getBoundingClientRect().top) < 3;
    });

    const handle = await scrollbar.boundingBox();
    assert(handle);
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.evaluate(() => {
      document.addEventListener('pointerdown', event => {
        window.__scrollbarPointerRole = event.target.getAttribute('role');
      }, { once: true, capture: true });
    });
    await page.mouse.down();
    assert.equal(await page.evaluate(() => window.__scrollbarPointerRole), 'scrollbar', 'drag must start on the handle, not click the track');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 100, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => scrollY > 100);
    const dragged = await page.evaluate(() => scrollY);

    const trigger = page.locator('[data-publication-id="P2"] .publication-thumbnail');
    await trigger.click();
    const dialog = page.locator('.image-lightbox');
    await page.locator('.image-lightbox[open][data-settled]').waitFor();
    const lockedAt = await page.evaluate(() => scrollY);
    assert(await page.locator('html').evaluate(element => element.classList.contains('glass-dialog-open')));
    await page.mouse.move(8, 880);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(200);
    assert(Math.abs(await page.evaluate(() => scrollY) - lockedAt) < 1, 'modal background must not scroll');
    await page.getByRole('button', { name: 'Close image preview', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement === document.querySelector('[data-publication-id="P2"] .publication-thumbnail'), null, { timeout: 3000 });
    assert(!await page.locator('html').evaluate(element => element.classList.contains('glass-dialog-open')));
    await scrollbar.focus();
    await page.keyboard.press('Home');
    await page.waitForFunction(() => scrollY === 0);
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => scrollY > 600);
    report.cases.push({ browser: name, bottom, dragged, lockedAt, keyboard: true, drag: true, modalLock: true, restored: true });
    console.log(`PASS ${name}: keyboard, drag, modal lock, focus and resumed scrolling`);
  } catch (error) {
    report.errors.push({ browser: name, message: error.stack });
    console.error(`${name}: ${error.message}`);
  } finally {
    await browser.close();
  }
}
await mkdir('output/performance-pass', { recursive: true });
await writeFile('output/performance-pass/scrollbar-browser.json', JSON.stringify(report, null, 2));
if (report.errors.length || report.cases.length !== 2) process.exitCode = 1;
