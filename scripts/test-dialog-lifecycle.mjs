import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const readSource = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const morphSource = readSource('src/components/ui/glassMorph.ts');
const lightboxSource = readSource('src/components/ui/ImageLightbox.tsx');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

// Exercise the real hook callbacks without a browser or a throttled render workload.
function environment() {
  const classes = new Set();
  const frames = new Map();
  let frame = 0;
  let effects = [];
  const context = {
    exports: {},
    document: { documentElement: { classList: {
      add: name => classes.add(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    } } },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: callback => { frames.set(++frame, callback); return frame; },
    cancelAnimationFrame: id => frames.delete(id),
    require: name => {
      assert.equal(name, 'react');
      return {
        useRef: current => ({ current }),
        useCallback: callback => callback,
        useEffect: effect => effects.push(effect),
      };
    },
  };
  runInNewContext(compile(morphSource), context);
  return {
    motion: context.exports,
    locked: () => classes.has('glass-dialog-open'),
    flushFocus: () => { for (const callback of frames.values()) callback(); frames.clear(); },
    create: () => {
      effects = [];
      let closed = 0;
      let focused = 0;
      const origin = { style: {}, isConnected: true, matches: () => true, focus: options => {
        assert.equal(options.preventScroll, true);
        focused++;
      } };
      const dialog = {
        open: false, dataset: {},
        showModal() { this.open = true; },
        close() { this.open = false; },
      };
      const hook = context.exports.useMorphDialog(() => closed++);
      hook.dialogRef.current = dialog;
      const cleanups = effects.map(effect => effect());
      return { ...hook, origin, dialog, closed: () => closed, focused: () => focused,
        unmount: () => cleanups.forEach(cleanup => cleanup()) };
    },
  };
}

function animation() {
  let finish;
  let cancel;
  const finished = new Promise((resolve, reject) => { finish = resolve; cancel = reject; });
  return { finished, finish, cancel };
}

test('closing one modal retains the other scroll lock and restores source/focus', async () => {
  const env = environment();
  const first = env.create();
  const second = env.create();
  first.show(first.origin);
  second.show(second.origin);
  assert(env.locked());
  assert.equal(first.origin.style.visibility, 'hidden');
  const opening = animation();
  const openingDone = first.run([opening]);
  const outgoing = animation();
  const closing = first.close(() => [outgoing]);
  assert.equal(await openingDone, false);
  assert(first.dialog.open);
  outgoing.finish();
  await closing;
  first.handleClose();
  assert(env.locked());
  assert.equal(first.origin.style.visibility, '');
  assert.equal(first.closed(), 1);
  env.flushFocus();
  assert.equal(first.focused(), 1);
  await second.close();
  second.handleClose();
  assert.equal(env.locked(), false);
});

test('reopening cancels an old close and ignores a queued close event', async () => {
  const env = environment();
  const modal = env.create();
  modal.show(modal.origin);
  const outgoing = animation();
  const closing = modal.close(() => [outgoing]);
  modal.show(modal.origin);
  await closing;
  modal.handleClose();
  assert(modal.dialog.open);
  assert(env.locked());
  assert.equal(modal.closed(), 0);
  assert.equal(modal.origin.style.visibility, 'hidden');
  modal.unmount();
  assert.equal(env.locked(), false);
});

test('unmount invalidates pending animation completion and releases the lock', async () => {
  const env = environment();
  const modal = env.create();
  modal.show(modal.origin);
  const opening = animation();
  const done = modal.run([opening]);
  modal.unmount();
  assert.equal(await done, false);
  assert.equal(env.locked(), false);
  assert.equal(modal.origin.style.visibility, '');
  env.flushFocus();
  assert.equal(modal.focused(), 0);
});

test('failed native opening releases the lock without hiding the source', () => {
  const env = environment();
  const modal = env.create();
  modal.dialog.showModal = () => { throw new Error('detached dialog'); };
  assert.throws(() => modal.show(modal.origin), /detached dialog/);
  assert.equal(env.locked(), false);
  assert.notEqual(modal.origin.style.visibility, 'hidden');
});

test('effect cleanup and replay retain return focus and reacquire the scroll lock', async () => {
  const env = environment();
  const modal = env.create();
  modal.show(modal.origin);
  modal.unmount();
  modal.show(modal.origin);
  assert(env.locked());
  await modal.close();
  modal.handleClose();
  env.flushFocus();
  assert.equal(modal.focused(), 1);
  assert.equal(env.locked(), false);
});

test('spring inputs and settled durations remain unchanged', () => {
  const { motion } = environment();
  assert.deepEqual(motion.openMotion, motion.springTiming(240, 24));
  assert.deepEqual(motion.closeMotion, motion.springTiming(380, 38));
  assert.equal(motion.openMotion.duration, 583);
  assert.equal(motion.closeMotion.duration, 368);
});

test('caption measurement deduplication preserves the original four-read geometry', () => {
  const ast = ts.createSourceFile('ImageLightbox.tsx', lightboxSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const layout = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'finalLayout');
  const body = layout.body;
  // Restore only the old measurement helper to get the uncached reference algorithm.
  const helpers = body.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => ['heights', 'captionHeight'].includes(declaration.name.getText(ast))));
  assert.equal(helpers.length, 2);
  const source = layout.getText(ast);
  const start = helpers[0].getStart(ast) - layout.getStart(ast);
  const end = helpers[1].end - layout.getStart(ast);
  const reference = source.slice(0, start)
    + 'const captionHeight = width => { caption.style.width = `${width}px`; return caption.offsetHeight; };'
    + source.slice(end);
  const context = { exports: {}, document: { documentElement: { clientWidth: 1440 } }, window: { innerHeight: 900 } };
  runInNewContext(compile(`export ${source}\nexport ${reference.replace('function finalLayout', 'function referenceLayout')}`), context);
  const naturalSizes = [[3180, 976], [2703, 870], [3163, 1487], [3519, 2153], [5643, 2397], [2153, 1604], [1550, 1411], [1440, 550], [4139, 1314], [2901, 1347], [120, 90]];
  let fewerReads = 0;
  for (const viewport of [390, 640, 1440, 2560]) {
    context.document.documentElement.clientWidth = viewport;
    for (const [width, height] of naturalSizes) {
      for (const textWidth of [250, 1400, 3800]) {
        const caption = () => ({ style: {}, reads: 0, get offsetHeight() {
          this.reads++;
          return Math.ceil(textWidth / Number.parseFloat(this.style.width)) * 22;
        } });
        const actualCaption = caption();
        const referenceCaption = caption();
        const actual = context.exports.finalLayout({ width, height }, actualCaption, 40);
        const expected = context.exports.referenceLayout({ width, height }, referenceCaption, 40);
        assert.deepEqual(actual, expected);
        assert.equal(referenceCaption.reads, 4);
        assert(actualCaption.reads <= referenceCaption.reads);
        if (actualCaption.reads < referenceCaption.reads) fewerReads++;
      }
    }
  }
  assert(fewerReads > 0);
});
