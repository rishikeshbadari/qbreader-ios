import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

type VoiceEngine = 'expo' | 'puter-web';

let puterReady: Promise<void> | null = null;
let activeHtmlAudio: HTMLAudioElement | null = null;

export async function stopVoice(): Promise<void> {
  Speech.stop();
  if (Platform.OS === 'web' && activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
    } catch {
      // ignore stop errors
    }
    activeHtmlAudio = null;
  }
}

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
  }

  Speech.speak(text, {
    rate: 0.92,
    pitch: 1,
    voice: voiceIdentifier,
    onError: (e) => console.error('Expo speech error', e),
  });
  return 'expo';
}

export function getVoiceEngineStatus(): VoiceEngine {
  return Platform.OS === 'web' ? 'puter-web' : 'expo';
}

async function ensurePuter(): Promise<void> {
  if (typeof window === 'undefined' || Platform.OS !== 'web') {
    throw new Error('Puter only supported on web');
  }
  if ((window as unknown as { puter?: { ai?: { txt2speech?: unknown } } }).puter?.ai?.txt2speech) {
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
    const puter = (window as unknown as { puter?: { ai?: { txt2speech?: unknown } } }).puter;
    if (!puter?.ai?.txt2speech) {
      return null;
    }
    const audio = await puter.ai.txt2speech(text, {
      voice: voiceIdentifier,
      engine: 'neural',
      language: 'en-US',
    });
    if (audio) {
      activeHtmlAudio = audio as HTMLAudioElement;
      await audio.play();
      return 'puter-web';
    }
  } catch (error) {
    console.error('Puter TTS failed, falling back to Expo speech', error);
  }
  return null;
}

