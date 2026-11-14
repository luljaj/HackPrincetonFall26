import unittest
from voice_runtime import parse_speech_request

class SpeechRequestTest(unittest.TestCase):
    def test_trims_valid_text(self):
        self.assertEqual(parse_speech_request(b'{"text":"  Hola!  "}'), 'Hola!')

    def test_rejects_invalid_and_oversize_text(self):
        for body in ['null', '[]', '{}', '{"text":42}', '{"text":" "}', '{"text":'+ '"' + 'x'*601 + '"}', 'broken']:
            with self.subTest(body=body[:40]), self.assertRaises(ValueError):
                parse_speech_request(body)

if __name__ == '__main__':
    unittest.main()
