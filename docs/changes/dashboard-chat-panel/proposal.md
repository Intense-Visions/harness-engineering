# Dashboard Chat Panel — Maintenance Command Launcher with Full AI Interaction

## Overview

The dashboard gains a collapsible side panel available on every page, providing full interactive Claude sessions for running harness maintenance commands. The panel supports multiple concurrent sessions with explicit session management, context-aware command launching from pages that surface issues (Health, Overview), and a searchable command palette exposing all harness skills. Sessions are linked to `.harness` state for artifact traceability.

### Goals

1. Make AI chat a first-class, always-available capability across the entire dashboard
2. Enable launching any harness maintenance skill from the dashboard with full interactive control
3. Provide contextual "fix it" flows where reported issues (security, performance, architecture) seed chat sessions with relevant findings
4. Support multiple concurrent sessions with tab-based switching and durable session metadata
5. Link sessions to `.harness/sessions/` state for traceability between conversations, interactions, and artifacts

### Non-goals

- Replacing the CLI as the primary Claude Code interface
- Real-time collaboration (multi-user chat)
- Automated remediation without human initiation (the user always starts the session)
- Server-side session management beyond file-based metadata

## Decisions

| #   | Decision                                                                                                        | Rationale                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Extend existing Chat page as dual-purpose (interaction-driven + command-driven) rather than creating a new page | Reuses existing block renderers, SSE streaming, and chat-proxy infrastructure. The "Neural Link Offline" empty state becomes the command palette.                                                                               |
| D2  | Expose all harness skills, not just maintenance commands                                                        | User wants full manual access. Categories provide organization; search provides fast access at scale.                                                                                                                           |
| D3  | Command in URL + fresh data fetch on mount for contextual launches                                              | Keeps URLs clean and shareable (`?command=harness:security-scan`). Chat page fetches latest findings from existing dashboard API endpoints to build system prompt. No new server state for context passing.                     |
| D4  | Briefing panel before auto-send                                                                                 | Mirrors attention chat's context bar. Shows fetched findings and command description. User clicks "Execute" to initiate — intentional, not surprising.                                                                          |
| D5  | Search-first command palette with categorized cards                                                             | Handles 20+ skills without scrolling fatigue. Categories provide discovery; search provides speed.                                                                                                                              |
| D6  | Slash-triggered autocomplete at input start                                                                     | Familiar pattern (Slack/Discord/GitHub). Filters same client-side skill registry as palette. Only at input start — typing `/` mid-sentence is a message, not a command.                                                         |
| D7  | Collapsible right side panel available on every page                                                            | First-class treatment. Page content resizes so findings/graph/roadmap stay visible alongside chat. Persistent trigger button in layout.                                                                                         |
| D8  | Explicit session management with tabs                                                                           | Multiple concurrent sessions, user-controlled. Each session maps to a Claude Code `sessionId`. Tabs show session name, command, and status.                                                                                     |
| D9  | Client-side session tracking with `.harness/sessions/<id>/session.json` persistence                             | `localStorage` for active UI state. `.harness` file links session to artifacts (interaction, spec, plan). Claude Code handles conversation persistence natively via `--session-id`/`--resume`. No server-side session registry. |
| D10 | Context-aware seeding per page                                                                                  | `useChatContext()` hook reads current route and fetches relevant data. Health -> findings. Overview -> project pulse. Attention -> interaction context. Generic elsewhere.                                                      |

## Technical Design

### Component Architecture

```
Layout.tsx
├── ChatPanelTrigger          # Persistent button (bottom-right or sidebar edge)
├── ChatPanel                 # Collapsible right panel, resizes page content
│   ├── SessionTabBar         # Tab list + "New Session" button
│   ├── CommandPalette        # Search + categorized skill grid (shown for new sessions)
│   ├── BriefingPanel         # Context display + "Execute" button (shown pre-launch)
│   ├── MessageStream         # Reuses existing block renderers (Virtuoso + AssistantBlocks)
│   └── ChatInput             # Text input with slash-autocomplete dropdown
│       └── SlashAutocomplete # Filtered command dropdown on `/` trigger
└── {Page Content}            # Existing pages, width adjusts when panel open
```

### Data Flow

1. **Panel open** — `ChatPanel` mounts, reads `localStorage` for active sessions
2. **Command selection** — User picks from palette OR navigates with `?command=...`
   - `useChatContext()` fetches relevant data from existing dashboard APIs
   - `BriefingPanel` renders context summary
3. **Execute** — User clicks "Execute"
   - First message sent: system prompt (context + command instructions) + user prompt (slash command)
   - `POST /api/chat` with `{ prompt, system, sessionId? }`
   - SSE stream consumed by existing `applyChunk()` logic
   - Session metadata written to localStorage + `POST /api/sessions` to persist `.harness` file
4. **Follow-up messages** — `POST /api/chat` with `{ prompt, sessionId }` (resume)
5. **Tab switching** — UI swaps visible message history, `sessionId` changes for next send
6. **Contextual launch from Health** — "Fix" button calls `panel.open({ command: 'harness:security-scan' })`, skips palette, goes straight to `BriefingPanel` with findings pre-loaded

### Session Metadata Schema

Persisted to `.harness/sessions/<id>/session.json`:

```typescript
interface ChatSession {
  sessionId: string; // Claude Code session ID
  command: string | null; // Skill that seeded it, e.g. "harness:security-scan"
  interactionId: string | null; // Link to escalated interaction if applicable
  label: string; // User-visible name (auto-generated or user-renamed)
  createdAt: string; // ISO timestamp
  lastActiveAt: string; // Updated on each message
  artifacts: string[]; // Paths to specs, plans, etc. produced during session
  status: 'active' | 'idle' | 'completed';
}
```

### New API Endpoints

On the orchestrator server, alongside existing routes:

```
POST   /api/sessions          # Persist session.json to .harness/sessions/<id>/
  Body: ChatSession
  Response: { ok: true }

GET    /api/sessions           # List sessions from .harness/sessions/*/session.json
  Response: ChatSession[]

PATCH  /api/sessions/:id       # Update session (artifacts, status, lastActiveAt)
  Body: Partial<ChatSession>
  Response: { ok: true }
```

### Skill Registry

Client-side hardcoded registry, filterable by search and category:

```typescript
interface SkillEntry {
  id: string; // e.g. "harness:security-scan"
  name: string; // e.g. "Security Scan"
  description: string; // One-liner
  category: SkillCategory;
  slashCommand: string; // e.g. "/harness:security-scan"
  contextSources?: string[]; // API endpoints to fetch for briefing
}

type SkillCategory =
  | 'health' // validate, verify, integrity
  | 'security' // security-scan, supply-chain-audit
  | 'performance' // perf
  | 'architecture' // enforce-architecture, dependency-health
  | 'code-quality' // code-review, codebase-cleanup, cleanup-dead-code, detect-doc-drift
  | 'workflow'; // brainstorming, planning, execution, tdd, debugging, refactoring, onboarding
```

### Layout Resize Strategy

```
Panel closed:  [--- Page Content 100% ---]
Panel open:    [--- Page Content flex-1 ---][-- ChatPanel 420px --]
```

- CSS: `Layout` becomes a flex row. Panel width fixed at 420px.
- Transition: `transition-all duration-300` on the container.
- Panel state stored in `localStorage` key `chat-panel-open`.
- Pages don't need changes — they already flex within their container.

### Slash Autocomplete

- `ChatInput` watches for `/` as the first character
- On `/` detected: render `SlashAutocomplete` portal positioned above the input
- Filter `SkillEntry[]` by typed substring (e.g., `/sec` matches "security-scan", "supply-chain-audit")
- Arrow keys navigate, Enter selects, Escape dismisses
- Selection replaces input content with the full slash command
- If the selected skill has `contextSources`, trigger context fetch for briefing

### Integration with Existing Attention Flow

The current flow continues to work:

```
Attention page → "Claim" link → /orchestrator/chat?interactionId=xxx
```

The Chat page detects `interactionId` and behaves as today. The session created from an interaction writes `interactionId` into `session.json`, linking the conversation to the `.harness` interaction state. When the panel is open, the attention flow opens a new session tab in the panel instead of navigating.

## Success Criteria

| #    | Criterion                                                                                                      | Verification                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1  | Chat panel opens/closes from every dashboard page via persistent trigger button                                | Manual: navigate to each route, toggle panel, verify page content resizes and panel renders                                                          |
| SC2  | Command palette displays all harness skills grouped by category with working search filter                     | Test: render CommandPalette, verify all skill entries present, type filter text, verify filtered results match                                       |
| SC3  | Selecting a command from palette fetches relevant context and shows briefing panel                             | Test: select "harness:security-scan", verify fetch to dashboard API, verify briefing renders findings summary                                        |
| SC4  | Clicking "Execute" on briefing panel sends slash command + system prompt as first message and streams response | Integration test: mock chat-proxy, verify POST /api/chat payload contains system prompt with context and slash command, verify SSE blocks render     |
| SC5  | Slash autocomplete appears when typing `/` at input start, filters skills, and inserts selection               | Test: type `/sec` in ChatInput, verify dropdown shows matching skills, select one, verify input value updates                                        |
| SC6  | Session tabs allow creating, switching, and managing multiple concurrent sessions                              | Test: create two sessions with different commands, switch between tabs, verify each shows its own message history and resumes with correct sessionId |
| SC7  | Session metadata persisted to `.harness/sessions/<id>/session.json` via API                                    | Integration test: create session, verify POST /api/sessions, verify file written with correct schema                                                 |
| SC8  | Sessions created from interactions include `interactionId` in metadata                                         | Test: open chat with `?interactionId=xxx`, verify session.json contains the interaction link                                                         |
| SC9  | Health page "Fix" buttons open chat panel with command and findings pre-loaded                                 | Manual + test: click fix button next to security findings, verify panel opens with briefing showing those findings                                   |
| SC10 | Existing attention chat flow continues to work (Claim -> Chat with interaction context)                        | Regression test: existing Chat.test.tsx passes, attention -> chat flow produces identical behavior                                                   |
| SC11 | Panel state (open/closed) and active sessions persist across page navigation and browser refresh               | Test: open panel, create session, refresh page, verify panel state and session list restored from localStorage                                       |
| SC12 | Chat panel renders message blocks identically to existing Chat page (thinking, tool_use, status, text)         | Visual regression: compare block rendering in panel vs standalone, verify shared components produce same output                                      |

## Implementation Order

### Phase 1: Chat Panel Shell + Layout Integration

- `ChatPanel` component with open/close toggle
- `ChatPanelTrigger` persistent button in `Layout.tsx`
- Flex layout resize behavior (page content + panel)
- Panel state persistence in localStorage
- Extract shared chat rendering components from `Chat.tsx` into reusable modules (`MessageStream`, `AssistantBlocks`, `ChatInput` — most already exist, just need to be importable)

### Phase 2: Command Palette + Skill Registry

- Client-side `SkillEntry[]` registry with all harness skills, categories, descriptions
- `CommandPalette` component with search input + categorized card grid
- Wire palette into ChatPanel as the new-session view
- `SlashAutocomplete` component on `ChatInput`

### Phase 3: Contextual Launch + Briefing Panel

- `useChatContext()` hook — route-aware data fetching from existing dashboard APIs
- `BriefingPanel` component showing fetched context + "Execute" button
- Context-to-system-prompt builder per command type
- Deep-link support: `?command=...` opens panel with briefing
- "Fix" action buttons on Health page wired to panel open with command

### Phase 4: Session Management

- `SessionTabBar` component with tab list + "New Session" button
- Client-side session state in localStorage (id, command, label, messages)
- `POST/GET/PATCH /api/sessions` endpoints on orchestrator server
- `.harness/sessions/<id>/session.json` write/read
- Session switching — swap visible messages, track active sessionId per tab
- `interactionId` linkage for attention-originated sessions

### Phase 5: Polish + Standalone Parity

- Existing `/orchestrator/chat` route renders ChatPanel in maximized/full-page mode
- Attention "Claim" flow opens panel instead of navigating (with fallback to standalone)
- Session rename, completion, and cleanup UX
- Responsive behavior for narrow viewports (panel goes full-width below breakpoint)
- Keyboard shortcut to toggle panel
