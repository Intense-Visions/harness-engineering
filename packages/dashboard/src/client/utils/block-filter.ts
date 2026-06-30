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
 * Apply a TaskCreate block: register a new todo keyed by an index-based ID.
 */
function applyTaskCreate(
  tb: ToolUseBlock,
  todoMap: Map<string, TodoItem>,
  indexBase: number
): void {
  if (!tb.args) return;
  try {
    const args = JSON.parse(tb.args) as { subject?: string; description?: string };
    const id = `task-${indexBase + todoMap.size + 1}`;
    if (args.subject) {
      todoMap.set(id, { id, text: args.subject, completed: false });
    }
  } catch {
    // skip malformed args
  }
}

/**
 * Apply a TaskUpdate block: mark a matching todo as completed (by index-based ID).
 */
function applyTaskUpdate(tb: ToolUseBlock, todoMap: Map<string, TodoItem>): void {
  if (!tb.args) return;
  try {
    const args = JSON.parse(tb.args) as { taskId?: string; status?: string };
    if (args.taskId && args.status === 'completed') {
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

/**
 * Apply a TodoWrite block: upsert every todo carried in the args payload.
 */
function applyTodoWrite(tb: ToolUseBlock, todoMap: Map<string, TodoItem>): void {
  if (!tb.args) return;
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

    if (tb.tool === 'TaskCreate') applyTaskCreate(tb, todoMap, todos.length);
    if (tb.tool === 'TaskUpdate') applyTaskUpdate(tb, todoMap);
    if (tb.tool === 'TodoWrite') applyTodoWrite(tb, todoMap);
  }

  return [...todoMap.values()];
}
