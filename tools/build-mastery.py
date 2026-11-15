"""Tag every lesson with one mastery skill: python3 tools/build-mastery.py [--only ep3-01 ...]

The curriculum (categories → skills) is fixed below, written for parents. Luna only picks which skill each
lesson practises, from that fixed list (strict JSON schema with an enum, so it can't invent one), plus
whether the lesson is worth tracking at all. Output: apps/web/app/lab/mastery.json. Review it by hand.
Language words aren't tagged here: they come from translations.json (one track per language).
Needs OPENAI_API_KEY (read from apps/web/.env.local if not set). Stdlib only.
"""
import argparse, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'apps/web/app/lab'

# id, parent-facing name, skills (id, what the kid can do)
CATEGORIES = [
    ('numbers', 'Numbers', [('add-small-numbers', 'Adds small numbers'), ('count-to-5', 'Counts up to 5'), ('count-to-10', 'Counts up to 10'), ('how-many', 'Says how many there are')]),
    ('shapes', 'Shapes', [('name-shapes', 'Names shapes'), ('match-shapes', 'Matches a shape to where it fits')]),
    ('remembering', 'Remembering', [('recall-places', 'Remembers the places on the map, in order'),
                                    ('recall-events', 'Remembers what just happened'),
                                    ('recall-objects', 'Remembers a thing from earlier')]),
    ('choosing', 'Choosing', [('pick-place', 'Picks the right path or place'), ('pick-object', 'Picks the right thing'),
                              ('explain-choice', 'Says why')]),
    ('words', 'Words', [('name-things', 'Names things'), ('action-words', 'Uses action words (up, down, across)'),
                        ('describe-things', 'Describes things (colours, sizes, how they look)')]),
    ('stories', 'Stories & imagination', [('what-next', 'Guesses what happens next'), ('feelings', 'Understands how characters feel'),
                                          ('imagine', 'Imagines and describes')]),
    ('joining-in', 'Joining in', [('answer-aloud', 'Answers out loud'), ('chant', 'Says the chant with Dora'),
                                  ('do-action', 'Does the action')]),
    ('show-spanish', "The show's Spanish", [('spanish-words', 'Says the Spanish words Dora teaches')]),
]
# Hand review of Luna's tags (None = not tracked). Applied after tagging, so re-runs keep them.
OVERRIDES = {
    'ep3-07': 'recall-objects',  # "who do we ask for help": the Map
    'ep3-10': 'recall-places',   # "say it with me: firehouse, bridge, pyramid"
    'ep3-35': 'pick-object',     # "do you see stars?"
    'ep3-37': 'recall-events',   # "who did I just see?", same as ep3-30
    'ep3-38': None,              # "will you help us finish the bridge?"
    'ep3-45': 'pick-place',      # "where's the pyramid?"
    'ep3-51': 'pick-place',      # "dig for the keys here?", same as ep3-52/53
    'ep3-54': 'count-to-5',      # two keys
    'ep3-55': 'count-to-10',     # six keys, counted along
    'ep3-63': 'how-many',        # six stars
    'ep3-64': 'spanish-words',   # count the stars in Spanish
}
SKILL_IDS = [s for _, _, skills in CATEGORIES for s, _ in skills]

INSTRUCTIONS = """You build a learning record for a 3-6 year old watching an interactive Dora episode. The show pauses and asks the child a question.
Pick the ONE skill from the list that answering this question best shows the child can do. Prefer the most specific skill.
- If the question is about which place comes next on the map, use recall-places.
- If the child is asked to say a Spanish word the show teaches, use spanish-words.
- track: false only if the question shows no real skill (e.g. "Are you ready?", "Will you help?"). Otherwise true.
Skills:
""" + '\n'.join(f'- {s}: {name} ({cat})' for cat, _, skills in CATEGORIES for s, name in skills)

SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['skill', 'track'],
          'properties': {'skill': {'type': 'string', 'enum': SKILL_IDS}, 'track': {'type': 'boolean'}}}


def api_key():
    if os.environ.get('OPENAI_API_KEY'): return os.environ['OPENAI_API_KEY'].strip()
    m = re.search(r'^OPENAI_API_KEY=(.+)$', (ROOT / 'apps/web/.env.local').read_text(), re.M)
    if not m: sys.exit('Set OPENAI_API_KEY')
    return m.group(1).strip()


def tag(key, model, lesson):
    user = json.dumps({k: lesson.get(k) for k in ('question', 'type', 'answer', 'accept', 'say_word', 'category', 'skill')}, ensure_ascii=False)
    body = {'model': model, 'store': False, 'reasoning': {'effort': 'low'}, 'max_output_tokens': 800,
            'input': [{'role': 'system', 'content': INSTRUCTIONS}, {'role': 'user', 'content': user}],
            'text': {'format': {'type': 'json_schema', 'name': 'mastery', 'strict': True, 'schema': SCHEMA}}}
    req = urllib.request.Request('https://api.openai.com/v1/responses', json.dumps(body).encode(),
                                 {'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
    out = json.load(urllib.request.urlopen(req, timeout=60))
    text = next(c['text'] for o in out['output'] if o['type'] == 'message' for c in o['content'] if c['type'] == 'output_text')
    d = json.loads(text)
    if d['skill'] not in SKILL_IDS: raise ValueError(d['skill'])
    return d['skill'] if d['track'] else None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--only', nargs='*')
    p.add_argument('--model', default=os.environ.get('LUNA_MODEL', 'gpt-6-luna'))
    args = p.parse_args()
    lessons = json.loads((LAB / 'lessons.json').read_text())
    out_path = LAB / 'mastery.json'
    old = json.loads(out_path.read_text())['lessons'] if args.only and out_path.exists() else {}
    todo = [(sid, l) for sid, l in lessons.items() if not args.only or sid in args.only]
    key = api_key()
    def one(item):
        sid, lesson = item
        for _ in range(2):
            try: return sid, tag(key, args.model, lesson)
            except Exception as exc: err = exc
        return sid, err
    tagged = dict(old)
    with ThreadPoolExecutor(8) as pool:
        for sid, res in pool.map(one, todo):
            if isinstance(res, Exception): print(f'{sid}: FAILED {res}', file=sys.stderr); continue
            if res is None: tagged.pop(sid, None)
            else: tagged[sid] = res
            print(f"{sid}: {res or '(not tracked)'}  ← {lessons[sid]['question']}", flush=True)
    for sid, skill in OVERRIDES.items():
        if sid not in lessons or (args.only and sid not in args.only): continue
        if skill: tagged[sid] = skill
        else: tagged.pop(sid, None)
    tagged.update({f'demo-addition-{n}': 'add-small-numbers' for n in range(1, 4)})
    curriculum = {'categories': [{'id': c, 'name': n, 'skills': [{'id': s, 'name': sn} for s, sn in skills]} for c, n, skills in CATEGORIES],
                  'lessons': dict(sorted(tagged.items()))}
    out_path.write_text(json.dumps(curriculum, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    assert len(SKILL_IDS) == len(set(SKILL_IDS)), 'skill ids must be unique'
    assert all(v is None or v in SKILL_IDS for v in OVERRIDES.values()), 'override uses an unknown skill'
    main()
