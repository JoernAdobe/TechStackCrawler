import {
  FileText, ShoppingCart, BarChart3, User, TrendingUp,
  Target, Image, Handshake, Mail, Database,
  Tag, Megaphone, MessageSquare, Wrench, type LucideIcon,
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

export default function ResultCard({ result, index }: ResultCardProps) {
  const isDetected =
    result.currentTechnology !== 'Not Detected' &&
    result.currentTechnology !== 'N/A';

  const Icon = categoryIcons[result.category] || Wrench;

  return (
    <SpotlightCard
      className={`bg-ts-surface-card rounded-xl border transition-all duration-300 p-5 min-w-0 ${
        isDetected
          ? 'border-ts-success/20 hover:border-ts-success/40 hover:shadow-glow-success'
          : 'border-ts-border hover:border-ts-accent/30 hover:shadow-glow-accent'
      }`}
      spotlightColor={isDetected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(99, 102, 241, 0.15)'}
    >
      <div className="w-full min-w-0" style={{ animationDelay: `${index * 80}ms` }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isDetected ? 'bg-ts-success/10' : 'bg-ts-accent/10'
            }`}>
              <Icon className={`w-5 h-5 ${isDetected ? 'text-ts-success' : 'text-ts-accent'}`} strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-ts-text-primary text-sm">
              {result.category}
            </h3>
          </div>
          <Badge
            variant={isDetected ? 'default' : 'secondary'}
            className={`text-xs font-medium ${
              isDetected
                ? 'bg-ts-success/10 text-ts-success border border-ts-success/20 hover:bg-ts-success/20'
                : 'bg-ts-warning/10 text-ts-warning border border-ts-warning/20 hover:bg-ts-warning/20'
            }`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
              isDetected ? 'bg-ts-success animate-pulse' : 'bg-ts-warning'
            }`} />
            {isDetected ? 'Detected' : 'Not Found'}
          </Badge>
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
          <p className="text-sm text-ts-text-secondary leading-relaxed line-clamp-3">
            {result.challengesAndPainPoints}
          </p>
        </div>

        {/* Adobe Opportunity */}
        {result.adobeOpportunity &&
          result.adobeOpportunity !== 'N/A' &&
          result.adobeOpportunity !== '' && (
            <div className="mt-4 pt-3 border-t border-ts-border/50">
              <p className="text-xs uppercase tracking-wider text-adobe-red mb-1 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-adobe-red animate-pulse-glow" />
                Adobe Opportunity
              </p>
              <p className="text-sm text-ts-text-primary leading-relaxed">
                {result.adobeOpportunity}
              </p>
            </div>
          )}
      </div>
    </SpotlightCard>
  );
}
