import { Lightbulb } from 'lucide-react';
import type { AdobePlay, BriefingResult, ExecutiveBullet } from '../../types/briefing';
import ScoreRing from './ScoreRing';
import SubScoreTiles from './SubScoreTiles';
import DrillLink, { type DrillHandler } from './DrillLink';
import { SourceFootnote } from './BriefingSources';
import { BAND_STYLES, CONFIDENCE_STYLES } from './meta';

function Bullet({ bullet, index, onDrill }: { bullet: ExecutiveBullet; index: number; onDrill: DrillHandler }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-adobe-red/15 text-xs font-semibold text-adobe-red" aria-hidden="true">
        {index + 1}
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-ts-text-primary">
          <span className="font-semibold">{bullet.label}: </span>
          {bullet.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {bullet.sectionRef && <DrillLink id={bullet.sectionRef} onDrill={onDrill} />}
          {bullet.source && <SourceFootnote source={bullet.source} />}
        </div>
      </div>
    </li>
  );
}

function PlayCard({ play, onDrill }: { play: AdobePlay; onDrill: DrillHandler }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-ts-border bg-ts-surface-light p-4">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-adobe-red/40 bg-adobe-red/10 px-2 py-0.5 text-xs font-semibold text-ts-text-primary">
        <Lightbulb className="h-3 w-3 text-adobe-red" aria-hidden="true" />
        {play.product}
      </span>
      <p className="text-sm font-semibold leading-snug text-ts-text-primary">{play.headline}</p>
      <p className="flex-1 text-xs leading-relaxed text-ts-text-secondary">
        <span className="font-medium text-ts-text-primary/80">Based on: </span>
        {play.basedOn}
      </p>
      <DrillLink id={play.sectionRef} onDrill={onDrill} />
    </li>
  );
}

/** C-Level-Hero: Score-Ring, Fazit, 5 Bullets, Sub-Scores und Top-3-Adobe-Plays. */
export default function ExecutiveSummary({ result, onDrill }: { result: BriefingResult; onDrill: DrillHandler }) {
  const exec = result.executive;
  const band = BAND_STYLES[exec.band];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3 lg:pr-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ts-text-secondary">Overall Pre-Briefing Score</p>
          <ScoreRing score={exec.overallScore} band={exec.band} />
          <div className="flex flex-wrap justify-center gap-2">
            {exec.overallScore != null && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${band.chip}`}>{band.label}</span>
            )}
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${CONFIDENCE_STYLES[exec.confidence]}`}>
              Confidence: {exec.confidence}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="text-2xl font-bold text-ts-text-primary sm:text-3xl">{result.companyName}</h3>
          {result.domain && <p className="mt-0.5 text-sm text-ts-text-secondary">{result.domain}</p>}
          <p className={`mt-3 text-base font-medium leading-relaxed sm:text-lg ${band.text}`}>{exec.verdict}</p>
          <ul className="mt-5 space-y-3" aria-label="Executive summary">
            {exec.bullets.map((b, i) => <Bullet key={b.key} bullet={b} index={i} onDrill={onDrill} />)}
          </ul>
        </div>
      </div>

      {exec.subScores.length > 0 && (
        <section aria-labelledby="briefing-subscores">
          <h4 id="briefing-subscores" className="mb-2.5 text-sm font-semibold text-ts-text-primary">Score breakdown</h4>
          <SubScoreTiles scores={exec.subScores} onDrill={onDrill} />
        </section>
      )}

      {exec.topPlays.length > 0 && (
        <section aria-labelledby="briefing-plays">
          <h4 id="briefing-plays" className="mb-2.5 text-sm font-semibold text-ts-text-primary">Top Adobe plays</h4>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {exec.topPlays.slice(0, 3).map((p) => <PlayCard key={`${p.product}-${p.sectionRef}`} play={p} onDrill={onDrill} />)}
          </ul>
        </section>
      )}

      <p className="text-xs text-ts-text-secondary">The score is a prioritisation aid, not a forecast.</p>
    </div>
  );
}
