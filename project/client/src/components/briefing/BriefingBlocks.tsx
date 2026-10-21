import { Info } from 'lucide-react';
import type { BriefingBlock } from '../../types/briefing';

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

function Block({ block }: { block: BriefingBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="text-sm leading-relaxed text-ts-text-primary/90">{block.text}</p>;
    case 'feature-grid':
      return (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {block.cards.map((c, i) => (
            <li key={i} className="rounded-xl border border-ts-border bg-ts-surface-light p-3">
              <p className="text-xs uppercase tracking-wide text-ts-text-secondary">{c.label}</p>
              <p className="mt-1 text-lg font-semibold text-ts-text-primary">{c.value}</p>
              {c.detail && <p className="mt-0.5 text-xs text-ts-text-secondary">{c.detail}</p>}
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="space-y-3">
          {block.items.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-adobe-red/50 text-xs font-semibold text-ts-text-primary" aria-hidden="true">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ts-text-primary">{s.title}</p>
                <p className="text-sm leading-relaxed text-ts-text-secondary">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    case 'note':
      return (
        <div className="flex gap-2.5 rounded-lg border-l-2 border-adobe-red bg-adobe-red/5 px-3.5 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-adobe-red" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            {block.title && <p className="font-semibold text-ts-text-primary">{block.title}</p>}
            <p className="leading-relaxed text-ts-text-secondary">{block.text}</p>
          </div>
        </div>
      );
    case 'legend':
      return (
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ background: SAFE_COLOR.test(item.color) ? item.color : '#8B8FA0' }}
                aria-hidden="true"
              />
              <span className="font-medium text-ts-text-primary">{item.label}</span>
              <span className="text-ts-text-secondary">{item.text}</span>
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl border border-ts-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-ts-surface-light text-xs uppercase tracking-wide text-ts-text-secondary">
              <tr>
                {block.headers.map((h, i) => <th key={i} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-t border-ts-border/70">
                  {row.map((cell, c) => <td key={c} className="px-3 py-2 align-top text-ts-text-primary/90">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

export default function BriefingBlocks({ blocks }: { blocks: BriefingBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => <Block key={i} block={b} />)}
    </div>
  );
}
