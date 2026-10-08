import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/ui/ImageLightbox.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'ImageLightbox.tsx',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const drain = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Stub only rendering/browser primitives; execute the actual component effect and event callbacks.
function setup({ complete = false, reduced = false } = {}) {
  const requests = [];
  const nodes = [];
  const animations = [];
  const effects = [];
  const resize = new Set();
  const fullDecode = deferred();
  const dialogRef = { current: null };
  const state = { current: { closing: false, origin: null } };
  let showCount = 0;
  let opening = [];
  let closing = [];
  const rect = { x: 0, y: 0, width: 300, height: 180 };
  class PreparedImage {
    constructor() { this.result = deferred(); requests.push(this); }
    decode() { return this.result.promise; }
  }
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, Image: PreparedImage, clearTimeout, setTimeout,
    document: { documentElement: { clientWidth: 1440 } },
    window: { innerHeight: 900, setTimeout }, innerHeight: 900,
    addEventListener: (type, callback) => { if (type === 'resize') resize.add(callback); },
    removeEventListener: (type, callback) => { if (type === 'resize') resize.delete(callback); },
    require: name => {
      if (name === 'react') return { useRef: current => ({ current }), useId: () => 'test',
        useLayoutEffect: callback => effects.push(callback), useEffect: callback => effects.push(callback) };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'lucide-react') return { X: 'svg' };
      if (name === './glassQuality') return { fullGlass: false };
      if (name === './lensMap' || name.endsWith('.css')) return {};
      assert.equal(name, './glassMorph');
      return {
        boxOf: () => rect, containBox: frame => frame,
        currentTransform: () => 'none', flip: () => 'unchanged-flip', reducedMotion: () => reduced,
        openMotion: { duration: 583, easing: 'unchanged-open' }, closeMotion: { duration: 368, easing: 'unchanged-close' },
        useMorphDialog: () => ({ dialogRef, state,
          show: origin => { showCount++; dialogRef.current.open = true; state.current.origin = origin; },
          run: items => { opening = items; return Promise.all(items.map(item => item.finished.catch(() => undefined))).then(() => true); },
          close: async animate => {
            state.current.closing = true;
            closing = animate ? animate() : [];
            await Promise.all(closing.map(item => item.finished.catch(() => undefined)));
            dialogRef.current.open = false;
          },
          handleClose: () => {},
        }),
      };
    },
  };
  runInNewContext(compiled, context);
  const build = element => {
    if (!element || typeof element !== 'object') return;
    const { type, props } = element;
    const node = {
      type, props, style: { ...props.style }, dataset: {}, open: false,
      complete, naturalWidth: complete ? 2560 : 0, naturalHeight: complete ? 786 : 0,
      get offsetWidth() { return 40; }, get offsetHeight() { return 22; },
      setAttribute() {}, decode: () => fullDecode.promise,
      animate: (keyframes, options) => {
        const result = deferred();
        const animation = { keyframes, options, node, finished: result.promise, playState: 'running',
          finish: () => { animation.playState = 'finished'; result.resolve(); },
          pause: () => { animation.playState = 'paused'; },
          cancel: () => { animation.playState = 'idle'; result.reject(new Error('cancelled')); },
        };
        animations.push(animation);
        return animation;
      },
    };
    nodes.push(node);
    if (props.ref) props.ref.current = node;
    const children = Array.isArray(props.children) ? props.children : [props.children];
    children.forEach(build);
  };
  return {
    ...context.exports, requests, nodes, animations, state, context,
    shown: () => showCount,
    node: type => nodes.find(node => node.type === type),
    mount: image => {
      build(context.exports.ImageLightbox({ image, onClose: () => {} }));
      const cleanups = effects.map(effect => effect()).filter(Boolean);
      return () => cleanups.forEach(cleanup => cleanup());
    },
    decoded: () => {
      const full = nodes.find(node => node.type === 'img');
      full.complete = true; full.naturalWidth = 2560; full.naturalHeight = 786;
      fullDecode.resolve();
    },
    failed: () => fullDecode.reject(new Error('decode failed')),
    finishOpening: () => opening.forEach(animation => animation.finish()),
    finishClosing: () => closing.forEach(animation => animation.finish()),
    relayout: () => resize.forEach(callback => callback()),
  };
}

const preview = { src: '/full.webp', thumbnail: '/thumb.webp', natural: { width: 3180, height: 976 }, alt: 'Figure' };
const geometry = picture => Object.fromEntries(['left', 'top', 'width', 'height', 'borderRadius'].map(key => [key, picture.style[key]]));
const reveals = env => env.animations.filter(animation => animation.node.type === 'img');

test('static intent decode deduplicates requests and permits retry after failure', async () => {
  const env = setup();
  assert.equal(await env.preparePreview(''), false);
  const first = env.preparePreview('/full.webp');
  assert.equal(env.preparePreview('/full.webp'), first);
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].src, '/full.webp');
  env.requests[0].result.reject(new Error('network'));
  assert.equal(await first, false);
  const retry = env.preparePreview('/full.webp');
  assert.equal(env.requests.length, 2);
  env.requests[1].result.resolve();
  assert.equal(await retry, true);
});

test('closed lightbox creates no image, source, or preparation request', () => {
  const env = setup();
  env.mount(null);
  assert.equal(env.node('img'), undefined);
  assert.equal(env.node('source'), undefined);
  assert.equal(env.requests.length, 0);
  assert.equal(env.shown(), 0);
});

test('native AVIF picture opens on its thumbnail and reveals only after the existing spring', async () => {
  const env = setup();
  const cleanup = env.mount({ ...preview, avif: '/full.avif', thumbnail: '/thumb.avif' });
  assert.equal(env.node('source').props.type, 'image/avif');
  assert.equal(env.node('source').props.srcSet, '/full.avif');
  assert.equal(env.node('img').props.src, '/full.webp');
  assert.equal(env.requests.length, 0, 'AVIF opening must not create a separate WebP preloader');
  assert.equal(env.shown(), 1, 'opening must not wait for full decode');
  const picture = env.node('picture');
  const before = geometry(picture);
  assert.equal(Number.parseFloat(picture.style.height), 976 * (1328 / 3180));
  env.decoded();
  await drain();
  assert.equal(reveals(env).length, 0);
  assert.equal(env.node('img').style.opacity, '0');
  env.finishOpening();
  await drain();
  const [fade] = reveals(env);
  assert.equal(fade.options.duration, 150);
  assert.equal(JSON.stringify(fade.keyframes), '[{"opacity":0},{"opacity":1}]');
  assert.deepEqual(geometry(picture), before);
  fade.finish();
  await drain();
  assert.equal(picture.style.backgroundImage, 'none');
  env.context.document.documentElement.clientWidth = 390;
  env.relayout();
  assert.equal(Number.parseFloat(picture.style.height), 976 * (346 / 3180));
  cleanup();
});

test('full decode after settling starts a fade without another layout or spring', async () => {
  const env = setup();
  const cleanup = env.mount(preview);
  env.finishOpening();
  await drain();
  assert.equal(reveals(env).length, 0);
  const picture = env.node('picture');
  const before = geometry(picture);
  const count = env.animations.length;
  env.decoded();
  await drain();
  assert.equal(env.animations.length, count + 1);
  assert.deepEqual(geometry(picture), before);
  cleanup();
});

test('prepared and loaded static full image is visible from the first opening frame', async () => {
  const env = setup({ complete: true });
  const prepared = env.preparePreview(preview.src);
  env.requests[0].result.resolve();
  await prepared;
  const cleanup = env.mount(preview);
  assert.equal(env.shown(), 1);
  assert.equal(env.node('img').style.opacity, '1');
  assert.equal(env.node('picture').style.backgroundImage, 'none');
  env.decoded();
  env.finishOpening();
  await drain();
  assert.equal(reveals(env).length, 0);
  cleanup();
});

test('closing before full decode prevents a late reveal', async () => {
  const env = setup();
  const cleanup = env.mount(preview);
  env.node('dialog').props.onCancel({ preventDefault() {} });
  env.decoded();
  env.finishOpening();
  await drain();
  assert.equal(reveals(env).length, 0);
  assert.equal(env.node('dialog').dataset.settled, undefined);
  env.finishClosing();
  await drain();
  cleanup();
});

test('closing during the reveal freezes opacity while the unchanged close morph runs', async () => {
  const env = setup();
  const cleanup = env.mount(preview);
  env.decoded();
  env.finishOpening();
  await drain();
  const [fade] = reveals(env);
  env.node('dialog').props.onCancel({ preventDefault() {} });
  assert.equal(fade.playState, 'paused');
  env.finishClosing();
  await drain();
  cleanup();
  assert.equal(fade.playState, 'idle');
});

test('failed full decode leaves the thumbnail available', async () => {
  const env = setup();
  const cleanup = env.mount(preview);
  env.failed();
  env.finishOpening();
  await drain();
  assert.equal(env.node('img').style.opacity, '0');
  assert.notEqual(env.node('picture').style.backgroundImage, 'none');
  assert.equal(reveals(env).length, 0);
  cleanup();
});

test('legacy callers retain decode-first behavior and unmount cancels pending opening', async () => {
  const env = setup();
  const cleanup = env.mount({ src: '/original.webp', alt: 'Legacy' });
  assert.equal(env.shown(), 0);
  env.decoded();
  await drain();
  assert.equal(env.shown(), 1);
  cleanup();
  const cancelled = setup();
  const dispose = cancelled.mount({ src: '/original.webp', alt: 'Legacy' });
  dispose();
  cancelled.decoded();
  await drain();
  assert.equal(cancelled.shown(), 0);
});

test('reduced motion reveals decoded full without adding an opacity animation', async () => {
  const env = setup({ reduced: true });
  const cleanup = env.mount(preview);
  assert.equal(env.node('dialog').dataset.settled, '');
  env.decoded();
  await drain();
  assert.equal(env.node('img').style.opacity, '1');
  assert.equal(env.node('picture').style.backgroundImage, 'none');
  assert.equal(reveals(env).length, 0);
  cleanup();
});
