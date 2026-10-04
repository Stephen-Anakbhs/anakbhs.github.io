import { Input, MP4, UrlSource, VideoSampleSink } from 'mediabunny';

export type HeroFrameMessage = {
  frame: VideoFrame;
  time: number;
  endTime: number;
  clock: number;
  loop: number;
  decodeWaitMs: number;
};

type Command = { type: 'start'; src: string; start: number; capacity: number } | { type: 'next' };
const worker = self as unknown as {
  onmessage: (event: MessageEvent<Command>) => void;
  postMessage(message: HeroFrameMessage | { error: string }, transfer?: Transferable[]): void;
};
let credits = 0;
let resume: (() => void) | undefined;

// Keep the continuous media clock off the page's rendering/timer queue.
const waitUntil = (deadline: number) => new Promise<void>(resolve => {
  const tick = () => {
    const remaining = deadline - performance.now();
    if (remaining <= 0) resolve();
    else setTimeout(tick, remaining);
  };
  tick();
});

worker.onmessage = ({ data }) => {
  if (data.type === 'next') { credits++; resume?.(); return; }
  credits = data.capacity;
  void decode(data.src, data.start).catch((error: unknown) => {
    worker.postMessage({ error: error instanceof Error ? error.message : String(error) });
  });
};

async function decode(src: string, start: number) {
  if (typeof VideoDecoder === 'undefined') throw new Error('Worker VideoDecoder is not supported');
  const input = new Input({ formats: [MP4], source: new UrlSource(src, {
    maxCacheSize: 16 * 1024 * 1024,
    getRetryDelay: attempt => attempt < 2 ? 0.5 : null,
  }) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) throw new Error('Original H.264 cannot be decoded');
    // Leaving Home on the last frame saves its end timestamp, not a decodable frame.
    if (start > 0 && start >= await track.computeDuration() - 1e-6) start = 0;
    // WebKit's default decoder produced bursty frames in the fallback regression.
    // This decoder is used only after native muted playback has been blocked.
    const sink = new VideoSampleSink(track, { optimizeForLatency: true, hardwareAcceleration: 'prefer-software' });
    let loop = 0;
    let offset = 0;
    let decodeWaitMs = 0;
    let origin: number | undefined;
    while (true) {
      let lastEnd = start;
      let requestedAt = performance.now();
      for await (const sample of sink.samples(start)) {
        try {
          decodeWaitMs += performance.now() - requestedAt;
          while (credits === 0) await new Promise<void>(resolve => { resume = resolve; });
          credits--;
          lastEnd = sample.timestamp + sample.duration;
          const clock = offset + sample.timestamp;
          origin ??= performance.now() - clock * 1000;
          await waitUntil(origin + clock * 1000);
          const frame = sample.toVideoFrame();
          try {
            worker.postMessage({ frame, time: sample.timestamp, endTime: lastEnd,
              clock, loop, decodeWaitMs }, [frame]);
          } catch (error) { frame.close(); throw error; }
        } finally { sample.close(); requestedAt = performance.now(); }
      }
      if (lastEnd <= start) throw new Error('Video contains no decodable frames');
      offset += lastEnd;
      start = 0;
      loop++;
    }
  } finally { input.dispose(); }
}
