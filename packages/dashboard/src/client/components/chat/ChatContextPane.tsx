import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  AlertTriangle,
  FileCode,
  GitBranch,
  Loader2,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import type {
  PendingInteraction,
  InteractionEnrichedSpec,
  InteractionComplexityScore,
} from '../../types/orchestrator';
import type { SkillEntry } from '../../types/skills';
import type { ChatContextState } from '../../hooks/useChatContext';
import { generateBriefingSummary } from '../../utils/context-to-prompt';

interface Props {
  interaction: PendingInteraction | null;
  skill: SkillEntry | null;
  context: ChatContextState;
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={color}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full ${color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EnrichedSpecSection({ spec }: { spec: InteractionEnrichedSpec }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-2">
          Intent
        </h4>
        <p className="text-sm text-white">{spec.intent}</p>
      </div>
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-2">
          Summary
        </h4>
        <p className="text-sm leading-relaxed text-gray-300">{spec.summary}</p>
      </div>
      {spec.affectedSystems.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-2">
            Affected Systems
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {spec.affectedSystems.map((sys) => (
              <span
                key={sys.name}
                className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400"
                title={`Confidence: ${Math.round(sys.confidence * 100)}% | Tests: ${sys.testCoverage} | Deps: ${sys.transitiveDeps.length}`}
              >
                {sys.name}
                <span className="ml-1 text-blue-500/50">{Math.round(sys.confidence * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {(spec.unknowns.length > 0 || spec.ambiguities.length > 0 || spec.riskSignals.length > 0) && (
        <div className="grid grid-cols-1 gap-3">
          {spec.unknowns.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">
                Unknowns ({spec.unknowns.length})
              </h4>
              <ul className="space-y-0.5">
                {spec.unknowns.map((u, i) => (
                  <li key={i} className="text-xs text-gray-400">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {spec.ambiguities.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-1">
                Ambiguities ({spec.ambiguities.length})
              </h4>
              <ul className="space-y-0.5">
                {spec.ambiguities.map((a, i) => (
                  <li key={i} className="text-xs text-gray-400">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {spec.riskSignals.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1">
                Risk Signals ({spec.riskSignals.length})
              </h4>
              <ul className="space-y-0.5">
                {spec.riskSignals.map((r, i) => (
                  <li key={i} className="text-xs text-gray-400">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComplexitySection({ score }: { score: InteractionComplexityScore }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${RISK_COLORS[score.riskLevel] ?? RISK_COLORS.medium}`}
        >
          {score.riskLevel} risk
        </span>
        <span className="text-xs font-mono text-gray-400">{score.recommendedRoute}</span>
      </div>
      <div className="space-y-2">
        <ScoreBar value={score.overall} label="Overall" color="text-primary-500" />
        <ScoreBar value={score.dimensions.structural} label="Structural" color="text-blue-400" />
        <ScoreBar value={score.dimensions.semantic} label="Semantic" color="text-purple-400" />
        <ScoreBar value={score.dimensions.historical} label="Historical" color="text-yellow-400" />
        <ScoreBar value={score.confidence} label="Confidence" color="text-emerald-400" />
      </div>
      <div className="grid grid-cols-4 gap-2 border-t border-gray-800 pt-3">
        {(
          [
            { val: score.blastRadius.services, label: 'Services' },
            { val: score.blastRadius.modules, label: 'Modules' },
            { val: score.blastRadius.filesEstimated, label: 'Files' },
            { val: score.blastRadius.testFilesAffected, label: 'Tests' },
          ] as const
        ).map((item) => (
          <div key={item.label} className="text-center">
            <span className="block text-lg font-bold text-white">{item.val}</span>
            <span className="text-[9px] uppercase tracking-widest text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
      {score.reasoning.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            Reasoning
          </h4>
          <ul className="space-y-0.5">
            {score.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-gray-400">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InteractionPane({ interaction }: { interaction: PendingInteraction }) {
  const { context: ctx, reasons } = interaction;

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full custom-scrollbar">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Target size={14} className="text-primary-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-400">
            Escalation Context
          </span>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">{ctx.issueTitle}</h2>
        <p className="text-xs text-gray-500 font-mono">{interaction.issueId}</p>
      </div>

      {ctx.issueDescription && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Description
          </h4>
          <p className="text-sm leading-relaxed text-gray-300">{ctx.issueDescription}</p>
        </div>
      )}

      {reasons.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={12} />
            Escalation Reasons
          </h4>
          <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            {reasons.map((reason, i) => (
              <div
                key={i}
                className="text-sm text-amber-300 [&_p]:m-0 [&_strong]:font-bold [&_strong]:text-amber-200"
              >
                <Markdown remarkPlugins={[remarkGfm]}>{reason}</Markdown>
              </div>
            ))}
          </div>
        </div>
      )}

      {ctx.enrichedSpec && (
        <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-4 flex items-center gap-1.5">
            <Zap size={12} />
            Enriched Spec (SEL)
          </h4>
          <EnrichedSpecSection spec={ctx.enrichedSpec} />
        </div>
      )}

      {ctx.complexityScore && (
        <div className="rounded-lg border border-secondary-400/20 bg-secondary-400/5 p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-secondary-400 mb-4 flex items-center gap-1.5">
            <GitBranch size={12} />
            Complexity Model (CML)
          </h4>
          <ComplexitySection score={ctx.complexityScore} />
        </div>
      )}

      {ctx.relatedFiles.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
            <FileCode size={12} />
            Related Files
          </h4>
          <ul className="space-y-1">
            {ctx.relatedFiles.map((file) => (
              <li key={file} className="font-mono text-xs text-gray-400 truncate" title={file}>
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(ctx.specPath || ctx.planPath) && (
        <div className="space-y-1 text-xs text-gray-500">
          {ctx.specPath && (
            <p>
              Spec: <span className="font-mono text-gray-400">{ctx.specPath}</span>
            </p>
          )}
          {ctx.planPath && (
            <p>
              Plan: <span className="font-mono text-gray-400">{ctx.planPath}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SkillPane({ skill, context }: { skill: SkillEntry; context: ChatContextState }) {
  const summary = generateBriefingSummary(skill, context.data);

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full custom-scrollbar">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-primary-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-400">
            Skill Briefing
          </span>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">{skill.name}</h2>
        <p className="text-sm text-gray-300 leading-relaxed">{skill.description}</p>
        <p className="mt-2 text-[10px] font-mono text-neutral-muted">{skill.slashCommand}</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
          Telemetry Findings
        </h4>
        {context.isLoading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading context...</span>
          </div>
        ) : context.error ? (
          <div className="flex gap-2 text-red-400">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-tight">{context.error}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white leading-relaxed">{summary}</p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Context extracted from latest telemetry
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatContextPane({ interaction, skill, context }: Props) {
  if (interaction) return <InteractionPane interaction={interaction} />;
  if (skill) return <SkillPane skill={skill} context={context} />;
  return null;
}
