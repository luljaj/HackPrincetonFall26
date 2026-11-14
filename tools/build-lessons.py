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
    'required': ['keep', 'visual', 'question', 'type', 'answer', 'accept', 'skill', 'say_word', 'say_language', 'say_ipa'],
    'properties': {
        'keep': {'type': 'boolean'},
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
You get the transcript around the pause; the show's lines right after the pause usually reveal the answer.
Every pause is a learning moment, even lines the characters say to each other: ask the child about what they just saw or heard.
Dora is the one speaking: never address Dora by name. Keep the expected answer short (1-4 words) and only use what the transcript supports.
The answer must be what the show reveals in the lines right after the pause (the next place visited, the thing named, the word said). If those lines don't reveal it, make the question open.
- keep: false only if no sensible question fits (credits, music, pure noise). Otherwise true.
- visual: true if the child must look at the current picture to answer (finding or pointing at something, shapes, "do you see...?", choosing a place on the map); false if they can answer from what they heard or from their own ideas.
- question: what Dora says, warm and simple, under 16 words, clearly addressed to the child, ending with "?" or (for "say" prompts) "!". Never give away the answer.
- type: "say" when the show asks the viewer to say a word; "count" for counting; "choice" when the child picks among things on screen; "open" for opinions or imagination (any sensible answer is right); otherwise "answer".
- answer: the expected answer, or "any sensible answer" for open questions.
- accept: 1-5 short phrases that clearly mean the right answer (include the Spanish word when the show uses one). Empty for open questions.
- skill: the main thing practised.
- say_word, say_language (2-letter code), say_ipa (broad IPA, spaced by phone; Latin American Spanish for Spanish words): only for type "say", otherwise null."""


def api_key():
    if os.environ.get('OPENAI_API_KEY'): return os.environ['OPENAI_API_KEY'].strip()
    env = (ROOT / 'apps/web/.env.local').read_text()
    m = re.search(r'^OPENAI_API_KEY=(.+)$', env, re.M)
    if not m: sys.exit('Set OPENAI_API_KEY')
    return m.group(1).strip()


def context(segments, spot):
    lines = [f"[{s['start']:.1f}s] {s['text'].strip()}" for s in segments if spot['t'] - 30 <= s['start'] <= spot['resumeAt'] + 8]
    return '\n'.join(lines)


def lesson(key, model, segments, spot):
    user = json.dumps({'pause_after_line': spot['text'], 'pause_at_seconds': spot['pauseAt'], 'show_resumes_at_seconds': spot['resumeAt'],
                       'transcript_around_pause': context(segments, spot)}, ensure_ascii=False)
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
    if not 3 <= len(q.split()) <= 20 or q[-1] not in '?!': raise ValueError(f'unclear question: {q}')
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
    p.add_argument('--model', default=os.environ.get('LUNA_MODEL', 'gpt-6-luna'))
    args = p.parse_args()
    segments = json.loads(args.transcript.read_text())['segments']
    spots = [s for s in json.loads((LAB / 'spots.json').read_text()) if not args.only or s['id'] in args.only]
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
            print(f"{sid}: {'' if res['keep'] else '(skip) '}{res['type']:6} {res['question']}  → {res['answer']}", flush=True)
    out_path.write_text(json.dumps(dict(sorted(lessons.items())), indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    assert validate({'question': 'What do you want to be?', 'answer': 'any sensible answer', 'type': 'open', 'say_word': None, 'say_language': None, 'say_ipa': None, 'accept': [' ']})['accept'] == []
    main()
