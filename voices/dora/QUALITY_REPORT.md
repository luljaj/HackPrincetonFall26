# Voice quality comparison

## Current local setup: Multilingual V3

The user compared volume-matched Turbo and Multilingual V3 samples and preferred V3 as closer to Dora. Both the resident server and all 19 saved lab lines now use V3, with the same reference and disabled Turbo pilot adapter. The V3 checkpoint is pinned to Hugging Face revision `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`; the installed MLX 1.3.1 loader's legacy V2 filename is bridged locally without changing the actual V3 weights.

Five controlled samples (English, French, Hindi and mixed English/French) had zero normalized word error in Whisper checks. Saved-line checks recognized 17 lines exactly; two recognized “Ayyy” as “Hey.” These are transcription checks, not a naturalness score. Comparing a current-episode reference did not consistently improve the voice similarity proxy, so the existing reference was retained.

The English live test produced first browser-arriving PCM at 1.20 seconds, versus the service's 0.90 seconds; its four audio chunks had no predicted buffer underruns with the existing 160 ms scheduling buffer. This is one local observation, not a latency guarantee. Mixed-script speech is assembled using separate language settings and takes longer. Tokenizer dictionaries are warmed at startup. Native-speaker pronunciation review is still needed, especially for isolated Japanese vocabulary and Latin-language code switching.

Generated dialogue measured roughly 6 dB below the source in the English comparison; profile gain is now +6 dB, preserving the existing peak safety knee. Dubs trim silence and use pitch-preserving FFmpeg tempo adjustment (capped at 1.8×), instead of changing Web Audio playback rate. Handback is constrained by the next spoken cue so another character's opening words are not muted. Language changes stop the previous dub, and greetings cannot overlap a dub or teaching turn. Busy live requests wait instead of immediately falling back to an unrelated browser voice; actual speech failure retains readable captions.

`evaluation/quality/v3/transition-preview.mp4` demonstrates the French introduction mixed with the source's no-voice bed and the original next character. It is an offline illustration of the handback settings, not a browser recording. The browser check could not connect through the embedded browser; direct local HTTP playback endpoints returned success. Build, lint, types, 141 web tests and 10 voice tests passed. The pitch-preservation test measures a shortened 440 Hz signal, rather than asserting filter parameters.

## Earlier Turbo and pilot-adapter comparison

The initial reference was prepared from a 16 kHz transcription WAV. The source episode contains 48 kHz audio. A replacement reference was extracted from that source before vocal separation, then resampled once to the model's 24 kHz rate.

Controlled samples compared the old reference/full adapter; the new reference with adapter strengths 1.0, 0.35, 0.15, 0.1 and 0; and the original Chatterbox engine. Samples used the same two texts and fixed generation seeds. Artifacts and ASR/speaker checks are in the ignored `evaluation/quality/` directory.

On the new sentence “A seatbelt keeps us safe! Great job!”, the old setup produced an estimated voiced median pitch around 572 Hz. The new reference without the adapter produced approximately 378 Hz, with all normalized transcript words present. A speaker-embedding proxy remained similar (approximately 0.94). These are diagnostic measurements from two sentences, not human naturalness ratings or proof of an exact voice match. The original engine also produced inconsistent pitch between the two phrases.

The current default therefore retains the pilot adapter as an option but sets its strength to zero. It uses the cleaner reference, temperature 0.7, continuous low/high-pass filtering and brief utterance endpoint fades. Offline audio is encoded at 160 kbps AAC; live speech stays PCM. A small browser playback buffer reduces late-chunk gaps. The voice is never automatically pitch-shifted to hit a target frequency.

Nineteen current lab lines were regenerated and checked with Whisper. Normalized words matched on 16; the other three differ only in “Hmm/Mmm” and “Ayyy/Hey”. These checks establish recognizable text, not naturalness. Human listening is still necessary to judge whether the voice is sufficiently close. Pre/postprocessing cannot recover an actor's exact delivery from a different model.

The previous profile, reference and rendered lines were preserved locally for comparison and rollback. The pretrained engine's watermark generation remains enabled.
