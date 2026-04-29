import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useThreadStore } from '../stores/threadStore';
import { useSSE } from '../hooks/useSSE';
import { StaleIndicator } from '../components/StaleIndicator';
import { ProgressChart } from '../components/ProgressChart';
import { DependencyGraph } from '../components/DependencyGraph';
import { StatsBar } from '../components/roadmap/StatsBar';
import { FeatureTable } from '../components/roadmap/FeatureTable';
import { ClaimConfirmation } from '../components/roadmap/ClaimConfirmation';
import { AssignmentHistory } from '../components/roadmap/AssignmentHistory';
import { SSE_ENDPOINT } from '@shared/constants';
import { isRoadmapData } from '../utils/typeGuards';
import type {
  MilestoneProgress,
  DashboardFeature,
  ClaimResponse,
  RoadmapData,
} from '@shared/types';

function FilterBar({
  milestoneOptions,
  filterMilestone,
  setFilterMilestone,
  filterStatus,
  setFilterStatus,
  workableOnly,
  setWorkableOnly,
}: {
  milestoneOptions: string[];
  filterMilestone: string;
  setFilterMilestone: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  workableOnly: boolean;
  setWorkableOnly: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
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
        <option value="needs-human">Needs Human</option>
      </select>
      <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={workableOnly}
          onChange={(e) => setWorkableOnly(e.target.checked)}
          className="rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500/30"
        />
        Workable only
      </label>
    </div>
  );
}

const btnClass =
  'rounded bg-primary-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-400 border border-primary-500/20 hover:bg-primary-500 hover:text-white transition-all';

function RoadmapActionButton({ command, label }: { command: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        const thread = useThreadStore.getState().createThread('chat', {
          sessionId: crypto.randomUUID(),
          command,
        });
        navigate(`/t/${thread.id}`);
      }}
      className={btnClass}
    >
      {label}
    </button>
  );
}

function AddToRoadmapButton() {
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showDialog) inputRef.current?.focus();
  }, [showDialog]);

  const handleSubmit = () => {
    const text = description.trim();
    if (!text) return;
    const thread = useThreadStore.getState().createThread('chat', {
      sessionId: crypto.randomUUID(),
      command: 'harness:roadmap-add',
    });
    navigate(`/t/${thread.id}`);
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

const WORKFLOW_COMMANDS: Record<string, string> = {
  brainstorming: 'harness:brainstorming',
  planning: 'harness:planning',
  execution: 'harness:execution',
};

function RoadmapContent({
  milestones,
  features,
  data,
}: {
  milestones: MilestoneProgress[];
  features: DashboardFeature[];
  data: RoadmapData;
}) {
  const navigate = useNavigate();
  const [filterMilestone, setFilterMilestone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [workableOnly, setWorkableOnly] = useState(false);
  const [claimTarget, setClaimTarget] = useState<DashboardFeature | null>(null);
  const [identity, setIdentity] = useState<string | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);

  const milestoneOptions = milestones.map((m) => m.name);
  const hasBlockers = features.some((f) => f.blockedBy.length > 0);

  // Fetch identity on mount
  useEffect(() => {
    fetch('/api/identity')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.username) setIdentity(d.username);
      })
      .catch(() => {})
      .finally(() => setIdentityLoading(false));
  }, []);

  const handleClaim = useCallback((feature: DashboardFeature) => {
    setClaimTarget(feature);
  }, []);

  const handleClaimConfirm = useCallback(
    (response: ClaimResponse) => {
      setClaimTarget(null);
      const command = WORKFLOW_COMMANDS[response.workflow] ?? 'harness:execution';
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: crypto.randomUUID(),
        command,
      });
      navigate(`/t/${thread.id}`);
    },
    [navigate]
  );

  return (
    <div className="space-y-8">
      {/* Stats Bar */}
      <StatsBar data={data} />

      {/* Progress by Milestone */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Progress by Milestone
        </h2>
        <ProgressChart milestones={milestones} />
      </section>

      {/* Feature Table */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Features
          </h2>
          <FilterBar
            milestoneOptions={milestoneOptions}
            filterMilestone={filterMilestone}
            setFilterMilestone={setFilterMilestone}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            workableOnly={workableOnly}
            setWorkableOnly={setWorkableOnly}
          />
        </div>
        <div className="relative">
          <FeatureTable
            features={features}
            milestones={milestones}
            filterMilestone={filterMilestone}
            filterStatus={filterStatus}
            workableOnly={workableOnly}
            identity={identityLoading ? null : identity}
            onClaim={handleClaim}
          />
          {claimTarget && identity && (
            <ClaimConfirmation
              feature={claimTarget}
              identity={identity}
              onConfirm={handleClaimConfirm}
              onCancel={() => setClaimTarget(null)}
            />
          )}
        </div>
      </section>

      {/* Blocker Dependencies */}
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

      {/* Assignment History */}
      {data.assignmentHistory.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Assignment History
          </h2>
          <AssignmentHistory records={data.assignmentHistory} />
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
        <RoadmapContent
          milestones={roadmapData.milestones}
          features={roadmapData.features}
          data={roadmapData}
        />
      )}
    </div>
  );
}
