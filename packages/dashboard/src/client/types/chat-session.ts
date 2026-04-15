import type { ChatMessage } from './chat';

export interface ChatSession {
  sessionId: string;            // Claude Code session ID
  command: string | null;       // Skill that seeded it, e.g. "harness:security-scan"
  interactionId: string | null; // Link to escalated interaction if applicable
  label: string;                // User-visible name
  createdAt: string;            // ISO timestamp
  lastActiveAt: string;         // Updated on each message
  artifacts: string[];          // Paths to specs, plans, etc. produced during session
  status: 'active' | 'idle' | 'completed';
  messages: ChatMessage[];      // Cached message history for UI state
  input: string;                // Unsent input state
}
