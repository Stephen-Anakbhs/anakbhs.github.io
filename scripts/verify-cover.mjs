// The cover's edge cases, in Playwright's own Chromium (never branded Chrome: Cold Turkey closes every Chrome
// window when one runs without its extension). Usage: node scripts/verify-cover.mjs [base-url]
import { chromium } from "playwright";

const base = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const browser = await chromium.launch();
const fresh = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__lost = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const context = original.call(this, type, ...rest);
      if (/webgl/.test(type) && context && !this.__watched) {
        this.__watched = true;
        this.addEventListener("webglcontextlost", () => { if (this.isConnected) window.__lost++; });
      }
      return context;
    };
  });
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  return page;
};
const state = (page) => page.evaluate(() => ({ view: document.documentElement.dataset.view, path: location.pathname + location.hash, y: Math.round(scrollY) }));

// 1. Home clicked while the cover is lifting: one lift, one return, and it stays on the cover.
{
  const page = await fresh();
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(150);
  await page.click('nav.nav-links a[href="/#home"]');
  await page.waitForTimeout(4000);
  const end = await state(page);
  check("Home during a lift ends on the cover", end.view === "cover" && end.path === "/", JSON.stringify(end));
  await page.close();
}

// 2. Back to the cover from far down the content: the sheet comes down over where the visitor was.
{
  const page = await fresh();
  await page.click(".scroll-cue");
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.getElementById("projects").scrollIntoView({ block: "start" }));
  await page.waitForTimeout(800);
  const before = await state(page);
  await page.goBack();
  await page.waitForTimeout(120);
  const during = await state(page);
  check("Back keeps the page where it was while the sheet comes down", Math.abs(during.y - before.y) < 4, `before ${before.y}, during ${during.y}`);
  await page.waitForTimeout(2500);
  check("Back ends on the cover", (await state(page)).view === "cover", JSON.stringify(await state(page)));
  await page.close();
}

// 3. Ten round trips between the homepage and the publication list lose no WebGL context on the page.
{
  const page = await fresh();
  for (let trip = 0; trip < 10; trip++) {
    await page.evaluate(() => { history.pushState({}, "", "/publications"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { history.pushState({}, "", "/"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.waitForTimeout(900);
  }
  const lost = await page.evaluate(() => window.__lost);
  check("ten round trips lose no context in use", lost === 0, `${lost} lost`);
  await page.close();
}

// 4. Leaving the homepage right after a lift lands: the end of the lift does not pull the visitor back.
{
  const page = await fresh();
  await page.click(".scroll-cue");
  await page.waitForFunction(() => document.documentElement.dataset.view === "content", null, { timeout: 6000 });
  await page.evaluate(() => { history.pushState({}, "", "/publications"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(1500);
  const end = await state(page);
  check("leaving right after a lift stays away", end.path === "/publications", JSON.stringify(end));
  await page.close();
}

// 5. A link clicked while a short drag springs back acts at once.
{
  const page = await fresh();
  const grab = await page.locator(".hero-grab").boundingBox();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 - 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(60);
  await page.click('nav.nav-links a[href="/#projects"]');
  await page.waitForTimeout(3000);
  const end = await state(page);
  check("a link during a spring-back lifts to its section", end.view === "content" && end.path === "/#projects", JSON.stringify(end));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
