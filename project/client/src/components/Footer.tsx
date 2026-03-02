const commit = import.meta.env.VITE_GIT_COMMIT;

export default function Footer() {
  const buildLabel =
    commit && commit !== 'unknown' ? commit : '—';
  return (
    <footer className="relative py-6">
      {/* Top gradient separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ts-border to-transparent" />
      <div className="text-center space-y-1">
        <span className="block text-xs text-ts-text-secondary">
          Questions? Contact:{' '}
          <a
            href="mailto:daudert@adobe.com"
            className="text-ts-accent hover:text-ts-accent-light transition-colors duration-200"
          >
            daudert@adobe.com
          </a>
        </span>
        <span className="block text-xs text-ts-text-secondary/60">
          Build: {buildLabel}
        </span>
      </div>
    </footer>
  );
}
