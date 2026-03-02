import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ClipboardList, Search } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import ResultCard from './ResultCard';
import AdobeOpportunityCharts from './AdobeOpportunityCharts';
import AnimatedCounter from './AnimatedCounter';
import { Badge } from './ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';

gsap.registerPlugin(useGSAP);

interface ResultsTableProps {
  results: AnalysisResult;
}

export default function ResultsTable({ results }: ResultsTableProps) {
  const safeUrl = /^https?:\/\//i.test(results.url) ? results.url : '#';
  const gridRef = useRef<HTMLDivElement>(null);
  const rawRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!gridRef.current) return;
      const cards = gridRef.current.querySelectorAll(':scope > *');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out' },
      );
    },
    { scope: gridRef },
  );

  useGSAP(
    () => {
      if (!rawRef.current) return;
      const badges = rawRef.current.querySelectorAll('.tech-badge');
      gsap.fromTo(
        badges,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.3, stagger: 0.03, ease: 'back.out(1.5)' },
      );
    },
    { scope: rawRef },
  );

  const detectedCount = results.categories.filter(
    c => c.currentTechnology !== 'Not Detected' && c.currentTechnology !== 'N/A',
  ).length;

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Summary */}
      <div className="mb-8 gradient-border bg-ts-surface-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-5 h-5 text-ts-accent" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold text-ts-text-primary">
            Executive Summary
          </h2>
        </div>
        <p className="text-ts-text-secondary leading-relaxed">
          {results.summary}
        </p>
        <div className="mt-4 flex items-center gap-4 text-xs text-ts-text-secondary">
          <span>
            URL:{' '}
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ts-accent-light hover:underline"
            >
              {results.url}
            </a>
          </span>
          <span>
            Analyzed:{' '}
            {new Date(results.analyzedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="bg-ts-surface-card rounded-xl border border-ts-border p-4 text-center">
          <AnimatedCounter value={results.categories.length} className="text-2xl font-bold text-ts-text-primary" />
          <p className="text-xs text-ts-text-secondary mt-1">Categories</p>
        </div>
        <div className="bg-ts-surface-card rounded-xl border border-ts-success/20 p-4 text-center">
          <AnimatedCounter value={detectedCount} className="text-2xl font-bold text-ts-success" />
          <p className="text-xs text-ts-text-secondary mt-1">Detected</p>
        </div>
        <div className="bg-ts-surface-card rounded-xl border border-ts-accent/20 p-4 text-center">
          <AnimatedCounter value={results.rawDetections.length} className="text-2xl font-bold text-ts-accent-light" />
          <p className="text-xs text-ts-text-secondary mt-1">Technologies</p>
        </div>
      </div>

      {/* Category Grid Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ts-text-primary">
          Technology Stack Analysis
        </h2>
        <div className="flex items-center gap-3 text-xs text-ts-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ts-success animate-pulse" />
            Detected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ts-warning" />
            Not Found
          </span>
        </div>
      </div>

      {/* Category Grid */}
      <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full min-w-0">
        {results.categories.map((cat, i) => (
          <ResultCard key={cat.category} result={cat} index={i} />
        ))}
        {results.rawDetections
          .filter(
            (tech) =>
              !results.categories.some(
                (cat) =>
                  cat.currentTechnology
                    .toLowerCase()
                    .includes(tech.name.toLowerCase()),
              ),
          )
          .map((tech, i) => (
            <ResultCard
              key={`raw-${tech.name}`}
              result={{
                category: tech.name,
                currentTechnology: tech.version ? `${tech.name} ${tech.version}` : tech.name,
                challengesAndPainPoints: 'See Executive Summary.',
                adobeOpportunity: 'Auto-detected – see Executive Summary for context.',
              }}
              index={results.categories.length + i}
            />
          ))}
      </div>

      {/* Raw Detections */}
      {results.rawDetections.length > 0 && (
        <div className="mt-8 bg-ts-surface-card rounded-xl border border-ts-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-ts-accent" strokeWidth={1.5} />
            <h2 className="text-lg font-semibold text-ts-text-primary">
              All Detected Technologies
            </h2>
            <Badge variant="secondary" className="ml-2 bg-ts-accent/10 text-ts-accent-light border border-ts-accent/20">
              {results.rawDetections.length}
            </Badge>
          </div>
          <div ref={rawRef} className="flex flex-wrap gap-2">
            {results.rawDetections.map((tech) => (
              <Tooltip key={tech.name}>
                <TooltipTrigger asChild>
                  <span
                    className="tech-badge inline-flex items-center gap-1.5 text-xs bg-ts-surface-light border border-ts-border px-3 py-1.5 rounded-full text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent/30 hover:shadow-glow-accent transition-all duration-200 cursor-default"
                  >
                    <span className="font-medium text-ts-text-primary">
                      {tech.name}
                    </span>
                    {tech.version && (
                      <span className="text-ts-accent-light">v{tech.version}</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      tech.confidence >= 90
                        ? 'bg-ts-success/10 text-ts-success'
                        : tech.confidence >= 80
                          ? 'bg-ts-accent/10 text-ts-accent-light'
                          : 'bg-ts-warning/10 text-ts-warning'
                    }`}>
                      {tech.confidence}%
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tech.name}{tech.version ? ` v${tech.version}` : ''} — Confidence: {tech.confidence}%</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <AdobeOpportunityCharts results={results} />
        </div>
      )}
    </div>
  );
}
