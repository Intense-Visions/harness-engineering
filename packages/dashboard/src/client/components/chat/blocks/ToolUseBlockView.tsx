import { useState } from 'react';
import Markdown from 'react-markdown';
import { motion } from 'framer-motion';
import remarkGfm from 'remark-gfm';
import type { ToolUseBlock } from '../../../types/chat';
import { formatToolArgs } from './format-tool-args';

export function ToolUseBlockView({
  block,
  forceResult,
  isPending = false,
  attribution,
}: {
  block: ToolUseBlock;
  forceResult?: string;
  isPending?: boolean;
  attribution?: string;
}) {
  const [isOpen, setIsOpen] = useState(() => {
    const t = block.tool.toLowerCase();
    return (
      t.includes('interaction') ||
      t.includes('question') ||
      t.includes('ask') ||
      t.includes('human')
    );
  });
  const result = block.result || forceResult;
  const hasResult = result !== undefined;

  const isTodoWrite = block.tool.toLowerCase().includes('todo');
  let todos: { content: string; status: string; activeForm?: string }[] | null = null;
  if (isTodoWrite && block.args) {
    try {
      const parsed = JSON.parse(block.args);
      if (parsed.todos && Array.isArray(parsed.todos)) {
        todos = parsed.todos;
      }
    } catch {
      // ignore
    }
  }

  const _hasExpandedContent = hasResult || todos !== null;

  return (
    <div className="relative overflow-hidden rounded border border-neutral-border/50 bg-neutral-surface/50 backdrop-blur-sm transition-all duration-200">
      {isPending && !hasResult && (
        <motion.div
          initial={{ top: '-10%' }}
          animate={{ top: '110%' }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="absolute left-0 right-0 h-4 bg-gradient-to-b from-transparent via-secondary-400/20 to-transparent pointer-events-none z-10"
        />
      )}

      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none relative z-20 hover:bg-white/5 active:bg-white/10 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          className="text-[9px] text-secondary-400 font-bold"
        >
          &#9654;
        </motion.span>
        <span className="text-[10px] font-black tracking-[0.2em] text-neutral-text capitalize truncate max-w-[300px]">
          {(() => {
            if (block.tool.toLowerCase() === 'bash' && block.args) {
              try {
                const parsed = JSON.parse(block.args);
                if (parsed.description) return parsed.description;
              } catch {
                // ignore
              }
            }
            return block.tool.replace(/_/g, ' ');
          })()}
        </span>
        {block.args && (
          <span className="truncate font-mono text-[9px] text-neutral-muted/60" title={block.args}>
            {formatToolArgs(block.tool, block.args)}
          </span>
        )}
        {attribution && (
          <span className="ml-2 inline-flex items-center gap-1 rounded bg-secondary-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-secondary-400 border border-secondary-400/20">
            {attribution}
          </span>
        )}
        {hasResult && (
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                block.isError
                  ? 'text-red-400 border-red-400/30 bg-red-400/5'
                  : 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5'
              }`}
            >
              {block.isError ? 'ERR' : 'OK'}
            </span>
          </div>
        )}
      </div>

      {isOpen && hasResult && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-neutral-border/50 bg-neutral-bg/50 relative z-20 px-3 py-2"
        >
          <div
            className={`max-h-[60vh] overflow-auto prose prose-invert prose-xs selection:bg-secondary-400/20 whitespace-pre-wrap ${
              block.isError ? 'text-red-400' : ''
            }`}
          >
            <Markdown remarkPlugins={[remarkGfm]}>{result}</Markdown>

            {hasResult && !isPending && block.tool.toLowerCase().includes('emit_interaction') && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-border/50 pt-3 not-prose">
                {(() => {
                  try {
                    const payload = JSON.parse(block.args || '{}');
                    const dispatchSend = (text: string) => {
                      window.dispatchEvent(new CustomEvent('chat-action-send', { detail: text }));
                    };

                    if (payload.type === 'question') {
                      const els = [];

                      if (payload.question?.options && payload.question.options.length > 0) {
                        const { options, recommendation } = payload.question;
                        if (recommendation !== undefined && options[recommendation.optionIndex]) {
                          els.push(
                            <button
                              key="approve-rec"
                              onClick={() =>
                                dispatchSend(
                                  `Approve recommendation: ${options[recommendation.optionIndex].label}`
                                )
                              }
                              className="rounded bg-primary-500 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-primary-400 transition-colors"
                            >
                              Approve Recommendation (
                              {String.fromCharCode(65 + recommendation.optionIndex)})
                            </button>
                          );
                        }
                        options.forEach((opt: { label?: string } | string, i: number) => {
                          if (recommendation?.optionIndex === i) return;
                          const label = typeof opt === 'string' ? opt : opt.label;
                          els.push(
                            <button
                              key={`opt-${i}`}
                              onClick={() =>
                                dispatchSend(
                                  `Approve option ${String.fromCharCode(65 + i)}: ${label}`
                                )
                              }
                              className="rounded bg-neutral-surface/60 border border-neutral-border hover:bg-white/5 px-3 py-1.5 text-[10px] font-medium text-neutral-text transition-colors"
                            >
                              Option {String.fromCharCode(65 + i)}
                            </button>
                          );
                        });
                      }

                      els.push(
                        <button
                          key="continue-btn"
                          onClick={() => dispatchSend('Continue')}
                          className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 text-[10px] font-bold hover:bg-emerald-500/30 transition-colors"
                        >
                          Continue
                        </button>
                      );

                      return els;
                    }

                    if (payload.type === 'confirmation') {
                      return (
                        <>
                          <button
                            onClick={() => dispatchSend('Yes, proceed')}
                            className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                          >
                            Confirm & Proceed
                          </button>
                          <button
                            onClick={() => dispatchSend('No, stop')}
                            className="rounded bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-1.5 text-xs font-bold hover:bg-red-500/30 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      );
                    }

                    if (payload.type === 'transition' && payload.transition?.requiresConfirmation) {
                      return (
                        <>
                          <button
                            onClick={() =>
                              dispatchSend(`Yes, proceed to ${payload.transition.suggestedNext}`)
                            }
                            className="rounded bg-primary-500 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-primary-400 transition-colors"
                          >
                            Proceed to {payload.transition.suggestedNext}
                          </button>
                          <button
                            onClick={() => dispatchSend('No, stay here')}
                            className="rounded bg-neutral-surface/60 border border-neutral-border hover:bg-white/5 px-4 py-1.5 text-[10px] font-medium text-neutral-text transition-colors"
                          >
                            Stay in {payload.transition.completedPhase}
                          </button>
                        </>
                      );
                    }

                    if (payload.type === 'batch') {
                      return (
                        <>
                          <button
                            onClick={() => dispatchSend('Approve all decisions')}
                            className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                          >
                            Approve All
                          </button>
                          <button
                            onClick={() => dispatchSend('Reject batch')}
                            className="rounded bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-1.5 text-xs font-bold hover:bg-red-500/30 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      );
                    }
                  } catch {
                    // Parse failed, UI untouched
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
