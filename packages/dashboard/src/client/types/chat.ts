export * from './chat-session';

export interface ThinkingBlock {
  kind: 'thinking';
  text: string;
}

export interface ToolUseBlock {
  kind: 'tool_use';
  tool: string;
  args?: string;
  result?: string;
  isError?: boolean;
}

export interface StatusBlock {
  kind: 'status';
  text: string;
}

export interface TextBlock {
  kind: 'text';
  text: string;
}

export type ContentBlock = ThinkingBlock | ToolUseBlock | StatusBlock | TextBlock;

/* ── Panel events — mutable session state routed to ContextPanel, not MessageStream ── */

export interface TodoUpdate {
  kind: 'todo_update';
  todos: Array<{ id: string; text: string; done: boolean }>;
}

export interface StatusUpdate {
  kind: 'status_update';
  phase: string | null;
  skill: string | null;
  startedAt: number | null;
}

export interface ArtifactUpdate {
  kind: 'artifact_update';
  artifacts: Array<{ path: string; action: 'created' | 'modified' }>;
}

export interface ContextSourceUpdate {
  kind: 'context_source_update';
  sources: Array<{ label: string; url: string }>;
}

export type PanelEvent = TodoUpdate | StatusUpdate | ArtifactUpdate | ContextSourceUpdate;

/* ── Messages ── */

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  blocks: ContentBlock[];
  panelEvents?: PanelEvent[];
}

export type ChatMessage = UserMessage | AssistantMessage;
