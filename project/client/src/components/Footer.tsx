const commit = import.meta.env.VITE_GIT_COMMIT;

export default function Footer() {
  const buildLabel =
    commit && commit !== 'unknown' ? commit : '—';
  return (
    <footer className="py-3 text-center space-y-1">
      <span className="block text-xs text-ts-text-secondary">
        Questions? Contact:{' '}
        <a
          href="mailto:daudert@adobe.com"
          className="text-ts-accent hover:text-ts-accent-light"
        >
          daudert@adobe.com
        </a>
      </span>
      <span className="block text-xs text-ts-text-secondary">
        Build: {buildLabel}
      </span>
    </footer>
  );
}
