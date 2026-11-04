import type { HeroFrameMessage } from './heroFrameWorker';

/** Decode ahead off-thread, then hand over each original frame on its media timestamp. */
export async function playDecodedFrames(
  src: string, signal: AbortSignal, start: number,
  present: (frame: VideoFrame, endTime: number, item: HeroFrameMessage, drawMs: number) => void,
) {
  if (signal.aborted) return;
  const worker = new Worker(new URL('./heroFrameWorker.ts', import.meta.url), { type: 'module' });
  const capacity = 12;
  const queue: HeroFrameMessage[] = [];
  let failure: Error | undefined;
  let wake: (() => void) | undefined;
  let releaseWait: (() => void) | undefined;
  let timer = 0;
  const stop = () => { worker.terminate(); clearTimeout(timer); wake?.(); releaseWait?.(); };
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
      const tick = () => {
        const remaining = deadline - performance.now();
        if (signal.aborted || remaining <= 0) { releaseWait = undefined; resolve(); }
        else timer = window.setTimeout(tick, remaining);
      };
      tick();
    });
  };
  try {
    worker.postMessage({ type: 'start', src: new URL(src, location.href).href, start, capacity });
    // A short queue absorbs bursty worker delivery without dropping frames or slowing playback.
    while (!signal.aborted && !failure && queue.length < capacity) await waitForData();
    let origin: number | undefined;
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
        const drawnAt = performance.now();
        present(item.frame, item.endTime, item, drawMs);
        drawMs += performance.now() - drawnAt;
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

/** The hero's opaque picture on a plain 2D canvas, also kept for the navigation glass to sample. */
export async function playCanvasHero(
  canvas: HTMLCanvasElement, src: string, signal: AbortSignal, start: number,
  onFrame: (time: number) => void,
) {
  if (signal.aborted) return;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas is not supported');
  const mediaCanvas = canvas as HTMLCanvasElement & { liquidVideoFrame?: VideoFrame };
  // WebKit omits alpha from getContextAttributes(); this full-frame H.264 canvas is opaque.
  canvas.dataset.mediaOpaque = 'true';
  let frames = 0;
  try {
    await playDecodedFrames(src, signal, start, (frame, endTime, item, drawMs) => {
      if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
      if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      // The glass renderer can sample the decoded frame without a slow canvas readback.
      const previousFrame = mediaCanvas.liquidVideoFrame;
      mediaCanvas.liquidVideoFrame = frame.clone();
      previousFrame?.close();
      canvas.dataset.frame = String(++frames);
      canvas.dataset.time = String(item.time);
      canvas.dataset.loop = String(item.loop);
      canvas.dataset.decodeWaitMs = String(item.decodeWaitMs);
      canvas.dataset.drawMs = String(drawMs);
      onFrame(endTime);
    });
  } finally {
    mediaCanvas.liquidVideoFrame?.close();
    delete mediaCanvas.liquidVideoFrame;
  }
}
