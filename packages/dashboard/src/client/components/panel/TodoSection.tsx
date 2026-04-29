import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ListTodo } from 'lucide-react';

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

interface Props {
  todos: TodoItem[];
}

export function TodoSection({ todos }: Props) {
  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.completed).length;

  return (
    <div className="border-b border-white/[0.06] pb-3">
      <div className="flex items-center gap-2 mb-2">
        <ListTodo size={12} className="text-neutral-muted" />
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          Tasks
        </h4>
        <span className="text-[9px] text-neutral-muted/60 tabular-nums">
          {completed}/{todos.length}
        </span>
        {/* Progress bar */}
        <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-semantic-success"
            initial={{ width: 0 }}
            animate={{ width: `${(completed / todos.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
      <AnimatePresence mode="popLayout">
        {todos.map((todo) => (
          <motion.div
            key={todo.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="flex items-start gap-2 py-0.5"
          >
            {todo.completed ? (
              <CheckCircle2 size={14} className="text-semantic-success flex-shrink-0 mt-0.5" />
            ) : (
              <Circle size={14} className="text-neutral-muted/40 flex-shrink-0 mt-0.5" />
            )}
            <span
              className={[
                'text-xs leading-relaxed',
                todo.completed ? 'text-neutral-muted/50 line-through' : 'text-neutral-text',
              ].join(' ')}
            >
              {todo.text}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
