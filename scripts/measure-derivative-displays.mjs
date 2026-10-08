// Read actual image content boxes for the deterministic derivative comparisons.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4181';
const destination = process.argv[3] || 'output/media-derivative-review/display-boxes.json';
const result = {};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route(/\.(mp4|webm)(\?|$)/, route => route.abort());
    await page.route(/youtube\.com\/embed\//, route => route.abort());
    const collect = async (locator, role) => {
      const box = await locator.evaluate(async img => {
        await img.decode().catch(() => {});
        const r = img.getBoundingClientRect();
        const s = getComputedStyle(img);
        return {
          source: new URL(img.currentSrc || img.src).pathname.replace(/^\/media\//, ''),
          width: r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
          height: r.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom),
          fit: s.objectFit, natural: [img.naturalWidth, img.naturalHeight]
        };
      });
      if (!box.width || !box.height || !box.natural[0]) throw new Error(`Invalid image box: ${JSON.stringify(box)}`);
      (result[box.source] ||= []).push({
        role, label: `chrome-${viewport.width}x${viewport.height}`, css_width: box.width,
        css_height: box.height, fit: box.fit === 'cover' ? 'cover' : 'contain', dpr: 2,
        natural: box.natural, geometry_source: 'measured browser box'
      });
    };
    await page.goto(`${base}/publications?glass=lite`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.publication-thumbnail img');
    await page.evaluate(() => document.fonts.ready);
    for (const button of await page.locator('.publication-thumbnail').all()) {
      await button.scrollIntoViewIfNeeded();
      await collect(button.locator('img'), 'thumb');
      await button.click();
      await page.waitForSelector('.image-lightbox[open][data-settled]', { timeout: 20000 });
      await collect(page.locator('.lightbox-figure'), 'full');
      await page.locator('.lightbox-close').click();
      await page.waitForSelector('.image-lightbox[open]', { state: 'detached' });
    }
    await page.goto(`${base}/?glass=lite`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.showcase-image img', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    for (const logo of await page.locator('.career-logo img, .membership-logo').all()) {
      if ((await logo.getAttribute('src')).endsWith('.svg')) continue;
      await logo.scrollIntoViewIfNeeded();
      await collect(logo, 'logo');
    }
    for (const button of await page.locator('.showcase-image').all()) {
      await button.scrollIntoViewIfNeeded();
      await collect(button.locator('img'), 'thumb');
      await button.click();
      await page.waitForSelector('.project-dialog[open][data-settled]');
      await collect(page.locator('.project-detail-image'), 'full');
      await page.locator('.project-close').click();
      await page.waitForSelector('.project-dialog[open]', { state: 'detached' });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (Object.keys(result).length !== 22) throw new Error(`Expected 22 sources, found ${Object.keys(result).length}`);
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ destination, sources: Object.keys(result).length, boxes: Object.values(result).flat().length }));
