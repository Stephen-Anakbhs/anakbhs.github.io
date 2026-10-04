import { Input, MP4, UrlSource, VideoSampleSink } from 'mediabunny';

/** Decode the original MP4 into images on its original timestamps; loaded only after autoplay denial. */
export async function playCanvasHero(
  canvas: HTMLCanvasElement, src: string, signal: AbortSignal, start: number,
  onFrame: (time: number) => void,
) {
  if (typeof VideoDecoder === 'undefined') throw new Error('VideoDecoder is not supported');
  const input = new Input({ formats: [MP4], source: new UrlSource(src, {
    maxCacheSize: 16 * 1024 * 1024,
    getRetryDelay: (attempt) => attempt < 2 ? 0.5 : null,
  }) });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  let raf = 0;
  let releaseWait: (() => void) | undefined;
  const cancelWait = () => { cancelAnimationFrame(raf); releaseWait?.(); };
  signal.addEventListener('abort', cancelWait, { once: true });
  const waitUntil = (deadline: number) => new Promise<void>((resolve) => {
    releaseWait = resolve;
    const tick = (time: number) => {
      if (signal.aborted || time >= deadline) { releaseWait = undefined; resolve(); }
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) throw new Error('Original H.264 cannot be decoded');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas is not supported');
    canvas.width = await track.getDisplayWidth();
    canvas.height = await track.getDisplayHeight();
    const sink = new VideoSampleSink(track);
    let frames = 0;
    let loop = 0;
    while (!signal.aborted) {
      let origin: number | undefined;
      let lastEnd = start;
      for await (const sample of sink.samples(start)) {
        try {
          if (signal.aborted) return;
          origin ??= performance.now() - sample.timestamp * 1000;
          await waitUntil(origin + sample.timestamp * 1000);
          if (signal.aborted) return;
          sample.draw(context, 0, 0, canvas.width, canvas.height);
          canvas.dataset.frame = String(++frames);
          canvas.dataset.time = String(sample.timestamp);
          canvas.dataset.loop = String(loop);
          lastEnd = sample.timestamp + sample.duration;
          onFrame(lastEnd);
        } finally { sample.close(); }
      }
      if (origin !== undefined) await waitUntil(origin + lastEnd * 1000);
      start = 0;
      loop++;
    }
  } finally {
    cancelWait();
    signal.removeEventListener('abort', cancelWait);
    signal.removeEventListener('abort', dispose);
    dispose();
  }
}
