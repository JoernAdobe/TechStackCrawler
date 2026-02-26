import { useCallback, useRef } from 'react';

/** Spielt statische Audio-Dateien – kein ElevenLabs-Key nötig */
export function useStaticAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playStatic = useCallback((name: 'welcome' | 'analysis-complete') => {
    try {
      const audio = new Audio(`/audio/${name}.mp3`);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => {
        audioRef.current = null;
      };
    } catch {
      // Silent fail
    }
  }, []);

  return { playStatic };
}
