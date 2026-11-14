"""Shared local voice profile and Chatterbox loading for batch and live speech."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / 'voices/dora/profile.json'


def read_profile(path=PROFILE):
    path = Path(path).resolve()
    data = json.loads(path.read_text())
    reference = (path.parent / data['reference']).resolve()
    if not reference.is_file():
        raise FileNotFoundError(f'Voice reference missing: {reference}')
    return data, reference


def load_voice(profile=PROFILE, engine='turbo', exaggeration=0.7, use_adapter=True, reference_override=None):
    data, reference = read_profile(profile)
    data["fine_tuned"] = False
    if reference_override is not None:
        reference = Path(reference_override).resolve(strict=True)
    if engine == 'original':
        from chatterbox.tts_mlx import ChatterboxTTSMLX
        model = ChatterboxTTSMLX.from_pretrained(device='mps')
        model.prepare_conditionals(str(reference), exaggeration=exaggeration)
    else:
        from chatterbox.tts_turbo_mlx import ChatterboxTurboMLX
        model = ChatterboxTurboMLX.from_pretrained(nano=engine == 'nano')
        weights = data.get('lora_adapter')
        if use_adapter and engine == 'turbo' and weights:
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
                weight = layer.weight.astype(mx.float32) + (left @ right).T
                replacements.append((name + '.weight', weight.astype(layer.weight.dtype)))
            if not replacements:
                raise ValueError('The checkpoint contains no LoRA weights.')
            model.t3.load_weights(replacements, strict=False)
            model.t3.finalize("float16")
            data["fine_tuned"] = True
        model.prepare_conditionals(reference)
    return model, data


def parse_speech_request(body):
    data = json.loads(body)
    if not isinstance(data, dict) or not isinstance(data.get('text'), str):
        raise ValueError('Provide a text string.')
    text = data['text'].strip()
    if not text or len(text) > 600:
        raise ValueError('Text must contain 1–600 characters.')
    return text
