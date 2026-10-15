import type { ConsistencyCode, SolutionMappingMatrix } from '../types/parity';

const CODE_STYLES: Record<string, { label: string; className: string }> = {
  '1': { label: 'Consistent', className: 'bg-ts-success/15 text-ts-success border-ts-success/30' },
  '2': { label: 'Multiple', className: 'bg-ts-warning/15 text-ts-warning border-ts-warning/30' },
  '-1': { label: 'Inconsistent', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  '-2': { label: 'Different', className: 'bg-adobe-red/15 text-adobe-red border-adobe-red/30' },
  '0': { label: 'None', className: 'bg-ts-surface-light text-ts-text-secondary border-ts-border' },
};

function CodeBadge({ code }: { code: ConsistencyCode }) {
  const style = CODE_STYLES[String(code)] ?? CODE_STYLES['0'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ${style.className}`}
      title={`Consistency code ${code}`}
    >
      <span className="font-mono">{code}</span>
      {style.label}
    </span>
  );
}

function columnTitle(col: SolutionMappingMatrix['columns'][number]): string {
  if (col.label) return col.label;
  try {
    return new URL(col.url).hostname.replace(/^www\./, '');
  } catch {
    return col.url;
  }
}

export default function SolutionMatrix({ matrix }: { matrix: SolutionMappingMatrix }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-ts-text-primary mb-3">Solution Mapping</h3>
        <div className="relative overflow-x-auto rounded-xl border border-ts-border">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-ts-surface-light">
                <th className="sticky left-0 z-10 bg-ts-surface-light text-left px-3 py-2 font-semibold text-ts-text-secondary border-b border-ts-border min-w-[11rem]">
                  Building Block
                </th>
                {matrix.columns.map((col, i) => (
                  <th
                    key={`${col.url}-${i}`}
                    className="text-left px-3 py-2 font-semibold text-ts-text-primary border-b border-l border-ts-border min-w-[9rem] max-w-[14rem]"
                    title={col.url}
                  >
                    <div className="truncate">{columnTitle(col)}</div>
                    {col.label && <div className="truncate font-normal text-ts-text-secondary">{col.url}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.buildingBlock} className="border-b border-ts-border/60 last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-ts-surface-card text-left px-3 py-2 font-medium text-ts-text-primary"
                  >
                    {row.buildingBlock}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`align-top px-3 py-2 border-l border-ts-border/60 ${
                        cell.solutions.length === 0 ? 'bg-rose-300/10' : 'bg-ts-surface-card'
                      }`}
                    >
                      {cell.solutions.length === 0 ? (
                        <span className="sr-only">No solution</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {cell.solutions.map((s) => (
                            <li
                              key={s.name}
                              className={
                                s.weak
                                  ? 'italic text-ts-text-secondary'
                                  : s.isAdobe
                                    ? 'font-semibold text-adobe-red'
                                    : 'text-ts-text-primary'
                              }
                              title={s.weak ? 'Unverified signal' : undefined}
                            >
                              {s.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ts-text-secondary">
          <span className="font-semibold text-adobe-red">Adobe solutions</span> highlighted ·{' '}
          <span className="italic">italic = unverified signal</span> · tinted cells = no solution detected
        </p>
      </section>

      {matrix.keyFindings.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-ts-text-primary mb-3">Key Findings</h3>
          <div className="rounded-xl border border-ts-border divide-y divide-ts-border/60">
            {matrix.keyFindings.map((k) => (
              <div key={k.buildingBlock} className="px-4 py-3 bg-ts-surface-card flex flex-col md:flex-row md:items-start gap-2 md:gap-4">
                <div className="md:w-56 shrink-0 flex items-center gap-2">
                  <CodeBadge code={k.code} />
                  <span className="text-sm font-medium text-ts-text-primary">{k.buildingBlock}</span>
                </div>
                <div className="text-sm text-ts-text-secondary space-y-1">
                  {k.solutions.length > 0 && <div className="text-ts-text-primary">{k.solutions.join(' | ')}</div>}
                  {k.findings.map((f, i) => (
                    <p key={i}>{f}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {matrix.otherTechnologies.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-ts-text-primary mb-3">Other Technologies</h3>
          <div className="flex flex-wrap gap-1.5">
            {matrix.otherTechnologies.map((t) => (
              <span key={t} className="px-2 py-0.5 text-xs rounded-md border border-ts-border bg-ts-surface-light text-ts-text-secondary">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
