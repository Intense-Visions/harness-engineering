import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ToolUseBlock } from '../../../types/chat';
import { ToolUseBlockView } from './ToolUseBlockView';

export function TodoBlockView({ block }: { block: ToolUseBlock }) {
  let todos: { content: string; status: string; activeForm?: string }[] | null = null;
  if (block.args) {
    try {
      const parsed = JSON.parse(block.args);
      if (parsed.todos && Array.isArray(parsed.todos)) {
        todos = parsed.todos;
      }
    } catch {
      // ignore
    }
  }

  if (!todos) {
    return <ToolUseBlockView block={block} isPending={false} />;
  }

  return (
    <div className="my-3 rounded border border-primary-500/20 bg-primary-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary-500/10 bg-primary-500/10">
        <svg
          className="w-3 h-3 text-primary-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <span className="font-bold tracking-widest uppercase text-[10px] text-primary-300">
          Todo Plan
        </span>
        {block.isError && <span className="ml-auto text-[10px] text-red-400">Error Parsing</span>}
      </div>

      <div className="flex flex-col p-3 gap-2">
        {todos.map((todo, idx) => {
          const isCompleted = todo.status === 'completed' || todo.status === 'done';
          const isInProgress = todo.status === 'in_progress';
          return (
            <div key={idx} className="flex items-start gap-3 text-sm">
              <div className="pt-1 shrink-0">
                {isCompleted ? (
                  <div className="h-3.5 w-3.5 rounded bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
                    <svg
                      className="w-2.5 h-2.5 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                ) : isInProgress ? (
                  <div className="h-3.5 w-3.5 rounded bg-secondary-400/20 border border-secondary-400 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-secondary-400 animate-pulse" />
                  </div>
                ) : (
                  <div className="h-3.5 w-3.5 rounded border border-neutral-border bg-neutral-surface/50" />
                )}
              </div>
              <div className="flex flex-col leading-snug pt-[1px]">
                <span
                  className={`text-neutral-text text-[13px] ${isCompleted ? 'line-through text-neutral-muted' : ''}`}
                >
                  {todo.content}
                </span>
                {todo.activeForm && isInProgress && (
                  <span className="text-xs text-secondary-400 mt-1 font-mono">
                    ▶ {todo.activeForm}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {block.result && (
          <div className="mt-2 pt-2 border-t border-primary-500/10 text-xs text-neutral-muted prose prose-invert prose-xs whitespace-pre-wrap">
            <Markdown remarkPlugins={[remarkGfm]}>{block.result}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
