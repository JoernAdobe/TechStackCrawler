import { useCallback, useRef, useState, useEffect } from 'react';

export function useTts() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);

  useEffect(() => {
    fetch('/api/tts/status')
      .then((r) => r.ok && r.json())
      .then((d) => d?.available && setTtsAvailable(true))
      .catch(() => {});
  }, []);

  const playTts = useCallback(async (text: string) => {
    if (!ttsAvailable) return;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        return; // TTS not configured or failed - fail silently
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      await audio.play();

      audio.onended = () => {
        URL.revokeObjectURL(url);
      };
    } catch {
      // Silent fail - user might have muted or TTS disabled
    }
  }, [ttsAvailable]);

  return { playTts, ttsAvailable };
}
