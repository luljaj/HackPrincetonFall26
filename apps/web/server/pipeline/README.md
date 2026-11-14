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
