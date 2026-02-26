export default function Header() {
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
          <span className="text-xs text-ts-text-secondary px-3 py-1 rounded-full border border-ts-border bg-ts-surface-light">
            Powered by JAVELYN
          </span>
        </div>
      </div>
    </header>
  );
}
