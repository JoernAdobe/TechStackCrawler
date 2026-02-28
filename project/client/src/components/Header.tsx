import { useSound } from '../contexts/SoundContext';

export default function Header() {
  const { soundEnabled, toggleSound } = useSound();

  return (
    <header className="w-full border-b border-ts-border/50 backdrop-blur-sm bg-ts-surface/80 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-adobe-red to-red-700 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm6.232 0L24 22.624V1.376z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-ts-text-primary tracking-tight">
              TechStack Analyzer
            </h1>
            <p className="text-xs text-ts-text-secondary">
              AI-Powered Technology Detection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Sound off' : 'Sound on'}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ts-border bg-ts-surface-light hover:bg-ts-surface-hover transition-colors text-ts-text-secondary hover:text-ts-text-primary"
          >
            {soundEnabled ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
                <span className="text-xs font-medium">Sound on</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
                <span className="text-xs font-medium">Sound off</span>
              </>
            )}
          </button>
          <span className="text-xs text-ts-text-secondary px-3 py-1 rounded-full border border-ts-border bg-ts-surface-light">
            Powered by JAVELYN
          </span>
        </div>
      </div>
    </header>
  );
}
