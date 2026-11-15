"""Write one clear question for every pause: python3 tools/build-lessons.py <transcript.json> [--only ep3-01 ...]

Spot detection finds where the show pauses, but many of those lines aren't questions to the kid
("I know what I want to be.") or are said between characters. For each spot, Luna reads the transcript
around it (including the show's next line, which is usually the answer) and writes what Dora should ask,
the expected answer, and answers clear enough to celebrate instantly. Output: apps/web/app/lab/lessons.json.
Needs OPENAI_API_KEY (read from apps/web/.env.local if not set). Stdlib only.
"""
import argparse, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'apps/web/app/lab'
SKILLS = ['words', 'spanish', 'counting', 'shapes', 'colors', 'objects', 'places', 'feelings', 'imagination', 'story']

SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'required': ['keep', 'viewer_prompt', 'value', 'visual', 'question', 'type', 'answer', 'accept', 'skill', 'say_word', 'say_language', 'say_ipa'],
    'properties': {
        'keep': {'type': 'boolean'},
        'viewer_prompt': {'type': 'boolean'},
        'value': {'type': 'integer', 'enum': [1, 2, 3]},
        'visual': {'type': 'boolean'},
        'question': {'type': 'string'},
        'type': {'type': 'string', 'enum': ['answer', 'say', 'open', 'choice', 'count']},
        'answer': {'type': 'string'},
        'accept': {'type': 'array', 'items': {'type': 'string'}},
        'skill': {'type': 'string', 'enum': SKILLS},
        'say_word': {'type': ['string', 'null']},
        'say_language': {'type': ['string', 'null']},
        'say_ipa': {'type': ['string', 'null']},
    },
}

INSTRUCTIONS = """You turn a pause in a Dora the Explorer episode into one clear question Dora asks a 3-6 year old viewer.
You get what the child has ALREADY seen and heard (before_pause) and what the show says next (after_pause).
The child knows only before_pause and the picture on screen. They have NOT heard after_pause.
- question: what Dora says, warm and simple, under 16 words, clearly addressed to the child, ending with "?" or (for "say" prompts) "!". Dora is the speaker: never address Dora by name. Never give away the answer. It must be one of:
  (a) the show's own question or prompt to the viewer at this moment (then after_pause may reveal the answer);
  (b) a question fully answerable from before_pause (something already said or shown);
  (c) a guess or opinion ("What do you think...?", "What would you...?"), with type "open".
  NEVER ask a factual question whose answer only appears in after_pause: the child cannot know it yet.
- viewer_prompt: true only if the show itself is asking or prompting the viewer right here (case a).
- value: 3 = the show asks the viewer, or a great learning moment; 2 = a fair question about what just happened; 1 = pausing here would interrupt a conversation for little gain.
- keep: false if no sensible question fits (credits, music, mid-sentence, pure noise). Otherwise true.
- visual: true if the child must look at the current picture to answer (finding or pointing at something, shapes, "do you see...?", choosing a place on the map).
- type: "say" when the viewer is asked to say a word; "count" for counting; "choice" when the child picks among things on screen; "open" for guesses, opinions or imagination (any sensible answer is right); otherwise "answer".
- answer: the expected answer in 1-4 words (for case a, what after_pause reveals; for case b, what before_pause established), or "any sensible answer" for open questions.
- accept: 1-5 short phrases that clearly mean the right answer (include the Spanish word when the show uses one). Empty for open questions.
- skill: the main thing practised.
- say_word, say_language (2-letter code), say_ipa (broad IPA, spaced by phone; Latin American Spanish for Spanish words): only for type "say", otherwise null."""

MIN_GAP_S = 35  # pauses closer together than this make the show feel chopped up
RUN_GAP_S = 12  # ...except the show's own run of prompts on one skill (three shape questions in a row)
MAX_PAUSES = 18  # a 24-minute episode plus ~20 s per pause finishes the whole story in about 30 minutes
# The demo must show every skill: at least this many pauses of each kind, when the episode has them.
QUOTA = {'counting': 2, 'shapes': 3, 'language': 3, 'picking': 3, 'memory': 3, 'imagination': 2}


def category(lesson):
    """Which skill a pause shows off."""
    if lesson['type'] == 'count': return 'counting'
    if lesson['skill'] == 'shapes': return 'shapes'
    if lesson['type'] == 'say' or lesson['skill'] == 'spanish': return 'language'
    if lesson['type'] == 'open': return 'imagination'
    if lesson['type'] == 'choice' or lesson['visual']: return 'picking'  # choose or find the right thing on screen
    if not lesson['viewer_prompt']: return 'memory'  # recall something the story already said
    return 'joining in'  # the show's yes/no invitations ("Will you help us?"): fine, but no quota


def repeats(a, b):
    """Two pauses that would feel like the same question twice: same skill and the same answer,
    or two open questions with mostly the same words."""
    if a['category'] != b['category']: return False
    words = lambda c: set(re.findall(r"[a-z']+", c['question'].lower()))
    if a['open'] or b['open']: return len(words(a) & words(b)) / max(len(words(a) | words(b)), 1) >= 0.5
    return a['answer'] == b['answer']


def select(candidates, must=(), cap=MAX_PAUSES):
    """Pick the pauses to ask: `must` ids, then every skill covered, then fill the longest quiet stretches.
    candidates: dicts with id, t, show (the show's own prompt), value, category, question, answer, open."""
    best_first = sorted(candidates, key=lambda c: (not c['show'], -c['value'], c['t']))
    kept = [c for c in best_first if c['id'] in must]
    def fits(c):
        gap = lambda k: RUN_GAP_S if c['show'] and k['show'] and c['category'] == k['category'] else MIN_GAP_S
        return all(abs(c['t'] - k['t']) >= gap(k) and not repeats(c, k) for k in kept)
    for cat, want in QUOTA.items():  # coverage first, best of each skill
        for c in [c for c in best_first if c['category'] == cat]:
            if sum(k['category'] == cat for k in kept) >= want or len(kept) >= cap: break
            if c not in kept and fits(c): kept.append(c)
    while len(kept) < cap:  # then spread: whichever fitting pause is farthest from every chosen one
        rest = [c for c in best_first if c not in kept and fits(c)]
        if not rest: break
        kept.append(max(rest, key=lambda c: min([abs(c['t'] - k['t']) for k in kept] or [1e9])))
    return {c['id'] for c in kept}


def api_key():
    if os.environ.get('OPENAI_API_KEY'): return os.environ['OPENAI_API_KEY'].strip()
    env = (ROOT / 'apps/web/.env.local').read_text()
    m = re.search(r'^OPENAI_API_KEY=(.+)$', env, re.M)
    if not m: sys.exit('Set OPENAI_API_KEY')
    return m.group(1).strip()


def context(segments, spot):
    """(what the child has already heard, what the show says next), split at the pause."""
    line = lambda s: f"[{s['start']:.1f}s] {s['text'].strip()}"
    before = [line(s) for s in segments if spot['pauseAt'] - 45 <= s['start'] < spot['pauseAt'] - 0.05]
    after = [line(s) for s in segments if spot['pauseAt'] - 0.05 <= s['start'] <= spot['resumeAt'] + 10]
    return '\n'.join(before), '\n'.join(after)


def lesson(key, model, segments, spot):
    before, after = context(segments, spot)
    user = json.dumps({'pause_at_seconds': spot['pauseAt'], 'before_pause': before, 'after_pause': after}, ensure_ascii=False)
    body = {'model': model, 'store': False, 'reasoning': {'effort': 'low'}, 'max_output_tokens': 1500,
            'input': [{'role': 'system', 'content': INSTRUCTIONS}, {'role': 'user', 'content': user}],
            'text': {'format': {'type': 'json_schema', 'name': 'lesson', 'strict': True, 'schema': SCHEMA}}}
    req = urllib.request.Request('https://api.openai.com/v1/responses', json.dumps(body).encode(),
                                 {'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
    out = json.load(urllib.request.urlopen(req, timeout=60))
    text = next(c['text'] for o in out['output'] if o['type'] == 'message' for c in o['content'] if c['type'] == 'output_text')
    return validate(json.loads(text))


def validate(d):
    q = d['question'].strip()
    if not 2 <= len(q.split()) <= 20 or q.rstrip('"”’\'')[-1:] not in ('?', '!'): raise ValueError(f'unclear question: {q}')
    if re.search(r'\bDora\s*[?!]$|,\s*Dora\b', q): raise ValueError(f'Dora addressing herself: {q}')
    if len(d['answer'].split()) > 6: raise ValueError(f'answer too long: {d["answer"]}')
    if d['type'] == 'say' and not (d['say_word'] and d['say_language'] and d['say_ipa']): raise ValueError('say lesson without word/ipa')
    d['question'] = q
    d['accept'] = [a.strip() for a in d['accept'] if a.strip()][:5]
    return d


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('transcript', type=Path)
    p.add_argument('--only', nargs='*')
    p.add_argument('--reselect', action='store_true', help='Only redo the choice of pauses from the existing lessons (no API calls)')
    p.add_argument('--model', default=os.environ.get('LUNA_MODEL', 'gpt-6-luna'))
    args = p.parse_args()
    segments = json.loads(args.transcript.read_text())['segments']
    spots = [] if args.reselect else [s for s in json.loads((LAB / 'spots.json').read_text()) if not args.only or s['id'] in args.only]
    out_path = LAB / 'lessons.json'
    lessons = json.loads(out_path.read_text()) if out_path.exists() else {}
    key = api_key()
    def one(spot):
        for attempt in range(2):
            try: return spot['id'], lesson(key, args.model, segments, spot)
            except Exception as exc: err = exc
        return spot['id'], err
    with ThreadPoolExecutor(8) as pool:
        for sid, res in pool.map(one, spots):
            if isinstance(res, Exception): print(f'{sid}: FAILED {res}', file=sys.stderr); continue
            lessons[sid] = res
            print(f"{sid}: {'' if res['keep'] else '(skip) '}{'SHOW ' if res['viewer_prompt'] else '     '}v{res['value']} {res['type']:6} {res['question']}  → {res['answer']}", flush=True)
    # Final choice of pauses: every skill covered, the best ones, spaced out. `asked` = this spot is actually used.
    times = {s['id']: s['pauseAt'] for s in json.loads((LAB / 'spots.json').read_text())}
    for l in lessons.values(): l['category'] = category(l)
    spots_all = json.loads((LAB / 'spots.json').read_text())
    # Spanish words rank first within language (that's the language the show itself teaches).
    worth = lambda l: l['value'] + (1 if l['category'] == 'language' and (l['say_language'] == 'es' or l['skill'] == 'spanish') else 0)
    answers = {s['id']: s.get('answer') for s in spots_all}  # hand-pinned answers win
    chosen = select([{'id': sid, 't': times[sid], 'show': l['viewer_prompt'], 'value': worth(l), 'category': l['category'],
                      'question': l['question'], 'answer': (answers.get(sid) or l['answer']).lower().removeprefix('the ').removeprefix('a '),
                      'open': l['type'] == 'open'}
                     for sid, l in lessons.items() if sid in times and l['keep'] and (l['viewer_prompt'] or l['value'] >= 2)],
                    must={s['id'] for s in spots_all if s.get('custom')})  # hand-written spots are always asked
    for sid, l in lessons.items(): l['asked'] = sid in chosen
    counts = {c: sum(l['asked'] and l['category'] == c for l in lessons.values()) for c in QUOTA}
    print(f'{len(chosen)} of {len(lessons)} pauses are asked: {counts}')
    out_path.write_text(json.dumps(dict(sorted(lessons.items())), indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    c = lambda i, t, show, value, cat, q='q', a=None, open_=False: {'id': i, 't': t, 'show': show, 'value': value, 'category': cat, 'question': q, 'answer': a or i, 'open': open_}
    assert select([c('a', 0, False, 2, 'memory'), c('b', 10, True, 3, 'memory'), c('c', 50, False, 3, 'memory'), c('d', 60, False, 2, 'memory')]) == {'b', 'c'}
    # the show's own run of shape prompts stays together; a cap is respected; hand-written spots are always in
    run = [c('s1', 100, True, 3, 'shapes'), c('s2', 114, True, 3, 'shapes'), c('s3', 128, True, 3, 'shapes'), c('m', 120, True, 3, 'memory')]
    assert select(run) == {'s1', 's2', 's3'} and len(select(run, cap=2)) == 2 and 'm' in select(run, must={'m'})
    # the same question twice is dropped: same answer, or two open questions with the same words
    assert select([c('p1', 0, False, 2, 'memory', a='pyramid'), c('p2', 100, False, 2, 'memory', a='pyramid')]) == {'p1'}
    assert select([c('o1', 0, True, 3, 'imagination', 'What do you want to be when you grow up?', open_=True),
                   c('o2', 300, True, 3, 'imagination', 'When you grow up, what will you be?', open_=True)]) == {'o1'}
    assert validate({'question': 'Say, “Arriba!”', 'answer': 'arriba', 'type': 'say', 'say_word': 'arriba', 'say_language': 'es', 'say_ipa': 'a r i β a', 'accept': []})['question'].endswith('”')
    assert validate({'question': 'What do you want to be?', 'answer': 'any sensible answer', 'type': 'open', 'say_word': None, 'say_language': None, 'say_ipa': None, 'accept': [' ']})['accept'] == []
    main()
