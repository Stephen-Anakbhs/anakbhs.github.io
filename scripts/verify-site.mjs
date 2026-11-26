// Walks the site the way a visitor does, in Playwright's own Chromium, WebKit and Firefox. Never branded Chrome:
// on the owner's computer Cold Turkey closes every Chrome window as soon as one runs without its extension.
// Usage: node scripts/verify-site.mjs [base-url, default http://127.0.0.1:4173] [only: chromium|webkit|firefox]
import { chromium, devices, firefox, webkit } from "playwright";

const base = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const only = process.argv[3];
const targets = [
  ["chromium desktop", chromium, { viewport: { width: 1440, height: 900 } }],
  ["chromium phone", chromium, devices["Pixel 7"]],
  ["webkit desktop", webkit, { viewport: { width: 1280, height: 800 } }],
  ["webkit iphone", webkit, devices["iPhone 13"]],
  ["firefox desktop", firefox, { viewport: { width: 1366, height: 768 } }],
].filter(([name]) => !only || name.startsWith(only));

let failures = 0;
const check = (target, name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  [${target}] ${name}${detail ? `  (${detail})` : ""}`);
};
// Playwright's open-source browsers cannot decode the H.264 hero film; the site falls back on purpose.
// Third-party embeds (the YouTube player in a project sheet) log their own cookie notices.
// Headless WebKit on Windows often gets no GPU device, so its WebGL contexts are lost at once.
const expected = (text) => /hero-background-1080p\.mp4|MEDIA_ERR|Failed to load resource: the server responded with a status of 206|youtube\.com|Cookie “|WebGL: context lost|Shader error null/.test(text);
// The not-found check asks for this address on purpose; GitHub Pages answers it with a 404 status.
const deliberate = (url = "") => url.endsWith("/no-such-page");

for (const [target, engine, options] of targets) {
  const browser = await engine.launch();
  const context = await browser.newContext({ ...options, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [], broken = [], requested = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !expected(message.text()) && !deliberate(message.location().url)) errors.push(message.text().slice(0, 200)); });
  page.on("request", (request) => requested.push(request.url()));
  page.on("response", (response) => { if (response.status() >= 400 && !deliberate(response.url())) broken.push(`${response.status()} ${response.url()}`); });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    // Requests the page itself abandons (a film paused, a dialog closed) are not failures.
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|interrupted/i.test(failure) && !expected(request.url())) broken.push(`${failure} ${request.url()}`);
  });
  try {
    await page.goto(`${base}/`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const cover = await page.evaluate(() => ({ view: document.documentElement.dataset.view, title: document.title, h1: document.querySelector("h1")?.textContent || "" }));
    check(target, "cover first", cover.view === "cover" && /Renjun/.test(cover.h1), JSON.stringify(cover));
    check(target, "title is the name", cover.title === "Renjun Gao", cover.title);
    const early = requested.filter((url) => /\/media\/derived\/pub-|\/media\/derived\/(hero-bus|project-|lc4dvit)/.test(url));
    check(target, "figures below the cover wait", early.length === 0, early.slice(0, 3).join(" "));

    // The cover's chevron lifts it on every screen; phones keep the section links in a menu.
    await page.click(".scroll-cue", { force: true }); // it bobs, so it is never still enough for a normal click
    await page.waitForFunction(() => document.documentElement.dataset.view === "content", null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    check(target, "About opens the content", await page.evaluate(() => location.hash === "#about" && !!document.getElementById("about")));

    // Every image on the page, once each part has been on screen.
    for (let y = 0; y < 40; y++) {
      const done = await page.evaluate(() => { window.scrollBy(0, innerHeight * 0.8); return innerHeight + scrollY >= document.documentElement.scrollHeight - 2; });
      await page.waitForTimeout(350);
      if (done) break;
    }
    await page.waitForTimeout(5000);
    const images = await page.evaluate(() => [...document.querySelectorAll("main img")].filter((img) => img.currentSrc || img.getAttribute("src"))
      .map((img) => ({ src: (img.currentSrc || img.src).replace(location.origin, ""), ok: img.complete && img.naturalWidth > 0, done: img.complete })));
    const bad = images.filter((image) => image.done && !image.ok);
    const waiting = images.filter((image) => !image.done);
    check(target, `all ${images.length} images decode`, bad.length === 0, bad.map((image) => image.src).slice(0, 4).join(" "));
    check(target, "no image still loading after the walk", waiting.length === 0, waiting.map((image) => image.src).slice(0, 4).join(" "));

    // A publication figure opens in the lightbox and closes again.
    await page.evaluate(() => document.getElementById("publications")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(1200);
    await page.click(".publication-thumbnail");
    await page.waitForSelector("dialog[open]", { timeout: 6000 });
    const shown = await page.waitForFunction(() => { const img = document.querySelector("dialog[open] img"); return !!img && img.complete && img.naturalWidth > 0; }, null, { timeout: 20000 }).then(() => true, () => false);
    check(target, "lightbox shows the full figure", shown);
    await page.keyboard.press("Escape");
    const lightboxClosed = await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 6000 }).then(() => true, () => false);
    check(target, "lightbox closes", lightboxClosed);

    // A project card opens its sheet and closes again.
    await page.evaluate(() => document.getElementById("projects")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(1200);
    await page.click(".showcase-card");
    const projectOpen = await page.waitForSelector("dialog.project-dialog[open]", { timeout: 6000 }).then(() => true, () => false);
    check(target, "project sheet opens", projectOpen);
    await page.keyboard.press("Escape");
    const projectClosed = await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 6000 }).then(() => true, () => false);
    check(target, "project sheet closes", projectClosed);

    // The navigation lens comes to rest on the active link.
    if ((options.viewport?.width ?? 0) > 900) {
      await page.click('nav.nav-links a[href="/#publications"]');
      await page.waitForTimeout(2200);
      const lens = await page.evaluate(() => {
        const active = document.querySelector("nav.nav-links a[aria-current]");
        const lensElement = document.querySelector(".nav-lens");
        return active && lensElement ? { left: parseFloat(lensElement.style.left), width: parseFloat(lensElement.style.width), want: [active.offsetLeft, active.offsetWidth] } : null;
      });
      check(target, "navigation lens rests on the active link", !!lens && Math.abs(lens.left - lens.want[0]) < 1 && Math.abs(lens.width - lens.want[1]) < 1, JSON.stringify(lens));
    }

    await page.goto(`${base}/publications`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    check(target, "/publications lists the papers", (await page.locator(".publication-item").count()) >= 5);
    await page.goto(`${base}/no-such-page`, { waitUntil: "load" });
    await page.waitForTimeout(800);
    check(target, "unknown address shows the not-found page", /not found|404/i.test(await page.locator("main").innerText()));

    check(target, "no script errors", errors.length === 0, errors.slice(0, 3).join(" | "));
    check(target, "no failed requests", broken.length === 0, broken.slice(0, 3).join(" | "));
  } catch (error) {
    check(target, "walk finished", false, String(error).split("\n")[0].slice(0, 300));
  }
  await browser.close().catch(() => {});
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
