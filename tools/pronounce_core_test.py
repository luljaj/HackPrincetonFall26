import unittest
from pronounce_core import speech_bounds, align, norm, parse_request, parse_transcribe_request, score, verdict


class PronounceTest(unittest.TestCase):
    def test_norm_strips_marks_and_keeps_affricates(self):
        self.assertEqual(norm('m o t͡ʃ iː l a'), ['m', 'o', 'ʧ', 'i', 'l', 'a'])
        self.assertEqual(norm('ˈaɾiβa'), ['a', 'ɾ', 'i', 'β', 'a'])

    def test_any_r_and_regional_variants_are_free(self):
        for heard in ['a r i β a', 'a ɾ i b a', 'a ɹ i v a']:
            self.assertEqual(align(norm(heard), norm('a r i β a')), (0.0, []))
        self.assertEqual(align(norm('s i n t u ɾ o n'), norm('θ i n t u ɾ o n'))[0], 0.0)  # seseo

    def test_kid_slips_cost_half_and_are_named(self):
        dist, diffs = align(norm('a l i β a'), norm('a r i β a'))
        self.assertEqual((dist, diffs), (0.5, [('r', 'l')]))
        dist, diffs = align(norm('m o s i l a'), norm('m o ʧ i l a'))
        self.assertEqual(diffs, [('ʧ', 's')])

    def test_coaches_the_biggest_slip_not_natural_blending(self):
        out = score('s i n t u ɾ o n', 's i ŋ t u l o n', -7.0, 0.5)  # cintulón
        self.assertEqual(out['coach'], {'expected': 'ɾ', 'heard': 'l'})
        self.assertEqual(score('a β a x o', 'a β a k o', -7.0, 0.5)['coach'], {'expected': 'x', 'heard': 'k'})

    def test_missing_sound_is_named(self):
        self.assertEqual(align(norm('b a x o'), norm('a β a x o'))[1], [('a', '')])

    def test_verdict_bands(self):
        self.assertEqual([verdict(lp, 0.5, 'a') for lp in (-1, -7, -14)], ['good', 'close', 'retry'])
        self.assertEqual(verdict(-1, 0.001, 'a'), 'silent')
        self.assertEqual(verdict(-14, 0.5, ''), 'silent')  # loud noise but no speech sounds: re-prompt, not "try again"

    def test_each_language_has_its_own_cutoff(self):
        self.assertEqual(verdict(-14, 0.5, 'a', 'es'), 'retry')
        self.assertEqual(verdict(-14, 0.5, 'a', 'zh'), 'close')  # Chinese scores lower for the same correct word
        self.assertEqual(verdict(-10, 0.5, 'a', 'zh'), 'close')
        self.assertEqual(verdict(-16, 0.5, 'a', 'xx'), 'retry')  # unmeasured language: default -15

    def test_higher_bar_for_every_supported_language(self):
        old_close = {'en': -12, 'es': -12, 'de': -13.5, 'fr': -13.5, 'hi': -15, 'ja': -15.5, 'zh': -17}
        for language, close in old_close.items():
            with self.subTest(language=language):
                self.assertEqual(verdict(close + 6.5, .5, 'a', language), 'close')
                self.assertEqual(verdict(close + .5, .5, 'a', language), 'retry')

    def test_vowel_slips_are_coached(self):
        self.assertEqual(score('p e s o', 'p i s u', -7.0, 0.5)['coach'], {'expected': 'e', 'heard': 'i'})

    def test_score_reports_one_sound_to_coach(self):
        out = score('a r i β a', 'a l i β a', -6.0, 0.5)
        self.assertEqual((out['verdict'], out['coach']), ('close', {'expected': 'r', 'heard': 'l'}))
        self.assertIsNone(score('a r i β a', 'a ɾ i b a', -1.0, 0.5)['coach'])

    def test_rejects_bad_requests(self):
        good = {'word': 'arriba', 'language': 'es', 'ipa': 'a r i β a', 'audio': 'AAAA'}
        self.assertEqual(parse_request(__import__('json').dumps(good))['word'], 'arriba')
        for bad in [{**good, 'language': 'spanish'}, {**good, 'word': ''}, {**good, 'ipa': ' '}, {**good, 'audio': ''}, []]:
            with self.subTest(bad=str(bad)[:50]), self.assertRaises(ValueError):
                parse_request(__import__('json').dumps(bad))


class SpeechBoundsTest(unittest.TestCase):
    def test_trims_lead_and_tail_silence_with_padding(self):
        frames = [0.001] * 30 + [0.2] * 10 + [0.001] * 30
        self.assertEqual(speech_bounds(frames, pad=8), (22, 48))

    def test_a_loud_bang_does_not_trim_away_a_quiet_answer(self):
        frames = [0.001] * 30 + [0.6] * 3 + [0.001] * 20 + [0.03] * 10 + [0.001] * 30
        self.assertEqual(speech_bounds(frames, pad=0), (30, 63))

    def test_quiet_or_empty_input_is_left_alone(self):
        self.assertEqual(speech_bounds([0.001] * 5), (0, 5))
        self.assertEqual(speech_bounds([]), (0, 0))


class TranscribeRequestTest(unittest.TestCase):
    def test_defaults_and_dedupes(self):
        out = parse_transcribe_request('{"audio": "AAAA", "languages": ["en", "es", "en"]}')
        self.assertEqual((out['hint'], out['languages']), ('', ['en', 'es']))

    def test_rejects_bad_requests(self):
        for body in ['[]', '{"audio": ""}', '{"audio": "A", "hint": 5}', '{"audio": "A", "languages": []}', '{"audio": "A", "languages": ["english"]}']:
            with self.subTest(body=body), self.assertRaises(ValueError):
                parse_transcribe_request(body)


if __name__ == '__main__':
    unittest.main()
