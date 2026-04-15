import React from 'react';
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
import { motion } from 'framer-motion';
import { GlowCard } from '../NeonAI/GlowCard';
import type { SkillEntry, SkillCategory } from '../../types/skills';

interface Props {
  skill: SkillEntry;
  onClick: () => void;
  delay?: number;
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

export function SkillCard({ skill, onClick, delay = 0 }: Props) {
  const Icon = CATEGORY_ICONS[skill.category];
  const colorClass = CATEGORY_COLORS[skill.category];

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="text-left w-full h-full"
    >
      <GlowCard
        delay={delay}
        uid={skill.id.toUpperCase().replace('HARNESS:', '')}
        className="h-full"
      >
        <div className="flex flex-col h-full gap-4">
          <div className="flex items-start justify-between">
            <div className={`p-2 rounded-lg border ${colorClass}`}>
              <Icon size={20} />
            </div>
            <div className="text-neutral-muted group-hover:text-primary-400 transition-colors">
              <ChevronRight size={16} />
            </div>
          </div>

          <div className="flex-1">
            <h4 className="text-sm font-bold text-white mb-1 group-hover:text-glow-primary transition-all">
              {skill.name}
            </h4>
            <p className="text-[11px] leading-relaxed text-neutral-muted">{skill.description}</p>
          </div>

          <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5 font-mono text-[9px] uppercase tracking-widest text-neutral-muted/50 group-hover:text-neutral-muted transition-colors">
            <span>{skill.slashCommand}</span>
          </div>
        </div>
      </GlowCard>
    </motion.button>
  );
}
