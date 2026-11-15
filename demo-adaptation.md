# Live lesson demo

Open the TV at http://localhost:3010 and the parent view at http://localhost:3010/parent in two windows.

1. In Settings, enable Demo Mode. This returns the category focus to Usual so the Numbers change is visible. Select English on the TV for the starting point.
2. Start the cartoon. In the parent companion, send **Make Sam learn more about addition**. The Numbers dial moves to More and a prepared addition question is inserted at the current playhead. If Dora is already handling an answer, it waits until that exchange finishes.
3. Answer the two-plus-one question incorrectly, then try again after Dora's help. The inserted pause resumes the episode at the same point. Numbers set to More also adds a short addition challenge after the episode's number pauses.
4. Send **Switch Sam to Spanish**. The real learning plan changes; the TV selects Spanish. On a supported answer, Dora then models the word in Spanish and asks the child to say it. The three prepared additions support all six practice languages.
5. After a pause has saved, send **Reset the current skill**. The receipt names the resolved skill. Open Mastery to see its current level reset to Not yet. The viewing and its answers remain available as historical evidence. **Reset Numbers** resets that category instead.

Demo Mode bypasses the chat model only for the explicit rehearsed addition, language, and reset commands. Those commands still save through the real services. Ambiguous or mixed requests use the normal chat model. If a service cannot save, the companion reports that the action failed.

Only Numbers currently inserts extra authored challenges; other category weights are saved preferences. Repeating “more addition” while Numbers is already More keeps that setting; return it to Usual before repeating the insertion demo.

Pronunciation and recall knobs live in `apps/web/app/lab/learning-policy.json`. The raised pronunciation cutoffs are starting guesses checked with synthetic and boundary tests, not calibrated on children's recordings. Close pronunciation prompts one modeled retry; silence moves on kindly. Recall questions require the actual name or requested answer rather than a vague description.
