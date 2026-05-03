import React, { useState, useEffect, useRef, useMemo } from 'react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import type {
  ContentBlock,
  ThinkingBlock,
  ToolUseBlock,
  StatusBlock,
  TextBlock,
} from '../../types/chat';
import { NeuralOrganism } from './NeuralOrganism';
import { isLogOutput, computeBlockSegments, segmentKey, type BlockSegment } from './block-segments';
import { AdviseSkillsView, parseAdviseSkillsResult } from './AdviseSkillsView';
import { FindingsView, parseFindingsResult } from './FindingsView';
import { GraphImpactView, parseGraphImpactResult } from './GraphImpactView';

const PROCESSING_PHRASES = [
  'Thinking deeply…',
  'Analyzing the codebase…',
  'Connecting the dots…',
  'Weaving through the code…',
  'Exploring possibilities…',
  'Building a mental model…',
  'Following the thread…',
  'Mapping dependencies…',
  'Tracing the logic…',
  'Piecing it together…',
  'Diving into the details…',
  'Reasoning through options…',
  'Scanning for patterns…',
  'Synthesizing insights…',
  'Crafting a response…',
  'Running the numbers…',
  'Almost there…',
  'Working through it…',
  'Processing your request…',
  'Engineering a solution…',
];

/**
 * ─── STREAMING INDICATOR ───
 *
 * The NeuralOrganism radiates energy while processing. Activity bars
 * emanate outward from the creature, and a bioluminescent glow field
 * pulses behind it. The composition should feel like the creature is
 * *working* — alive, focused, radiating.
 */

/** Activity bars — radiate outward from the organism with staggered organic timing */
function ActivityBar({ index, total }: { index: number; total: number }) {
  const centerFactor = 1 - Math.abs(index - total / 2) / (total / 2);
  const maxHeight = 0.4 + centerFactor * 0.6;
  const baseHeight = 0.1 + centerFactor * 0.1;
  const duration = 1.2 + (1 - centerFactor) * 2;
  const opacity = 0.3 + centerFactor * 0.5;

  return (
    <motion.div
      animate={{
        scaleY: [baseHeight, maxHeight, baseHeight * 1.3, maxHeight * 0.7, baseHeight],
        opacity: [opacity * 0.6, opacity, opacity * 0.7, opacity * 0.9, opacity * 0.6],
      }}
      transition={{
        duration,
        repeat: Infinity,
        delay: index * 0.08,
        ease: 'easeInOut',
      }}
      className="w-[1.5px] h-5 rounded-full origin-bottom"
      style={{
        background: `linear-gradient(to top, rgba(139,92,246,0.8), rgba(34,211,238,0.6))`,
      }}
    />
  );
}

function StreamingIndicator() {
  const [phraseIndex, setPhraseIndex] = useState(() =>
    Math.floor(Math.random() * PROCESSING_PHRASES.length)
  );
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(
      () => {
        setPhraseIndex((prev) => {
          let next: number;
          do {
            next = Math.floor(Math.random() * PROCESSING_PHRASES.length);
          } while (next === prev && PROCESSING_PHRASES.length > 1);
          return next;
        });
      },
      4500 + Math.random() * 2000
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative flex items-center gap-4 py-5 px-4"
    >
      {/* Ambient glow field behind organism */}
      <motion.div
        className="absolute left-0 top-1/2 w-20 h-20 -translate-x-1/4 -translate-y-1/2 rounded-full pointer-events-none"
        animate={{
          opacity: [0.05, 0.1, 0.07, 0.09, 0.05],
          scale: [0.95, 1.08, 0.98, 1.04, 0.95],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(79,70,229,0.08) 50%, transparent 70%)',
          filter: 'blur(12px)',
        }}
      />

      {/* The creature — gentle hover */}
      <motion.div
        animate={{ y: [0, -2, 1, -1.5, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="shrink-0 relative z-10"
      >
        <NeuralOrganism size={80} />
      </motion.div>

      {/* Activity bars + text — connected composition */}
      <div className="relative flex-1 min-w-0 flex items-center h-10">
        {/* Activity bars — ghostly, behind text */}
        <div className="absolute inset-0 flex items-end justify-start gap-[2.5px] opacity-[0.15] pointer-events-none overflow-hidden blur-[0.5px]">
          {Array.from({ length: 20 }).map((_, i) => (
            <ActivityBar key={i} index={i} total={20} />
          ))}
        </div>

        {/* Phrase + elapsed */}
        <div className="relative z-10 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={phraseIndex}
              initial={{ opacity: 0, x: -4, filter: 'blur(3px)' }}
              animate={{ opacity: 0.9, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 4, filter: 'blur(2px)' }}
              transition={{ duration: 0.4 }}
              className="text-[11px] font-semibold tracking-[0.08em] text-neutral-muted uppercase leading-none"
            >
              {PROCESSING_PHRASES[phraseIndex]}
            </motion.span>
          </AnimatePresence>
          <div className="h-3.5 flex items-center mt-1">
            {elapsed > 2 && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                className="text-[8px] font-mono text-neutral-muted/60 tabular-nums tracking-[0.15em]"
              >
                T+{formatElapsed(elapsed)}
              </motion.span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ThinkingBlockView({ block }: { block: ThinkingBlock }) {
  return (
    <details className="rounded border border-neutral-border/50 bg-neutral-surface/50 backdrop-blur-sm group">
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-neutral-muted select-none flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-secondary-400 group-open:animate-pulse" />
        Thinking...
      </summary>
      <div className="border-t border-neutral-border/50 px-3 py-2">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-muted">
          {block.text}
        </p>
      </div>
    </details>
  );
}

function formatToolArgs(tool: string, args?: string) {
  if (!args) return '';
  const toolLower = tool.toLowerCase();
  try {
    const parsed = JSON.parse(args);
    if (toolLower.includes('todo') && parsed.todos && Array.isArray(parsed.todos)) {
      return `Updating ${parsed.todos.length} tasks`;
    }
    if (toolLower === 'bash' && (parsed.command || parsed.args)) {
      const cmd = parsed.command || parsed.args;
      // If we have a description, the command itself is now the "args preview"
      return cmd.replace(/cd\s+("[^"]+"|'[^']+'|[^\s]+)\s*&&\s*/g, '').slice(0, 100);
    }
    if (toolLower === 'agent' || toolLower === 'subagent' || parsed.subagent_type) {
      const type = parsed.subagent_type || parsed.type;
      if (type && parsed.description) {
        return `${type}: ${parsed.description}`.slice(0, 100);
      }
      if (parsed.description) {
        return parsed.description.slice(0, 100);
      }
    }
    if (parsed.path || parsed.file_path || parsed.filePath) {
      const p = parsed.path || parsed.file_path || parsed.filePath;
      return p.split('/').slice(-2).join('/');
    }
    return JSON.stringify(parsed).slice(0, 100);
  } catch {
    return args.slice(0, 100);
  }
}

function ToolUseBlockView({
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

function AgentBlockView({ block, children }: { block: ToolUseBlock; children?: React.ReactNode }) {
  let parsedArgs: Record<string, string | undefined> = {};
  if (block.args) {
    try {
      parsedArgs = JSON.parse(block.args);
    } catch {
      // ignore
    }
  }

  const toolLower = block.tool.toLowerCase();
  const isSkill = toolLower === 'skill' || toolLower.startsWith('harness:');
  const containerClasses = isSkill
    ? 'border-emerald-400/20 bg-emerald-400/5'
    : 'border-secondary-400/20 bg-secondary-400/5';

  const headerClasses = isSkill
    ? 'border-emerald-400/10 bg-emerald-400/10'
    : 'border-secondary-400/10 bg-secondary-400/10';

  const iconClasses = isSkill ? 'text-emerald-400' : 'text-secondary-400';
  const textTitleClasses = isSkill ? 'text-emerald-300' : 'text-secondary-300';
  const textRunningClasses = isSkill ? 'text-emerald-400' : 'text-secondary-400';
  const borderDescClasses = isSkill ? 'border-emerald-400/10' : 'border-secondary-400/10';

  const titleText = isSkill
    ? `Skill: ${parsedArgs.skill || (toolLower.startsWith('harness:') ? block.tool.split(':')[1] : 'Execution')}`
    : `Subagent: ${parsedArgs.subagent_type || parsedArgs.type || 'Execution'}`;

  const mainDesc = isSkill ? undefined : parsedArgs.description;
  const promptText = isSkill ? parsedArgs.args : parsedArgs.prompt;

  return (
    <div className={`my-3 rounded border ${containerClasses} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${headerClasses}`}>
        <svg
          className={`w-3 h-3 ${iconClasses}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isSkill ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          )}
        </svg>
        <span className={`font-bold tracking-widest uppercase text-[10px] ${textTitleClasses}`}>
          {titleText}
        </span>
        {!block.result && !block.isError && (
          <span className={`ml-auto text-[10px] ${textRunningClasses} animate-pulse`}>
            Running...
          </span>
        )}
        {block.isError && <span className="ml-auto text-[10px] text-red-400">Error</span>}
      </div>

      <div className="flex flex-col p-3 gap-2">
        {mainDesc && <div className="text-[13px] font-bold text-neutral-text">{mainDesc}</div>}
        {promptText && (
          <div className="text-xs text-neutral-muted bg-neutral-surface/40 p-2 rounded border border-neutral-border/50 whitespace-pre-wrap font-mono leading-relaxed mt-1 overflow-x-auto">
            {promptText}
          </div>
        )}
        {block.result &&
          (() => {
            const advise = parseAdviseSkillsResult(block.result);
            if (advise) {
              return (
                <div
                  className={`mt-2 pt-2 border-t ${borderDescClasses} max-h-[60vh] overflow-auto`}
                >
                  <AdviseSkillsView payload={advise} />
                </div>
              );
            }
            const findings = parseFindingsResult(block.result);
            if (findings) {
              return (
                <div
                  className={`mt-2 pt-2 border-t ${borderDescClasses} max-h-[60vh] overflow-auto`}
                >
                  <FindingsView payload={findings} />
                </div>
              );
            }
            const impact = parseGraphImpactResult(block.result);
            if (impact) {
              return (
                <div
                  className={`mt-2 pt-2 border-t ${borderDescClasses} max-h-[60vh] overflow-auto`}
                >
                  <GraphImpactView payload={impact} />
                </div>
              );
            }
            return (
              <div
                className={`mt-2 pt-2 border-t ${borderDescClasses} text-xs text-neutral-muted prose prose-invert prose-xs max-h-[40vh] overflow-auto whitespace-pre-wrap`}
              >
                <Markdown remarkPlugins={[remarkGfm]}>{block.result}</Markdown>
              </div>
            );
          })()}
        {children &&
          (Array.isArray(children) ? (children as React.ReactNode[]).length > 0 : true) && (
            <div className={`mt-2 pt-2 border-t ${borderDescClasses} flex flex-col gap-1`}>
              <div className="text-[10px] uppercase tracking-widest font-black text-neutral-muted/50 mb-1">
                Activity Trace
              </div>
              {children}
            </div>
          )}
      </div>
    </div>
  );
}

function TodoBlockView({ block }: { block: ToolUseBlock }) {
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

function LogOutputView({ text }: { text: string }) {
  return (
    <div className="my-2 rounded border border-neutral-border/30 bg-neutral-surface/20 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-border/10 bg-neutral-surface/40 select-none">
        <div className="flex gap-1 mr-1">
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border/30" />
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border/30" />
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border/30" />
        </div>
        <span className="text-[10px] font-black tracking-[0.2em] text-neutral-muted/60 uppercase">
          Terminal Output
        </span>
      </div>
      <div className="px-3 py-3 bg-neutral-bg/20">
        <div className="prose prose-invert prose-xs selection:bg-secondary-400/20 whitespace-pre-wrap">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      </div>
    </div>
  );
}

function StatusBlockView({ block }: { block: StatusBlock }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
      <span className="font-mono text-[10px] tracking-widest text-neutral-muted">{block.text}</span>
    </div>
  );
}

function TextBlockView({ block }: { block: TextBlock }) {
  if (isLogOutput(block.text)) {
    return <LogOutputView text={block.text} />;
  }

  const packedMatches = [...block.text.matchAll(/<?!--\s*packed:\s*(.*?)\s*-->?/g)];
  const cleanText = block.text
    .replace(/<?!--\s*packed:\s*(.*?)\s*-->?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return (
    <div className="flex flex-col gap-2 relative">
      {packedMatches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {packedMatches.map((m, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary-500/10 px-2.5 py-0.5 text-[10px] font-medium text-secondary-300 border border-secondary-500/20"
              title="Graph context packing applied"
            >
              <svg
                className="w-3 h-3 text-secondary-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              <span>Packed: {m[1]}</span>
            </span>
          ))}
        </div>
      )}
      {cleanText.length > 0 && (
        <div className="prose prose-invert prose-sm max-w-none py-1 selection:bg-primary-500/30">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const {
                  node: _node,
                  className,
                  children,
                  ...rest
                } = props as React.HTMLAttributes<HTMLElement> & { node?: unknown };
                const inline = !(className && /language-(\w+)/.test(className));
                const match = /language-(\w+)/.exec(className ?? '');
                return !inline && match ? (
                  <div className="relative group my-4">
                    <div className="absolute -inset-2 bg-gradient-to-r from-primary-500/10 to-secondary-400/10 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative rounded-lg border border-neutral-border overflow-hidden shadow-2xl">
                      <div className="flex items-center justify-between px-4 py-2 bg-neutral-surface/80 border-b border-neutral-border">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
                          {match[1]}
                        </span>
                        <div className="flex gap-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border" />
                          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border" />
                        </div>
                      </div>
                      <SyntaxHighlighter
                        {...rest}
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        className="!bg-neutral-surface/40 !m-0 !p-4 !text-[11px] font-mono leading-relaxed"
                      >
                        {(Array.isArray(children)
                          ? children.join('')
                          : typeof children === 'string'
                            ? children
                            : ''
                        ).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                ) : (
                  <code
                    className={`${className} bg-neutral-surface/60 px-1.5 py-0.5 rounded text-secondary-400 font-mono text-[11px] border border-neutral-border`}
                    {...rest}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {cleanText}
          </Markdown>
        </div>
      )}
    </div>
  );
}

function ActivityGroup({
  blocks,
  startIndex,
  isStreaming,
  isLastGroup,
}: {
  blocks: ContentBlock[];
  startIndex: number;
  isStreaming: boolean;
  isLastGroup: boolean;
}) {
  const _toolCount = blocks.filter((b) => b.kind === 'tool_use').length;

  if (blocks.length === 0) return null;

  // Don't wrap if it's just a single thinking or status block
  if (blocks.length === 1) {
    const block = blocks[0]!;
    if (block.kind !== 'tool_use' && block.kind !== 'text') {
      if (block.kind === 'thinking') {
        return (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <ThinkingBlockView block={block as ThinkingBlock} />
          </motion.div>
        );
      }
      if (block.kind === 'status') {
        return (
          <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}>
            <StatusBlockView block={block as StatusBlock} />
          </motion.div>
        );
      }
    }
  }

  return (
    <div className="relative flex flex-col gap-[2px] my-1">
      {(() => {
        const elements: React.ReactNode[] = [];
        let toolCluster: { block: ContentBlock; localIndex: number }[] = [];

        const flushCluster = () => {
          if (toolCluster.length === 0) return;
          if (toolCluster.length >= 3) {
            const lastTool = toolCluster[toolCluster.length - 1]!.block as ToolUseBlock;

            elements.push(
              <details
                key={`cluster-${elements.length}`}
                className="rounded border border-neutral-border/50 bg-neutral-bg/30 my-1"
              >
                <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-muted select-none flex items-center gap-2">
                  <div className="flex -space-x-1 shrink-0">
                    <div className="h-2 w-2 rounded-full bg-secondary-400/50" />
                    <div className="h-2 w-2 rounded-full bg-secondary-400/70" />
                    <div className="h-2 w-2 rounded-full bg-secondary-400" />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                    <span className="shrink-0">Used {toolCluster.length} tools</span>
                    <span className="shrink-0 opacity-30 text-lg leading-none mt-[-2px]">·</span>
                    <span className="truncate opacity-75 capitalize tracking-widest text-[9px] font-black text-neutral-text">
                      {lastTool.tool.replace(/_/g, ' ')}
                      {lastTool.args && (
                        <span className="font-mono text-[9px] font-normal normal-case tracking-normal ml-2 text-neutral-muted/80">
                          {formatToolArgs(lastTool.tool, lastTool.args)}
                        </span>
                      )}
                    </span>
                  </div>
                </summary>
                <div className="flex flex-col gap-[2px] border-t border-neutral-border/50 p-2">
                  {toolCluster.map(({ block, localIndex }) => {
                    const isLast = isLastGroup && localIndex === blocks.length - 1;
                    return (
                      <ToolUseBlockView
                        key={startIndex + localIndex}
                        block={block as ToolUseBlock}
                        isPending={isLast && isStreaming}
                      />
                    );
                  })}
                </div>
              </details>
            );
          } else {
            toolCluster.forEach(({ block, localIndex }) => {
              const isLast = isLastGroup && localIndex === blocks.length - 1;
              elements.push(
                <ToolUseBlockView
                  key={startIndex + localIndex}
                  block={block as ToolUseBlock}
                  isPending={isLast && isStreaming}
                />
              );
            });
          }
          toolCluster = [];
        };

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i]!;
          if (block.kind === 'tool_use') {
            toolCluster.push({ block, localIndex: i });
          } else {
            flushCluster();

            switch (block.kind) {
              case 'thinking':
                elements.push(
                  <motion.div
                    key={startIndex + i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <ThinkingBlockView block={block as ThinkingBlock} />
                  </motion.div>
                );
                break;
              case 'status':
                elements.push(
                  <motion.div
                    key={startIndex + i}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <StatusBlockView block={block as StatusBlock} />
                  </motion.div>
                );
                break;
              case 'text':
                elements.push(
                  <motion.div
                    key={startIndex + i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <TextBlockView block={block as TextBlock} />
                  </motion.div>
                );
                break;
            }
          }
        }
        flushCluster();
        return elements;
      })()}
    </div>
  );
}

export function BlockSegmentView({
  segment,
  isStreaming,
}: {
  segment: BlockSegment;
  isStreaming: boolean;
}) {
  switch (segment.kind) {
    case 'agent':
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <AgentBlockView block={segment.block}>
            {segment.childBlocks.length > 0 && (
              <ActivityGroup
                blocks={segment.childBlocks}
                startIndex={segment.childStartIndex}
                isStreaming={isStreaming}
                isLastGroup={segment.childIsLastGroup}
              />
            )}
          </AgentBlockView>
        </motion.div>
      );
    case 'todo':
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <TodoBlockView block={segment.block} />
        </motion.div>
      );
    case 'interaction':
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <ToolUseBlockView block={segment.block} isPending={segment.isPending} />
        </motion.div>
      );
    case 'activity':
      return (
        <ActivityGroup
          blocks={segment.blocks}
          startIndex={segment.startIndex}
          isStreaming={isStreaming}
          isLastGroup={segment.isLastGroup}
        />
      );
    case 'text':
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <TextBlockView block={segment.block} />
        </motion.div>
      );
    case 'streaming':
      return (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 border-t border-white/5"
        >
          <StreamingIndicator />
        </motion.div>
      );
  }
}

export function AssistantBlocks({
  blocks,
  isStreaming,
}: {
  blocks: ContentBlock[];
  isStreaming: boolean;
}) {
  if (blocks.length === 0 && isStreaming) {
    return <StreamingIndicator />;
  }

  const segments = useMemo(() => computeBlockSegments(blocks, isStreaming), [blocks, isStreaming]);

  if (segments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {segments.map((segment) => (
        <BlockSegmentView key={segmentKey(segment)} segment={segment} isStreaming={isStreaming} />
      ))}
    </div>
  );
}
