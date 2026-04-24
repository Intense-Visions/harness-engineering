import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useChatPanel } from '../hooks/useChatPanel';
import { useSSE } from '../hooks/useSSE';
import { StaleIndicator } from '../components/StaleIndicator';
import { ProgressChart } from '../components/ProgressChart';
import { GanttChart } from '../components/GanttChart';
import { DependencyGraph } from '../components/DependencyGraph';
import { SSE_ENDPOINT } from '@shared/constants';
import { isRoadmapData } from '../utils/typeGuards';
import type { MilestoneProgress, DashboardFeature } from '@shared/types';

function FilterBar({
  milestoneOptions,
  filterMilestone,
  setFilterMilestone,
  filterStatus,
  setFilterStatus,
}: {
  milestoneOptions: string[];
  filterMilestone: string;
  setFilterMilestone: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
}) {
  return (
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
  );
}

const btnClass =
  'rounded bg-primary-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-400 border border-primary-500/20 hover:bg-primary-500 hover:text-white transition-all';

function RoadmapActionButton({ command, label }: { command: string; label: string }) {
  const [, setSearchParams] = useSearchParams();
  const { open: openChat } = useChatPanel();
  return (
    <button
      onClick={() => {
        setSearchParams({ command });
        openChat();
      }}
      className={btnClass}
    >
      {label}
    </button>
  );
}

function AddToRoadmapButton() {
  const [, setSearchParams] = useSearchParams();
  const { open: openChat } = useChatPanel();
  const [showDialog, setShowDialog] = useState(false);
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showDialog) inputRef.current?.focus();
  }, [showDialog]);

  const handleSubmit = () => {
    const text = description.trim();
    if (!text) return;
    setSearchParams({ command: 'harness:roadmap-add', commandArgs: text });
    openChat();
    setShowDialog(false);
    setDescription('');
  };

  return (
    <div className="relative">
      <button onClick={() => setShowDialog(!showDialog)} className={btnClass}>
        Add
      </button>
      {showDialog && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            What should be added?
          </label>
          <input
            ref={inputRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') {
                setShowDialog(false);
                setDescription('');
              }
            }}
            placeholder="e.g. Dark mode support"
            className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-primary-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowDialog(false);
                setDescription('');
              }}
              className="rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!description.trim()}
              className="rounded bg-primary-500 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-40 hover:bg-primary-400 transition-colors"
            >
              Go
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoadmapContent({
  milestones,
  features,
}: {
  milestones: MilestoneProgress[];
  features: DashboardFeature[];
}) {
  const [filterMilestone, setFilterMilestone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const milestoneOptions = milestones.map((m) => m.name);
  const hasBlockers = features.some((f) => f.blockedBy.length > 0);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Progress by Milestone
        </h2>
        <ProgressChart milestones={milestones} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Feature Timeline
          </h2>
          <FilterBar
            milestoneOptions={milestoneOptions}
            filterMilestone={filterMilestone}
            setFilterMilestone={setFilterMilestone}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
          />
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-4">
          <GanttChart
            features={features}
            filterMilestone={filterMilestone}
            filterStatus={filterStatus}
          />
        </div>
      </section>

      {hasBlockers && (
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
  );
}

export function Roadmap() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');

  const roadmap = data ? data.roadmap : null;
  const roadmapData = roadmap && isRoadmapData(roadmap) ? roadmap : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Roadmap</h1>
        <div className="flex items-center gap-3">
          <RoadmapActionButton command="harness:roadmap-pilot" label="Pilot" />
          <RoadmapActionButton command="harness:roadmap-sync" label="Sync" />
          <AddToRoadmapButton />
          <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
        </div>
      </div>

      {!data && !error && <p className="text-sm text-gray-500">Connecting to data stream…</p>}

      {roadmap && !roadmapData && (
        <p className="text-sm text-red-400">{'error' in roadmap ? roadmap.error : 'Unavailable'}</p>
      )}

      {roadmapData && (
        <RoadmapContent milestones={roadmapData.milestones} features={roadmapData.features} />
      )}
    </div>
  );
}
