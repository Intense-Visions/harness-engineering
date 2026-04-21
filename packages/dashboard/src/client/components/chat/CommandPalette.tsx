import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SKILL_REGISTRY } from '../../constants/skills';
import type { SkillEntry, SkillCategory } from '../../types/skills';
import { SkillCard } from './SkillCard';

interface Props {
  onSelect: (skill: SkillEntry) => void;
}

const CATEGORIES: { id: SkillCategory; label: string }[] = [
  { id: 'workflow', label: 'Workflow' },
  { id: 'health', label: 'Health' },
  { id: 'security', label: 'Security' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'code-quality', label: 'Code Quality' },
  { id: 'performance', label: 'Performance' },
];

export function CommandPalette({ onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filteredSkills = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return SKILL_REGISTRY;
    return SKILL_REGISTRY.filter(
      (skill) =>
        skill.name.toLowerCase().includes(s) ||
        skill.id.toLowerCase().includes(s) ||
        skill.description.toLowerCase().includes(s) ||
        skill.slashCommand.toLowerCase().includes(s)
    );
  }, [search]);

  const groupedSkills = useMemo(() => {
    const groups: Partial<Record<SkillCategory, SkillEntry[]>> = {};
    for (const skill of filteredSkills) {
      if (!groups[skill.category]) groups[skill.category] = [];
      groups[skill.category]!.push(skill);
    }
    return groups;
  }, [filteredSkills]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-muted">
          <Search size={15} />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills, commands, or categories..."
          className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition-all"
          autoFocus
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
        <AnimatePresence mode="popLayout">
          {filteredSkills.length > 0 ? (
            <div className="flex flex-col gap-5 pb-4">
              {CATEGORIES.map((cat) => {
                const skills = groupedSkills[cat.id];
                if (!skills) return null;

                return (
                  <motion.div
                    key={cat.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
                        {cat.label}
                      </h3>
                      <div className="flex-1 h-px bg-white/5" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                      {skills.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} onClick={() => onSelect(skill)} />
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="mb-3 rounded-full bg-white/5 p-3 text-neutral-muted">
                <Search size={24} />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">No skills match</h4>
              <p className="text-xs text-neutral-muted">Try different keywords.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
