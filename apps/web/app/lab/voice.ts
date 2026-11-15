type VoiceMessage =
  | { type: "start"; sampleRate: number }
  | { type: "audio"; pcm: string }
  | { type: "done"; firstAudioSeconds: number; generationSeconds: number }
  | { type: "error"; error: string };

function parseMessage(line: string): VoiceMessage {
  const value: unknown = JSON.parse(line);
  if (typeof value !== "object" || value === null || !("type" in value)) throw new Error("Invalid voice stream.");
  switch (value.type) {
    case "start":
      if ("sampleRate" in value && typeof value.sampleRate === "number" && Number.isInteger(value.sampleRate) && value.sampleRate >= 8000 && value.sampleRate <= 48000) {
        return { type: "start", sampleRate: value.sampleRate };
      }
      break;
    case "audio":
      if ("pcm" in value && typeof value.pcm === "string") return { type: "audio", pcm: value.pcm };
      break;
    case "done":
      if ("firstAudioSeconds" in value && typeof value.firstAudioSeconds === "number" && "generationSeconds" in value && typeof value.generationSeconds === "number") {
        return { type: "done", firstAudioSeconds: value.firstAudioSeconds, generationSeconds: value.generationSeconds };
      }
      break;
    case "error":
      if ("error" in value && typeof value.error === "string") return { type: "error", error: value.error };
  }
  throw new Error("Invalid voice stream message.");
}

export async function streamVoice({ text, learningLanguage, context, destination, signal, onSpeaking, onMetrics }: {
  text: string;
  learningLanguage?: string;
  context: AudioContext;
  destination: AudioNode;
  signal: AbortSignal;
  onSpeaking: (speaking: boolean) => void;
  onMetrics: (metrics: { firstAudioSeconds: number; generationSeconds: number }) => void;
}): Promise<void> {
  const sources = new Set<AudioBufferSourceNode>();
  let finishPlayback: (() => void) | undefined;
  let streamDone = false;
  const playbackDone = new Promise<void>((resolve) => { finishPlayback = resolve; });
  const stop = () => {
    for (const source of sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    sources.clear();
    finishPlayback?.();
    onSpeaking(false);
  };
  signal.throwIfAborted();
  signal.addEventListener("abort", stop, { once: true });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    await context.resume();
    const response = await fetch("/api/voice", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, learningLanguage }), signal,
    });
    if (!response.ok || !response.body) throw new Error(response.status === 429 ? "Voice is busy. Try again shortly." : "Voice service unavailable. Start the local voice server.");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let sampleRate: number | undefined;
    let nextAt: number | undefined;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const message = parseMessage(line);
      if (streamDone) throw new Error("Unexpected data after voice completion.");
      switch (message.type) {
        case "start":
          if (sampleRate !== undefined) throw new Error("Duplicate voice header.");
          sampleRate = message.sampleRate;
          break;
        case "audio": {
          if (sampleRate === undefined) throw new Error("Voice header missing.");
          const bytes = Uint8Array.from(atob(message.pcm), (c) => c.charCodeAt(0));
          if (bytes.length === 0 || bytes.length % 2) throw new Error("Invalid voice audio.");
          const pcm = new DataView(bytes.buffer);
          const buffer = context.createBuffer(1, bytes.length / 2, sampleRate);
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768;
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(destination);
          sources.add(source);
          source.onended = () => {
            sources.delete(source);
            source.disconnect();
            if (streamDone && sources.size === 0) finishPlayback?.();
          };
          // Start the buffer when audio arrives; time spent generating must not consume it.
          nextAt = Math.max(nextAt ?? context.currentTime + 0.16, context.currentTime + 0.025);
          source.start(nextAt);
          nextAt += buffer.duration;
          onSpeaking(true);
          break;
        }
        case "done":
          streamDone = true;
          onMetrics(message);
          if (sources.size === 0) finishPlayback?.();
          break;
        case "error": throw new Error(message.error);
      }
    };
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      pending += decoder.decode(result.value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) !== -1) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending);
    if (!streamDone) throw new Error("Voice stream ended before completion.");
    await playbackDone;
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", stop);
    await reader?.cancel().catch(() => undefined);
    stop();
  }
}

/** Keep the caption readable if speech fails, without changing the character's voice. */
export function captionFallback(text: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const guard = setTimeout(() => finish(), Math.min(12000, 1500 + text.split(/\s+/).length * 350));
    const finish = () => {
      clearTimeout(guard);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Fetch a whole line from the voice server as one buffer (for dubbing, where it's prepared ahead and played on cue). */
export async function fetchVoice({ text, language, durationSeconds, context, signal }: {
  text: string; language: string; durationSeconds: number; context: AudioContext; signal: AbortSignal;
}): Promise<AudioBuffer> {
  const response = await fetch("/api/voice", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language, durationSeconds }), signal,
  });
  if (!response.ok) throw new Error("Voice service unavailable.");
  let sampleRate: number | undefined;
  let complete = false;
  const chunks: Int16Array[] = [];
  for (const line of (await response.text()).split("\n")) {
    if (!line.trim()) continue;
    const message = parseMessage(line);
    if (complete) throw new Error("Unexpected data after voice completion.");
    if (message.type === "start") sampleRate = message.sampleRate;
    else if (message.type === "error") throw new Error(message.error);
    else if (message.type === "done") complete = true;
    else if (message.type === "audio") {
      const bytes = Uint8Array.from(atob(message.pcm), (c) => c.charCodeAt(0));
      if (!sampleRate || !bytes.length || bytes.length % 2) throw new Error("Invalid voice audio.");
      chunks.push(new Int16Array(bytes.buffer, 0, bytes.length >> 1));
    }
  }
  const length = chunks.reduce((n, c) => n + c.length, 0);
  if (!complete || !sampleRate || !length) throw new Error("Incomplete voice audio.");
  const all = new Float32Array(length);
  let at = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i++) all[at++] = c[i]! / 32768;
  const buffer = context.createBuffer(1, all.length, sampleRate);
  buffer.getChannelData(0).set(all);
  return buffer;
}
