import { useNavigate } from 'react-router';
import { AlertTriangle, X } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { NeuralOrganism } from '../chat/NeuralOrganism';
import type { Thread } from '../../types/thread';

interface Props {
  thread: Thread;
  dimmed?: boolean;
}

function ThreadAvatar({ thread }: { thread: Thread }) {
  switch (thread.avatar) {
    case 'organism':
      return (
        <div className="flex-shrink-0">
          <NeuralOrganism size={20} growthDuration={5} />
        </div>
      );
    case 'alert':
      return (
        <div className="h-5 w-5 flex-shrink-0 flex items-center justify-center">
          <AlertTriangle size={14} className="text-semantic-warning" />
        </div>
      );
    case 'user':
      return (
        <div className="h-5 w-5 flex-shrink-0 rounded-full bg-primary-500/20 flex items-center justify-center">
          <span className="text-[8px] font-bold text-primary-500">U</span>
        </div>
      );
    default:
      return (
        <div className="h-5 w-5 flex-shrink-0 rounded-full bg-white/[0.08] flex items-center justify-center">
          <span className="text-[8px] font-bold text-neutral-muted">S</span>
        </div>
      );
  }
}

function StatusDot({ thread }: { thread: Thread }) {
  if (thread.status === 'pending') {
    return (
      <div className="h-1.5 w-1.5 rounded-full bg-semantic-warning animate-pulse flex-shrink-0" />
    );
  }
  if (thread.status === 'active') {
    return <div className="h-1.5 w-1.5 rounded-full bg-semantic-success flex-shrink-0" />;
  }
  return null;
}

export function ThreadListItem({ thread, dimmed }: Props) {
  const navigate = useNavigate();
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const isActive = activeThreadId === thread.id;

  return (
    <button
      onClick={() => {
        useThreadStore.getState().setActiveThread(thread.id);
        navigate(`/t/${thread.id}`);
      }}
      className={[
        'group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-all duration-150',
        isActive
          ? 'bg-white/[0.08] text-white'
          : dimmed
            ? 'text-neutral-muted/60 hover:text-neutral-muted hover:bg-white/[0.03]'
            : 'text-neutral-text hover:bg-white/[0.04]',
      ].join(' ')}
    >
      <ThreadAvatar thread={thread} />
      <span className="flex-1 truncate text-left">{thread.title}</span>
      <StatusDot thread={thread} />
      {thread.unread && <div className="h-2 w-2 rounded-full bg-primary-500 flex-shrink-0" />}
      {thread.type !== 'attention' && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            useThreadStore.getState().closeThread(thread.id);
            if (isActive) navigate('/');
          }}
          className="hidden group-hover:flex h-4 w-4 items-center justify-center rounded text-neutral-muted hover:text-white hover:bg-white/[0.08]"
        >
          <X size={10} />
        </span>
      )}
    </button>
  );
}
