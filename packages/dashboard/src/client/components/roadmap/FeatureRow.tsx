import { useState } from 'react';
import type { DashboardFeature } from '@shared/types';
import { STATUS_COLOR } from '../../utils/statusColors';
import { EM_DASH, isWorkable, externalIdToUrl } from './utils';

interface Props {
  feature: DashboardFeature;
  identity: string | null;
  onClaim: (feature: DashboardFeature) => void;
}

function StatusBadge({ status }: { status: DashboardFeature['status'] }) {
  const color = STATUS_COLOR[status] ?? '#71717a';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {status.replace('-', ' ')}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    P0: 'text-red-400 bg-red-400/10',
    P1: 'text-orange-400 bg-orange-400/10',
    P2: 'text-yellow-400 bg-yellow-400/10',
    P3: 'text-gray-400 bg-gray-400/10',
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${colors[priority] ?? 'text-gray-400 bg-gray-400/10'}`}
    >
      {priority}
    </span>
  );
}

export function FeatureRow({ feature, identity, onClaim }: Props) {
  const [expanded, setExpanded] = useState(false);
  const workable = isWorkable(feature);

  return (
    <div className="border-t border-gray-800 first:border-t-0">
      {/* Collapsed row */}
      <div
        className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-800/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className="text-[10px] text-gray-600 transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
        >
          &#9654;
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-200" title={feature.name}>
          {feature.name}
        </span>
        <StatusBadge status={feature.status} />
        {feature.priority && <PriorityBadge priority={feature.priority} />}
        {feature.assignee && feature.assignee !== EM_DASH && (
          <span className="text-xs text-gray-500" title={feature.assignee}>
            {feature.assignee}
          </span>
        )}
        <span
          className="hidden max-w-[200px] truncate text-xs text-gray-600 lg:inline"
          title={feature.summary}
        >
          {feature.summary}
        </span>
        {workable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (identity) onClaim(feature);
            }}
            disabled={!identity}
            title={identity ? undefined : 'Could not resolve your identity'}
            className={`ml-auto rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest border transition-all whitespace-nowrap ${
              identity
                ? 'bg-primary-500/10 text-primary-400 border-primary-500/20 hover:bg-primary-500 hover:text-white'
                : 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
            }`}
          >
            Start Working
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 bg-gray-900/30 px-10 py-3 text-xs">
          <div>
            <span className="text-gray-500">Summary: </span>
            <span className="text-gray-300">{feature.summary}</span>
          </div>
          <div>
            <span className="text-gray-500">Spec: </span>
            <span className="text-gray-400">{feature.spec ?? EM_DASH}</span>
          </div>
          <div>
            <span className="text-gray-500">Plans: </span>
            <span className="text-gray-400">
              {feature.plans.length > 0 ? feature.plans.join(', ') : EM_DASH}
            </span>
          </div>
          <div>
            <span className="text-gray-500">External ID: </span>
            {feature.externalId ? (
              (() => {
                const url = externalIdToUrl(feature.externalId);
                return url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-400 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {feature.externalId}
                  </a>
                ) : (
                  <span className="text-gray-400">{feature.externalId}</span>
                );
              })()
            ) : (
              <span className="text-gray-400">{EM_DASH}</span>
            )}
          </div>
          {feature.blockedBy.length > 0 && (
            <div>
              <span className="text-gray-500">Blocked by: </span>
              <span className="text-red-400">{feature.blockedBy.join(', ')}</span>
            </div>
          )}
          {feature.updatedAt && (
            <div>
              <span className="text-gray-500">Updated: </span>
              <span className="text-gray-400">
                {new Date(feature.updatedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
