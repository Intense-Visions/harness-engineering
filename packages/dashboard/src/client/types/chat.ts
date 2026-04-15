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

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  blocks: ContentBlock[];
}

export type ChatMessage = UserMessage | AssistantMessage;
