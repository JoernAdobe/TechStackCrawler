import { useCallback, useRef } from 'react';
import { useSound } from '../contexts/SoundContext';

/** Spielt statische Audio-Dateien – kein ElevenLabs-Key nötig */
export function useStaticAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { soundEnabled } = useSound();

  const playStatic = useCallback(
    (name: 'welcome' | 'analysis-complete') => {
      if (!soundEnabled) return;
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
    },
    [soundEnabled],
  );

  return { playStatic };
}
