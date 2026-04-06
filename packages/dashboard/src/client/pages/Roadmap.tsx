import { useState } from 'react';
import { useSSE } from '../hooks/useSSE';
import { StaleIndicator } from '../components/StaleIndicator';
import { ProgressChart } from '../components/ProgressChart';
import { GanttChart } from '../components/GanttChart';
import { DependencyGraph } from '../components/DependencyGraph';
import { SSE_ENDPOINT } from '@shared/constants';
import { isRoadmapData } from '../utils/typeGuards';

export function Roadmap() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');
  const [filterMilestone, setFilterMilestone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const roadmap = data ? data.roadmap : null;

  const roadmapData = roadmap && isRoadmapData(roadmap) ? roadmap : null;
  const milestones = roadmapData?.milestones ?? [];
  const features = roadmapData?.features ?? [];

  const milestoneOptions = milestones.map((m) => m.name);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Roadmap</h1>
        <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream…</p>}

      {roadmap && !roadmapData && (
        <p className="text-sm text-red-400">{'error' in roadmap ? roadmap.error : 'Unavailable'}</p>
      )}

      {roadmapData && (
        <div className="space-y-10">
          {/* Progress chart */}
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Progress by Milestone
            </h2>
            <ProgressChart milestones={milestones} />
          </section>

          {/* Gantt */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Feature Timeline
              </h2>
              <div className="flex gap-2">
                <select
                  value={filterMilestone}
                  onChange={(e) => setFilterMilestone(e.target.value)}
                  className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 focus:outline-none"
                >
                  <option value="">All Milestones</option>
                  {milestoneOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 focus:outline-none"
                >
                  <option value="">Non-done</option>
                  <option value="in-progress">In Progress</option>
                  <option value="planned">Planned</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                  <option value="backlog">Backlog</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-4">
              <GanttChart
                features={features}
                filterMilestone={filterMilestone}
                filterStatus={filterStatus}
              />
            </div>
          </section>

          {/* Dependency graph (conditional) */}
          {features.some((f) => f.blockedBy.length > 0) && (
            <section>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
                Blocker Dependencies
              </h2>
              <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-4">
                <DependencyGraph features={features} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
