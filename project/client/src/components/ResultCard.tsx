import { useState } from 'react';
import {
  FileText, ShoppingCart, BarChart3, User, TrendingUp,
  Target, Image, Handshake, Mail, Database,
  Tag, Megaphone, MessageSquare, Wrench, ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryResult } from '../types/analysis';
import SpotlightCard from './SpotlightCard';
import { Badge } from './ui/badge';

interface ResultCardProps {
  result: CategoryResult;
  index: number;
}

const categoryIcons: Record<string, LucideIcon> = {
  CMS: FileText,
  eCommerce: ShoppingCart,
  DMP: BarChart3,
  CDP: User,
  Analytics: TrendingUp,
  'Personalization & Optimization': Target,
  DAM: Image,
  CRM: Handshake,
  'ESP/Marketing Automation': Mail,
  EDW: Database,
  'Tag Management': Tag,
  Advertising: Megaphone,
  'Customer Support': MessageSquare,
  Other: Wrench,
};

/** Extract the first Adobe product name from the opportunity text */
function extractAdobeProduct(text: string): string | null {
  const match = text.match(/Adobe\s+[\w\s&-]+(?:Platform|Manager|Optimizer|Commerce|Campaign|CDP|Analytics|Workfront|GenStudio|Marketo|Target|Audience|Firefly|Express|AEM|Journey)/i);
  if (match) return match[0].trim();
  // Fallback: grab first "Adobe X" phrase
  const simple = text.match(/Adobe\s+\w+/i);
  return simple ? simple[0].trim() : null;
}

export default function ResultCard({ result, index }: ResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isDetected =
    result.currentTechnology !== 'Not Detected' &&
    result.currentTechnology !== 'N/A';

  const Icon = categoryIcons[result.category] || Wrench;

  const hasOpportunity =
    result.adobeOpportunity &&
    result.adobeOpportunity !== 'N/A' &&
    result.adobeOpportunity !== '';

  const adobeProduct = hasOpportunity ? extractAdobeProduct(result.adobeOpportunity!) : null;

  const hasDetails =
    (result.challengesAndPainPoints && result.challengesAndPainPoints !== 'See Executive Summary.') ||
    hasOpportunity;

  return (
    <SpotlightCard
      className={`bg-ts-surface-card rounded-xl border transition-all duration-300 min-w-0 ${
        isDetected
          ? 'border-ts-success/20 hover:border-ts-success/30'
          : 'border-ts-border hover:border-ts-accent/30'
      }`}
      spotlightColor={isDetected ? 'rgba(74, 222, 128, 0.06)' : 'rgba(139, 143, 160, 0.06)'}
    >
      <div className="w-full min-w-0" style={{ animationDelay: `${index * 80}ms` }}>
        {/* Compact header — always visible */}
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isDetected ? 'bg-ts-success/10' : 'bg-ts-accent/10'
              }`}>
                <Icon className={`w-4 h-4 ${isDetected ? 'text-ts-success' : 'text-ts-accent'}`} strokeWidth={1.5} />
              </div>
              <h3 className="font-semibold text-ts-text-primary text-sm">
                {result.category}
              </h3>
            </div>
            <Badge
              variant={isDetected ? 'default' : 'secondary'}
              className={`text-[11px] font-medium px-2 py-0.5 ${
                isDetected
                  ? 'bg-ts-success/10 text-ts-success border border-ts-success/20'
                  : 'bg-ts-warning/10 text-ts-warning border border-ts-warning/20'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                isDetected ? 'bg-ts-success' : 'bg-ts-warning'
              }`} />
              {isDetected ? 'Detected' : 'Not Found'}
            </Badge>
          </div>

          {/* Technology — single line */}
          <p className="text-sm text-ts-text-primary font-medium truncate">
            {result.currentTechnology}
          </p>

          {/* Adobe product tag — compact */}
          {adobeProduct && (
            <span className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium text-adobe-red bg-gradient-to-r from-adobe-red/15 to-adobe-red/5 rounded-full px-2.5 py-1">
              {adobeProduct}
            </span>
          )}
        </div>

        {/* Expand toggle */}
        {hasDetails && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-center gap-1 py-2 text-xs text-ts-text-secondary hover:text-ts-text-primary border-t border-ts-border/40 transition-colors"
            >
              {expanded ? 'Less' : 'Details'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Expanded details */}
            {expanded && (
              <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                {result.challengesAndPainPoints && result.challengesAndPainPoints !== 'See Executive Summary.' && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-ts-text-secondary mb-1 font-medium">
                      Challenges
                    </p>
                    <p className="text-xs text-ts-text-secondary leading-relaxed">
                      {result.challengesAndPainPoints}
                    </p>
                  </div>
                )}
                {hasOpportunity && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-adobe-red mb-1 font-medium">
                      Adobe Opportunity
                    </p>
                    <p className="text-xs text-ts-text-primary leading-relaxed">
                      {result.adobeOpportunity}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </SpotlightCard>
  );
}
