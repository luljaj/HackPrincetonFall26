"""Re-voice Dora's Spanish show lines in the language the kid is learning: python3 tools/build-dubs.py <transcript.json>

The episode is English with Spanish words baked into the recording ("¿Dónde está? Where is the bridge?").
When a kid learns French, those moments should be French, and for continuity the whole sentence is re-voiced
in Dora's voice rather than one word in a different voice. For each transcript line with Spanish, Luna decides
who is speaking (from the dialogue around it) and rewrites the line per language: English kept, Spanish swapped
for the target language in its native script. Only Dora's lines are dubbed.
Output: apps/web/app/lab/dubs.json. Needs OPENAI_API_KEY (read from apps/web/.env.local). Stdlib only.
"""
import argparse, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/app/lab/dubs.json'
LANGS = {'fr': 'French', 'de': 'German', 'zh': 'Mandarin Chinese (Chinese characters)', 'hi': 'Hindi (Devanagari)', 'ja': 'Japanese (native script)'}
SPANISH = re.compile(r"[¿¡áéíóúñ]|\b(hola|vámonos|vamonos|dónde|donde|está|arriba|abajo|sí|si|gracias|amigos?|muy bien|policía|mochila|mapa|"
                     r"puente|ya llegamos|uno|una|dos|tres|cuatro|cinco|seis|estrellas|ven|rápido|allí|ahí|soy|lo hicimos|"
                     r"quiero|ayudar|ayudarte|ayúdame|fantástico|fantastico|vamos|mira|bueno|perfecto|mami|papi|abuela|señor|"
                     r"por favor|de nada|adiós|adios|buenos días|aquí|allá|pirámide|piramide|excelente|bienvenidos)\b", re.I)
# Hand checks after reading each line in context (Luna's speaker call overruled where the dialogue says otherwise).
SPEAKER_OVERRIDES: dict[str, str] = {
    '46.7': 'Dora',      # "Hola, soy Dora": her own introduction
    '103.8': 'unsure',   # a bare "Hola!" at the door: Dora or Mommy
    '146.3': 'unsure',   # "Ah, sí!"
    '395.9': 'unsure',   # greetings at the firehouse: Dora and Boots both say hello
    '397.2': 'unsure',
    '552.6': 'other',    # Tico's family thanking them for rescuing Benny
    '399.2': 'other',    # "Hola, Boots": someone greeting Boots
    '412.2': 'other',    # Tico speaks only Spanish; Dora translates him right after
    '150.7': 'other',    # Mommy on the phone: "Fantástico! Come to La Pirámide quick! Ven rápido!"
    '151.6': 'other',
    '153.6': 'other',
    '504.6': 'Dora',     # the answered shouts after "Say, Arriba!" / "Say, abajo!": keep the pair consistent
    '539.5': 'Dora',
    '1384.5': 'unsure',  # a bare "Gracias!"
    '1436.6': 'unsure',  # "Gracias! Bye!" in the closing
}
# Whisper's regular mishearings in this episode.
FIXES = {'Zora': 'Dora', 'Bernie': 'Benny'}

SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['speaker', 'has_spanish', 'rewrites'],
    'properties': {
        'speaker': {'type': 'string', 'enum': ['Dora', 'Boots', 'other', 'unsure']},
        'has_spanish': {'type': 'boolean'},
        'rewrites': {'type': 'object', 'additionalProperties': False, 'required': list(LANGS),
                     'properties': {l: {'type': 'string'} for l in LANGS}},
    },
}

INSTRUCTIONS = """You help dub a Dora the Explorer episode for a child learning another language.
You get one transcript line (the target) with the lines around it. Decide who says the target line from the dialogue
(Dora introduces herself and talks to the viewer; Boots is her monkey friend; others include Mommy, Tico, Benny, Swiper).
If the target line contains Spanish, rewrite it for each language: keep every English word exactly, replace only the
Spanish words with the natural equivalent in that language (keep the same meaning, keep it short). Chinese, Hindi and
Japanese must use their native scripts, because the multilingual voice uses real language phonetics.
If the line has no Spanish, set has_spanish false and copy the line unchanged for every language."""


def api_key():
    if os.environ.get('OPENAI_API_KEY'): return os.environ['OPENAI_API_KEY'].strip()
    m = re.search(r'^OPENAI_API_KEY=(.+)$', (ROOT / 'apps/web/.env.local').read_text(), re.M)
    if not m: sys.exit('Set OPENAI_API_KEY')
    return m.group(1).strip()


def ask(key, model, segments, i):
    around = '\n'.join(f"{'>> ' if j == i else '   '}[{segments[j]['start']:.1f}s] {segments[j]['text'].strip()}"
                       for j in range(max(0, i - 6), min(len(segments), i + 5)))
    body = {'model': model, 'store': False, 'reasoning': {'effort': 'low'}, 'max_output_tokens': 1500,
            'input': [{'role': 'system', 'content': INSTRUCTIONS},
                      {'role': 'user', 'content': json.dumps({'target_line': segments[i]['text'].strip(), 'dialogue (>> marks the target)': around}, ensure_ascii=False)}],
            'text': {'format': {'type': 'json_schema', 'name': 'dub', 'strict': True, 'schema': SCHEMA}}}
    req = urllib.request.Request('https://api.openai.com/v1/responses', json.dumps(body).encode(),
                                 {'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
    out = json.load(urllib.request.urlopen(req, timeout=60))
    text = next(c['text'] for o in out['output'] if o['type'] == 'message' for c in o['content'] if c['type'] == 'output_text')
    return json.loads(text)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('transcript', type=Path)
    p.add_argument('--model', default=os.environ.get('LUNA_MODEL', 'gpt-6-luna'))
    args = p.parse_args()
    segments = json.loads(args.transcript.read_text())['segments']
    for seg in segments:
        for wrong, right in FIXES.items(): seg['text'] = seg['text'].replace(wrong, right)
    candidates = [i for i, s in enumerate(segments) if SPANISH.search(s['text'])]
    key = api_key()
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda i: (i, ask(key, args.model, segments, i)), candidates))
    dubs = []
    for i, r in results:
        s = segments[i]
        sid = f"{s['start']:.1f}"
        speaker = SPEAKER_OVERRIDES.get(sid, r['speaker'])
        print(f"{sid:>7}s {speaker:7} {'ES' if r['has_spanish'] else '--'} | {s['text'].strip()}  →  fr: {r['rewrites']['fr']}")
        if r['has_spanish'] and speaker == 'Dora':
            after = next((x for x in segments if x['start'] >= s['end'] - .04), None)
            dubs.append({'start': round(s['start'], 2), 'end': round(s['end'], 2), 'original': s['text'].strip(),
                         **r['rewrites'], **({'nextSpeechAt': round(after['start'], 2)} if after else {})})
    OUT.write_text(json.dumps(dubs, indent=1, ensure_ascii=False) + '\n')
    print(f'{len(dubs)} Dora lines to dub → {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
