import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const patchSource = readFileSync(new URL('./scrollbar-overflow-patch.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(patchSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
runInNewContext(compiled, module);
const transform = module.exports.scrollbarOverflowPatch().transform;
const id = '/node_modules/overlayscrollbars/overlayscrollbars.mjs';
const original = readFileSync(new URL('../node_modules/overlayscrollbars/overlayscrollbars.mjs', import.meta.url), 'utf8');
const patched = transform(original, id).code;

function setter(source, initial) {
  let value = initial;
  let writes = 0;
  const context = {
    a: {}, j: 'data-overlayscrollbars-viewport', x: 'visible', H: 'hidden', E: 'scroll',
    keys: Object.keys, concat: (a, b) => a.concat(b), deduplicateArray: values => [...new Set(values)],
    overflowCssValueToOverflowStyle: value => value,
    createViewportOverflowStyleClassName: (value, horizontal) => `overflow${horizontal ? 'X' : 'Y'}${value[0].toUpperCase()}${value.slice(1)}`,
    getAttr: () => value,
    setAttrs: (_node, _attribute, next) => { value = next; writes++; },
    p: (tokens, enabled = false) => {
      const next = new Set(value.split(' ').filter(Boolean));
      for (const token of tokens.split(' ')) enabled ? next.add(token) : next.delete(token);
      value = [...next].join(' ');
      writes++;
    },
  };
  const body = source.match(/const setViewportOverflowStyle = t => \{[\s\S]*?\n  \};/)[0];
  const apply = runInNewContext(`${body}; setViewportOverflowStyle`, context);
  return { apply, value: () => value, writes: () => writes };
}

test('all overflow axis transitions preserve upstream final tokens with one atomic write', () => {
  const values = ['visible', 'hidden', 'scroll'];
  for (const x of values) for (const y of values) {
    const initial = 'scrollbarHidden overflowXHidden overflowYScroll measuring';
    const old = setter(original, initial);
    const next = setter(patched, initial);
    old.apply({ x, y });
    next.apply({ x, y });
    assert.deepEqual(new Set(next.value().split(' ')), new Set(old.value().split(' ')));
    assert.equal(next.writes(), 1);
    next.apply({ x, y });
    assert.equal(next.writes(), 1, 'repeated state must not invalidate the document again');
  }
});

test('already canonical viewport state is a no-op', () => {
  const next = setter(patched, 'scrollbarHidden overflowXHidden overflowYScroll');
  next.apply({ x: 'hidden', y: 'scroll' });
  assert.equal(next.writes(), 0);
});

test('the patch is scoped to the pinned module, including dev query strings', () => {
  assert.equal(transform(original, '/other/module.mjs'), undefined);
  assert.equal(transform(original, `${id}?v=dev`).code, patched);
  assert.throws(() => transform('changed upstream source', id), /setter changed/);
});
