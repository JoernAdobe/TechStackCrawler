import type { CategoryResult } from '../types/analysis';
import SpotlightCard from './SpotlightCard';

interface ResultCardProps {
  result: CategoryResult;
  index: number;
}

const categoryIcons: Record<string, string> = {
  CMS: '📝',
  eCommerce: '🛒',
  DMP: '📊',
  CDP: '👤',
  Analytics: '📈',
  'Personalization & Optimization': '🎯',
  DAM: '🖼️',
  CRM: '🤝',
  'ESP/Marketing Automation': '📧',
  EDW: '🗄️',
  Other: '🔧',
};

export default function ResultCard({ result }: ResultCardProps) {
  const isDetected =
    result.currentTechnology !== 'Not Detected' &&
    result.currentTechnology !== 'N/A';

  return (
    <SpotlightCard
      className="bg-ts-surface-card rounded-xl border border-ts-border hover:border-ts-accent/30 transition-all duration-300"
      spotlightColor="rgba(99, 102, 241, 0.15)"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {categoryIcons[result.category] || '📦'}
            </span>
            <h3 className="font-semibold text-ts-text-primary">
              {result.category}
            </h3>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isDetected
                ? 'bg-ts-success/10 text-ts-success'
                : 'bg-ts-warning/10 text-ts-warning'
            }`}
          >
            {isDetected ? 'Detected' : 'Not Found'}
          </span>
        </div>

        {/* Current Technology */}
        <div className="mb-3">
          <p className="text-xs uppercase tracking-wider text-ts-text-secondary mb-1">
            Current Technology
          </p>
          <p className="text-sm text-ts-text-primary font-medium">
            {result.currentTechnology}
          </p>
        </div>

        {/* Challenges */}
        <div className="mb-3">
          <p className="text-xs uppercase tracking-wider text-ts-text-secondary mb-1">
            Challenges & Pain Points
          </p>
          <p className="text-sm text-ts-text-secondary leading-relaxed">
            {result.challengesAndPainPoints}
          </p>
        </div>

        {/* Adobe Opportunity */}
        {result.adobeOpportunity &&
          result.adobeOpportunity !== 'N/A' &&
          result.adobeOpportunity !== '' && (
            <div className="mt-4 pt-3 border-t border-ts-border/50">
              <p className="text-xs uppercase tracking-wider text-adobe-red mb-1">
                Adobe Opportunity
              </p>
              <p className="text-sm text-ts-text-primary">
                {result.adobeOpportunity}
              </p>
            </div>
          )}
      </div>
    </SpotlightCard>
  );
}
