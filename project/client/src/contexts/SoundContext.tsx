import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

const COOKIE_NAME = 'techstack_sound';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 Jahr

function getSoundFromCookie(): boolean {
  if (typeof document === 'undefined') return true;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return true;
  return match[1] !== '0';
}

function setSoundCookie(enabled: boolean) {
  document.cookie = `${COOKIE_NAME}=${enabled ? '1' : '0'}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

interface SoundContextValue {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

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

  return (
    <SoundContext.Provider value={{ soundEnabled, setSoundEnabled, toggleSound }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used within SoundProvider');
  return ctx;
}
