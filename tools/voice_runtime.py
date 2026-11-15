"""Shared local voice profile and Chatterbox loading for batch and live speech."""
import json
from pathlib import Path
import tempfile
import re

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / 'voices/dora/profile.json'


def load_multilingual(vocoder='mlx'):
    from huggingface_hub import snapshot_download, hf_hub_download
    from chatterbox.mtl_tts_mlx import ChatterboxMultilingualTTSMLX
    checkpoint = Path(snapshot_download('ResembleAI/chatterbox', revision='5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18', allow_patterns=[
        've.pt', 's3gen.pt', 't3_mtl23ls_v3.safetensors',
        'grapheme_mtl_merged_expanded_v1.json', 'Cangjie5_TC.json',
    ]))
    meanflow = hf_hub_download('ResembleAI/chatterbox-turbo', 's3gen_meanflow.safetensors',
        revision='749d1c1a46eb10492095d68fbcf55691ccf137cd') if vocoder == 'meanflow' else None
    # MLX 1.3.1's local loader hardcodes the V2 filename; V3 uses the same architecture.
    with tempfile.TemporaryDirectory(prefix='dora-v3-') as directory:
        folder = Path(directory)
        for name in ['ve.pt', 's3gen.pt', 'grapheme_mtl_merged_expanded_v1.json', 'Cangjie5_TC.json']:
            (folder / name).symlink_to(checkpoint / name)
        (folder / 't3_mtl23ls_v2.safetensors').symlink_to(checkpoint / 't3_mtl23ls_v3.safetensors')
        return ChatterboxMultilingualTTSMLX.from_local(folder, use_default_speaker=False,
            device='mps', vocoder=vocoder, meanflow_path=meanflow, t3_dtype='float16')


def read_profile(path=PROFILE):
    path = Path(path).resolve()
    data = json.loads(path.read_text())
    reference = (path.parent / data['reference']).resolve()
    if not reference.is_file():
        raise FileNotFoundError(f'Voice reference missing: {reference}')
    return data, reference


def load_voice(profile=PROFILE, engine='turbo', exaggeration=0.7, use_adapter=True, reference_override=None, adapter_strength=None, vocoder='mlx'):
    data, reference = read_profile(profile)
    data["fine_tuned"] = False
    strength = data.get('adapter_strength', 1.0) if adapter_strength is None else adapter_strength
    if not isinstance(strength, (int, float)) or not 0 <= strength <= 1:
        raise ValueError('Adapter strength must be between zero and one.')
    if reference_override is not None:
        reference = Path(reference_override).resolve(strict=True)
    if engine == 'multilingual':
        model = load_multilingual(vocoder)
        model.prepare_conditionals(str(reference), exaggeration=.3)
    elif engine == 'original':
        from chatterbox.tts_mlx import ChatterboxTTSMLX
        model = ChatterboxTTSMLX.from_pretrained(device='mps')
        model.prepare_conditionals(str(reference), exaggeration=exaggeration)
    else:
        from chatterbox.tts_turbo_mlx import ChatterboxTurboMLX
        model = ChatterboxTurboMLX.from_pretrained(nano=engine == 'nano')
        weights = data.get('lora_adapter')
        if use_adapter and engine == 'turbo' and weights and strength > 0:
            checkpoint = (Path(profile).resolve().parent / weights).resolve(strict=True)
            import mlx.core as mx
            arrays = mx.load(str(checkpoint))
            modules = dict(model.t3.named_modules())
            replacements = []
            for key, left in arrays.items():
                if not key.endswith('.lora_a'):
                    continue
                name = key.removesuffix('.lora_a')
                right = arrays[name + '.lora_b']
                layer = modules[name]
                weight = layer.weight.astype(mx.float32) + strength * (left @ right).T
                replacements.append((name + '.weight', weight.astype(layer.weight.dtype)))
            if not replacements:
                raise ValueError('The checkpoint contains no LoRA weights.')
            model.t3.load_weights(replacements, strict=False)
            model.t3.finalize("float16")
            data["fine_tuned"] = True
        model.prepare_conditionals(reference)
    return model, data


def generation_options(profile, engine, language='en'):
    temperature = profile.get('temperature', .7)
    if not isinstance(temperature, (int, float)) or not .1 <= temperature <= 1.5:
        raise ValueError('Voice temperature must be between 0.1 and 1.5.')
    if engine == 'original':
        return {'temperature': temperature, 'exaggeration': .3, 'cfg_weight': .6}
    if engine == 'multilingual':
        return {'language_id': language, 'temperature': temperature, 'exaggeration': .3,
                'cfg_weight': .5, 'seed': 42, 'watermark': True}
    return {'temperature': temperature, 'seed': 42}


def parse_speech_request(body):
    data = json.loads(body)
    if not isinstance(data, dict) or not isinstance(data.get('text'), str):
        raise ValueError('Provide a text string.')
    text = data['text'].strip()
    if not text or len(text) > 600:
        raise ValueError('Text must contain 1–600 characters.')
    return text


def parse_voice_request(body):
    text = parse_speech_request(body)
    data = json.loads(body)
    language = data.get('language', 'en')
    if language not in ('en', 'es', 'fr', 'de', 'zh', 'hi', 'ja'):
        raise ValueError('Unsupported speech language.')
    duration = data.get('durationSeconds')
    if duration is not None and (type(duration) not in (int, float) or not 0 < duration <= 60):
        raise ValueError('Dub duration must be between zero and 60 seconds.')
    learning_language = data.get('learningLanguage')
    if learning_language is not None and learning_language not in ('en', 'es', 'fr', 'de', 'zh', 'hi', 'ja'):
        raise ValueError('Unsupported learning language.')
    return text, language, duration, learning_language


def speech_parts(text, language='en', learning_language=None):
    """The multilingual tokenizer needs the right language for non-Latin scripts."""
    if language != 'en':
        return [(language, text)]
    pattern = r'[\u0900-\u097f]+(?:\s+[\u0900-\u097f]+)*|[\u3040-\u30ff\u3400-\u9fff々ー]+'
    parts = []
    start = 0
    for match in re.finditer(pattern, text):
        before = text[start:match.start()].strip()
        if before and any(c.isalnum() for c in before):
            parts.append(('en', before))
        word = match.group()
        code = 'hi' if '\u0900' <= word[0] <= '\u097f' else (
            'ja' if learning_language == 'ja' or re.search(r'[\u3040-\u30ff]', word) else 'zh')
        parts.append((code, word))
        start = match.end()
    tail = text[start:].strip()
    if tail and any(c.isalnum() for c in tail):
        parts.append(('en', tail))
    return parts or [('en', text)]
