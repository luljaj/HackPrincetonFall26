import unittest
import numpy as np
from voice_audio import VoicePostProcessor, fit_dub, join_speech

class VoiceAudioTest(unittest.TestCase):
    def test_language_spans_drop_padding_and_crossfade(self):
        sr=24000
        padded=np.concatenate([np.zeros(sr),np.ones(sr)*.1,np.zeros(sr)])
        joined=join_speech([padded,padded],sr)
        self.assertLess(len(joined)/sr,2.11)
        self.assertGreater(len(joined)/sr,2)
        self.assertLessEqual(float(np.max(np.abs(joined))),.100001)
    def test_dub_shortens_without_changing_pitch(self):
        sr=24000;t=np.arange(sr*2)/sr
        audio=.3*np.sin(2*np.pi*440*t)
        fitted=fit_dub(audio,sr,1.6)
        self.assertAlmostEqual(len(fitted)/sr,1.6,delta=.06)
        frequencies=np.fft.rfftfreq(len(fitted),1/sr)
        pitch=frequencies[np.argmax(np.abs(np.fft.rfft(fitted)))]
        self.assertAlmostEqual(pitch,440,delta=2)
        self.assertEqual(fitted[0],0)
        self.assertEqual(fitted[-1],0)

    def test_streamed_processing_matches_whole_audio(self):
        sr=24000;t=np.arange(sr)/sr
        audio=(.3*np.sin(2*np.pi*440*t)+.04*np.sin(2*np.pi*10000*t)).astype(np.float32)
        whole=VoicePostProcessor(sr);expected=np.concatenate([whole.process(audio),whole.finish()])
        streamed=VoicePostProcessor(sr);parts=[streamed.process(audio[i:i+137]) for i in range(0,len(audio),137)]
        actual=np.concatenate(parts+[streamed.finish()])
        np.testing.assert_allclose(actual,expected,atol=1e-7)
        self.assertEqual(len(actual),len(audio))
        self.assertEqual(actual[0],0)
        self.assertEqual(actual[-1],0)

    def test_suppresses_high_frequency_noise_without_losing_speech_band(self):
        sr=24000;t=np.arange(sr)/sr
        audio=.3*np.sin(2*np.pi*440*t)+.1*np.sin(2*np.pi*10000*t)
        processor=VoicePostProcessor(sr);filtered=np.concatenate([processor.process(audio),processor.finish()])
        def amplitude(samples,hz):return abs(np.dot(samples,np.exp(-2j*np.pi*hz*t)))*2/len(samples)
        self.assertGreater(amplitude(filtered,440),.28)
        self.assertLess(amplitude(filtered,10000),.006)

    def test_rejects_invalid_audio_and_frequency(self):
        with self.assertRaises(ValueError):VoicePostProcessor(16000,lowpass_hz=9000)
        with self.assertRaises(ValueError):VoicePostProcessor(24000).process([np.nan])

if __name__=='__main__':unittest.main()
