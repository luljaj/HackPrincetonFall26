"""Pure pronunciation scoring: kid-lenient phoneme alignment and the good/close/retry verdict.

Two signals, measured on 198 synthetic clips (see ux.md):
- Whisper's log-likelihood of the target word decides the verdict (AUC 0.97 to 0.98).
- A phoneme recogniser's output, aligned to the target phonemes, names the one sound to coach.
"""
import json
import re
import unicodedata
from pathlib import Path

# Sounds treated as the same for a 3-6 year old learner: allophones, regional variants, and any r
# (native Spanish kids master the trill around age 6-7).
# ponytail: one table tuned for Spanish and English; add per-language tables as languages are added.
FREE = [set('rɾɹʁʀ'), set('bβv'), set('dð'), set('gɣɡ'), set('sθz'), set('xhχ'), set('ʝjʎɟ'), set('iɪ'), set('uʊ'), set('aɑɐəæʌ'), set('ɛe'), set('ɔo'), set('nŋ')]  # n→ŋ before k/g is natural blending
HALF = [set('rɾɹlw'), set('mnŋɲ'), set('pb'), set('td'), set('kgɡ'), set('ʧʃs'), set('fθ'), set('ie'), set('ou')]  # vowel slips are coached, cheaply

# The shared policy raises both bands 1.5 log-prob above the earlier synthetic baseline,
# retaining language-specific offsets. These are guesses until tested with real children.
POLICY = json.loads((Path(__file__).resolve().parent.parent / 'apps/web/app/lab/learning-policy.json').read_text())['pronunciation']
# Clip normalisation the cutoffs above were calibrated with. Change any of these → recalibrate the cutoffs.
SAMPLE_RATE = 16000
FRAME = 320  # 20 ms frames for the speech trim
TRIM_PAD_FRAMES = 8  # keep 160 ms either side of the detected speech
LEAD_PAD = 3200  # then 0.2 s of quiet on both sides: Whisper scores better with a lead-in
WINDOW_S = 4  # Whisper encoder window for scoring (30 s normally): as accurate and 4.5x faster on the test set
SILENT_PEAK = 0.02  # audio peak below this, or no phonemes recognised at all, is treated as no answer


def norm(ipa: str) -> list[str]:
    """IPA string (spaced or not) → list of base phone symbols; affricates kept as one symbol."""
    s = unicodedata.normalize('NFD', ipa).replace('t͡ʃ', 'ʧ').replace('tʃ', 'ʧ').replace('d͡ʒ', 'ʤ').replace('dʒ', 'ʤ')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn' and c not in 'ˈˌːˑ.▁|ʰ')
    return [c for c in s if not c.isspace()]


def cost(a: str, b: str) -> float:
    if a == b or any(a in g and b in g for g in FREE): return 0.0
    if any(a in g and b in g for g in HALF): return 0.5
    return 1.0


def align(heard: list[str], target: list[str]) -> tuple[float, list[tuple[str, str]]]:
    """Weighted edit distance plus the costly differences as (expected, heard); '' marks a missing sound."""
    n, m = len(heard), len(target)
    d = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): d[i][0] = float(i)
    for j in range(1, m + 1): d[0][j] = float(j)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost(heard[i - 1], target[j - 1]))
    diffs, i, j = [], n, m
    while i or j:
        if i and j and d[i][j] == d[i - 1][j - 1] + cost(heard[i - 1], target[j - 1]):
            if cost(heard[i - 1], target[j - 1]): diffs.append((target[j - 1], heard[i - 1]))
            i, j = i - 1, j - 1
        elif j and d[i][j] == d[i][j - 1] + 1:
            diffs.append((target[j - 1], '')); j -= 1
        else:
            i -= 1  # an extra sound: not worth coaching
    return d[n][m], diffs[::-1]


def speech_bounds(frame_rms: list[float], pad: int = TRIM_PAD_FRAMES) -> tuple[int, int]:
    """First and last frame (exclusive end) holding speech, padded. Lead-in silence alone cost about
    2.5 log-prob on the test clips (close → retry), and mic recordings always have some."""
    if not frame_rms: return 0, 0
    # Relative to the noise floor (10th percentile), not the loudest frame: a door slam must not trim away a quiet answer.
    threshold = max(0.01, 3 * sorted(frame_rms)[len(frame_rms) // 10])
    loud = [i for i, r in enumerate(frame_rms) if r > threshold]
    if not loud: return 0, len(frame_rms)
    return max(0, loud[0] - pad), min(len(frame_rms), loud[-1] + 1 + pad)


def is_silent(peak: float, heard_ipa: str) -> bool:
    """No answer: too quiet, or only noise (the phoneme model hears no speech sounds)."""
    return peak < SILENT_PEAK or not norm(heard_ipa)


def verdict(target_lp: float, peak: float, heard_ipa: str, language: str = 'es') -> str:
    if is_silent(peak, heard_ipa): return 'silent'
    bands = POLICY.get(language, POLICY['default'])
    close, good = bands['close'], bands['good']
    return 'good' if target_lp > good else 'close' if target_lp > close else 'retry'


def score(target_ipa: str, heard_ipa: str, target_lp: float, peak: float, language: str = 'es') -> dict:
    target, heard = norm(target_ipa), norm(heard_ipa)
    dist, diffs = align(heard, target)
    v = verdict(target_lp, peak, heard_ipa, language)
    # Coach the biggest slip (a whole wrong or missing sound before a near-miss); ties keep word order.
    worst = max(diffs, key=lambda d: cost(d[0], d[1]) if d[1] else 1.0, default=None)
    coach = None if v == 'silent' or worst is None else {'expected': worst[0], 'heard': worst[1]}
    return {'verdict': v, 'heard': ' '.join(heard), 'target': ' '.join(target), 'distance': round(dist / max(len(target), 1), 3),
            'targetLogprob': round(target_lp, 2), 'coach': coach}


LANGUAGE = re.compile(r'^[a-z]{2,3}$')


def parse_request(body: bytes | str) -> dict:
    data = json.loads(body)
    if not isinstance(data, dict): raise ValueError('Provide a JSON object.')
    word, language, ipa, audio = (data.get(k) for k in ('word', 'language', 'ipa', 'audio'))
    if not isinstance(word, str) or not 0 < len(word.strip()) <= 40: raise ValueError('word must be 1-40 characters.')
    if not isinstance(language, str) or not LANGUAGE.match(language): raise ValueError('language must be a 2-3 letter code.')
    if not isinstance(ipa, str) or not 0 < len(norm(ipa)) <= 40: raise ValueError('ipa must contain 1-40 phones.')
    if not isinstance(audio, str) or not 0 < len(audio) <= 8_200_000: raise ValueError('audio must be base64, up to about 6 MB.')
    return {'word': word.strip(), 'language': language, 'ipa': ipa, 'audio': audio}


def parse_transcribe_request(body: bytes | str) -> dict:
    data = json.loads(body)
    if not isinstance(data, dict): raise ValueError('Provide a JSON object.')
    audio, hint, languages = data.get('audio'), data.get('hint', ''), data.get('languages', ['en'])
    if not isinstance(audio, str) or not 0 < len(audio) <= 8_200_000: raise ValueError('audio must be base64, up to about 6 MB.')
    if not isinstance(hint, str) or len(hint) > 300: raise ValueError('hint must be up to 300 characters.')
    if not isinstance(languages, list) or not 0 < len(languages) <= 4 or not all(isinstance(c, str) and LANGUAGE.match(c) for c in languages):
        raise ValueError('languages must be 1-4 language codes.')
    return {'audio': audio, 'hint': hint.strip(), 'languages': list(dict.fromkeys(languages))}
