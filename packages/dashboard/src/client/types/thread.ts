import type { InteractionContext } from './orchestrator';

export type ThreadType = 'chat' | 'attention' | 'analysis' | 'agent' | 'system';

export type ThreadStatus = 'pending' | 'active' | 'completed' | 'dismissed';

export type ThreadAvatar = 'user' | 'organism' | 'alert' | 'system';

export interface ChatMeta {
  sessionId: string;
  command: string | null;
}

export interface AttentionMeta {
  interactionId: string;
  issueId: string;
  reasons: string[];
  context: InteractionContext | null;
}

export interface AnalysisMeta {
  analysisTitle: string;
  description: string;
  labels: string[];
}

export interface AgentMeta {
  issueId: string;
  identifier: string;
  phase: string;
  issueTitle: string;
  issueDescription: string | null;
  startedAt: string;
  backendName: string | null;
}

export interface SystemMeta {
  page: string;
}

export type ThreadMeta = ChatMeta | AttentionMeta | AnalysisMeta | AgentMeta | SystemMeta;

export interface Thread {
  id: string;
  type: ThreadType;
  title: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  avatar: ThreadAvatar;
  unread: boolean;
  meta: ThreadMeta;
}

export const SYSTEM_PAGES = [
  // Spec 534 — five-signal default landing panel.
  { page: 'signals', label: 'Signals', route: '/s/signals' },
  { page: 'health', label: 'Health', route: '/s/health' },
  { page: 'graph', label: 'Graph', route: '/s/graph' },
  { page: 'impact', label: 'Impact', route: '/s/impact' },
  { page: 'decay', label: 'Decay Trends', route: '/s/decay' },
  { page: 'traceability', label: 'Traceability', route: '/s/traceability' },
  // Roadmap #710 — UAT sign-off front door (client / pm-ba lanes).
  { page: 'signoff', label: 'Sign-off', route: '/s/signoff' },
  { page: 'orchestrator', label: 'Orchestrator', route: '/s/orchestrator' },
  // Live work-in-flight kanban — orchestrator/parallel-coordinator state as lanes.
  { page: 'kanban', label: 'Work in Flight', route: '/s/kanban' },
  { page: 'maintenance', label: 'Maintenance', route: '/s/maintenance' },
  { page: 'streams', label: 'Streams', route: '/s/streams' },
  { page: 'roadmap', label: 'Roadmap', route: '/s/roadmap' },
  { page: 'adoption', label: 'Adoption', route: '/s/adoption' },
  { page: 'tokens', label: 'API Tokens', route: '/s/tokens' },
  { page: 'webhooks', label: 'Webhooks', route: '/s/webhooks' },
  // Phase 5: prompt-cache hit/miss insight surface.
  { page: 'insights-cache', label: 'Prompt Cache', route: '/s/insights-cache' },
  // Hermes Phase 4 — skill proposal review queue.
  { page: 'proposals', label: 'Proposals', route: '/s/proposals' },
  // Spec B Phase 7 — granular task routing observability panel.
  { page: 'routing', label: 'Routing', route: '/s/routing' },
  // LMLM Phase 8 — local model lifecycle operator panel.
  { page: 'local-models', label: 'Local Models', route: '/s/local-models' },
] as const;

export type SystemPage = (typeof SYSTEM_PAGES)[number]['page'];
