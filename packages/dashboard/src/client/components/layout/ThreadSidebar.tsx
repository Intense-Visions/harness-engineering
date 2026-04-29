import { FlaskConical, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { selectSidebarSections, useThreadStore } from '../../stores/threadStore';
import { SYSTEM_PAGES } from '../../types/thread';
import { Sigil } from '../NeonAI/Sigil';
import { SidebarSection } from '../sidebar/SidebarSection';
import { SystemNavItem } from '../sidebar/SystemNavItem';
import { ThreadListItem } from '../sidebar/ThreadListItem';

export function ThreadSidebar() {
  const navigate = useNavigate();
  const threads = useThreadStore((s) => s.threads);
  const sidebarSections = useMemo(
    () => selectSidebarSections({ threads } as Parameters<typeof selectSidebarSections>[0]),
    [threads]
  );
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

  return (
    <aside className="flex h-screen w-[280px] flex-shrink-0 flex-col border-r border-white/[0.06]">
      {/* Branding */}
      <div className="flex items-center border-b border-white/[0.06] px-4 py-3">
        <Sigil size={32} />
        <div className="flex flex-col flex-1">
          <span className="text-[11px] font-black tracking-tight text-neutral-text">Harness</span>
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-primary-500/70">
            Engineering
          </span>
        </div>
      </div>

      {/* Everything below branding gets the frosted glass background */}
      <div className="flex-1 flex flex-col bg-neutral-surface/20 backdrop-blur-xl overflow-hidden">
        {/* Action buttons */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <button
            onClick={handleNewChat}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500/10 border border-primary-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-500 hover:bg-primary-500/20 transition-colors"
          >
            <Plus size={12} />
            New Chat
          </button>
          <button
            onClick={handleNewAnalysis}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-muted hover:text-neutral-text hover:bg-white/[0.08] transition-colors"
          >
            <FlaskConical size={12} />
            Analyze
          </button>
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 overflow-y-auto py-2 no-scrollbar">
          <SidebarSection label="Active" count={sidebarSections.active.length}>
            {sidebarSections.active.length === 0 ? (
              <p className="px-3 py-2 text-[10px] text-neutral-muted/50 italic">
                No active threads
              </p>
            ) : (
              sidebarSections.active.map((thread) => (
                <ThreadListItem key={thread.id} thread={thread} />
              ))
            )}
          </SidebarSection>

          <SidebarSection
            label="Attention"
            count={sidebarSections.attention.length}
            defaultOpen={false}
          >
            {sidebarSections.attention.length === 0 ? (
              <p className="px-3 py-2 text-[10px] text-neutral-muted/50 italic">No pending items</p>
            ) : (
              sidebarSections.attention.map((thread) => (
                <ThreadListItem key={thread.id} thread={thread} />
              ))
            )}
          </SidebarSection>

          <SidebarSection label="Recent" count={sidebarSections.recent.length} defaultOpen={false}>
            {sidebarSections.recent.length === 0 ? (
              <p className="px-3 py-2 text-[10px] text-neutral-muted/50 italic">
                No recent threads
              </p>
            ) : (
              sidebarSections.recent.map((thread) => (
                <ThreadListItem key={thread.id} thread={thread} dimmed />
              ))
            )}
          </SidebarSection>

          <SidebarSection label="System">
            <div className="flex flex-col gap-0.5 px-1">
              {SYSTEM_PAGES.map((entry) => (
                <SystemNavItem
                  key={entry.page}
                  page={entry.page}
                  label={entry.label}
                  route={entry.route}
                />
              ))}
            </div>
          </SidebarSection>
        </div>
      </div>
    </aside>
  );
}
