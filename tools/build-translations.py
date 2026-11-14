"""Translate each spot's answer for language practice: python3 tools/build-translations.py [--langs es fr de zh hi ja] [--only ep3-01 ...]

After a spot's question, a kid learning another language hears the answer in that language and says it back.
For every spot with a concrete answer, Luna gives the word a 3-6 year old would say, a romanization for
non-Latin scripts, and broad IPA for the pronunciation scorer. Output: apps/web/app/lab/translations.json.
Needs OPENAI_API_KEY (read from apps/web/.env.local if not set). Stdlib only.
"""
import argparse, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'apps/web/app/lab'
LANGUAGES = {'es': 'Spanish', 'fr': 'French', 'de': 'German', 'zh': 'Mandarin Chinese', 'hi': 'Hindi', 'ja': 'Japanese'}

INSTRUCTIONS = """You help a 3-6 year old learn one word in another language, right after they answered a question in a cartoon.
Given the English answer, give the simplest word or very short phrase (1-3 words) a native-speaking child would use for it in each requested language.
- skip: true if the answer isn't something worth teaching as a word (a whole sentence, "yes", a name like Diego or Swiper). Then leave the languages empty.
- english: the short English word being taught (strip "the", "a").
- For each language: word (native script), romanized (pinyin with tone marks, Hindi/Japanese romanization; same as word for Latin scripts), ipa (broad IPA, phones separated by spaces)."""


def schema(langs):
    entry = {'type': 'object', 'additionalProperties': False, 'required': ['word', 'romanized', 'ipa'],
             'properties': {'word': {'type': 'string'}, 'romanized': {'type': 'string'}, 'ipa': {'type': 'string'}}}
    return {'type': 'object', 'additionalProperties': False, 'required': ['skip', 'english', 'languages'],
            'properties': {'skip': {'type': 'boolean'}, 'english': {'type': 'string'},
                           'languages': {'type': 'object', 'additionalProperties': False, 'required': langs,
                                         'properties': {l: {'anyOf': [entry, {'type': 'null'}]} for l in langs}}}}


def api_key():
    if os.environ.get('OPENAI_API_KEY'): return os.environ['OPENAI_API_KEY'].strip()
    m = re.search(r'^OPENAI_API_KEY=(.+)$', (ROOT / 'apps/web/.env.local').read_text(), re.M)
    if not m: sys.exit('Set OPENAI_API_KEY')
    return m.group(1).strip()


def translate(key, model, langs, answer, question):
    user = json.dumps({'question': question, 'english_answer': answer, 'languages': {l: LANGUAGES[l] for l in langs}}, ensure_ascii=False)
    body = {'model': model, 'store': False, 'reasoning': {'effort': 'low'}, 'max_output_tokens': 1500,
            'input': [{'role': 'system', 'content': INSTRUCTIONS}, {'role': 'user', 'content': user}],
            'text': {'format': {'type': 'json_schema', 'name': 'translation', 'strict': True, 'schema': schema(langs)}}}
    req = urllib.request.Request('https://api.openai.com/v1/responses', json.dumps(body).encode(),
                                 {'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
    out = json.load(urllib.request.urlopen(req, timeout=60))
    text = next(c['text'] for o in out['output'] if o['type'] == 'message' for c in o['content'] if c['type'] == 'output_text')
    return validate(json.loads(text))


NON_LATIN = re.compile(r'[\u0900-\u097f\u3040-\u30ff\u4e00-\u9fff()（）]')  # Devanagari, kana, CJK, brackets


def validate(d):
    if d['skip']: return None
    # A language with a broken romanization is dropped (the kid just won't practise that word in it).
    entries = {l: e for l, e in d['languages'].items()
               if e and e['word'].strip() and e['ipa'].strip() and len(e['word'].split()) <= 3 and not NON_LATIN.search(e['romanized'])}
    return {'english': d['english'].strip(), **entries} if entries else None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--langs', nargs='*', default=list(LANGUAGES))
    p.add_argument('--only', nargs='*')
    p.add_argument('--model', default=os.environ.get('LUNA_MODEL', 'gpt-6-luna'))
    args = p.parse_args()
    if set(args.langs) - LANGUAGES.keys(): p.error(f'languages must be among {list(LANGUAGES)}')
    lessons = json.loads((LAB / 'lessons.json').read_text())
    spots = {s['id']: s for s in json.loads((LAB / 'spots.json').read_text())}
    todo = []
    for sid, lesson in lessons.items():
        if args.only and sid not in args.only: continue
        spot = spots.get(sid, {})
        answer = spot.get('answer') or (None if lesson['type'] == 'open' else lesson['answer'])
        if answer: todo.append((sid, answer, lesson['question'] if not spot.get('custom') else 'What do we put on to stay safe?'))
    out_path = LAB / 'translations.json'
    result = json.loads(out_path.read_text()) if out_path.exists() else {}
    key = api_key()
    def one(item):
        sid, answer, question = item
        for _ in range(2):
            try: return sid, translate(key, args.model, args.langs, answer, question)
            except Exception as exc: err = exc
        return sid, err
    with ThreadPoolExecutor(8) as pool:
        for sid, res in pool.map(one, todo):
            if isinstance(res, Exception): print(f'{sid}: FAILED {res}', file=sys.stderr); continue
            if res is None: result.pop(sid, None); print(f'{sid}: (skip)'); continue
            result[sid] = res
            print(f"{sid}: {res['english']} → " + ', '.join(f"{l} {e['word']} [{e['romanized']}]" for l, e in res.items() if l != 'english'), flush=True)
    out_path.write_text(json.dumps(dict(sorted(result.items())), indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    assert validate({'skip': True, 'english': '', 'languages': {}}) is None
    assert validate({'skip': False, 'english': 'x', 'languages': {'hi': {'word': 'क', 'romanized': 'besbॉल', 'ipa': 'k'}}}) is None
    assert validate({'skip': False, 'english': 'map', 'languages': {'fr': {'word': 'carte', 'romanized': 'carte', 'ipa': 'k a ʁ t'}, 'de': None}}) == \
        {'english': 'map', 'fr': {'word': 'carte', 'romanized': 'carte', 'ipa': 'k a ʁ t'}}
    main()
