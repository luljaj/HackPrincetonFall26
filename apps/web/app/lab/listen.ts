// Hands-free listening: open the mic, wait for the kid to speak, stop when they go quiet.
// Energy-based voice detection with an adaptive noise floor.
// ponytail: energy VAD; swap in Silero (@ricky0123/vad-web) if real rooms are too noisy.

export const VAD = {
  frameMs: 30,
  calibrateMs: 300, // first stretch sets the noise floor
  minRms: 0.012, // never trigger below this, however quiet the room
  floorFactor: 3, // speech = louder than 3x the noise floor
  startMs: 90, // this much speech in a row counts as the kid starting
  endSilenceMs: 700, // this much quiet after speech ends the answer
  noSpeechMs: 6000, // nobody spoke: let the stage machine nudge
  maxMs: 8000, // hard cap on one answer
};

// Lossless when the browser allows it: Opus recordings cost the pronunciation scorer about 6 points of
// "praised" on the test set (85% → 79%) and add ±3 log-prob of noise per clip.
export const recorderOptions = (): MediaRecorderOptions => {
  const mimeType = ["audio/webm;codecs=pcm", "audio/wav"].find((t) => MediaRecorder.isTypeSupported(t));
  return mimeType ? { mimeType } : {};
};

export type Heard = { clip: Blob | null; spoke: boolean; endedAt: number };

type VadState = { floor: number; elapsed: number; loudFor: number; quietFor: number; started: boolean };
export const VAD_START: VadState = { floor: Infinity, elapsed: 0, loudFor: 0, quietFor: 0, started: false };

/** Pure VAD step, exported for tests: feed one frame's RMS and the real time since the last frame
 * (timers get throttled in background tabs, so never assume frameMs). */
export function vadStep(s: VadState, rms: number, dt: number = VAD.frameMs): { state: VadState; done: "spoke" | "silent" | null } {
  const n = { ...s, elapsed: s.elapsed + dt };
  // Noise floor = the quietest calibration frame, so a kid who answers instantly doesn't become the "floor".
  if (s.elapsed < VAD.calibrateMs) n.floor = Math.min(n.floor, rms); // any frame that starts inside the window
  const loud = rms > Math.max(VAD.minRms, n.floor * VAD.floorFactor);
  n.loudFor = loud ? n.loudFor + dt : 0;
  n.quietFor = loud ? 0 : n.quietFor + dt;
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

/** One answer from an already-open mic stream. The stream stays open; only this turn's recorder stops. */
export async function listenOnce(stream: MediaStream, context: AudioContext, signal: AbortSignal, onSpeechStart?: () => void): Promise<Heard> {
  signal.throwIfAborted();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const recorder = new MediaRecorder(stream, recorderOptions());
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  const buf = new Float32Array(analyser.fftSize);
  let state = VAD_START;
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = performance.now();
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
        if (!wasStarted && state.started) onSpeechStart?.();
        if (step.done) resolve(step.done);
      }, VAD.frameMs);
    });
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.stop();
    await stopped;
    return { clip: result === "spoke" ? new Blob(chunks, { type: recorder.mimeType }) : null, spoke: result === "spoke", endedAt: performance.now() };
  } finally {
    clearInterval(timer);
    if (recorder.state !== "inactive") recorder.stop();
    source.disconnect();
  }
}
