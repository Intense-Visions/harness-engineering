import { useState, useEffect, useCallback } from 'react';
import { ActionButton } from '../components/ActionButton';
import type { CIData, CheckResult } from '@shared/types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const CHECK_NAMES = [
  'validate',
  'check-deps',
  'check-arch',
  'check-perf',
  'check-security',
  'check-docs',
  'phase-gate',
] as const;

interface BadgeProps {
  name: string;
  result: CheckResult | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function CheckBadge({ name, result, expanded, onToggle }: BadgeProps) {
  if (!result) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-gray-600" />
          <span className="text-sm font-medium text-gray-400">{name}</span>
        </div>
        <p className="mt-1 text-xs text-gray-600">Not yet run</p>
      </div>
    );
  }

  const bgColor = result.passed ? 'border-emerald-800' : 'border-red-800';
  const dotColor = result.passed ? 'bg-emerald-400' : 'bg-red-400';
  const textColor = result.passed ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`rounded-lg border ${bgColor} bg-gray-900`}>
      <button onClick={onToggle} className="w-full p-4 text-left" aria-expanded={expanded}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${dotColor}`} />
            <span className="text-sm font-medium text-gray-200">{name}</span>
          </div>
          <span className={`text-xs font-medium ${textColor}`}>
            {result.passed ? 'PASS' : 'FAIL'}
          </span>
        </div>
        {!expanded && (result.errorCount > 0 || result.warningCount > 0) && (
          <p className="mt-1 text-xs text-gray-500">
            {result.errorCount > 0 && `${result.errorCount} errors`}
            {result.errorCount > 0 && result.warningCount > 0 && ', '}
            {result.warningCount > 0 && `${result.warningCount} warnings`}
          </p>
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="space-y-1 text-xs">
            <p className="text-gray-400">
              Errors:{' '}
              <span className={result.errorCount > 0 ? 'text-red-400' : 'text-gray-300'}>
                {result.errorCount}
              </span>
              {' | '}
              Warnings:{' '}
              <span className={result.warningCount > 0 ? 'text-yellow-400' : 'text-gray-300'}>
                {result.warningCount}
              </span>
            </p>
            {result.details && <p className="text-gray-500">{result.details}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function CI() {
  const [ciData, setCIData] = useState<CIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchCI = useCallback(async () => {
    try {
      const res = await fetch('/api/ci');
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { data: CIData };
      setCIData(body.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCI();
  }, [fetchCI]);

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleRefreshSuccess = useCallback(() => {
    void fetchCI();
  }, [fetchCI]);

  const checkMap = new Map<string, CheckResult>();
  if (ciData) {
    for (const check of ciData.checks) {
      checkMap.set(check.name, check);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">CI Checks</h1>
        <div className="flex items-center gap-4">
          <ActionButton
            url="/api/actions/refresh-checks"
            label="Run All Checks"
            loadingLabel="Running checks..."
            onSuccess={handleRefreshSuccess}
          />
          {ciData?.lastRun && (
            <span className="text-xs text-gray-500">Last checked {timeAgo(ciData.lastRun)}</span>
          )}
        </div>
      </div>

      {loading && !ciData && <p className="text-sm text-gray-500">Loading check results...</p>}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CHECK_NAMES.map((name) => (
          <CheckBadge
            key={name}
            name={name}
            result={checkMap.get(name)}
            expanded={expanded.has(name)}
            onToggle={() => toggleExpanded(name)}
          />
        ))}
      </div>
    </div>
  );
}
