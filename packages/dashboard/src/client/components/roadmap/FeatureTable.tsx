import { useState } from 'react';
import type { DashboardFeature, MilestoneProgress } from '@shared/types';
import { FeatureRow } from './FeatureRow';
import { isWorkable } from './utils';

interface Props {
  features: DashboardFeature[];
  milestones: MilestoneProgress[];
  filterMilestone: string;
  filterStatus: string;
  workableOnly: boolean;
  identity: string | null;
  onClaim: (feature: DashboardFeature) => void;
}

function MilestoneSection({
  name,
  features,
  progress,
  identity,
  onClaim,
}: {
  name: string;
  features: DashboardFeature[];
  progress: MilestoneProgress | undefined;
  identity: string | null;
  onClaim: (feature: DashboardFeature) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const done = progress?.done ?? 0;
  const total = progress?.total ?? features.length;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span
          className="text-xs text-gray-500 transition-transform"
          style={{ transform: collapsed ? undefined : 'rotate(90deg)' }}
        >
          &#9654;
        </span>
        <span className="text-sm font-semibold text-gray-200">{name}</span>
        <span className="text-xs text-gray-500">
          {done}/{total}
        </span>
        {/* Mini progress bar */}
        <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
          />
        </div>
      </button>
      {!collapsed && (
        <div>
          {features.map((f) => (
            <FeatureRow key={f.name} feature={f} identity={identity} onClaim={onClaim} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FeatureTable({
  features,
  milestones,
  filterMilestone,
  filterStatus,
  workableOnly,
  identity,
  onClaim,
}: Props) {
  // Apply filters
  const filtered = features.filter((f) => {
    if (filterMilestone && f.milestone !== filterMilestone) return false;
    if (filterStatus) {
      if (f.status !== filterStatus) return false;
    } else {
      // Default: hide done features
      if (f.status === 'done') return false;
    }
    if (workableOnly && !isWorkable(f)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return <p className="text-sm text-neutral-muted">No features match the current filters.</p>;
  }

  // Group by milestone preserving order
  const groups = new Map<string, DashboardFeature[]>();
  for (const f of filtered) {
    const list = groups.get(f.milestone) ?? [];
    list.push(f);
    groups.set(f.milestone, list);
  }

  // Build progress lookup
  const progressMap = new Map(milestones.map((m) => [m.name, m]));

  return (
    <div className="space-y-3">
      {Array.from(groups).map(([milestone, feats]) => (
        <MilestoneSection
          key={milestone}
          name={milestone}
          features={feats}
          progress={progressMap.get(milestone)}
          identity={identity}
          onClaim={onClaim}
        />
      ))}
    </div>
  );
}
