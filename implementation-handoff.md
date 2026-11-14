# Interactive Cartoon Learning — implementation handoff

Updated November 14, 2026. This document consolidates the planning conversation so it can be copied into the separate application repository. It supersedes earlier suggestions where they conflict with the decisions below.

## Repository and implementation status

- This is the research repository. The application is in a separate GitHub repository with a Turborepo setup, according to the user.
- The application repository has not been inspected. Framework, backend runtime, database, deployment, package manager, and existing application structure remain unknown.
- This document is a plan, not evidence that the pipeline or application has been implemented.
- The local Rhubarb experiment was implemented and tested; its visual result was rejected. Details appear below.
- Original vision: `cartoon-learning-idea.md`. Keep that file as background; use this handoff for the latest scope.
- The user requests **GPT-6.1 Sol subagents for research**. When evaluating choices, include alternatives, justify recommendations, and have agents challenge one another where useful.
- Work collaboratively through consequential decisions. Do not reopen settled choices or prescribe detailed behavior owned by another teammate unnecessarily.

## Product and demo

An existing cartoon becomes an interactive learning experience. At a prepared story moment, Dora needs the child's help. The child answers aloud; generated teaching dialogue responds to the answer, then the original episode continues. Parents can inspect learning evidence.

### Two connected experiences

- **Kid view:** a TV-style hub with cartoon channels/tiles, such as Dora and Bluey, leading into playback. A separate teammate owns the intricate kid UI design. Only prepared content is actually playable as an interactive lesson in the initial slice.
- **Parent view:** retains the learning-evidence dashboard. Proposed learning-preference controls (such as choosing math) belong to its owner; whether they are functional in the demo is not settled and is not a prerequisite for Luka's work.
- **Live synchronization:** use a shared backend with WebSocket change notifications after durable writes. Child interactions refresh parent evidence. Parent-to-kid preference updates are conditional on the other owner implementing them, not required now. Browsers do not directly own each other's state. Audio submissions and model processing keep their HTTP flow.
- The cartoon controller displays/plays supplied content and coordinates recording/playback. Question reasoning stays in the model pipeline. Parent-control functionality belongs to its teammate; view pairing and realtime hosting/ownership still need team agreement; see the learning progress plan. Do not infer an entire scheduling system or multi-show lesson catalog from the new presentation.

### Agreed constraints

- **Hard two-minute demo cap**, supplied by the user. Do not plan a second-session demonstration.
- **Pre/post learning checks are future work, mentioned in the pitch only.** Do not implement or scaffold check questions, phase fields, routes, prompts, comparison logic, or UI for them. The implemented evidence comes from the episode teaching conversation.
- Invite the judge to participate and intentionally answer incorrectly. They can role-play a child with a misconception; the response is generated live.
- Prefer short, single-part answers: a number, color, object, or brief phrase. Do not require a multi-part explanation in the core demo.
- A wrong short answer may suggest a misconception, but it does not prove the child's reasoning. Avoid claiming certainty about an explanation they never gave.
- One prepared scene and one learning objective are the initial slice. **The actual learning objective is still undecided.** Fractions and language learning were examples, not selections.
- The storyline is fixed. Only the teaching conversation adapts before the episode resumes.
- Dora initiates at specific prepared pause points. Child-initiated interruptions anywhere in an episode are outside this scope.
- Listening starts automatically after Dora finishes speaking. A microphone button is not the intended main interaction.
- Dora remains quietly attentive while processing. No filler acknowledgment is planned.
- Detailed wrong-answer pedagogy, follow-up limits, scene choice, and dashboard UI design belong with their owners and were deliberately deferred.

### Pitch and proof

Lead with adaptive teaching inside a familiar cartoon, then briefly show the resulting evidence.

- Prepared scene assets and objectives are legitimate preparation. Describe the adaptation as live; do not imply automatic conversion of arbitrary episodes.
- The live proof should be a meaningful response to the judge's actual answer and the corresponding saved interaction. Do not substitute a canned branch while calling it live adaptation.
- No second session will be demonstrated. Persistence is in scope; demonstrated cross-session personalization is not.
- “Answered this item after help” is evidence. “Mastered fractions” or durable learning improvement is not established by one interaction.

## Ownership

The user's ownership is the **model/conversation pipeline and shared interfaces**, not the audiovisual turn controller.

| Area | Owner and boundary |
| --- | --- |
| Cartoon experience | Cartoon teammate: scene preparation, microphone capture, end-of-answer detection, turn coordination, episode progression, ElevenLabs speech generation, avatar/video playback. |
| Model pipeline | User: transcription, Luna integration, response selection, model context/history, learning-evidence output, pipeline visibility, small evaluation set. |
| Shared interfaces | User defines the contracts among cartoon, pipeline, and dashboard, in agreement with teammates. This does not mean implementing their features. |
| Parent dashboard and persistence | Dashboard teammate: parent controls, evidence UI, and durable storage/read interfaces. User's pipeline writes completed processing results through that interface. |
| Kid TV hub | Separate kid UI teammate: show/channel selection and kid-facing presentation; integrate with cartoon playback; functional parent controls are not a prerequisite. |
| Realtime connection | Team must assign service ownership: authorized WebSocket subscriptions and notifications after durable changes. User defines the pipeline commit notification boundary, not all realtime infrastructure. |

### Explicitly outside the user's scope

- Microphone recording and deciding when an utterance is finished.
- Automatically opening/closing listening around playback; the cartoon controller owns that.
- ElevenLabs voice generation and Runway/avatar/video integration.
- Deciding when to end the teaching interaction and resume the episode.
- Dashboard presentation design.
- Building an automatic full-episode analysis/conversion system.

## Agreed processing flow

1. The cartoon controller starts a teaching moment using prepared scene/question configuration.
2. After Dora finishes, the controller records the child's answer and detects its end.
3. It sends the recorded audio and session identifier, with the relevant question/scene reference, to the user's backend.
4. The backend transcribes the audio.
5. The backend uses session history and scene context for Luna.
6. **Luna returns proposed dialogue and a learning assessment in one call.** The same call also returns a one-sentence parent summary of the session so far. Do not add a second evaluator to the critical path by default.
7. Application code composes the final response: teaching or clarification.
8. **Save the interaction after processing finishes.** Do not wait for playback acknowledgment.
9. After the write succeeds, notify the parent view through the shared realtime integration. Return the selected response text and response type to the cartoon controller, with the agreed assessment metadata.
10. The cartoon teammate generates speech, drives visuals, and decides whether another turn happens or the episode resumes.

The exact endpoint layout, transport, response schema, and persistence-call ordering need to be defined in the application repository. These steps express responsibilities rather than finalized API signatures.

## Luna and context

- Working model selection: OpenAI **GPT-6 Luna**, API identifier `gpt-6-luna`, for teaching dialogue. This is a starting choice, not a measured latency/quality winner.
- Return dialogue and assessment together in one call.
- In that same call, Luna also writes a one-sentence, plain-language **parent summary** of the session so far, for example “Answered correctly after assistance.” It describes what happened and must not claim mastery, infer hint counts from generic assistance flags, or claim help was necessary or verified as heard. It is saved with the interaction for the dashboard; it is not spoken and is not sent to the cartoon controller. There is no extra model call.
- The backend owns conversation history, keyed by a **session ID**. The cartoon frontend should not have to reconstruct the model conversation every turn.
- “Context” means information needed to respond coherently: what is happening in the scene, what Dora asked, the learning objective, the child's answer, recent dialogue, and help already supplied.
- The cartoon teammate authors/supplies scene facts, objectives, and starting questions. The user defines their shared format and assembles the model input.
- Prepare the world and task, not an exhaustive set of misconception-response branches.
- Character instructions and any target learner configuration belong in that context, but no age range or exact prompt has been selected.
- Prior-session summaries may be an optional future input. Do not build a complex memory/retrieval system or require a second session for this demo.
- Model assessment is a judgment. Schema validation can check structure and allowed values; it cannot establish semantic correctness by itself.

Source checked during research: [OpenAI models](https://developers.openai.com/api/docs/models). Recheck API details during implementation.

## Response selection

- Ordinary learning input: use Luna's teaching response.
- Empty or unclear input, or a suspected transcript problem: ask for clarification.
- A **prepared line** is the initial choice for the empty-audio clarification. Do not introduce another model generation step just to word it.

## History, evidence, and persistence

Retain:

- Session/interaction identifiers needed to relate records.
- Actual question text, including generated follow-up questions.
- Child's transcript.
- Selected response text and type.
- Luna's learning assessment and whether assistance had already been provided.
- Luna's one-sentence parent summary of the session so far.

Do not retain raw microphone recordings for this prototype. Temporary processing of uploaded audio is distinct from persistence.

Save after processing completes. **There is no playback-acknowledgment gate and no requirement to wait for Dora before saving.** This explicitly supersedes the earlier proposal to confirm delivery first.

Accordingly, a saved response means it was selected/generated by the pipeline, not verified as heard by the child. Do not add delivery-status machinery as a hidden requirement.

The pipeline produces the evidence and triggers its write; the dashboard teammate owns its storage implementation. Backend session history ownership does not require duplicating the dashboard data store; decide the practical arrangement once the existing app is inspected.

## Shared interface design to finalize

These are required concepts, not locked field names or technology choices:

| Boundary | Information |
| --- | --- |
| Cartoon → pipeline: scene/session setup | Scene facts, learning objective/task context, starting question, scene/question identity, relevant character configuration. |
| Cartoon → pipeline: answer | Session ID, recorded audio, enough question/turn identity to associate it correctly. |
| Pipeline → cartoon | Selected response text, type (`teaching` or `clarification` as conceptual values), agreed learning metadata. |
| Pipeline → persistence | Question, transcript, selected response, learning evidence, parent summary, identifiers. |
| Dashboard → persistence | Read session/interaction evidence for presentation. |

The pipeline does **not** issue a mandatory “resume episode” command. The cartoon controller owns progression. Scene resume anchors can remain in the cartoon configuration rather than becoming a required model input.

Use the smallest contract that lets teammates build against sample input/output independently. Do not invent a large event platform, schema-versioning system, or additional unowned backend workstream.

## Visibility and evaluation

The user owns a development view/logging setup sufficient to inspect:

- Transcript and scene/question context.
- Luna's proposed dialogue, assessment, and parent summary.
- Final returned response and saved record.
- Separate transcription, Luna, and total pipeline timings.

Run a small task-relevant evaluation set covering:

- Correct short answers and plausible incorrect short answers.
- Empty/unclear transcription and off-topic answers.
- Response/assessment structure and consistent evidence output.

Use the examples to tune prompts. This is a development test set, not a validated educational benchmark. No exact latency target or evaluation framework has been chosen.

An independent first milestone: submit an audio clip in a minimal test interface and inspect transcription, Luna output, selected response, and the persisted record. It should not depend on the avatar being ready.

## Cartoon/video research and current direction

### Prepared footage concept

The original plan was to create visually ambiguous extra footage before the demo, then generate only speech live. Both a natural loop and dialogue constrained to a fixed clip length were considered; neither was definitively selected.

Matching total duration does not match mouth shapes. ElevenLabs character timestamps are not a complete phoneme/viseme animation solution, and the researched standard TTS interface did not provide an exact-duration guarantee.

### Rhubarb experiment — rejected visual result

An actual local test used a Dora clip and a different sentence, “Can you find the blue triangle?”, spoken by macOS Samantha TTS. This was **not** ElevenLabs or a cloned Dora voice.

- Rhubarb 1.14.0 ran on the Apple Silicon Mac.
- Three seconds of original audio: 20 cues in approximately 1.75 seconds.
- Replacement audio: 13 cues in 4.87 seconds with PocketSphinx and transcript; approximately 2.52 seconds with phonetic recognition.
- The displayed offline TTS/cue/render pipeline took approximately 10.46 seconds.
- A manually positioned mouth overlay showed visible patching/jitter. The user rejected its visual quality. Do not revive that prototype as the chosen solution.
- This disproves neither all authored 2D rigs nor all audio-driven animation; it establishes that this rough overlay was inadequate.

Local report: `experiments/rhubarb-dora-2026-11-14/README.md`.
Local video: `experiments/rhubarb-dora-2026-11-14/dora-rhubarb-comparison.mp4`.
These files must be copied separately if desired; they are not embedded in this handoff.

The test source was a publicly accessible community Internet Archive upload, not an official rights-cleared production asset. [Source](https://archive.org/details/videoplayback_20250625_0531). [Rhubarb repository](https://github.com/DanielSWolf/rhubarb-lip-sync).

### Runway — promising, not selected or tested

The user is open to live video generation through a purpose-built conversational avatar service and found Runway intriguing. **Testing was paused to continue planning.**

Research findings from Sol subagents:

- Runway Characters documents character-image-driven avatars and cartoon examples.
- Its LiveKit integration can take externally synthesized audio and bypass its built-in dialogue/voice, potentially preserving Luna → ElevenLabs.
- Generated visual consistency, mouth quality for the exact Dora reference, and transitions from prepared footage remain untested.
- A deterministic quiet idle/closed-mouth pose was not established by the documentation. Showing a prepared attentive loop while a stream stays warm is an engineering possibility, not a verified seamless feature.
- Vendor latency figures concern its own measured pipeline, not this project's complete loop or cold start. No project latency guarantee exists.
- At research time, docs listed a $10 minimum API credit purchase, $0.02 session start plus $0.20/minute active, and five-minute sessions. Recheck before spending or implementation; no purchase or trial was performed.

Sources: [external audio](https://docs.dev.runwayml.com/characters/livekit/), [examples and vendor measurements](https://runway.com/news/engineering/building-runway-characters), [lifecycle](https://docs.dev.runwayml.com/characters/concepts/), [pricing](https://docs.dev.runwayml.com/guides/pricing/).

### Other researched options

| Option | Finding and limitation |
| --- | --- |
| Live2D Cubism MotionSync | Browser audio-driven 2D rig; requires authored model assets, not an existing MP4. Avoids an improvised pasted mouth, but custom art is substantial. Vowel-based blended mouth states are not full English phoneme alignment. |
| Rive / Adobe Character Animator | Authored integrated character art can improve control; rigging/art is required. Adobe's desktop streaming adds a bridge to a browser app. |
| LemonSlice Cartoon | Dedicated cartoon model and external audio support. At research time launch and pricing pages conflicted on plan access; affordable availability unresolved. Not tested. |
| Sync | Official material warned of reduced cartoon accuracy and non-live generation times. Not established as suitable for a live turn. |
| MuseTalk | NVIDIA real-time throughput claims do not establish Dora/flat-2D quality or Apple Silicon performance. |
| LatentSync / Wav2Lip | No verified drop-in solution for this flat-2D character and live Mac setup. |
| Adobe MakeItTalk | Explicit cartoon research, but legacy setup and no demonstrated practical live path here. |
| Simli / Hedra | Simli's researched current avatar requirements did not establish this 2D fit. Hedra's old realtime integration was documented as retired; do not rely on old realtime demos. |

Key sources: [Live2D MotionSync](https://docs.live2d.com/en/cubism-editor-manual/motion-sync/), [Live2D Web setup](https://docs.live2d.com/en/cubism-sdk-manual/use-on-scene-motion-sync-web/), [LemonSlice Cartoon](https://lemonslice.com/blog/cartoon-model), [LemonSlice pricing](https://lemonslice.com/pricing), [Sync cartoon limitations](https://support.sync.so/articles/7908962494-no-lipsync-on-my-ai-generated-character), [Sync timings](https://sync.so/docs/product/generation-times), [MuseTalk](https://github.com/TMElyralab/MuseTalk), [MakeItTalk](https://github.com/adobe-research/MakeItTalk).

### ElevenLabs

Matching Dora's voice was the user's preference, not a completed voice asset. Instant Voice Cloning was researched; ElevenLabs requires permission to clone a voice. Professional cloning has additional verification requirements. No voice has been created or selected in this work.

Sources: [voice cloning](https://elevenlabs.io/docs/eleven-api/concepts/voice-cloning), [permission requirements](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-is-my-voices), [timing API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).

## Dora scene research

Two Sol agents investigated whether Dora pauses are concept-agnostic. They inspected official descriptions, research publications, and secondary episode transcripts; they did not visually verify all proposed edit points.

Conclusion: **a story situation can support several learning objectives, but an existing question/pause is not automatically interchangeable.** The recorded answer reveal and following action can constrain the replacement more than the silence itself.

- Keeping the original question/continuation permits adaptive help around that task.
- Rewriting the question permits different activities compatible with visible objects and the required outcome.
- Replacing the entire challenge and resuming after its resolution allows broader objectives.
- A generic “solve a challenge to proceed” setup, such as a Troll Bridge scene, was proposed as flexible.
- **The user was not satisfied that a riddle necessarily provides the intended educational value and deferred this issue to the scene owner. No Troll Bridge episode or riddle approach is selected.**

Examples from secondary transcripts included route selection in *Backpack!*, large-red-book selection, size-based bridge repair, and a four-point-key task in *The Legend of the Big Red Chicken*. These demonstrate that visuals and continuation often bind the answer. Proposed alternative math/language questions were hypothetical adaptations, not original show dialogue.

Sources: [Paramount series description](https://www.paramountplus.com/shows/dora-the-explorer/), [official bridge compilation](https://www.youtube.com/watch?v=k60VNzuTwa0), [Backpack transcript](https://dora.fandom.com/wiki/Backpack%21/Transcript), [Big Red Chicken transcript](https://dora.fandom.com/wiki/The_Legend_of_the_Big_Red_Chicken/Transcript), [Dora curriculum-team article](https://ic4ml.org/wp-content/uploads/2022/04/JML-56_1-2.pdf), [Disney Research on interactive preschool programming](https://studios.disneyresearch.com/wp-content/uploads/2019/04/Investigating-the-Effects-of-Interactive-Features-for-Preschool-Television-Programming.pdf).

## Next work in the application repository

1. Inspect the actual Turborepo and repository instructions before choosing framework/package layout.
2. Agree on shared scene, audio-turn, pipeline-response, and persistence types with teammates.
3. Select a transcription service and confirm accepted audio formats from the cartoon recorder.
4. Verify Luna SDK/API details; define structured outputs and the prepared clarification line.
5. Decide the smallest backend/session-history/storage arrangement supported by the existing app.
6. Implement one audio-in → selected-response-out path with persistence and timing visibility.
7. Run the small evaluation set; refine behavior from failures rather than adding speculative infrastructure.
8. Connect to the cartoon controller and dashboard against the shared contracts.

Do not silently expand this into avatar research, episode authoring, dashboard design, cross-session demonstration, or playback-confirmation infrastructure. Those are either separately owned, deliberately deferred, or explicitly excluded from the current plan.
