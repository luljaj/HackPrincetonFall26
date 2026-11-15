// Instant path: if the transcript clearly contains an accepted answer, Dora can celebrate right away
// with her pre-made line instead of waiting about 1.6 s for Luna. Anything less clear goes to Luna.

import policy from "./learning-policy.json" with { type: "json" };

const squash = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length]!;
}

/** True when an accepted answer appears in the transcript, allowing about one slip per four letters
 * (Whisper writes "Seedbelt" for "seatbelt"). Answers shorter than 4 letters must match exactly. */
// "not a seatbelt" contains the answer but isn't one: any negation goes to Luna instead.
const NEGATION = /\b(no|not|don'?t|isn'?t|never|nope)\b/i;

export function clearlyCorrect(transcript: string, accepted: readonly string[], strictness: "gentle" | "recall" = "gentle"): boolean {
  const heard = squash(transcript);
  if (!heard || NEGATION.test(transcript)) return false;
  if (strictness === "recall") {
    const filler = /\b(um|uh|the|a|an|it is|it's|i think|next is|we go to)\b/gi;
    const named = squash(transcript.replace(filler, " "));
    return accepted.some(answer => {
      // Strip the same words from the stored answer: "The map" must compare as "map", not "themap".
      const want = squash(answer.replace(filler, " "));
      if (!want) return false;
      const allowed = Math.floor(want.length / policy.recall.editDivisor);
      return editDistance(named, want) <= allowed || editDistance(named.replace(/s$/, ""), want) <= allowed; // "maps"
    });
  }
  return accepted.some((answer) => {
    const want = squash(answer);
    if (!want) return false;
    if (heard.includes(want)) return true;
    if (want.length < 4) return false;
    const slack = Math.floor(want.length / policy.answers.editDivisor);
    for (let len = want.length - slack; len <= want.length + slack; len++)
      for (let i = 0; i + len <= heard.length; i++)
        if (editDistance(heard.slice(i, i + len), want) <= slack) return true;
    return false;
  });
}
