import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, 
  Shield, 
  Activity, 
  Layers, 
  Code, 
  Zap, 
  type LucideIcon 
} from 'lucide-react';
import { SKILL_REGISTRY } from '../../constants/skills';
import type { SkillEntry, SkillCategory } from '../../types/skills';

interface Props {
  filter: string;
  onSelect: (skill: SkillEntry) => void;
  onClose: () => void;
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
  health: 'text-emerald-400',
  security: 'text-red-400',
  performance: 'text-amber-400',
  architecture: 'text-blue-400',
  'code-quality': 'text-purple-400',
  workflow: 'text-secondary-400',
};

export function SlashAutocomplete({ filter, onSelect, onClose }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredSkills = useMemo(() => {
    const s = filter.toLowerCase().replace(/^\//, '');
    if (!s) return SKILL_REGISTRY;
    return SKILL_REGISTRY.filter(
      (skill) =>
        skill.name.toLowerCase().includes(s) ||
        skill.id.toLowerCase().includes(s) ||
        skill.slashCommand.toLowerCase().includes(s)
    );
  }, [filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredSkills]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredSkills.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredSkills.length) % filteredSkills.length);
      } else if (e.key === 'Enter') {
        if (filteredSkills[selectedIndex]) {
          e.preventDefault();
          onSelect(filteredSkills[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredSkills, selectedIndex, onSelect, onClose]);

  if (filteredSkills.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-white/10 bg-neutral-bg/80 backdrop-blur-2xl shadow-2xl z-[70]"
    >
      <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
        {filteredSkills.map((skill, idx) => {
          const Icon = CATEGORY_ICONS[skill.category];
          const colorClass = CATEGORY_COLORS[skill.category];
          const isSelected = idx === selectedIndex;

          return (
            <button
              key={skill.id}
              onClick={() => onSelect(skill)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all ${
                isSelected ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className={`shrink-0 ${colorClass}`}>
                <Icon size={14} />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white truncate">{skill.name}</span>
                  <span className="text-[9px] font-mono text-neutral-muted uppercase tracking-tighter shrink-0 ml-2">
                    {skill.category}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-muted truncate font-mono">
                  {skill.slashCommand}
                </div>
              </div>
              {isSelected && (
                <div className="text-[10px] font-mono text-primary-400 animate-pulse">
                  ↵
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="border-t border-white/5 bg-white/5 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-muted/50">
          Command Registry
        </span>
        <div className="flex gap-2 text-[9px] font-mono text-neutral-muted/30">
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
        </div>
      </div>
    </motion.div>
  );
}
