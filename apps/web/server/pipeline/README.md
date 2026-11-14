# Deterministic turn service

Pure modules are importable by `tsx`; runtime and route composition entry points carry
`server-only` guards. The runtime uses the real OpenAI adapters lazily on the first turn.

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
asserted. Multi-turn fixtures annotate the expected green-apple question. In live mode,
variant answers are graded only when the actual question matches that annotation (case
and whitespace normalized); another valid question is explicitly ungraded and requires
human review, with actual outputs/guides retained. `ungradedAssessments` reports this
coverage separately; these turns never increase `assessmentErrors`. All hard contract
and assistance checks still run. Offline expectations remain deterministic.
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
before deployment. The runtime and HTTP integration below compose these adapters.


## HTTP integration and local inspector

Node App Router handlers expose `POST /api/learning/sessions` with strict JSON
`{ "sceneId": "demo-scene" }` (201), then
`POST /api/learning/sessions/{sessionId}/turns` (200). The only bundled scene is
`server/scenes/example.scene.ts`, an explicitly synthetic counting fixture; replace
it with the agreed authored scene in the server scene loader before the demo.
Setup and the inspector work without an API key; the first transcription/Luna call
initializes the configured real adapters. Missing credentials return safe 502 errors.

Send a multipart `File` in `audio`, UUID `interactionId`, exact `questionId`, and
nonnegative integer text `expectedTurnNumber` (initially `"0"`). All four fields are
required exactly once; extra fields, including `transcript`, are rejected. Do not
set the browser's multipart Content-Type; let fetch supply its boundary. Files must
be nonempty and at most 3 MiB, with a matching filename suffix, MIME and basic
container signature: WebM (`audio/webm` or `video/webm`), MP4 (`audio/mp4` or
`video/mp4`), M4A (`audio/mp4`, `audio/m4a`, `audio/x-m4a`), or WAV (`audio/wav`,
`audio/wave`, `audio/x-wav`). Codec parameters are permitted. Signature checks do
not prove valid audio; the transcription provider must still successfully decode
it. This endpoint does not transcode or persist uploads. Confirm deployment body
limits externally; Next multipart parsing buffers the request before file validation.

The controller must send only one in-flight turn per session. Retain the completed
File, interaction ID and original metadata through failures or lost responses, and
retry that exact submission. A completed interaction is looked up before stale
question/turn checks and returns its original stored result without another model
call/write/publication. Newly recorded answers need fresh IDs. The server does not
hash/compare retry audio. After a successful result use its committed turnNumber and
nextQuestion; null ends this teaching moment. Technical errors have the shared
safe `{ error: { code, message, requestId } }` envelope: 400 malformed/empty, 413
oversize, 415 unsupported/undecodable, 404 missing session, 409 stale/closed turn,
502 provider/model, 503 store. No playback acknowledgment is required.

`runtime.ts` uses a global symbol so independently compiled Next route bundles share
one process-local store and development trace map, rather than allocating per
request. `PIPELINE_STORE=memory` (the default) is permitted only for development or
test; production memory, `postgres`, and unknown adapters fail with 503. No durable
adapter is implemented. The storage teammate should replace the selector with their
`PipelineStore` implementation from `server/storage/contract.ts`, preserving atomic
duplicate-before-version commit checks. That contract and committed records are
the integration boundary for their authorized parent progress reader/dashboard.
Memory and traces disappear on restart, are unbounded for this short-lived local
harness, and are not shared across processes/instances or suitable for deployment.
Restart development after changing runtime/provider configuration.

A realtime owner can install their server-side publisher once during server setup
by assigning `getPipelineRuntime().pipeline.publish = async (event) => { ... }`.
The hook receives only sessionId, interactionId and committed turnNumber, after
successful storage. It is currently unset: no socket server or delivery transport
exists here. Failed publication logs only a fixed category and does not undo the
turn; the subscriber must refetch/resync saved state. Do not configure this hook
inside each request or expose provider credentials/private records to clients.

For local inspection, set `PIPELINE_DEBUG=true` and run `npm run dev --workspace=web`
with NODE_ENV=development. Both `/dev/pipeline` and
`GET /api/dev/pipeline/{sessionId}?interactionId={interactionId}` return 404 without
both conditions, including production with the opt-in set. Never deploy a
NODE_ENV=development server with real learner data. The debug endpoint returns the
private session, selected record read back from the store, original commit trace,
and latest HTTP duration. The page provides a new-session selector, file upload,
submit and exact-retry controls; it displays the public response separately from
private scene/question guides, transcript, draft, assessment, parent summary and
all timings. It does not record, play speech or implement a child/dashboard UI.

Record diagnostics contain transcription/Luna and precommit durations. The trace
adds persistence and pipeline-total timing; HTTP total includes multipart parsing
through service return, excluding response serialization/transfer. Client round-trip
includes upload and the turn response, excluding the subsequent debug read. Replays
retain the original commit trace but update HTTP and client durations. A null Luna
duration/draft means it was skipped (empty transcript). No second timing write is
made. Detailed traces are collected only with local debug enabled and never hold audio.

`http.test.ts` exercises injectable handlers with fake adapters, strict upload/error
boundaries, setup/replay/readback and debug/storage gates. Tests and the default
evaluator use no network/provider calls. Real recorder/container decoding and live
model quality/latency require separate authorized live evaluation with credentials.
