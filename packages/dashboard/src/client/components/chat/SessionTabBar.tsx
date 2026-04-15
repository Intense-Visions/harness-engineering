import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, MessageSquare, Terminal, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatSession } from '../../types/chat-session';

interface Props {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, label: string) => void;
}

function EditableLabel({ 
  label, 
  onRename, 
  isActive 
}: { 
  label: string; 
  onRename: (val: string) => void;
  isActive: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    if (value.trim() && value !== label) {
      onRename(value.trim());
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') {
            setValue(label);
            setIsEditing(false);
          }
        }}
        className="bg-primary-500/20 border-none outline-none text-xs font-medium text-white w-[100px] rounded px-1"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span 
      className="max-w-[100px] truncate flex items-center gap-1 group/label"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {label || 'New Session'}
      <Edit2 
        size={8} 
        className="opacity-0 group-hover/label:opacity-50 hover:!opacity-100 transition-opacity cursor-pointer" 
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      />
    </span>
  );
}

export function SessionTabBar({ sessions, activeSessionId, onSelect, onNew, onClose, onRename }: Props) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-white/5 bg-black/20 px-2 pt-2">
      <AnimatePresence mode="popLayout">
        {sessions.map((session) => {
          const isActive = session.sessionId === activeSessionId;
          
          return (
            <motion.div
              key={session.sessionId}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative group"
            >
              <button
                onClick={() => onSelect(session.sessionId)}
                className={`flex h-9 items-center gap-2 rounded-t-lg px-4 text-xs font-medium transition-all ${
                  isActive 
                    ? 'bg-neutral-bg/60 text-white border-x border-t border-white/10 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]' 
                    : 'text-neutral-muted hover:bg-white/5 hover:text-neutral-text'
                }`}
              >
                {session.command ? (
                  <Terminal size={12} className={isActive ? 'text-primary-400' : 'text-neutral-muted'} />
                ) : (
                  <MessageSquare size={12} className={isActive ? 'text-primary-400' : 'text-neutral-muted'} />
                )}
                
                <EditableLabel 
                  label={session.label} 
                  onRename={(val) => onRename(session.sessionId, val)}
                  isActive={isActive}
                />
                
                {/* Close Button - visible on hover or if active */}
                <span 
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(session.sessionId);
                  }}
                  className={`ml-1 rounded-md p-0.5 hover:bg-white/10 hover:text-red-400 transition-colors ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <X size={10} />
                </span>
              </button>
              
              {isActive && (
                <motion.div
                  layoutId="active-tab-indicator"
                  className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary-500 z-10"
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      <button
        onClick={onNew}
        className="flex h-9 w-9 items-center justify-center rounded-t-lg text-neutral-muted transition-all hover:bg-white/5 hover:text-white"
        title="New Session"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
