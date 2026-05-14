import { useParams, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { useThreadStore } from '../../stores/threadStore';
import { EmptyState } from './EmptyState';
import { ChatThreadView } from '../threads/ChatThreadView';
import { AttentionThreadView } from '../threads/AttentionThreadView';
import { AgentThreadView } from '../threads/AgentThreadView';
import { AnalysisThreadView } from '../threads/AnalysisThreadView';

// System page components
import { Health } from '../../pages/Health';
import { Graph } from '../../pages/Graph';
import { Impact } from '../../pages/Impact';
import { DecayTrends } from '../../pages/DecayTrends';
import { Traceability } from '../../pages/Traceability';
import { Orchestrator } from '../../pages/Orchestrator';
import { Maintenance } from '../../pages/Maintenance';
import { Streams } from '../../pages/Streams';
import { Roadmap } from '../../pages/Roadmap';
import { Adoption } from '../../pages/Adoption';
import { Attention } from '../../pages/Attention';
import { Analyze } from '../../pages/Analyze';
import { Tokens } from '../../pages/Tokens';
import type { SystemPage } from '../../types/thread';
import type { ComponentType } from 'react';

const SYSTEM_PAGE_COMPONENTS: Record<string, ComponentType> = {
  health: Health,
  graph: Graph,
  impact: Impact,
  decay: DecayTrends,
  traceability: Traceability,
  orchestrator: Orchestrator,
  maintenance: Maintenance,
  streams: Streams,
  roadmap: Roadmap,
  adoption: Adoption,
  tokens: Tokens,
  // Legacy: these are now thread types but kept for /s/ URL compat
  attention: Attention,
  analyze: Analyze,
};

function ThreadPlaceholder({ type, title }: { type: string; title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="rounded-xl border border-white/[0.06] bg-neutral-surface/30 px-8 py-6 backdrop-blur-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted mb-2">
          {type} thread
        </p>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-xs text-neutral-muted mt-2">
          Thread view will be implemented in upcoming phases.
        </p>
      </div>
    </div>
  );
}

/** Route: /t/:threadId */
export function ThreadRoute() {
  const { threadId } = useParams<{ threadId: string }>();
  const thread = useThreadStore((s) => (threadId ? s.threads.get(threadId) : undefined));
  const hydrated = useThreadStore((s) => s.hydrated);
  // Keep activeThreadId in sync with the route
  useEffect(() => {
    if (threadId) useThreadStore.getState().setActiveThread(threadId);
  }, [threadId]);

  if (!thread && !hydrated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-neutral-muted">
        <p className="text-xs animate-pulse">Loading thread…</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-neutral-muted">
        <p className="text-sm">Thread not found.</p>
        <p className="text-xs mt-1">It may have been closed or does not exist yet.</p>
      </div>
    );
  }

  switch (thread.type) {
    case 'chat':
      return <ChatThreadView thread={thread} />;
    case 'attention':
      return <AttentionThreadView thread={thread} />;
    case 'agent':
      return <AgentThreadView thread={thread} />;
    case 'analysis':
      return <AnalysisThreadView thread={thread} />;
    default:
      return <ThreadPlaceholder type={thread.type} title={thread.title} />;
  }
}

/** Route: /s/:systemPage */
export function SystemRoute() {
  const { systemPage } = useParams<{ systemPage: string }>();
  if (!systemPage) return <EmptyState />;

  const PageComponent = SYSTEM_PAGE_COMPONENTS[systemPage as SystemPage];
  if (!PageComponent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-neutral-muted">
        <p className="text-sm">Unknown system page: {systemPage}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-7xl">
        <PageComponent />
      </div>
    </div>
  );
}

/** Route: / */
export function HomeRoute() {
  const lastThreadId = useThreadStore((s) => s.lastThreadId);
  const thread = useThreadStore((s) => (lastThreadId ? s.threads.get(lastThreadId) : undefined));
  const navigate = useNavigate();

  // If we have a last thread that still exists, redirect to it
  useEffect(() => {
    if (thread && lastThreadId) {
      navigate(`/t/${lastThreadId}`, { replace: true });
    }
  }, [thread, lastThreadId, navigate]);

  // Otherwise show the empty state
  if (!thread) return <EmptyState />;

  // Render nothing briefly while the redirect happens
  return null;
}
