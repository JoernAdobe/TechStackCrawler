import { useCallback, useEffect, useRef } from 'react';
import { useSound } from '../contexts/sound-context';

/** Spielt statische Audio-Dateien – kein ElevenLabs-Key nötig */
export function useStaticAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { soundEnabled } = useSound();

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.onended = null;
    audio.src = '';
    audioRef.current = null;
  }, []);

  const playStatic = useCallback(
    (name: 'welcome' | 'analysis-complete') => {
      if (!soundEnabled) return;
      // Laufende Wiedergabe beenden, sonst überlagern sich mehrere Audio-Elemente
      // und bleiben ohne Referenz im Speicher hängen.
      stop();
      try {
        const audio = new Audio(`/audio/${name}.mp3`);
        audioRef.current = audio;
        audio.play().catch(() => {});
        audio.onended = () => {
          if (audioRef.current === audio) audioRef.current = null;
        };
      } catch {
        // Silent fail
      }
    },
    [soundEnabled, stop],
  );

  // Bei Sound-Aus bzw. Unmount laufende Wiedergabe sauber beenden.
  useEffect(() => {
    if (!soundEnabled) stop();
  }, [soundEnabled, stop]);

  useEffect(() => stop, [stop]);

  return { playStatic, stop };
}
