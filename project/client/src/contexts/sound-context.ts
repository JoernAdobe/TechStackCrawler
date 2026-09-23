import { createContext, useContext } from 'react';

export interface SoundContextValue {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
}

export const SoundContext = createContext<SoundContextValue | null>(null);

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used within SoundProvider');
  return ctx;
}
