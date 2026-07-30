import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  FileText,
  Download,
  Layers,
  Target,
  Lightbulb,
  Plug,
  AlertTriangle,
} from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import {
  downloadTechCaseMarkdown,
  hasUseCases,
  integrationDetections,
  adobeOpportunities,
} from '../lib/techCaseMarkdown';

gsap.registerPlugin(useGSAP);

interface TechCaseInsightsProps {
  analysis: AnalysisResult;
}

const NOT_DETECTED = new Set(['Not Detected', 'N/A', 'Unknown', '']);

export default function TechCaseInsights({ analysis }: TechCaseInsightsProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const useCasesReady = hasUseCases(analysis);
  const vendorCount = analysis.rawDetections.length;
  const painCount = analysis.categories.filter(
    (c) => !NOT_DETECTED.has(c.currentTechnology.trim()) && !NOT_DETECTED.has(c.challengesAndPainPoints.trim()),
  ).length;
  const opportunityCount = adobeOpportunities(analysis).length;
  const useCaseCount = analysis.useCaseDiscovery?.useCases.length ?? 0;
  const integrationCount = integrationDetections(analysis).length;

  useGSAP(
    () => {
      if (!gridRef.current) return;
      const cards = gridRef.current.querySelectorAll(':scope > *');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power3.out' },
      );
    },
    { scope: gridRef },
  );

  const sections = [
    {
      code: '03',
      title: 'Current State & Challenges',
      icon: Layers,
      summary: `${vendorCount} technologies detected · ${painCount} categories with pain points`,
      ready: vendorCount > 0,
    },
    {
      code: '04',
      title: 'Proposed Solutions & Capabilities',
      icon: Target,
      summary: `${opportunityCount} Adobe opportunities mapped`,
      ready: opportunityCount > 0,
    },
    {
      code: '06',
      title: 'Key Use Cases + ROI',
      icon: Lightbulb,
      summary: useCasesReady
        ? `${useCaseCount} use cases with Adobe solutions`
        : 'Run "Discover Use Cases" to populate',
      ready: useCasesReady,
    },
    {
      code: '07',
      title: 'Integration Landscape',
      icon: Plug,
      summary: `${integrationCount} 3rd-party systems (CRM, CDP, ESP, …)`,
      ready: integrationCount > 0,
    },
  ];

  return (
    <section className="px-6 py-8 max-w-7xl mx-auto">
      <div className="bg-ts-surface-card rounded-2xl border border-ts-border overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-adobe-red/10 via-ts-surface-card to-ts-accent/5 p-6 border-b border-ts-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ts-text-primary flex items-center gap-2">
                <FileText className="w-6 h-6 text-adobe-red" strokeWidth={1.5} />
                TechCase Insights
              </h2>
              <p className="mt-1 text-sm text-ts-text-secondary max-w-2xl">
                Analysis mapped to the Adobe TechCase sections (03 · 04 · 06 · 07). Export as
                Markdown and paste into the matching slides — deal data (ARR, commercials,
                stakeholders) is added manually.
              </p>
            </div>
            <button
              onClick={() => downloadTechCaseMarkdown(analysis)}
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-medium rounded-xl hover:opacity-90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              Export Markdown
            </button>
          </div>
        </div>

        {/* Section preview grid */}
        <div className="p-6">
          {!useCasesReady && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-ts-warning/30 bg-ts-warning/10 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-ts-warning shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-xs text-ts-text-secondary leading-relaxed">
                Section 06 (Use Cases + ROI) is still empty. Generate use cases above first for a
                complete export — sections 03, 04 and 07 are already included.
              </p>
            </div>
          )}

          <div ref={gridRef} className="grid gap-4 sm:grid-cols-2">
            {sections.map((s) => (
              <div
                key={s.code}
                className="rounded-xl border border-ts-border bg-ts-surface-light/30 p-4 flex items-start gap-3"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    s.ready ? 'bg-ts-success/10 text-ts-success' : 'bg-ts-warning/10 text-ts-warning'
                  }`}
                >
                  {s.code}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ts-text-primary text-sm flex items-center gap-1.5">
                    <s.icon className="w-3.5 h-3.5 text-ts-accent-light" strokeWidth={1.5} />
                    {s.title}
                  </h3>
                  <p className="mt-1 text-xs text-ts-text-secondary leading-relaxed">
                    {s.summary}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
