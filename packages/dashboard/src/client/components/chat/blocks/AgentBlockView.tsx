import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ToolUseBlock } from '../../../types/chat';
import { AdviseSkillsView, parseAdviseSkillsResult } from '../AdviseSkillsView';
import { FindingsView, parseFindingsResult } from '../FindingsView';
import { GraphImpactView, parseGraphImpactResult } from '../GraphImpactView';

export function AgentBlockView({
  block,
  children,
}: {
  block: ToolUseBlock;
  children?: React.ReactNode;
}) {
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
