import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const { values: { revision } } = parseArgs({ options: { revision: { type: 'string' } } });
const sourcePath = 'src/components/home/Hero.tsx';
const root = new URL('../', import.meta.url);
// The optional revision runs these same assertions against committed source.
const source = revision
  ? execFileSync('git', ['show', `${revision}:${sourcePath}`], {
    cwd: fileURLToPath(root), encoding: 'utf8', timeout: 10000, windowsHide: true,
  })
  : readFileSync(new URL(sourcePath, root), 'utf8');
const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0, 'Hero.tsx must parse before extracting its observer');
const heroes = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Hero');
assert.equal(heroes.length, 1, 'Expected exactly one Hero component');
const observers = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'observePlaybackFrame') observers.push(node);
  ts.forEachChild(node, visit);
}
visit(heroes[0]);
assert.equal(observers.length, 1, 'Expected exactly one observePlaybackFrame declaration in Hero');
const initializer = observers[0].initializer;
assert(initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)), 'Expected an observer function initializer');
const compiled = ts.transpileModule(`const observePlaybackFrame = ${initializer.getText(parsed)}; observePlaybackFrame;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
console.log(`Hero readiness source: ${revision || 'working tree'}:${sourcePath}`);

// Execute the actual observer; only its effect state and native callback delivery are simulated.
function setup() {
  const callbacks = new Map();
  const calls = { ready: [], failed: [] };
  let requests = 0;
  const video = {
    paused: false, error: null, readyState: 2, currentTime: 0,
    requestVideoFrameCallback(callback) {
      const id = ++requests;
      callbacks.set(id, callback);
      return id;
    },
  };
  const state = {
    video, disposed: false, frameObserved: false, readinessFrame: 0,
    flushSync: callback => callback(),
    setVideoReady: value => calls.ready.push(value),
    setVideoFailed: value => calls.failed.push(value),
  };
  const observe = runInNewContext(compiled, state);
  return {
    video, state, calls, observe,
    requested: () => requests,
    pending: () => callbacks.size,
    deliverFrame() {
      assert.equal(callbacks.size, 1, 'A native frame must consume exactly one scheduled callback');
      const [id, callback] = callbacks.entries().next().value;
      callbacks.delete(id);
      callback(1000, { mediaTime: 0, presentedFrames: 1, width: 1920, height: 1080 });
    },
  };
}

function assertNotReady(env) {
  assert.deepEqual(env.calls.ready, [], 'No readiness update is allowed without valid native frame evidence');
  assert.deepEqual(env.calls.failed, [], 'Invalid native frame evidence must not clear the failure state');
  assert.equal(env.state.frameObserved, false);
}

function assertReady(env) {
  assert.deepEqual(env.calls.ready, [true], 'A valid native frame must mark readiness exactly once');
  assert.deepEqual(env.calls.failed, [false]);
  assert.equal(env.state.frameObserved, true);
  assert.equal(env.state.readinessFrame, 0);
  assert.equal(env.pending(), 0);
}

test('readyState and advancing time do not mark ready before the native callback', () => {
  const env = setup();
  env.video.readyState = 4;
  env.video.currentTime = 2;
  env.observe();
  assert.equal(env.requested(), 1);
  assert.equal(env.pending(), 1);
  assertNotReady(env);
});

for (const paused of [true, false]) {
  test(`a presented native frame marks ready while ${paused ? 'paused' : 'playing'}`, () => {
    const env = setup();
    env.observe();
    assertNotReady(env);
    // WebKit may pause after the request but before delivering its first frame.
    env.video.paused = paused;
    env.deliverFrame();
    assertReady(env);
    assert.equal(env.video.paused, paused, 'Readiness must not change playback state');
  });
}

for (const [name, invalidate] of [
  ['disposed effect', env => { env.state.disposed = true; }],
  ['media error', env => { env.video.error = { code: 3 }; }],
  ['HAVE_NOTHING', env => { env.video.readyState = 0; }],
  ['HAVE_METADATA', env => { env.video.readyState = 1; }],
]) {
  test(`a native callback with ${name} does not mark ready`, () => {
    const env = setup();
    env.observe();
    invalidate(env);
    env.deliverFrame();
    assertNotReady(env);
    assert.equal(env.state.readinessFrame, 0, 'A consumed callback must clear its handle');
    assert.equal(env.pending(), 0);
    assert.equal(env.requested(), 1);
  });
}

test('repeated observation schedules no duplicate callback before or after readiness', () => {
  const env = setup();
  env.observe();
  env.observe();
  env.observe();
  assert.equal(env.requested(), 1);
  assert.equal(env.pending(), 1);
  assertNotReady(env);
  env.deliverFrame();
  env.observe();
  env.observe();
  assert.equal(env.requested(), 1);
  assertReady(env);
});

test('a rejected callback releases its handle for one later observation', () => {
  const env = setup();
  env.observe();
  env.video.readyState = 1;
  env.deliverFrame();
  assertNotReady(env);
  env.video.readyState = 2;
  env.observe();
  env.observe();
  assert.equal(env.requested(), 2);
  assert.equal(env.pending(), 1);
  env.deliverFrame();
  assertReady(env);
});

test('without requestVideoFrameCallback the observer does not invent frame evidence', () => {
  const env = setup();
  delete env.video.requestVideoFrameCallback;
  env.observe();
  env.observe();
  assertNotReady(env);
  assert.equal(env.requested(), 0);
  assert.equal(env.pending(), 0);
  assert.equal(env.state.readinessFrame, 0);
});
