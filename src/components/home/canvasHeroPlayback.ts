import type { HeroFrameMessage } from './heroFrameWorker';

/** Decode off the page thread and transfer original frames without copying their pixels. */
export async function playCanvasHero(
  canvas: HTMLCanvasElement, src: string, signal: AbortSignal, start: number,
  onFrame: (time: number) => void,
) {
  if (signal.aborted) return;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas is not supported');
  const worker = new Worker(new URL('./heroFrameWorker.ts', import.meta.url), { type: 'module' });
  const capacity = 12;
  const queue: HeroFrameMessage[] = [];
  let failure: Error | undefined;
  let wake: (() => void) | undefined;
  let releaseWait: (() => void) | undefined;
  let raf = 0;
  const stop = () => { worker.terminate(); cancelAnimationFrame(raf); wake?.(); releaseWait?.(); };
  signal.addEventListener('abort', stop, { once: true });
  worker.onmessage = (event: MessageEvent<HeroFrameMessage | { error: string }>) => {
    if ('error' in event.data) failure = new Error(event.data.error);
    else if (signal.aborted) event.data.frame.close();
    else queue.push(event.data);
    wake?.();
  };
  worker.onerror = (event) => { failure = new Error(event.message || 'Frame worker failed'); wake?.(); };
  const waitForData = () => new Promise<void>(resolve => { wake = resolve; });
  const waitUntil = (deadline: number): Promise<void> => {
    if (signal.aborted || performance.now() >= deadline) return Promise.resolve();
    return new Promise<void>(resolve => {
      releaseWait = resolve;
      const tick = (time: number) => {
        if (signal.aborted || time >= deadline) { releaseWait = undefined; resolve(); }
        else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  };
  try {
    worker.postMessage({ type: 'start', src: new URL(src, location.href).href, start, capacity });
    while (!signal.aborted && !failure && queue.length < capacity) await waitForData();
    let origin: number | undefined;
    let frames = 0;
    let drawMs = 0;
    while (!signal.aborted) {
      if (failure) throw failure;
      if (!queue.length) { await waitForData(); continue; }
      const item = queue.shift()!;
      worker.postMessage({ type: 'next' });
      try {
        origin ??= performance.now() - item.clock * 1000;
        await waitUntil(origin + item.clock * 1000);
        if (signal.aborted) return;
        if (canvas.width !== item.frame.displayWidth) canvas.width = item.frame.displayWidth;
        if (canvas.height !== item.frame.displayHeight) canvas.height = item.frame.displayHeight;
        const drawnAt = performance.now();
        context.drawImage(item.frame, 0, 0, canvas.width, canvas.height);
        drawMs += performance.now() - drawnAt;
        canvas.dataset.frame = String(++frames);
        canvas.dataset.time = String(item.time);
        canvas.dataset.loop = String(item.loop);
        canvas.dataset.decodeWaitMs = String(item.decodeWaitMs);
        canvas.dataset.drawMs = String(drawMs);
        onFrame(item.endTime);
      } finally { item.frame.close(); }
    }
  } finally {
    stop();
    signal.removeEventListener('abort', stop);
    for (const item of queue) item.frame.close();
    worker.onmessage = null;
    worker.onerror = null;
  }
}
