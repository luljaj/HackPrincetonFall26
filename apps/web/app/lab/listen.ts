// Hands-free listening: open the mic, wait for the kid to speak, stop when they go quiet.
// Energy-based voice detection with an adaptive noise floor.
// ponytail: energy VAD; swap in Silero (@ricky0123/vad-web) if real rooms are too noisy.

export const VAD = {
  frameMs: 30,
  calibrateMs: 300, // first stretch sets the noise floor
  minRms: 0.012, // never trigger below this, however quiet the room
  floorFactor: 3, // speech = louder than 3x the noise floor
  startMs: 200, // this much speech counts as the kid starting (a word, not a click or a voice tail)
  gapMs: 150, // quiet shorter than this between syllables keeps adding up toward startMs
  pauseMs: 200, // first short pause after speech: Dora's "Hmm" goes here, like a listener's "mm"
  endSilenceMs: 400, // this much quiet after speech ends the answer (people take turns within a few hundred ms)
  noSpeechMs: 7500, // nobody spoke: let the stage machine nudge (kids, and presenters, need a moment)
  maxMs: 8000, // hard cap on one answer
};

// Lossless when the browser allows it: Opus recordings cost the pronunciation scorer about 6 points of
// "praised" on the test set (85% → 79%) and add ±3 log-prob of noise per clip.
export const recorderOptions = (): MediaRecorderOptions => {
  const mimeType = ["audio/webm;codecs=pcm", "audio/wav"].find((t) => MediaRecorder.isTypeSupported(t));
  return mimeType ? { mimeType } : {};
};

// lastSpeechAt = the kid's last loud frame: the honest start of the turn gap (endedAt is endSilenceMs later).
export type Heard = { clip: Blob | null; spoke: boolean; endedAt: number; lastSpeechAt: number };

type VadState = { floor: number; elapsed: number; loudFor: number; quietFor: number; started: boolean };
export const VAD_START: VadState = { floor: Infinity, elapsed: 0, loudFor: 0, quietFor: 0, started: false };

/** Pure VAD step, exported for tests: feed one frame's RMS and the real time since the last frame
 * (timers get throttled in background tabs, so never assume frameMs). */
export function vadStep(s: VadState, rms: number, dt: number = VAD.frameMs): { state: VadState; done: "spoke" | "silent" | null } {
  const n = { ...s, elapsed: s.elapsed + dt };
  // Noise floor = the quietest calibration frame, so a kid who answers instantly doesn't become the "floor".
  if (s.elapsed < VAD.calibrateMs) n.floor = Math.min(n.floor, rms); // any frame that starts inside the window
  const loud = rms > Math.max(VAD.minRms, n.floor * VAD.floorFactor);
  n.quietFor = loud ? 0 : n.quietFor + dt;
  n.loudFor = loud ? n.loudFor + dt : n.quietFor > VAD.gapMs ? 0 : n.loudFor; // syllable gaps don't reset it
  if (!n.started && n.loudFor >= VAD.startMs) n.started = true;
  const done: "spoke" | "silent" | null = n.started && n.quietFor >= VAD.endSilenceMs ? "spoke"
    : !n.started && n.elapsed >= VAD.noSpeechMs ? "silent"
    : n.elapsed >= VAD.maxMs ? (n.started ? "spoke" : "silent") : null;
  return { state: n, done };
}

/** Open once per hands-free session and reuse it: reopening per turn costs 100-300 ms and the device's gain
 * ramp-up can swallow the first syllable. */
export const openMic = () =>
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

// The clip is only the answer: from just before the kid started talking to just after they stopped, as a
// 16 kHz mono 16-bit WAV (what Whisper and the scorer use anyway). Recording the whole listening window as
// Chrome's 48 kHz stereo PCM made 1-3 MB clips full of silence: slow to upload and over the size limits.
export const CLIP = {
  rate: 16000,
  prerollMs: 300, // before the detected start, so the first syllable isn't clipped
  tailMs: 250, // after the last loud frame, so the last syllable isn't either
};

/** Sample range [from, to) of the answer within everything heard so far. Pure, exported for tests. */
export function speechWindow(total: number, rate: number, startedAt: number, loudForAtStart: number, quietForAtEnd: number): [number, number] {
  const ms = (x: number) => Math.round((x * rate) / 1000);
  const from = Math.max(0, startedAt - ms(loudForAtStart + CLIP.prerollMs));
  const to = Math.min(total, total - ms(Math.max(0, quietForAtEnd - CLIP.tailMs)));
  return [from, Math.max(from, to)];
}

/** Float samples at `fromRate` → 16-bit mono WAV at CLIP.rate (linear resampling). Pure, exported for tests. */
export function encodeWav(samples: Float32Array, fromRate: number): Uint8Array {
  const n = Math.max(0, Math.floor((samples.length * CLIP.rate) / fromRate));
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at: number, str: string) => { for (let i = 0; i < str.length; i++) out.setUint8(at + i, str.charCodeAt(i)); };
  text(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); text(8, "WAVE");
  text(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, CLIP.rate, true); out.setUint32(28, CLIP.rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  text(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const at = (i * fromRate) / CLIP.rate;
    const j = Math.floor(at);
    const a = samples[j] ?? 0, b = samples[j + 1] ?? a;
    const v = Math.max(-1, Math.min(1, a + (b - a) * (at - j)));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(out.buffer);
}

// The mic's raw samples, mixed to mono, straight off the audio thread (loaded once per audio context).
const TAP = `registerProcessor("dora-mic-tap", class extends AudioWorkletProcessor {
  process(inputs) {
    const chans = inputs[0];
    if (chans && chans.length) {
      const mono = new Float32Array(chans[0].length);
      for (const ch of chans) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / chans.length;
      this.port.postMessage(mono, [mono.buffer]);
    }
    return true;
  }
});`;
const tapLoaded = new WeakMap<BaseAudioContext, Promise<void>>();
function loadTap(context: AudioContext) {
  let loaded = tapLoaded.get(context);
  if (!loaded) {
    loaded = context.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], { type: "text/javascript" })));
    tapLoaded.set(context, loaded);
  }
  return loaded;
}

/** One answer from an already-open mic stream. The stream stays open; only this turn's tap is removed. */
export async function listenOnce(stream: MediaStream, context: AudioContext, signal: AbortSignal, onSpeechStart?: () => void, onPause?: () => void): Promise<Heard> {
  signal.throwIfAborted();
  await loadTap(context);
  signal.throwIfAborted();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  // Everything heard this turn (8 s at most), kept as chunks; the answer is cut out of it at the end.
  const tap = new AudioWorkletNode(context, "dora-mic-tap");
  const mute = context.createGain();
  mute.gain.value = 0; // the tap must be pulled by the graph to run, but nobody should hear the mic
  source.connect(tap).connect(mute).connect(context.destination);
  const chunks: Float32Array[] = [];
  let heardSamples = 0;
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => { chunks.push(e.data); heardSamples += e.data.length; };
  const buf = new Float32Array(analyser.fftSize);
  let state = VAD_START;
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = performance.now();
  let paused = false; // onPause fires once, at the first short pause after speech
  let startedAt = 0, loudForAtStart = 0; // where speech was detected, in samples, and how much speech it took
  try {
    const result = await new Promise<"spoke" | "silent">((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((sum, x) => sum + x * x, 0) / buf.length);
        const wasStarted = state.started;
        const now = performance.now();
        const step = vadStep(state, rms, now - last);
        last = now;
        state = step.state;
        if (!wasStarted && state.started) { startedAt = heardSamples; loudForAtStart = state.loudFor; onSpeechStart?.(); }
        if (state.started && !paused && state.quietFor >= VAD.pauseMs) { paused = true; onPause?.(); }
        if (step.done) resolve(step.done);
      }, VAD.frameMs);
    });
    const endedAt = performance.now();
    let clip: Blob | null = null;
    if (result === "spoke") {
      const all = new Float32Array(heardSamples);
      let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.length; }
      const [from, to] = speechWindow(heardSamples, context.sampleRate, startedAt, loudForAtStart, state.quietFor);
      clip = new Blob([encodeWav(all.subarray(from, to), context.sampleRate) as BlobPart], { type: "audio/wav" });
    }
    return { clip, spoke: result === "spoke", endedAt, lastSpeechAt: endedAt - state.quietFor };
  } finally {
    clearInterval(timer);
    tap.port.onmessage = null;
    source.disconnect();
    tap.disconnect();
    mute.disconnect();
  }
}
