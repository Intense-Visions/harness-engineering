# Chat-First Dashboard Rewrite

## Overview

Replace the current page-based dashboard with a chat-first, thread-centric interface. Chat becomes the primary surface. Agent sessions, attention items, and analysis requests all manifest as threads. Dashboard data views (Health, Graph, Roadmap, etc.) live in a System navigation section. A right context panel shows live session state (todos, artifacts, status) alongside threads.

### Goals

1. Every interaction with the system happens through a thread or is one click from a thread
2. Attention items, agent sessions, manual chats, and analysis requests are all thread types with a unified rendering pipeline
3. Dashboard data views remain fully functional, accessed via a System section in the sidebar
4. The message stream contains only narrative content (text, thinking, tool use, code); mutable session state (todos, artifacts, status) lives in the right context panel
5. The layout follows messaging-app conventions: thread list on left, active thread in center, context on right

### Non-Goals

- Backend API changes (existing endpoints, SSE streams, and WebSocket connections are reused)
- Streaming protocol changes
- Skill system rework
- Mobile/responsive layout (desktop-first)

## Decisions

| #   | Decision                | Choice                                             | Rationale                                                                                                                |
| --- | ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D1  | Top-level layout        | Chat-list (Slack/Discord style)                    | Fully commits to chat-as-main-surface. Three columns: sidebar, center thread, right context panel                        |
| D2  | Sidebar organization    | Pinned sections: Attention, Active, Recent, System | Attention stays prominent at top. Clear lifecycle (attention -> active -> recent). System section houses dashboard pages |
| D3  | Attention item UX       | Collapsible briefing card + chat thread            | Rich context without dominating. Collapses on interaction. Explicit claim/dismiss before committing                      |
| D4  | Agent session identity  | Organism avatar (NeuralOrganism)                   | Brand-consistent. Distinguishes agent-initiated from human-initiated threads                                             |
| D5  | Analyze integration     | Dedicated thread type with form card               | Mirrors attention pattern (briefing card -> chat). "New Analysis" button in sidebar                                      |
| D6  | Dashboard pages         | System section in sidebar, full center column      | Heavy visualizations get proper space. No cramming into side panels                                                      |
| D7  | Right context panel     | Todos, session status, artifacts, context sources  | Mutable state updates in place. Message stream stays clean with narrative content only                                   |
| D8  | Message stream content  | Text, thinking, tool use, code blocks only         | State that changes over time -> panel. Narrative of what happened -> stream                                              |
| D9  | Home state              | Auto-open last thread, empty state fallback        | Messaging app behavior. Quick actions + command palette when nothing's active                                            |
| D10 | Migration strategy      | Big bang                                           | Clean cut, no hybrid state. Full experience ships at once                                                                |
| D11 | Implementation approach | Ground-up UI rewrite                               | Thread-first from day one. Unified state management. No adapter layers                                                   |

## Technical Design

### Core Abstractions

**Thread** -- the universal unit. Every view in the app is a thread or thread-adjacent.

```typescript
type ThreadType = 'chat' | 'attention' | 'analysis' | 'agent' | 'system';

interface Thread {
  id: string;
  type: ThreadType;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'dismissed';
  createdAt: number;
  updatedAt: number;
  avatar: ThreadAvatar; // 'user' | 'organism' | 'alert' | 'system'
  unread: boolean;
  meta: ChatMeta | AttentionMeta | AnalysisMeta | AgentMeta | SystemMeta;
}
```

**ThreadStore** -- single zustand store managing all thread state:

```typescript
interface ThreadStore {
  threads: Map<string, Thread>;
  activeThreadId: string | null;
  lastThreadId: string | null; // for auto-reopen on launch

  // Thread CRUD
  createThread(type: ThreadType, meta: ThreadMeta): Thread;
  closeThread(id: string): void;
  claimThread(id: string): void; // attention -> active transition

  // Messages (per-thread)
  messages: Map<string, Message[]>;
  appendMessage(threadId: string, message: Message): void;

  // Panel state (per-thread)
  panelState: Map<string, PanelState>;
  updateTodos(threadId: string, todos: Todo[]): void;
  updateArtifacts(threadId: string, artifacts: Artifact[]): void;
  updateStatus(threadId: string, status: SessionStatus): void;

  // Sidebar (derived)
  sidebarSections: { attention: Thread[]; active: Thread[]; recent: Thread[]; system: Thread[] };
}
```

### Component Tree

```
App
+-- ThreadSidebar (left, ~280px)
|   +-- SidebarHeader (new chat / new analysis buttons)
|   +-- SidebarSection label="Attention"
|   |   +-- ThreadListItem[] (alert icon, title, badge)
|   +-- SidebarSection label="Active"
|   |   +-- ThreadListItem[] (user/organism avatar, title, status dot)
|   +-- SidebarSection label="Recent"
|   |   +-- ThreadListItem[] (dimmed, timestamp)
|   +-- SidebarSection label="System" collapsible
|       +-- SystemNavItem[] (Health, Graph, Impact, Roadmap, etc.)
|
+-- ThreadView (center, flex-1)
|   +-- ThreadHeader (title, thread type badge, actions)
|   +-- [switches on thread type]
|   |   +-- ChatThreadView -> MessageStream + ChatInput
|   |   +-- AttentionThreadView -> BriefingCard (collapsible) + MessageStream + ChatInput
|   |   +-- AnalysisThreadView -> AnalysisFormCard (collapsible) + MessageStream + ChatInput
|   |   +-- AgentThreadView -> MessageStream (read-only until interaction needed)
|   |   +-- SystemThreadView -> existing page component (Health, Graph, etc.)
|   +-- EmptyState (when no thread selected -- quick actions + command palette)
|
+-- ContextPanel (right, ~320px, conditional)
    +-- TodoSection (live checklist)
    +-- StatusSection (phase, skill, elapsed)
    +-- ArtifactsSection (files created/modified)
    +-- ContextSourcesSection (skill metadata, data sources)
```

### Message Types

```typescript
// Stream content -- renders in MessageStream
type StreamBlock = TextBlock | ThinkingBlock | ToolUseBlock | CodeBlock;

// Panel content -- renders in ContextPanel, not in stream
type PanelEvent = TodoUpdate | StatusUpdate | ArtifactUpdate | ContextSourceUpdate;

// Assistant message carries both stream and panel content
interface AssistantMessage {
  role: 'assistant';
  blocks: StreamBlock[]; // -> MessageStream
  panelEvents: PanelEvent[]; // -> ContextPanel (filtered out of stream)
}
```

### Routing

```typescript
'/t/:threadId'; // all thread types -- type determines rendering
'/s/:systemPage'; // system views (health, graph, impact, etc.)
'/'; // home -- auto-opens lastThreadId or shows EmptyState
```

### Data Flow

- **Attention items:** `useOrchestratorSocket` -> WebSocket escalation events -> `ThreadStore.createThread('attention', ...)` -> appears in Attention section
- **Agent sessions:** `useRecentSessions` + WebSocket -> `ThreadStore.createThread('agent', ...)` -> appears in Active section
- **Manual chats:** User clicks "New Chat" -> `ThreadStore.createThread('chat', ...)` -> appears in Active section
- **Analysis:** User clicks "New Analysis" -> `ThreadStore.createThread('analysis', ...)` -> form card renders -> submit triggers SSE pipeline -> results stream as messages
- **System pages:** Static entries in System section -> clicking navigates to `/s/:page` -> renders existing page component

### File Structure

```
src/client/
+-- stores/
|   +-- threadStore.ts          # zustand store
+-- components/
|   +-- layout/
|   |   +-- ChatLayout.tsx      # root three-column layout
|   |   +-- ThreadSidebar.tsx   # left sidebar
|   |   +-- ThreadView.tsx      # center column router
|   |   +-- ContextPanel.tsx    # right panel
|   |   +-- EmptyState.tsx      # home/no-selection state
|   +-- sidebar/
|   |   +-- SidebarSection.tsx  # collapsible section
|   |   +-- ThreadListItem.tsx  # thread entry in sidebar
|   |   +-- SystemNavItem.tsx   # system page entry
|   +-- threads/
|   |   +-- ChatThreadView.tsx
|   |   +-- AttentionThreadView.tsx
|   |   +-- AnalysisThreadView.tsx
|   |   +-- AgentThreadView.tsx
|   |   +-- SystemThreadView.tsx
|   +-- cards/
|   |   +-- BriefingCard.tsx    # attention context card
|   |   +-- AnalysisFormCard.tsx # analysis input form card
|   +-- panel/
|       +-- TodoSection.tsx
|       +-- StatusSection.tsx
|       +-- ArtifactsSection.tsx
|       +-- ContextSourcesSection.tsx
+-- types/
|   +-- thread.ts               # Thread, ThreadType, meta types
+-- main.tsx                     # new router setup
```

### Components Reused (internals transplanted)

- `MessageStream.tsx` -- virtual scrolling, block rendering (stripped of panel content)
- `ChatInput.tsx` -- textarea, slash autocomplete, send
- `CommandPalette.tsx` -- skill discovery (moves into EmptyState)
- `SlashAutocomplete.tsx` -- inline suggestions
- All page components (Health, Graph, Impact, etc.) -- rendered inside SystemThreadView
- `EnrichedSpecPanel` / `ComplexityScorePanel` -- used inside BriefingCard
- `NeuralOrganism` -- avatar for agent threads
- `GlowCard`, `AuraBackground`, design system tokens -- visual layer stays

### Components Removed

- `Layout.tsx` -- replaced by ChatLayout.tsx
- `DomainNav.tsx` -- replaced by sidebar sections + System nav
- `ChatPanel.tsx` (as side panel) -- internals redistributed into thread views
- `SessionTabBar.tsx` -- replaced by sidebar thread selection
- `ChatContextPane.tsx` -- replaced by ContextPanel
- `Overview.tsx` -- replaced by EmptyState + sidebar Attention section
- `Attention.tsx` (as standalone page) -- replaced by AttentionThreadView
- `Analyze.tsx` (as standalone page) -- replaced by AnalysisThreadView

## Success Criteria

1. **Three-column layout renders** -- sidebar (280px), center thread (flex), right context panel (320px) with proper resize behavior
2. **Sidebar sections populate** -- Attention shows pending escalations from WebSocket, Active shows running agents + open chats, Recent shows completed threads, System shows all dashboard pages
3. **Chat thread works** -- new chat creates a thread, messages stream via SSE, thinking/tool-use/text blocks render in MessageStream, slash commands and command palette function
4. **Attention thread works** -- clicking an attention item opens a thread with collapsible briefing card (title, escalation reasons, SEL/CML data), interacting collapses the card to one-line summary, first message claims the item (status transitions from pending to active, moves from Attention to Active section)
5. **Agent thread works** -- agent sessions appear with organism avatar, message stream shows agent activity, read-only until escalation/interaction is needed
6. **Analysis thread works** -- "New Analysis" creates a thread with form card (title, description, labels), submitting runs SEL/CML/PESL pipeline, results stream as structured message blocks, action buttons (Add to Roadmap, Dispatch, Refine) appear as message actions
7. **System views work** -- all 10 dashboard pages (Health, Graph, Impact, Decay, Traceability, Orchestrator, Roadmap, Adoption, Maintenance, Streams) render in center column via System nav, full-width, fully functional
8. **Right context panel works** -- todos update in real-time as tasks are created/completed, artifacts accumulate as files are created/modified, session status shows current phase/skill/elapsed, sections appear/disappear based on relevance
9. **Message stream is clean** -- no todo blocks, status blocks, or artifact blocks in the stream; only text, thinking, tool use, and code blocks
10. **Home state works** -- opening the dashboard auto-opens last active thread; if no threads exist, shows empty state with "New Chat" / "New Analysis" buttons and command palette
11. **Thread lifecycle works** -- threads transition correctly: attention pending -> claimed -> active -> completed/dismissed; chat active -> completed; agent active -> completed
12. **Existing functionality preserved** -- all skills execute correctly, all SSE/WebSocket streams connect, all dashboard data displays accurately, all API endpoints are consumed

## Implementation Order

### Phase 1: Foundation -- Thread model, store, and three-column shell

- `thread.ts` types (Thread, ThreadType, meta variants)
- `threadStore.ts` zustand store (CRUD, section derivation, active thread tracking)
- `ChatLayout.tsx` three-column flexbox shell
- `ThreadSidebar.tsx` with four collapsible sections (hardcoded system entries, empty for dynamic sections)
- `ThreadView.tsx` center column with type-based routing
- `EmptyState.tsx` with quick action buttons and command palette
- New router setup in `main.tsx`

### Phase 2: Chat threads -- Core messaging in the new layout

- `ChatThreadView.tsx` wiring MessageStream + ChatInput
- Refactor MessageStream to filter out panel events from the block stream
- Refactor `useChatPanel` -> `useChatThread` (thread-oriented instead of panel-oriented)
- SSE streaming connected to ThreadStore message append
- Slash commands and command palette working in context

### Phase 3: Context panel -- Right panel with live state

- `ContextPanel.tsx` container with conditional sections
- `TodoSection.tsx` -- live checklist, updates from PanelEvent stream
- `StatusSection.tsx` -- phase, skill name, elapsed timer
- `ArtifactsSection.tsx` -- accumulating file list
- `ContextSourcesSection.tsx` -- skill metadata and data sources
- PanelEvent filtering: todo/status/artifact updates routed to panel, not stream

### Phase 4: Attention threads -- Escalations as conversations

- `AttentionThreadView.tsx` with BriefingCard + MessageStream + ChatInput
- `BriefingCard.tsx` -- collapsible card with escalation summary, SEL/CML panels, claim/dismiss actions
- WebSocket escalation events -> ThreadStore creates attention threads
- Claim interaction: first message collapses card, moves thread from Attention to Active
- Dismiss action: marks thread as dismissed, moves to Recent

### Phase 5: Agent threads -- Sessions with organism avatar

- `AgentThreadView.tsx` -- MessageStream (read-only by default) + ChatInput (enabled on escalation)
- Agent session events -> ThreadStore creates agent threads with organism avatar
- Wire `useRecentSessions` and WebSocket data into thread creation
- Running agents show status dot in sidebar, completed agents move to Recent

### Phase 6: Analysis threads -- Pipeline in conversation form

- `AnalysisThreadView.tsx` with AnalysisFormCard + MessageStream + ChatInput
- `AnalysisFormCard.tsx` -- interactive form (title, description, labels) that collapses after submit
- Submit triggers SEL/CML/PESL pipeline via SSE
- Results stream as structured message blocks (SEL block, CML block, PESL block)
- Action buttons (Add to Roadmap, Dispatch, Refine) as message actions
- Refine pre-populates form for re-analysis

### Phase 7: System views -- Dashboard pages in the new shell

- `SystemThreadView.tsx` -- renders existing page components at full center-column width
- `SystemNavItem.tsx` entries for all 10 pages
- Route handling for `/s/:page`
- Strip layout/nav wrappers from page components (they inherit from ChatLayout now)
- Right context panel hides or shows related threads for system views

### Phase 8: Polish and cleanup

- Remove old components (Layout, DomainNav, ChatPanel as side panel, SessionTabBar, Overview, Attention page, Analyze page)
- Remove old routes
- Thread persistence (lastThreadId in localStorage for auto-reopen)
- Keyboard shortcuts (new chat, switch threads, toggle context panel)
- Transition animations (sidebar selection, briefing card collapse, thread switching)
- Unread indicators and badge counts on sidebar sections
