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
  { page: 'health', label: 'Health', route: '/s/health' },
  { page: 'graph', label: 'Graph', route: '/s/graph' },
  { page: 'impact', label: 'Impact', route: '/s/impact' },
  { page: 'decay', label: 'Decay Trends', route: '/s/decay' },
  { page: 'traceability', label: 'Traceability', route: '/s/traceability' },
  { page: 'orchestrator', label: 'Orchestrator', route: '/s/orchestrator' },
  { page: 'maintenance', label: 'Maintenance', route: '/s/maintenance' },
  { page: 'streams', label: 'Streams', route: '/s/streams' },
  { page: 'roadmap', label: 'Roadmap', route: '/s/roadmap' },
  { page: 'adoption', label: 'Adoption', route: '/s/adoption' },
  { page: 'tokens', label: 'API Tokens', route: '/s/tokens' },
  { page: 'webhooks', label: 'Webhooks', route: '/s/webhooks' },
  // Phase 5: prompt-cache hit/miss insight surface.
  { page: 'insights-cache', label: 'Prompt Cache', route: '/s/insights-cache' },
] as const;

export type SystemPage = (typeof SYSTEM_PAGES)[number]['page'];
