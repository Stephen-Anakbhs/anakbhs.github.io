import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = 'output/verification';
const marker = 'MOBILE_AUTOPLAY_RESULT ';
const engines = (process.env.AUTOPLAY_ENGINES || (process.platform === 'win32' ? 'chrome' : 'chrome,webkit')).split(',');
assert(engines.length && engines.every(name => ['chrome', 'webkit'].includes(name)), 'Unknown autoplay test engine');
const report = { base, platform: process.platform, engines, cases: [], errors: [] };
if (process.platform === 'win32') console.log('WebKit media decoding is verified by the macOS CI job, not Windows emulation.');
await mkdir(output, { recursive: true });

for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
  if (!engines.includes(name)) continue;
  const browser = await engine.launch({ headless: true, ...(name === 'chrome' ? {
    channel: 'chrome', args: ['--autoplay-policy=document-user-activation-required'],
  } : {}) });
  try {
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const label = `${name}-${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ label, message: error.message }));
      // Record inside the page before any evaluation or input can grant activation.
      await page.addInitScript(() => {
        const start = performance.now();
        let firstTime = null;
        let inputs = 0;
        let unreadySamples = 0, unreadyPlayerExposed = false;
        for (const event of ['pointerdown', 'touchend', 'keydown']) {
          document.addEventListener(event, e => { if (e.isTrusted) inputs++; }, true);
        }
        const timer = setInterval(() => {
          const v = document.querySelector('.hero-video');
          const poster = document.querySelector('.hero-photo');
          const vr = v?.getBoundingClientRect(), pr = poster?.getBoundingClientRect();
          const coveredByPoster = Boolean(v && poster && getComputedStyle(poster).opacity === '1'
            && Number(getComputedStyle(poster).zIndex) > Number(getComputedStyle(v).zIndex)
            && pr.left <= vr.left && pr.right >= vr.right && pr.top <= vr.top && pr.bottom >= vr.bottom);
          if (v && v.dataset.ready !== 'true') {
            unreadySamples++;
            unreadyPlayerExposed ||= getComputedStyle(v).opacity !== '0' && !coveredByPoster;
          }
          if (v && !v.paused && v.readyState >= 2 && firstTime === null) firstTime = v.currentTime;
          const advanced = firstTime !== null && v && v.currentTime > firstTime + 0.35;
          const decoded = v?.getVideoPlaybackQuality().totalVideoFrames || 0;
          if ((!advanced || decoded === 0) && performance.now() - start < 20000) return;
          clearInterval(timer);
          console.info('MOBILE_AUTOPLAY_RESULT ' + JSON.stringify({
            advanced, elapsedMs: performance.now() - start, inputs,
            activated: navigator.userActivation?.hasBeenActive ?? null,
            firstTime, time: v?.currentTime, paused: v?.paused, ready: v?.readyState,
            error: v?.error?.code ?? null, autoplay: v?.autoplay, muted: v?.muted,
            inline: v?.playsInline, loop: v?.loop, controls: v?.controls,
            opacity: v ? getComputedStyle(v).opacity : null,
            width: v?.videoWidth, height: v?.videoHeight,
            decoded,
            unreadySamples, unreadyPlayerExposed, coveredByPoster,
            droppedPlayingEvents: window.heroDroppedPlayingEvents || 0,
            playingSuppressionInstalled: window.heroPlayingSuppressionInstalled === true,
            timeUpdateSuppressionInstalled: window.heroTimeUpdateSuppressionInstalled === true,
          }));
        }, 100);
      });
      try {
        let delayed = false;
        if (viewport.width === 390) {
          await page.route('**/media/hero-background-1080p.mp4', async route => {
            if (!delayed) { delayed = true; await new Promise(resolve => setTimeout(resolve, 900)); }
            await route.continue();
          });
        }
        for (const mode of ['fresh-entry', 'reload']) {
          if ([390, 844].includes(viewport.width) && mode === 'reload') {
            await page.addInitScript(suppressTimeUpdate => {
              window.heroPlayingSuppressionInstalled = true;
              document.addEventListener('playing', event => {
                if (!(event.target instanceof HTMLVideoElement) || !event.target.matches('.hero-video')) return;
                window.heroDroppedPlayingEvents = (window.heroDroppedPlayingEvents || 0) + 1;
                event.stopImmediatePropagation();
              }, true);
              if (suppressTimeUpdate) {
                window.heroTimeUpdateSuppressionInstalled = true;
                document.addEventListener('timeupdate', event => {
                  if (event.target instanceof HTMLVideoElement && event.target.matches('.hero-video')) event.stopImmediatePropagation();
                }, true);
              }
            }, viewport.width === 844);
          }
          const recording = page.waitForEvent('console', { predicate: m => m.text().startsWith(marker), timeout: 30000 });
          const response = mode === 'fresh-entry'
            ? await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
            : await page.reload({ waitUntil: 'domcontentloaded' });
          assert.equal(response.status(), 200);
          const result = JSON.parse((await recording).text().slice(marker.length));
          report.cases.push({ label, mode, delayedMedia: viewport.width === 390 && mode === 'fresh-entry', ...result });
          assert(result.advanced && result.decoded > 0, `${label} ${mode}: no decoded playback without input`);
          assert.equal(result.inputs, 0);
          assert.equal(result.activated, false, 'Startup test must not receive a user activation');
          assert(result.autoplay && result.muted && result.inline && result.loop && !result.controls);
          assert.equal(result.opacity, '1');
          assert.equal(result.coveredByPoster, false, 'Decoded playback must not remain covered by the poster');
          assert.equal(result.unreadyPlayerExposed, false, 'The poster must cover the unready native player');
          if (viewport.width === 390 && mode === 'fresh-entry') {
            assert(result.unreadySamples > 0, 'The delayed-media case must observe the startup waiting state');
          }
          if (viewport.width === 390 && mode === 'reload') {
            // A cached WebKit reload may emit no playing event at all.
            assert.equal(result.playingSuppressionInstalled, true, 'Playing-event suppression must be installed before reload');
          }
          if (viewport.width === 844 && mode === 'reload') {
            assert(result.playingSuppressionInstalled && result.timeUpdateSuppressionInstalled, 'Frame readiness must work without playing or timeupdate events');
          }
          assert.equal(result.width, 1920); assert.equal(result.height, 1080);
          console.log(`PASS ${label} ${mode}: ${result.elapsedMs.toFixed(0)}ms, no input or activation`);
        }
        if (viewport.width === 390) {
          await page.evaluate(() => document.querySelector('#projects').scrollIntoView({ behavior: 'instant' }));
          await page.waitForFunction(() => document.querySelector('.hero-video').paused);
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.waitForFunction(() => !document.querySelector('.hero-video').paused);
          await page.screenshot({ path: `${output}/mobile-autoplay-${name}.png` });
          report.cases.push({ label, mode: 'offscreen-pause-and-home-resume', passed: true });
        }
      } catch (error) {
        report.cases.push({ label, failure: error.stack });
        process.exitCode = 1;
        console.error(`${label}: ${error.message}`);
      } finally { await context.close(); }
    }
    for (const scenario of ['bridge-denied', 'bridge-pending', 'bridge-callback-existing', 'bridge-callback-late', 'bridge-callback-offscreen', 'bridge-callback-hidden']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 MicroMessenger/8.0' });
      try {
        await page.addInitScript(scenario => {
          const set = Element.prototype.setAttribute;
          Element.prototype.setAttribute = function (key, value) {
            if (this instanceof HTMLVideoElement && key.toLowerCase() === 'autoplay') return;
            return set.call(this, key, value);
          };
          const play = HTMLMediaElement.prototype.play;
          const callbackOnly = scenario.startsWith('bridge-callback-');
          const interrupted = ['bridge-callback-offscreen', 'bridge-callback-hidden'].includes(scenario);
          let bridgeReady = false, inHostCallback = false, bridgeInvocations = 0, attempts = 0, inputs = 0;
          let callbackWhileInactive = false, returnedToHome = false;
          const installBridge = () => {
            window.WeixinJSBridge = { invoke(method, options, callback) {
              if (method !== 'getNetworkType') throw new Error('Unexpected host method');
              bridgeInvocations++;
              const interrupt = interrupted && bridgeInvocations === 1;
              if (interrupt) setTimeout(() => {
                if (scenario === 'bridge-callback-hidden') {
                  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
                  document.dispatchEvent(new Event('visibilitychange'));
                } else document.querySelector('#projects').scrollIntoView({ behavior: 'instant' });
              }, 0);
              setTimeout(() => {
                if (interrupt) callbackWhileInactive = document.hidden || document.querySelector('.hero').getBoundingClientRect().bottom <= 0;
                inHostCallback = true;
                try { callback({ err_msg: 'getNetworkType:wifi' }); }
                finally { inHostCallback = false; }
                if (interrupt) setTimeout(() => {
                  returnedToHome = true;
                  if (scenario === 'bridge-callback-hidden') {
                    delete document.hidden;
                    document.dispatchEvent(new Event('visibilitychange'));
                  } else scrollTo({ top: 0, behavior: 'instant' });
                }, 250);
              }, interrupt ? 500 : 200);
            } };
          };
          if (scenario === 'bridge-callback-existing' || interrupted) { bridgeReady = true; installBridge(); }
          for (const kind of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(kind, e => { if (e.isTrusted) inputs++; }, true);
          HTMLMediaElement.prototype.play = function () {
            if (!this.matches('.hero-video')) return play.call(this);
            attempts++;
            if (callbackOnly ? inHostCallback : bridgeReady) { delete this.paused; return play.call(this); }
            if (scenario === 'bridge-pending') {
              Object.defineProperty(this, 'paused', { value: false, configurable: true });
              return new Promise(() => {});
            }
            return Promise.reject(new DOMException('Waiting for host bridge', 'NotAllowedError'));
          };
          const start = performance.now();
          let scheduled = false;
          const timer = setInterval(() => {
            const video = document.querySelector('.hero-video');
            if (attempts && !scheduled && scenario !== 'bridge-callback-existing' && !interrupted) {
              scheduled = true;
              setTimeout(() => {
                bridgeReady = true;
                if (callbackOnly) installBridge();
                document.dispatchEvent(new Event('WeixinJSBridgeReady'));
              }, 300);
            }
            if (!(bridgeReady && video && !video.paused && video.currentTime > .35) && performance.now() - start < 20000) return;
            clearInterval(timer);
            console.info('WECHAT_BRIDGE_RESULT ' + JSON.stringify({ attempts, bridgeInvocations, inputs, callbackWhileInactive, returnedToHome, activated: navigator.userActivation?.hasBeenActive,
              advanced: Boolean(video && !video.paused && video.currentTime > .35), fallback: document.querySelector('.hero')?.dataset.mediaFallback }));
          }, 100);
        }, scenario);
        const recording = page.waitForEvent('console', { predicate: m => m.text().startsWith('WECHAT_BRIDGE_RESULT '), timeout: 30000 });
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
        const result = JSON.parse((await recording).text().slice('WECHAT_BRIDGE_RESULT '.length));
        console.log(`BRIDGE ${name} ${scenario}: ${JSON.stringify(result)}`);
        assert(result.advanced && result.attempts >= 2);
        if (['bridge-callback-offscreen', 'bridge-callback-hidden'].includes(scenario)) {
          assert(result.callbackWhileInactive && result.returnedToHome, 'The first host callback must arrive while inactive before returning');
          assert.equal(result.bridgeInvocations, 2, 'An unused offscreen callback must allow one new request on return');
        } else if (scenario.startsWith('bridge-callback-')) assert.equal(result.bridgeInvocations, 1, 'Use the host callback without repeatedly querying the bridge');
        assert.equal(result.inputs, 0); assert.equal(result.activated, false); assert.equal(result.fallback, undefined);
        report.cases.push({ label: name, mode: scenario, ...result });
        console.log(`PASS ${name} ${scenario}: host-event retry without input`);
      } catch (error) { report.cases.push({ label: name, mode: scenario, failure: error.stack }); process.exitCode = 1; }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
report.passed = !report.cases.some(c => c.failure) && report.errors.length === 0;
if (!report.passed) process.exitCode = 1;
await writeFile(`${output}/mobile-autoplay.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, errors: report.errors }));
