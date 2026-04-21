import {
  Heart,
  Shield,
  Activity,
  Layers,
  Code,
  Zap,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { SkillEntry, SkillCategory } from '../../types/skills';

interface Props {
  skill: SkillEntry;
  onClick: () => void;
}

const CATEGORY_ICONS: Record<SkillCategory, LucideIcon> = {
  health: Heart,
  security: Shield,
  performance: Activity,
  architecture: Layers,
  'code-quality': Code,
  workflow: Zap,
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  health: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  security: 'text-red-400 bg-red-400/10 border-red-400/20',
  performance: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  architecture: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'code-quality': 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  workflow: 'text-secondary-400 bg-secondary-400/10 border-secondary-400/20',
};

export function SkillCard({ skill, onClick }: Props) {
  const Icon = CATEGORY_ICONS[skill.category];
  const colorClass = CATEGORY_COLORS[skill.category];

  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10 transition-all text-left"
    >
      <div className={`flex-shrink-0 p-1.5 rounded-md border ${colorClass}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h4 className="text-xs font-semibold text-white group-hover:text-primary-300 transition-colors">
            {skill.name}
          </h4>
          <span className="text-[9px] font-mono text-neutral-muted/30 hidden sm:inline">
            {skill.slashCommand}
          </span>
        </div>
        <p className="text-[10px] leading-snug text-neutral-muted truncate">{skill.description}</p>
      </div>
      <ChevronRight
        size={14}
        className="flex-shrink-0 text-neutral-muted/20 group-hover:text-primary-400 transition-colors"
      />
    </button>
  );
}
