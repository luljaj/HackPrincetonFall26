# Deterministic turn service

Pure modules are importable by `tsx`; the future runtime/route entry points must carry
`server-only` guards. There are no real provider calls in this implementation.

- `processTurn(input: ProcessTurnInput, dependencies: PipelineDependencies): Promise<TurnResponse>`
  accepts `{ sessionId, metadata: { interactionId, questionId, expectedTurnNumber }, audio: File }`.
- `createSession(input: CreateSessionRequest, dependencies: SessionDependencies): Promise<CreateSessionResponse>`
  validates and snapshots a scene supplied by `getScene` before saving it.
- `MemoryPipelineStore` implements the approved `PipelineStore` contract. It is process-local,
  loses data on restart, and is not a durable deployment adapter.

`types.ts` exports the adapter and context contracts. Transcription receives `{ audio, hints }`
and returns `{ transcript, model }`. Luna receives structured `LunaContext` (scene, exact
private question, original/variant identity, transcript, prior assistance and complete ordered
history) and returns `{ draft, model }`. The service validates the draft at runtime. Adapters
must supply trusted behavior instructions separately from structured learner data.

`PipelineError` exposes a public-safe `code`, `message`, and HTTP `status`, following specification
section 4. Transcription decoding failures should throw `PipelineError("UNSUPPORTED_AUDIO")`;
provider failures use `PROVIDER_ERROR`; refusals/incomplete/missing parsed Luna output use
`INVALID_MODEL_OUTPUT`. Unexpected provider/store exceptions are replaced with safe messages.
Audio metadata is checked here; successful decoding must be verified by the adapter.

Dependencies inject UUID generation and `{ now(): ISO string, monotonicMs(): number }`.
Diagnostics save stage durations and processing-before-commit. Optional `trace` receives a
cloned canonical record, replay flag, persistence duration and total time through publication;
trace overhead itself is excluded. The trace is restricted development data, including
transcripts/private guides, and must not be exposed through public or ordinary parent reads.
It never contains audio. No second save updates postcommit timings.

Optional `publish` receives only `{ sessionId, interactionId, turnNumber }` after a new commit.
Concurrent same-ID requests may do duplicate external work, but only one commits and publishes.
Completed replays skip external work. Publisher/trace failures are isolated and logged as fixed
categories through `log` (or `console.warn` by default). No browser acknowledgment is awaited.

A repeated interaction ID always means the exact same submission; the service does not compare
metadata or hash audio. Duplicate lookup is session-scoped and precedes stale state checks.
A newly recorded answer needs a new interaction ID.

Contextual validation enforces exactly one different variant after an incorrect original,
retains the active question for clarification, and closes after an assessed variant. Case and
whitespace normalized identical questions and repeated exact question text in feedback are
rejected. Educational correctness, same-objective meaning and scene compatibility still require
the provider prompt and evaluation; string validation cannot establish those semantic facts.

Run `npm run test --workspace=web` for contract and deterministic service/store checks.

## OpenAI adapters

`client.ts` is the `server-only` app entry: `createOpenAIAdapters()` validates configuration
on invocation, then returns the injected-compatible `luna` and `transcribe` adapters.
It does not select storage or expose a route. `config.ts`, `luna.ts` and `transcribe.ts`
are pure factory modules for the CLI/tests. Never import the app entry from a browser.

Copy `.env.example` to an ignored local environment file or set server environment values.
`OPENAI_API_KEY` is required only for real providers; defaults are `gpt-transcribe` and
`gpt-6-luna`, overridable by `TRANSCRIPTION_MODEL` and `LUNA_MODEL`. Model identifiers
remain deployment/account dependent. Requests use a 30-second timeout with no SDK retries;
Luna uses Responses parsing, low reasoning, a 1,200-token output budget, no tools and
`store: false`. No provider payloads or exception messages are attached to public errors.
Refusal, incomplete/failed responses, missing parsed data and invalid drafts fail closed.
Transcription passes the original File, a balanced scene vocabulary prompt and JSON output;
it does not transcode, estimate ASR confidence or persist audio. Decoder errors map to 415;
authentication, rate limits, model availability and transport errors map to 502.

Run `npm run eval:pipeline --workspace=web` for eleven synthetic offline scenarios
(15 turns) using `processTurn` and the memory store. This checks contracts, assistance,
clarification, one-variant behavior and retained records; its deterministic oracle does
not measure model assessment or teaching quality. Timing reports label the bypass/fake
model IDs and are not provider latency measurements.

Only `npm run eval:pipeline --workspace=web -- --live` creates real clients. It deliberately
loads `apps/web/.env.local` then `.env` (existing shell values win). Text cases bypass ASR
and send synthetic transcripts to Luna. Results include exact outputs, private records,
model IDs, prompt revision, assessment mismatches/failures and median/slowest stage times
in ignored `evals/pipeline/results/`. Inspect semantics, pacing/word counts, tentative
parent summaries and prompt-injection handling manually; no exact generated wording is
asserted. Multi-turn expected answers assume the natural variant asks about green apples;
review a mismatch against the generated question/guide before interpreting assessment error.
A failed or prematurely closed case stops its remaining turns and exits nonzero.

For supplied, deliberately synthetic audio only, use `--live --audio-manifest=/absolute/manifest.json`.
The JSON array adds single-turn fixtures with shape:

```json
[{ "id": "wrong-short-answer", "audioPath": "/absolute/synthetic/wrong.webm",
   "notes": "Deliberately recorded four; inspect transcription fidelity and room noise.",
   "steps": [{ "transcript": "four", "expected": "incorrect" }] }]
```

Supported fixture suffixes: webm, wav, m4a, mp4 (3 MiB maximum). `transcript` documents the
intended spoken content; real ASR output is saved separately in the record for human
comparison, never replaced by this annotation. Raw files stay at the supplied path and
are never copied into persistence/reports. Audio requires `--live`; the offline fake bytes
are explicitly a text bypass and cannot establish decoding or microphone quality.
No recorded fixtures or recorder evidence are bundled. Actual recorder samples, noisy-room
checks, provider credentials/budget and live quality/latency remain external validation.
Application non-persistence does not establish provider retention; review account settings
before deployment. These adapters do not implement a runtime selector, HTTP or dev UI.
