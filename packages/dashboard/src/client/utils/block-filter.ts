import type { ContentBlock, ToolUseBlock } from '../types/chat';
import type { TodoItem } from '../components/panel/TodoSection';

const TASK_TOOLS = new Set([
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
  'TodoWrite',
]);

/**
 * Returns true if a block should be rendered in the message stream.
 * Status blocks and task-related tool_use blocks are filtered out — they
 * go to the context panel instead.
 */
export function isStreamBlock(block: ContentBlock): boolean {
  if (block.kind === 'status') return false;
  if (block.kind === 'tool_use' && TASK_TOOLS.has(block.tool)) return false;
  return true;
}

/**
 * Filter an array of content blocks to only those that belong in the stream.
 */
export function filterStreamBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.filter(isStreamBlock);
}

/**
 * Extract todo items from task-related tool_use blocks.
 * Parses TaskCreate args for subjects and TaskUpdate results for status changes.
 */
export function extractTodosFromBlocks(blocks: ContentBlock[]): TodoItem[] {
  const todos: TodoItem[] = [];
  const todoMap = new Map<string, TodoItem>();

  for (const block of blocks) {
    if (block.kind !== 'tool_use') continue;
    const tb = block as ToolUseBlock;

    if (tb.tool === 'TaskCreate' && tb.args) {
      try {
        const args = JSON.parse(tb.args) as { subject?: string; description?: string };
        const id = `task-${todos.length + todoMap.size + 1}`;
        if (args.subject) {
          todoMap.set(id, { id, text: args.subject, completed: false });
        }
      } catch {
        // skip malformed args
      }
    }

    if (tb.tool === 'TaskUpdate' && tb.args) {
      try {
        const args = JSON.parse(tb.args) as { taskId?: string; status?: string };
        if (args.taskId && args.status === 'completed') {
          // Mark matching todo as completed (by index-based ID)
          const key = `task-${args.taskId}`;
          const existing = todoMap.get(key);
          if (existing) {
            todoMap.set(key, { ...existing, completed: true });
          }
        }
      } catch {
        // skip malformed args
      }
    }

    if (tb.tool === 'TodoWrite' && tb.args) {
      try {
        const args = JSON.parse(tb.args) as {
          todos?: Array<{ id: string; content: string; status: string }>;
        };
        if (args.todos) {
          for (const t of args.todos) {
            todoMap.set(t.id, {
              id: t.id,
              text: t.content,
              completed: t.status === 'completed',
            });
          }
        }
      } catch {
        // skip malformed args
      }
    }
  }

  return [...todoMap.values()];
}
