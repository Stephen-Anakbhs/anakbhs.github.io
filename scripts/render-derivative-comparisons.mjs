// Native Chrome object-fit rasterization, with the same fractional CSS box at DPR 2.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const report = process.argv[2] || 'output/media-derivative-review/static-canonical.jsonl';
const destination = process.argv[3] || 'output/media-derivative-review/browser-static';
const canonical = process.argv[4] === 'canonical';
const rows = (await readFile(report, 'utf8')).trim().split('\n').map(JSON.parse).filter(r => r.event === 'static-result');
const backgrounds = ['ffffff', 'f7f8fa', '20242a'];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ deviceScaleFactor: 2, reducedMotion: 'reduce', viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
const images = new Map();
const references = new Map();
const comparisons = [];
await mkdir(destination, { recursive: true });
const dataUrl = async filename => {
  if (!images.has(filename)) {
    const type = filename.endsWith('.jpg') ? 'jpeg' : filename.split('.').at(-1);
    images.set(filename, `data:image/${type};base64,${(await readFile(filename)).toString('base64')}`);
  }
  return images.get(filename);
};
const fitRect = (size, box, fit) => {
  if (fit === 'cover') return { x: 0, y: 0, width: box.css_width, height: box.css_height };
  const scale = Math.min(box.css_width / size[0], box.css_height / size[1]);
  return { x: (box.css_width - size[0] * scale) / 2, y: (box.css_height - size[1] * scale) / 2,
    width: size[0] * scale, height: size[1] * scale };
};
try {
  for (const row of rows) {
    const seen = new Set();
    for (const box of row.display_comparisons) {
      if (seen.has(box.label)) continue;
      seen.add(box.label);
      for (const bg of backgrounds) {
        const stem = `${path.basename(row.target)}.${box.label}.${bg}`;
        const referenceKey = `${row.source}.${box.role}.${box.label}.${bg}`;
        const reference = path.join(destination, `${path.basename(row.source)}.${box.role}.${box.label}.${bg}.reference.png`);
        const actual = path.join(destination, `${stem}.actual.png`);
        await page.setContent(`<style>html,body{margin:0;padding:0;background:#${bg}}#stage{position:relative;width:${box.css_width}px;height:${box.css_height}px;overflow:hidden;background:#${bg}}img{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:${box.fit};object-position:50% 50%;padding:0;border:0}</style><div id="stage"><img></div>`);
        const render = async (filename, output) => {
          await page.locator('img').evaluate(async (img, src) => { img.src = src; await img.decode(); }, await dataUrl(filename));
          await page.locator('#stage').screenshot({ path: output, animations: 'disabled' });
        };
        if (!references.has(referenceKey)) {
          await render(path.join('public/media', row.source), reference);
          references.set(referenceKey, reference);
        }
        if (canonical) {
          const r = fitRect(row.source_size, box, box.fit);
          await page.locator('img').evaluate((img, r) => Object.assign(img.style, {
            inset: 'auto', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, objectFit: 'fill'
          }), r);
        }
        await render(row.target, actual);
        const a = fitRect(row.source_size, box, box.fit), b = canonical ? a : fitRect(row.size, box, box.fit);
        const crop = [Math.floor(Math.min(a.x, b.x) * 2), Math.floor(Math.min(a.y, b.y) * 2),
          Math.ceil(Math.max(a.x + a.width, b.x + b.width) * 2), Math.ceil(Math.max(a.y + a.height, b.y + b.height) * 2)];
        comparisons.push({ source: row.source, source_size: row.source_size, target: row.target,
          size: row.size, bytes: row.bytes, label: box.label, role: box.role, css_width: box.css_width,
          css_height: box.css_height, dpr: 2, fit: box.fit, canonical_geometry: canonical, background: `#${bg}`, crop, reference, actual });
      }
    }
    console.log(`Rendered ${path.basename(row.target)}`);
  }
} finally {
  await browser.close();
}
const index = path.join(destination, 'index.json');
await writeFile(index, JSON.stringify({ engine: canonical ? 'Chrome native original versus derivative in original continuous aspect rectangle; DPR 2' : 'Chrome native img object-fit; fractional CSS box; DPR 2', comparisons }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ index, comparisons: comparisons.length }));
