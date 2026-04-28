import type { RoadmapData } from '@shared/types';

interface Props {
  data: RoadmapData;
}

const stats = [
  { key: 'totalFeatures', label: 'Total', color: 'text-white' },
  { key: 'totalDone', label: 'Done', color: 'text-emerald-400' },
  { key: 'totalInProgress', label: 'In Progress', color: 'text-blue-400' },
  { key: 'totalPlanned', label: 'Planned', color: 'text-gray-400' },
  { key: 'totalBlocked', label: 'Blocked', color: 'text-red-400' },
  { key: 'totalNeedsHuman', label: 'Needs Human', color: 'text-amber-400' },
  { key: 'totalBacklog', label: 'Backlog', color: 'text-gray-500' },
] as const;

export function StatsBar({ data }: Props) {
  return (
    <div className="flex flex-wrap gap-6 rounded-lg border border-gray-800 bg-gray-900/50 px-5 py-3">
      {stats.map(({ key, label, color }) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <span className={`text-lg font-bold tabular-nums ${color}`}>{data[key]}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
