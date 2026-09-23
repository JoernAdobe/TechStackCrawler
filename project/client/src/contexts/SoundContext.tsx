import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { SoundContext } from './sound-context';

const COOKIE_NAME = 'techstack_sound';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 Jahr

function getSoundFromCookie(): boolean {
  if (typeof document === 'undefined') return true;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return false;
  return match[1] !== '0';
}

function setSoundCookie(enabled: boolean) {
  document.cookie = `${COOKIE_NAME}=${enabled ? '1' : '0'}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundEnabledState] = useState(getSoundFromCookie);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);
    setSoundCookie(enabled);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      setSoundCookie(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ soundEnabled, setSoundEnabled, toggleSound }),
    [soundEnabled, setSoundEnabled, toggleSound],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}
