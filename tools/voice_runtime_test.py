import unittest
from voice_runtime import parse_speech_request, parse_voice_request, generation_options, speech_parts

class SpeechRequestTest(unittest.TestCase):
    def test_language_and_dub_duration(self):
        self.assertEqual(parse_voice_request('{"text":"Bonjour!","language":"fr","durationSeconds":2}'), ('Bonjour!', 'fr', 2, None))
        self.assertEqual(parse_voice_request('{"text":"Hello!"}'), ('Hello!', 'en', None, None))
        for options in ['"language":"unknown"', '"language":[]', '"durationSeconds":true', '"durationSeconds":0', '"durationSeconds":NaN']:
            with self.subTest(options=options), self.assertRaises(ValueError):
                parse_voice_request('{"text":"Hello!",'+options+'}')

    def test_multilingual_uses_real_language_and_watermark(self):
        options = generation_options({}, 'multilingual', 'hi')
        self.assertEqual(options['language_id'], 'hi')
        self.assertTrue(options['watermark'])

    def test_native_words_get_their_own_phonetics(self):
        self.assertEqual(speech_parts('In Hindi, map is नक्शा. Can you say नक्शा?'),
            [('en','In Hindi, map is'),('hi','नक्शा'),('en','. Can you say'),('hi','नक्शा')])
        self.assertEqual(speech_parts('Can you say 地図?', learning_language='ja'), [('en','Can you say'),('ja','地図')])
        self.assertEqual(speech_parts('你好! Let us learn!'), [('zh','你好'),('en','! Let us learn!')])
        self.assertEqual(speech_parts('Bonjour!', 'fr'), [('fr','Bonjour!')])

    def test_trims_valid_text(self):
        self.assertEqual(parse_speech_request(b'{"text":"  Hola!  "}'), 'Hola!')

    def test_rejects_invalid_and_oversize_text(self):
        for body in ['null', '[]', '{}', '{"text":42}', '{"text":" "}', '{"text":'+ '"' + 'x'*601 + '"}', 'broken']:
            with self.subTest(body=body[:40]), self.assertRaises(ValueError):
                parse_speech_request(body)

if __name__ == '__main__':
    unittest.main()
