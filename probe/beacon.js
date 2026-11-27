// Probe only: reports the page's layout to the log server once a second, and its errors as they happen.
// Experiments: ?v= adds variant styles (several joined by +), ?act= runs one scripted action after load,
// and every load records how the scroll position moved in its first seconds (TRACE lines).
(function () {
  const q = new URLSearchParams(location.search);
  const tab = q.get('n') || '-';
  const variants = (q.get('v') || '').split(/[\s+,]+/).filter(Boolean);
  const act = q.get('act') || '';
  const send = (text) => { fetch('http://127.0.0.1:8123/log?' + encodeURIComponent(text), { mode: 'no-cors' }).catch(() => {}); };
  addEventListener('error', (event) => {
    const target = event.target;
    const what = target && target !== window ? (target.currentSrc || target.src || target.href || target.tagName) : event.message;
    send('PAGE-ERROR ' + tab + ' ' + what);
  }, true);
  addEventListener('unhandledrejection', (event) => send('PAGE-REJECTION ' + tab + ' ' + (event.reason && event.reason.message)));

  // Scroll trace: every change of scrollY in the first 6 s, and every script call that scrolls, with its caller.
  const t0 = performance.now();
  const trace = [];
  const mark = (what) => { if (trace.length < 300) trace.push(Math.round(performance.now() - t0) + ' ' + what); };
  let lastY = -1;
  const sample = () => { const y = Math.round(scrollY); if (y !== lastY) { mark('y=' + y); lastY = y; } };
  const fast = setInterval(sample, 25);
  const wrap = (owner, name) => {
    const original = owner[name];
    owner[name] = function (...args) {
      const from = (new Error().stack || '').split('\n').slice(1, 4).map((line) => line.replace(/https?:\/\/[^/]+/, '').trim().slice(0, 70)).join(' < ');
      // instantscroll: every smooth scroll the site asks for becomes instant.
      if (variants.includes('instantscroll') && args[0] && typeof args[0] === 'object' && args[0].behavior === 'smooth') args[0] = { ...args[0], behavior: 'instant' };
      mark(name + ' ' + JSON.stringify(args).slice(0, 70) + ' from ' + from);
      const before = Math.round(scrollY);
      const result = original.apply(this, args);
      sample();
      send('SCROLLCALL ' + tab + ' ' + name + ' ' + JSON.stringify(args).slice(0, 80) + ' y=' + before + ' t=' + Math.round(performance.now() - t0));
      setTimeout(() => send('SCROLLAFTER ' + tab + ' ' + name + ' y=' + Math.round(scrollY) + ' after 900ms'), 900);
      return result;
    };
  };
  for (const type of ['touchstart', 'touchend', 'touchcancel']) {
    addEventListener(type, () => send('TOUCH ' + tab + ' ' + type + ' y=' + Math.round(scrollY) + ' t=' + Math.round(performance.now() - t0)), { passive: true, capture: true });
  }
  wrap(window, 'scrollTo');
  wrap(window, 'scroll');
  wrap(window, 'scrollBy');
  wrap(Element.prototype, 'scrollIntoView');
  addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'));
  addEventListener('load', () => mark('load'));
  addEventListener('touchstart', () => mark('touchstart'), { passive: true, capture: true });
  setTimeout(() => {
    clearInterval(fast);
    send('TRACE ' + tab + ' ' + location.pathname + location.hash + ' :: ' + trace.join(' | '));
  }, 6000);

  // Variant styles, in the head before the site's own stylesheet; !important where the site sets the same thing.
  const VARIANTS = {
    // Nothing in an open dialog can be hit at the top or bottom edge; a catcher inside the veil takes taps elsewhere.
    pe: '@supports (-webkit-touch-callout: none) {' +
      '.glass-dialog, .glass-dialog::backdrop, .glass-veil { pointer-events: none !important; }' +
      '.glass-veil::after { content: ""; position: absolute; left: 12px; right: 12px; top: calc(var(--runway) + 12px); height: calc(100dvh - 24px); pointer-events: auto; }' +
      '.project-sheet, .lightbox-paper, .lightbox-figure, .lightbox-caption { pointer-events: auto; } }',
    lock: 'html.glass-dialog-open { overflow: hidden !important; }',
    runway: '@supports (-webkit-touch-callout: none) { :root { --runway: 140px !important; } }',
    tail: '@supports (-webkit-touch-callout: none) { .site-shell { padding-bottom: 140px !important; min-height: calc(100lvh + var(--runway) + 140px) !important; } }',
    // The root may scroll under an open dialog (is the veil cut at the layout viewport because the root cannot?).
    nolock: 'html.glass-dialog-open { overflow: visible !important; }',
    // The veil drawn by the document itself, which Safari shows under its bars; the dialog's veil only catches taps.
    docveil: '@supports (-webkit-touch-callout: none) {' +
      'html.glass-dialog-open .site-shell { position: relative; }' +
      'html.glass-dialog-open .site-shell::after { content: ""; position: absolute; inset: 0; z-index: 30; background: rgba(222, 226, 230, 0.62); pointer-events: none; }' +
      '.glass-veil { background: transparent !important; } }',
    // With absdialog (script below) the dialog sits in the document; its backdrop would otherwise be sampled for a band.
    absdialog: '@supports (-webkit-touch-callout: none) { .glass-dialog::backdrop { display: none !important; } }',
  };
  const css = variants.map((name) => VARIANTS[name] || '').join('\n');
  if (css) {
    const style = document.createElement('style');
    style.id = 'probe-variant';
    style.textContent = css;
    const insert = () => (document.head || document.documentElement).append(style);
    if (document.documentElement) insert();
    else document.addEventListener('DOMContentLoaded', insert);
  }
  // absdialog: the open dialog keeps the site's iOS rules but is placed in the document at the current scroll position.
  if (variants.includes('absdialog')) {
    setInterval(() => {
      const dialog = document.querySelector('dialog[open]');
      if (!dialog || dialog.dataset.probeAbs) return;
      dialog.dataset.probeAbs = '1';
      Object.assign(dialog.style, { position: 'absolute', top: Math.round(scrollY) + 'px', height: innerHeight + 'px' });
      send('ACT ' + tab + ' absdialog top=' + dialog.style.top + ' box=' + JSON.stringify(dialog.getBoundingClientRect()));
    }, 30);
  }
  // abs: the open dialog becomes part of the document at the current scroll position (as the cover is on iOS).
  if (variants.includes('abs')) {
    setInterval(() => {
      const dialog = document.querySelector('dialog[open]');
      if (!dialog || dialog.dataset.probeAbs) return;
      dialog.dataset.probeAbs = '1';
      const runway = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--runway')) || 0;
      Object.assign(dialog.style, { position: 'absolute', top: scrollY + 'px', bottom: 'auto', height: innerHeight + 'px', overflow: 'visible' });
      const veil = dialog.querySelector('.glass-veil');
      if (veil) Object.assign(veil.style, { position: 'absolute', top: -runway + 'px', translate: 'none', height: 'calc(100lvh + ' + (runway + 70) + 'px)' });
      send('ACT ' + tab + ' abs top=' + dialog.style.top);
    }, 50);
  }

  if (act.startsWith('open:')) {
    const prefix = act.slice(5);
    setTimeout(() => {
      const element = [...document.querySelectorAll('[aria-label]')].find((item) => item.getAttribute('aria-label').startsWith(prefix));
      send('ACT ' + tab + ' open "' + prefix + '" found=' + Boolean(element) + ' view=' + document.documentElement.dataset.view);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      setTimeout(() => element.click(), 900);
    }, 3500);
  } else if (act === 'bottom') {
    setTimeout(() => {
      const tail = variants.includes('tail') ? 140 : 0;
      window.scrollTo({ top: document.documentElement.scrollHeight - innerHeight - tail, behavior: 'instant' });
      send('ACT ' + tab + ' bottom y=' + Math.round(scrollY) + ' of ' + document.documentElement.scrollHeight);
    }, 3500);
  }

  const rect = (element) => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  };
  let probe = null;
  const insets = () => {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.append(probe);
    }
    const style = getComputedStyle(probe);
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(parseFloat);
  };
  const height = (unit) => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;visibility:hidden;height:100' + unit;
    document.body.append(box);
    const value = Math.round(box.getBoundingClientRect().height);
    box.remove();
    return value;
  };
  const report = () => {
    if (document.hidden || !document.body) return;
    const root = document.documentElement;
    const dialog = document.querySelector('dialog[open]');
    const header = document.querySelector('.site-header');
    const state = {
      tab, url: location.pathname + location.search + location.hash, view: root.dataset.view, y: Math.round(scrollY),
      inner: [innerWidth, innerHeight], vv: [Math.round(visualViewport.offsetTop), Math.round(visualViewport.height)],
      screen: [screen.width, screen.height], dvh: height('dvh'), lvh: height('lvh'), svh: height('svh'), safe: insets(),
      scrollH: root.scrollHeight, rootBg: getComputedStyle(root).backgroundColor,
      backdrop: rect(document.querySelector('.site-backdrop')), hero: rect(document.querySelector('.hero')),
      header: rect(header), menu: header && header.dataset.menuOpen, footer: rect(document.querySelector('footer')),
      dialog: dialog && {
        cls: dialog.className, box: rect(dialog), veil: rect(dialog.querySelector('.glass-veil')),
        sheet: rect(dialog.querySelector('.glass-sheet')), close: rect(dialog.querySelector('button[aria-label^="Close"]')),
        textScroll: (dialog.querySelector('.project-detail') || {}).scrollTop,
      },
    };
    send(JSON.stringify(state));
  };
  setInterval(report, 1000);

  // The UI test moves the page through the log server, so every page opens in this same tab.
  let done = Number(sessionStorage.getItem('probe-cmd') || 0);
  setInterval(() => {
    fetch('http://127.0.0.1:8123/cmd', { cache: 'no-store' }).then((response) => response.json()).then((cmd) => {
      if (cmd.id > done) {
        done = cmd.id;
        sessionStorage.setItem('probe-cmd', String(done));
        location.href = cmd.url;
      }
    }).catch(() => {});
  }, 300);
})();
