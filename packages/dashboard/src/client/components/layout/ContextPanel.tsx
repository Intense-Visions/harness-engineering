import { motion, AnimatePresence } from 'framer-motion';
import { PanelRightClose } from 'lucide-react';
import { TodoSection, type TodoItem } from '../panel/TodoSection';
import { StatusSection } from '../panel/StatusSection';
import { ArtifactsSection, type ArtifactItem } from '../panel/ArtifactsSection';
import { ContextSourcesSection, type ContextSource } from '../panel/ContextSourcesSection';

export interface PanelState {
  todos: TodoItem[];
  phase: string | null;
  skill: string | null;
  startedAt: number | null;
  artifacts: ArtifactItem[];
  contextSources: ContextSource[];
}

const EMPTY_STATE: PanelState = {
  todos: [],
  phase: null,
  skill: null,
  startedAt: null,
  artifacts: [],
  contextSources: [],
};

interface Props {
  state: PanelState | null;
  onClose?: () => void;
}

function hasContent(state: PanelState): boolean {
  return (
    state.todos.length > 0 ||
    state.phase !== null ||
    state.skill !== null ||
    state.artifacts.length > 0 ||
    state.contextSources.length > 0
  );
}

export function ContextPanel({ state, onClose }: Props) {
  const panelState = state ?? EMPTY_STATE;
  const visible = hasContent(panelState);

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex-shrink-0 border-l border-white/[0.06] bg-neutral-surface/10 backdrop-blur-xl overflow-hidden"
        >
          <div className="w-[320px] h-screen flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
                Context
              </h3>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-neutral-muted hover:text-white transition-colors"
                >
                  <PanelRightClose size={14} />
                </button>
              )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 no-scrollbar flex flex-col gap-3">
              <TodoSection todos={panelState.todos} />
              <StatusSection
                phase={panelState.phase}
                skill={panelState.skill}
                startedAt={panelState.startedAt}
              />
              <ArtifactsSection artifacts={panelState.artifacts} />
              <ContextSourcesSection sources={panelState.contextSources} />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
