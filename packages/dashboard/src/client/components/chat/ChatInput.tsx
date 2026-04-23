import { useState } from 'react';
import { Send } from 'lucide-react';
import { SlashAutocomplete } from './SlashAutocomplete';
import { SKILL_REGISTRY } from '../../constants/skills';
import type { SkillEntry } from '../../types/skills';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
}

export function ChatInput({ value, onChange, onSend, disabled, placeholder }: Props) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const handleTextChange = (text: string) => {
    onChange(text);
    if (text.startsWith('/')) {
      const s = text.toLowerCase().replace(/^\//, '');
      const hasMatches = SKILL_REGISTRY.some(
        (skill) =>
          skill.name.toLowerCase().includes(s) ||
          skill.id.toLowerCase().includes(s) ||
          skill.slashCommand.toLowerCase().includes(s)
      );
      setShowAutocomplete(hasMatches);
    } else {
      setShowAutocomplete(false);
    }
  };

  const handleSkillSelect = (skill: SkillEntry) => {
    onChange(skill.slashCommand + ' ');
    setShowAutocomplete(false);
  };

  return (
    <div className="relative">
      {showAutocomplete && (
        <SlashAutocomplete
          filter={value}
          onSelect={handleSkillSelect}
          onClose={() => setShowAutocomplete(false)}
        />
      )}

      <textarea
        rows={1}
        value={value}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (showAutocomplete) {
            // Autocomplete handles arrows and enter/esc via global listeners
            // but we might want to prevent default for some to avoid double-processing
            if (
              e.key === 'ArrowUp' ||
              e.key === 'ArrowDown' ||
              (e.key === 'Enter' && value.startsWith('/'))
            ) {
              // Let Autocomplete handle it
              return;
            }
          }

          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder ?? 'Execute command or query neural link...'}
        disabled={disabled}
        className="w-full resize-none rounded-2xl border border-neutral-border bg-neutral-surface/60 px-5 py-4 pr-14 text-sm text-neutral-text placeholder-neutral-muted/50 backdrop-blur-xl transition-all focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 disabled:opacity-50 shadow-lg"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-primary-500 p-2.5 text-white transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 shadow-[0_0_15px_rgba(79,70,229,0.3)]"
      >
        {disabled ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <Send size={18} />
        )}
      </button>
    </div>
  );
}
