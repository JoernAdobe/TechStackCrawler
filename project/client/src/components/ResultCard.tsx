import { useState } from 'react';
import {
  FileText, ShoppingCart, BarChart3, User, TrendingUp,
  Target, Image, Handshake, Mail, Database,
  Tag, Megaphone, MessageSquare, Wrench, ChevronDown,
  CheckCircle2, AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryResult } from '../types/analysis';

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
  const simple = text.match(/Adobe\s+\w+/i);
  return simple ? simple[0].trim() : null;
}

/** Extract all unique Adobe product names from opportunity text */
function extractAllAdobeProducts(text: string): string[] {
  const products: string[] = [];
  const regex = /Adobe\s+[\w\s&-]+?(?:Platform|Manager|Optimizer|Commerce|Campaign|CDP|Analytics|Workfront|GenStudio|Marketo|Target|Audience|Firefly|Express|AEM|Journey\s*(?:Analytics|Optimizer)?)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const product = match[0].trim();
    if (!products.includes(product)) products.push(product);
  }
  if (products.length === 0) {
    const simple = text.match(/Adobe\s+\w+/gi);
    if (simple) {
      simple.forEach(p => {
        const trimmed = p.trim();
        if (!products.includes(trimmed)) products.push(trimmed);
      });
    }
  }
  return products;
}

export default function ResultCard({ result, index }: ResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isDetected =
    result.currentTechnology !== 'Not Detected' &&
    result.currentTechnology !== 'N/A' &&
    !result.currentTechnology.startsWith('Not Detected');

  const Icon = categoryIcons[result.category] || Wrench;

  const hasOpportunity =
    result.adobeOpportunity &&
    result.adobeOpportunity !== 'N/A' &&
    result.adobeOpportunity !== '';

  const adobeProducts = hasOpportunity ? extractAllAdobeProducts(result.adobeOpportunity!) : [];

  const hasDetails =
    (result.challengesAndPainPoints && result.challengesAndPainPoints !== 'See Executive Summary.') ||
    hasOpportunity;

  return (
    <div
      className={`group rounded-xl border transition-all duration-300 overflow-hidden ${
        isDetected
          ? 'bg-ts-surface-card border-ts-success/20 hover:border-ts-success/40'
          : 'bg-ts-surface border-ts-border hover:border-ts-text-secondary/30'
      }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Status indicator bar */}
      <div className={`h-0.5 ${isDetected ? 'bg-ts-success/40' : 'bg-ts-border'}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
              isDetected ? 'bg-ts-success/10' : 'bg-ts-accent/8'
            }`}>
              <Icon className={`w-4 h-4 ${isDetected ? 'text-ts-success' : 'text-ts-text-secondary'}`} strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-ts-text-primary text-sm leading-tight">
              {result.category}
            </h3>
          </div>

          {/* Status badge */}
          <div className={`flex items-center gap-1 flex-shrink-0 text-[11px] font-medium ${
            isDetected ? 'text-ts-success' : 'text-ts-text-secondary'
          }`}>
            {isDetected ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            {isDetected ? 'Detected' : 'Not Found'}
          </div>
        </div>

        {/* Detected technology — only show for actual detections */}
        {isDetected && (
          <p className="text-[13px] leading-relaxed mb-3 text-ts-text-primary">
            {result.currentTechnology}
          </p>
        )}

        {/* Adobe product tags — only on detected cards (confirmed in use) */}
        {isDetected && adobeProducts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1">
            {adobeProducts.map((product, i) => (
              <span
                key={i}
                className="inline-flex items-center text-[11px] font-medium rounded-md px-2 py-0.5 text-ts-success bg-ts-success/8 border border-ts-success/15"
              >
                {product}
              </span>
            ))}
          </div>
        )}

        {/* Not Found: short hint that opportunity exists */}
        {!isDetected && hasOpportunity && (
          <p className="text-[12px] text-ts-text-secondary italic">
            Adobe opportunity available — see details
          </p>
        )}
      </div>

      {/* Expand toggle */}
      {hasDetails && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-2.5 text-xs text-ts-text-secondary hover:text-ts-text-primary border-t border-ts-border/30 transition-colors"
          >
            {expanded ? 'Less' : 'Details'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>

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
  );
}
