import { Platform } from 'react-native';

type VoiceEngine = 'puter-web' | 'web-speech' | 'unavailable';
type PuterSpeechOptions = {
  voice?: string;
  engine: 'neural';
  language: 'en-US';
};
type PuterWindow = Window &
  typeof globalThis & {
    puter?: {
      ai?: {
        txt2speech?: (
          text: string,
          options: PuterSpeechOptions
        ) => Promise<HTMLAudioElement | null>;
      };
    };
  };

const WEB_SPEECH_RATE = 0.92;
const WEB_SPEECH_PITCH = 1;

let puterReady: Promise<void> | null = null;
let activeHtmlAudio: HTMLAudioElement | null = null;

/**
 * Stop any in-flight speech playback for both Expo and web engines.
 */
export async function stopVoice(): Promise<void> {
  const browserWindow = getBrowserWindow();
  browserWindow?.speechSynthesis?.cancel();

  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
    } catch {
      // ignore stop errors
    }
    activeHtmlAudio = null;
  }
}

/**
 * Speak the provided text using the best available engine for the platform.
 * Returns the engine that was ultimately used.
 */
export async function speakWithBestVoice(
  text: string,
  voiceIdentifier?: string
): Promise<VoiceEngine> {
  await stopVoice();

  if (Platform.OS === 'web') {
    const engine = await tryPuterTts(text, voiceIdentifier);
    if (engine === 'puter-web') {
      return engine;
    }
    return tryWebSpeech(text, voiceIdentifier);
  }

  return 'unavailable';
}

/**
 * Return the engine that would be selected for the current platform without
 * actually speaking.
 */
export function getVoiceEngineStatus(): VoiceEngine {
  return Platform.OS === 'web' ? 'puter-web' : 'unavailable';
}

function getBrowserWindow(): PuterWindow | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window as PuterWindow;
}

async function ensurePuter(): Promise<void> {
  const browserWindow = getBrowserWindow();
  if (!browserWindow || Platform.OS !== 'web') {
    throw new Error('Puter only supported on web');
  }
  if (browserWindow.puter?.ai?.txt2speech) {
    return;
  }
  if (!puterReady) {
    puterReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Puter.js'));
      document.head.appendChild(script);
    });
  }
  await puterReady;
}

async function tryPuterTts(text: string, voiceIdentifier?: string): Promise<VoiceEngine | null> {
  try {
    await ensurePuter();
    const puter = getBrowserWindow()?.puter;
    const textToSpeech = puter?.ai?.txt2speech;
    if (!textToSpeech) {
      return null;
    }
    const audio = await textToSpeech(text, {
      voice: voiceIdentifier,
      engine: 'neural',
      language: 'en-US',
    });
    if (audio) {
      activeHtmlAudio = audio;
      await audio.play();
      return 'puter-web';
    }
  } catch (error) {
    console.error('Puter TTS failed, falling back to Web Speech', error);
  }
  return null;
}

function tryWebSpeech(text: string, voiceIdentifier?: string): VoiceEngine {
  const browserWindow = getBrowserWindow();
  const speechSynthesis = browserWindow?.speechSynthesis;
  const Utterance = browserWindow?.SpeechSynthesisUtterance;
  if (!speechSynthesis || !Utterance) {
    return 'unavailable';
  }

  const utterance = new Utterance(text);
  utterance.rate = WEB_SPEECH_RATE;
  utterance.pitch = WEB_SPEECH_PITCH;

  if (voiceIdentifier) {
    const selectedVoice = speechSynthesis
      .getVoices()
      .find((voice) => voice.voiceURI === voiceIdentifier || voice.name === voiceIdentifier);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
  }

  utterance.onerror = (event) => {
    console.error('Web speech failed', event.error);
  };
  speechSynthesis.speak(utterance);
  return 'web-speech';
}
