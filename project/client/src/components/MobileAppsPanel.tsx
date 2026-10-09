import { ExternalLink, Star } from 'lucide-react';
import type { MobileAppInfo, MobileAppsResult } from '../types/parity';

const FOUND_VIA_LABEL: Record<MobileAppInfo['foundVia'], string> = {
  'website-link': 'Website link',
  'smart-banner-meta': 'Smart banner',
  'store-search': 'Store search',
};

const STORE_LABEL: Record<MobileAppInfo['store'], string> = {
  apple: 'App Store',
  google: 'Google Play',
};

function AppRow({ app }: { app: MobileAppInfo }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-ts-border bg-ts-surface-light/30 p-3">
      {app.iconUrl ? (
        <img src={app.iconUrl} alt="" className="h-11 w-11 rounded-xl shrink-0" loading="lazy" />
      ) : (
        <div className="h-11 w-11 rounded-xl shrink-0 bg-ts-border flex items-center justify-center text-xs text-ts-text-secondary">
          {app.store === 'apple' ? 'iOS' : 'And'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ts-text-primary truncate">{app.name}</div>
        <div className="text-[11px] text-ts-text-secondary truncate">
          {STORE_LABEL[app.store]}
          {app.publisher ? ` · ${app.publisher}` : ''}
          {app.genre ? ` · ${app.genre}` : ''}
          {app.version ? ` · v${app.version}` : ''}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ts-text-secondary">
          {app.rating !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-ts-warning">
              <Star className="w-3 h-3 fill-current" />
              {app.rating}
              {app.ratingCount !== undefined && (
                <span className="text-ts-text-secondary">({app.ratingCount.toLocaleString('en')})</span>
              )}
            </span>
          )}
          <span>{FOUND_VIA_LABEL[app.foundVia]}</span>
          {app.lastUpdated && <span>· updated {new Date(app.lastUpdated).toLocaleDateString()}</span>}
        </div>
      </div>
      <a
        href={app.storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 p-2 text-ts-text-secondary hover:text-adobe-red transition-colors"
        aria-label={`Open ${app.name} in ${STORE_LABEL[app.store]}`}
      >
        <ExternalLink className="w-4 h-4" />
      </a>
    </li>
  );
}

export default function MobileAppsPanel({ data }: { data: MobileAppsResult }) {
  return (
    <div className="space-y-3">
      {data.apps.length > 0 ? (
        <ul className="space-y-2">
          {data.apps.map((app) => (
            <AppRow key={`${app.store}:${app.appId}`} app={app} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ts-text-secondary">No mobile apps found.</p>
      )}
      {data.notes && data.notes.length > 0 && (
        <ul className="space-y-0.5">
          {data.notes.map((n) => (
            <li key={n} className="text-[11px] text-ts-text-secondary">
              · {n}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-ts-text-secondary">{new Date(data.fetchedAt).toLocaleString()}</p>
    </div>
  );
}
