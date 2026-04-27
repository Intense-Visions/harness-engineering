import { useState, useEffect, useCallback, memo } from 'react';
import { KpiCard } from '../components/KpiCard';
import type { AdoptionSnapshot, SkillAdoptionSummary } from '@shared/types';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function successAccentClass(rate: number): string {
  if (rate >= 0.8) return 'text-emerald-400';
  if (rate >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

const SkillRow = memo(function SkillRow({ skill }: { skill: SkillAdoptionSummary }) {
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-2 px-3 font-mono text-xs text-gray-200">{skill.skill}</td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-200">{skill.invocations}</td>
      <td className={`py-2 px-3 text-right tabular-nums ${successAccentClass(skill.successRate)}`}>
        {formatRate(skill.successRate)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-400">
        {formatDuration(skill.avgDuration)}
      </td>
      <td className="py-2 px-3 text-right text-xs text-gray-500">{skill.lastUsed.slice(0, 10)}</td>
    </tr>
  );
});

function SkillsTable({ skills }: { skills: SkillAdoptionSummary[] }) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-sm text-gray-500">
          No adoption data yet. Skills will appear here after your next session.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
              Skill
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Invocations
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Success
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Avg Duration
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
              Last Used
            </th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <SkillRow key={s.skill} skill={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function fetchAdoption(): Promise<AdoptionSnapshot> {
  const res = await fetch('/api/adoption');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: AdoptionSnapshot };
  return body.data;
}

export function Adoption() {
  const [snapshot, setSnapshot] = useState<AdoptionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchAdoption();
      setSnapshot(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Adoption</h1>
        {snapshot && (
          <span className="text-xs text-gray-500">
            Generated {new Date(snapshot.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {loading && !snapshot && (
        <p className="text-sm text-gray-500">Loading adoption telemetry...</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {snapshot && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Summary
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KpiCard label="Total Invocations" value={snapshot.totalInvocations} />
              <KpiCard label="Unique Skills" value={snapshot.uniqueSkills} />
              <KpiCard label="Period" value={snapshot.period} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Top Skills
            </h2>
            <SkillsTable skills={snapshot.topSkills} />
          </section>
        </div>
      )}
    </div>
  );
}
