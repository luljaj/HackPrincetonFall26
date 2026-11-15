# Dora demo: the lost jewel

Open `http://localhost:3010/?demo=treasure`. The normal `/` still plays the full episode. This mode uses the original Cloudflare episode and skips only the intervals in `apps/web/app/lab/demo-edit.json`; original scene, loop and dubbing timestamps stay intact.

The edited film is approximately 111 seconds, excluding live teaching pauses. The story is complete: Mommy calls Dora about a lost jewel, the pyramid is locked, the team finds and counts six keys, the door opens, they find the red diamond jewel, and Mommy celebrates. Firehouse, bridge and Swiper side trips are omitted so the goal stays clear.

The TV has a Play/Pause button on its screen. Pausing also stops Dora's speech and microphone listening; resuming a spoken line restarts that line. Hide remote collapses the sidebar, and Show remote restores it. The Next exercise button stays available on the screen while the remote is hidden.

## Run it

1. Open the demo TV and the parent view. Select English on the TV before switching it on. Leave hands-free on for the judge; use headphones or a separate microphone so the TV doesn't answer itself. Parent Demo Mode may be off.
2. The TV has one **Next exercise** button. It skips to the next exercise not yet entered: counting, addition, then translation. Exercises that start naturally also advance this button. After all three, the same button becomes **Continue story**. Skipping never marks an answer correct. Translation uses the selected learning language, defaulting to Hindi when the TV was English-only.
3. Let Mommy explain the jewel and the locked pyramid. While that plays, ask the parent chat: “Have Sam learn more about addition.” The saved focus changes immediately. In this edit, the extra addition question waits until the keys scene.
4. Dora reaches the prepared pause and asks, “How many keys do we have altogether?” Invite the judge to answer “five” or another incorrect number. Let the real pipeline respond to that answer, then answer the follow-up. The correct target is six; keep the actual result if the judge gets it wrong.
5. With Numbers turned up, one extra question uses the keys from the scene: “Two keys and one more key. How many keys is that?” The target is three. These lines are prepared; the judge's answer and Dora's teaching reply are live.
6. Type the exact parent command “teach him hindi now.” Prefer doing this while Dora is waiting on the keys question: the TV acknowledges it immediately, preserves the current answer's scoring language, and follows with Hindi practice after the current question. Hindi replaces the Spanish petal; Spanish progress remains saved.
7. Let the story finish: the keys open the pyramid and the lost jewel is found. Open Mastery to show the actual saved answer, assistance and language evidence. Ask chat, “What should we practise next?” Its recommendation uses saved results. Parent-set lesson levels are never presented as independent answers.

If the pitch needs to stay near three minutes, keep the judge's replies short and use the counting challenge plus Hindi. The extra addition is an optional proof of parent steering. Don't attempt every skill, a second viewing, all dashboard tabs and safety in the same run. A safety redirect can replace the optional extra challenge if it is part of the judging story.

The prepared counting and addition prompts have spoken versions in Spanish, French, German, Chinese, Hindi and Japanese, with the English question underneath. Word practice shows the English meaning, native script and romanization. This translates the teaching moments; the edited story's original English dialogue is retained.

## Rehearsal limits

Prepared footage, prepared prompts, live answers: describe that distinction plainly. The edit does not turn arbitrary cartoons into interactive content. A single answer is evidence for that question, not proof of lasting learning. Rehearse the judge's microphone and Hindi scoring with a real speaker: a synthetic Hindi pronunciation test received a retry, so it is not a passed speech-quality check.

No parent history is reset by entering this URL. Existing pending language-lesson requests from before the demo player opened are ignored; a new parent request is still delivered live. Watching time counts video actually played, excluding source jumps and time spent paused for a question. Skipping to an exercise does not create watched minutes or completed answers.

## Media and rebuilding

- Preview without live interactions: `/media/demo/dora-treasure-preview.mp4` on the local web app.
- Rebuild that preview with `python3 tools/build-demo-cut.py`. It reads the same edit manifest as playback, using the local `apps/web/public/media/dora-ep3.mp4`. The preview video stays ignored by Git.
- The four English prompts and their 24 translated recordings are checked in under `public/media/lab/`. Native-script text lives in `demo-questions.json` and `lines.json`; tests check caption/recording coverage. The existing voice generator accepts individual IDs such as `--only demoCountKeys_hi --engine multilingual`, or use the running V3 voice server. Translation IDs end in `_hi`, `_es`, `_fr`, `_de`, `_zh` or `_ja`.
