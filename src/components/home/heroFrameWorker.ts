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
    const sink = new VideoSampleSink(track, { optimizeForLatency: true });
    let loop = 0;
    let offset = 0;
    let decodeWaitMs = 0;
    while (true) {
      let lastEnd = start;
      let requestedAt = performance.now();
      for await (const sample of sink.samples(start)) {
        try {
          decodeWaitMs += performance.now() - requestedAt;
          while (credits === 0) await new Promise<void>(resolve => { resume = resolve; });
          credits--;
          const frame = sample.toVideoFrame();
          lastEnd = sample.timestamp + sample.duration;
          try {
            worker.postMessage({ frame, time: sample.timestamp, endTime: lastEnd,
              clock: offset + sample.timestamp, loop, decodeWaitMs }, [frame]);
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
