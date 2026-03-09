import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '../lib/utils';

interface PipelineDeal {
  id: string;
  name: string;
  stage: string;
  amount: number;
  companyName?: string;
  createDate?: string;
  lastActivityDate?: string;
  stageProbability?: number;
}

type RecencyStatus = 'warm' | 'amber' | 'cold' | 'grey';

interface NormalizedDeal extends PipelineDeal {
  daysSinceActivity: number;
  recencyStatus: RecencyStatus;
  dealAgeDays: number;
}

const EARLY_STAGES = ['prospecting', 'outreach', 'qualification'];

const STAGE_COLORS: Record<string, string> = {
  'Prospecting': '#6b7280',
  'Outreach': '#6b7280',
  'Qualification': '#6b7280',
  'Demo Scheduled': '#3b82f6',
  'Demo Completed': '#3b82f6',
  'Proposal Sent': '#f59e0b',
  'Negotiation': '#f97316',
  'Contract Sent': '#f97316',
  'Closed Won': '#22c55e',
};

function getStageColor(stage: string): string {
  return STAGE_COLORS[stage] || '#6b7280';
}

function computeRecency(deal: PipelineDeal): { days: number; status: RecencyStatus } {
  const isEarly = EARLY_STAGES.some(s => deal.stage.toLowerCase().includes(s));
  if (!deal.lastActivityDate) return { days: 999, status: isEarly ? 'grey' : 'cold' };
  const last = new Date(deal.lastActivityDate);
  const now = new Date();
  const days = Math.floor((now.getTime() - last.getTime()) / 86400000);
  if (isEarly) return { days, status: 'grey' };
  if (days <= 3) return { days, status: 'warm' };
  if (days <= 7) return { days, status: 'amber' };
  return { days, status: 'cold' };
}

function recencyBarColor(status: RecencyStatus): string {
  switch (status) {
    case 'warm': return '#22c55e';
    case 'amber': return '#f59e0b';
    case 'cold': return '#ef4444';
    case 'grey': return '#4b5563';
  }
}

function recencyTextColor(status: RecencyStatus): string {
  switch (status) {
    case 'warm': return '#4ade80';
    case 'amber': return '#fbbf24';
    case 'cold': return '#f87171';
    case 'grey': return '#9ca3af';
  }
}

type SortKey = 'activity' | 'value' | 'stage' | 'company';

function hubspotDealUrl(portalId: string, dealId: string): string {
  return `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}`;
}

interface PipelineViewProps {
  hubspotPortalId?: string;
  hubspotOwnerId?: string;
  hubspotPipeline?: string;
}

export function PipelineView({ hubspotPortalId = '', hubspotOwnerId = '', hubspotPipeline = '' }: PipelineViewProps) {
  const [deals, setDeals] = useState<NormalizedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [daysBack, setDaysBack] = useState(90);
  const [stageFilter, setStageFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('activity');
  const [sortAsc, setSortAsc] = useState(true);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (stageFilter) params.set('stage', stageFilter);
      if (hubspotOwnerId) params.set('owner', hubspotOwnerId);
      if (hubspotPipeline) params.set('pipeline', hubspotPipeline);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await window.raido.crossAppFetch(`http://localhost:3141/api/hubspot/deals${qs}`);
      const now = new Date();
      const cutoff = new Date(now.getTime() - daysBack * 86400000);

      const normalized: NormalizedDeal[] = (data.deals || []).map((d: PipelineDeal) => {
        const { days, status } = computeRecency(d);
        const created = d.createDate ? new Date(d.createDate) : now;
        const dealAgeDays = Math.floor((now.getTime() - created.getTime()) / 86400000);
        return { ...d, daysSinceActivity: days, recencyStatus: status, dealAgeDays };
      }).filter((d: NormalizedDeal) => {
        if (!d.createDate) return true;
        return new Date(d.createDate) >= cutoff;
      });

      setDeals(normalized);
    } catch {
      setError(true);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [daysBack, stageFilter, hubspotOwnerId, hubspotPipeline]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const stages = useMemo(() => {
    const s = new Set(deals.map(d => d.stage));
    return Array.from(s).sort();
  }, [deals]);

  const sorted = useMemo(() => {
    const arr = [...deals];
    const dir = sortAsc ? 1 : -1;
    switch (sortKey) {
      case 'activity':
        arr.sort((a, b) => (a.daysSinceActivity - b.daysSinceActivity) * dir);
        break;
      case 'value':
        arr.sort((a, b) => (b.amount - a.amount) * dir);
        break;
      case 'stage':
        arr.sort((a, b) => a.stage.localeCompare(b.stage) * dir);
        break;
      case 'company':
        arr.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '') * dir);
        break;
    }
    return arr;
  }, [deals, sortKey, sortAsc]);

  const maxAge = useMemo(() => Math.max(...deals.map(d => d.dealAgeDays), 1), [deals]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'activity'); }
  };

  const SortHeader = ({ label, sortId }: { label: string; sortId: SortKey }) => (
    <button
      onClick={() => handleSort(sortId)}
      className={cn('text-[10px] uppercase tracking-wider font-semibold flex items-center gap-0.5',
        sortKey === sortId ? 'text-text-secondary' : 'text-text-muted hover:text-text-secondary'
      )}
    >
      {label}
      {sortKey === sortId && (
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d={sortAsc ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
      )}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-subtle flex items-center gap-4 flex-shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">Pipeline</h2>

        <div className="flex items-center gap-2 ml-auto">
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-secondary outline-none"
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
          </select>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-secondary outline-none"
          >
            <option value="">All stages</option>
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <span className="text-xs text-text-muted">{deals.length} deals</span>

          <button
            onClick={fetchDeals}
            className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
            title="Refresh"
          >
            <svg className={cn('w-3.5 h-3.5', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="px-5 py-2 border-b border-border-subtle flex items-center gap-3 flex-shrink-0">
        <div className="w-[220px] flex-shrink-0">
          <SortHeader label="Deal" sortId="company" />
        </div>
        <div className="w-[100px] flex-shrink-0">
          <SortHeader label="Stage" sortId="stage" />
        </div>
        <div className="flex-1 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Timeline</div>
        <div className="w-[60px] text-right flex-shrink-0">
          <SortHeader label="Last" sortId="activity" />
        </div>
        <div className="w-[70px] text-right flex-shrink-0">
          <SortHeader label="ARR" sortId="value" />
        </div>
      </div>

      {/* Gantt rows */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {loading && deals.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">Loading pipeline...</div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">HubSpot unavailable — is Kenaz running?</div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">No deals found</div>
        ) : (
          sorted.map((deal) => {
            const barWidth = Math.max(4, (deal.dealAgeDays / maxAge) * 100);
            return (
              <a
                key={deal.id}
                href={hubspotPortalId ? hubspotDealUrl(hubspotPortalId, deal.id) : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-5 py-2.5 border-b border-border-subtle hover:bg-bg-hover transition-colors cursor-pointer"
              >
                {/* Deal name + company */}
                <div className="w-[220px] flex-shrink-0 min-w-0">
                  <div className="text-sm text-text-primary truncate font-medium">{deal.companyName || deal.name}</div>
                  {deal.companyName && <div className="text-[10px] text-text-muted truncate">{deal.name}</div>}
                </div>

                {/* Stage badge */}
                <div className="w-[100px] flex-shrink-0">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${getStageColor(deal.stage)}20`, color: getStageColor(deal.stage) }}
                  >
                    {deal.stage}
                  </span>
                </div>

                {/* Timeline bar */}
                <div className="flex-1 h-3 bg-bg-tertiary rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: recencyBarColor(deal.recencyStatus),
                      opacity: 0.7,
                    }}
                    title={`Created ${deal.createDate ? new Date(deal.createDate).toLocaleDateString() : 'unknown'} · ${deal.dealAgeDays}d old`}
                  />
                </div>

                {/* Last activity */}
                <div className="w-[60px] text-right flex-shrink-0">
                  <span
                    className="text-xs tabular-nums font-medium"
                    style={{ color: recencyTextColor(deal.recencyStatus) }}
                    title={deal.lastActivityDate ? new Date(deal.lastActivityDate).toLocaleDateString() : 'No activity'}
                  >
                    {deal.daysSinceActivity < 999 ? `${deal.daysSinceActivity}d` : '—'}
                  </span>
                </div>

                {/* ARR */}
                <div className="w-[70px] text-right flex-shrink-0">
                  <span className="text-xs text-text-muted tabular-nums">
                    {deal.amount > 0
                      ? `$${deal.amount >= 1000 ? `${(deal.amount / 1000).toFixed(0)}k` : deal.amount}`
                      : '—'}
                  </span>
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
