import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5';

export function AnalyzeForm({
  title,
  description,
  labels,
  streaming,
  onTitleChange,
  onDescriptionChange,
  onLabelsChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  labels: string;
  streaming: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onLabelsChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
      <div>
        <label htmlFor="analyze-title" className={LABEL_CLASS}>
          Title <span className="text-red-400">*</span>
        </label>
        <input
          id="analyze-title"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Describe the work item..."
          disabled={streaming}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="analyze-description" className={LABEL_CLASS}>
          Description
        </label>
        <textarea
          id="analyze-description"
          rows={8}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Additional context, requirements, constraints..."
          disabled={streaming}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="analyze-labels" className={LABEL_CLASS}>
          Labels
        </label>
        <input
          id="analyze-labels"
          type="text"
          value={labels}
          onChange={(e) => onLabelsChange(e.target.value)}
          placeholder="Comma-separated labels (e.g. frontend, auth, urgent)"
          disabled={streaming}
          className={INPUT_CLASS}
        />
      </div>
      <div className="flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSubmit}
          disabled={streaming || !title.trim()}
          className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {streaming ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send size={14} />
          )}
          {streaming ? 'Analyzing...' : 'Analyze'}
        </motion.button>
        {streaming && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-400 transition-colors hover:border-red-500/50 hover:text-red-400"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
