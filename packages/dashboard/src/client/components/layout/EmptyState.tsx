import { Plus, FlaskConical, Terminal } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useThreadStore } from '../../stores/threadStore';
import { NeuralOrganism } from '../chat/NeuralOrganism';
import { CommandPalette } from '../chat/CommandPalette';
import type { SkillEntry } from '../../types/skills';

export function EmptyState() {
  const navigate = useNavigate();
  const handleNewChat = () => {
    const store = useThreadStore.getState();
    const thread = store.createThread('chat', { sessionId: crypto.randomUUID(), command: null });
    store.setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  const handleNewAnalysis = () => {
    const store = useThreadStore.getState();
    const thread = store.createThread('analysis', {
      analysisTitle: 'New Analysis',
      description: '',
      labels: [],
    });
    store.setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  const handleSkillSelect = (skill: SkillEntry) => {
    const store = useThreadStore.getState();
    const thread = store.createThread('chat', {
      sessionId: crypto.randomUUID(),
      command: skill.slashCommand,
    });
    store.setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8"
      >
        <NeuralOrganism size={80} />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-2xl font-black tracking-tight text-white mb-2"
      >
        What would you like to do?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="text-sm text-neutral-muted mb-8"
      >
        Start a chat, run an analysis, or select a skill below.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="flex items-center gap-3 mb-10"
      >
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 rounded-xl bg-primary-500/10 border border-primary-500/20 px-5 py-2.5 text-sm font-bold text-primary-500 hover:bg-primary-500/20 transition-colors"
        >
          <Plus size={16} />
          New Chat
        </button>
        <button
          onClick={handleNewAnalysis}
          className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-5 py-2.5 text-sm font-bold text-neutral-text hover:bg-white/[0.08] transition-colors"
        >
          <FlaskConical size={16} />
          New Analysis
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <Terminal size={14} className="text-neutral-muted" />
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
            Skills & Commands
          </h3>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-white/[0.06] bg-neutral-surface/30 p-4 backdrop-blur-sm">
          <CommandPalette onSelect={handleSkillSelect} />
        </div>
      </motion.div>
    </div>
  );
}
