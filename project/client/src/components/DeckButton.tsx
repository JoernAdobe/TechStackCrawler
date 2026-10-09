import { useState } from 'react';
import { LoaderCircle, Presentation } from 'lucide-react';
import { ApiError, toErrorMessage } from '../lib/apiClient';

interface DeckButtonProps {
  href: string;
  label?: string;
}

function filenameFrom(res: Response, fallback: string): string {
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] || fallback;
}

export default function DeckButton({ href, label = 'Download PowerPoint' }: DeckButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(href, { credentials: 'same-origin' });
      if (!res.ok) {
        let message = `Request failed (HTTP ${res.status})`;
        try {
          const data = (await res.json()) as { error?: string; code?: string };
          if (data.error) message = data.error;
          throw new ApiError(res.status, message, data.code);
        } catch (err) {
          if (err instanceof ApiError) throw err;
          throw new ApiError(res.status, message);
        }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFrom(res, 'tech-stack-assessment.pptx');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(toErrorMessage(err, 'Download failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        aria-busy={loading}
        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-adobe-red to-adobe-red-dark rounded-lg hover:from-adobe-red-dark hover:to-[#B03522] transition-all hover:shadow-glow-red hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100"
      >
        {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Presentation className="w-4 h-4" />}
        {loading ? 'Building deck…' : label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-adobe-red max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
}
