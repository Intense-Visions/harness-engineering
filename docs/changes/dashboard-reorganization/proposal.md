# Dashboard Reorganization — Chat-First Architecture with Expandable Domain Navigation

## Overview

The harness dashboard has grown to 13 flat navigation items and treats chat as a secondary slide-over panel. This reorganization inverts the hierarchy: chat becomes a persistent, always-visible column; the triage feed becomes the landing experience; and navigation collapses from 13 items into 4 expandable domain pills that preserve the existing floating pill-bar identity.

### Goals

1. Elevate chat from side panel to persistent primary interface
2. Replace the flat 13-item nav with 4 expandable domain pills
3. Transform the overview from a KPI wall into an attention-driven triage feed
4. Establish a layout architecture that scales without adding nav items
5. Preserve the existing glassmorphic visual identity (GlowCards, AuraBackground, animations)

### Non-Goals

- Visual redesign or new design system components
- New backend APIs or data sources
- Changes to the chat system's functionality (message streaming, skill execution, sessions)
- Mobile-first responsive design (desktop-first, reasonable narrow-viewport fallback)

## Decisions

| #   | Decision                                              | Rationale                                                                                                                                                   |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Chat-first architecture                               | Chat is the primary way users interact with harness. Metrics views are contextual intelligence, not the main event.                                         |
| D2  | Persistent right column for chat (~35% / 420px width) | Always visible, no toggle required to start interacting. Collapsible via `Cmd+Ctrl+J` for data-heavy pages.                                                 |
| D3  | Landing page is triage feed + chat                    | `/` shows what needs attention (anomalies, blockers, status changes) in the content area with chat ready beside it. Replaces the current KPI-wall overview. |
| D4  | 4 domain pills replace 13 flat nav items              | Overview, Intelligence, Agents, Roadmap. Each domain expands inline to reveal sub-pages. No second nav row, no sidebar.                                     |
| D5  | Expanding pill interaction                            | Clicking a domain pill smoothly expands it to show sub-page tabs. Other pills compress/slide aside. Uses existing Framer Motion `layoutId` patterns.        |
| D6  | Route restructure under domain prefixes               | `/intelligence/health`, `/agents/streams`, etc. Old flat routes (`/health`, `/orchestrator/streams`) get redirects for bookmarks.                           |
| D7  | Full-screen `/orchestrator/chat` page removed         | Chat lives everywhere as the right column. Dedicated chat page is redundant.                                                                                |
| D8  | Preserve visual identity wholesale                    | GlowCards, AuraBackground, ScrambleText, neural organism, color tokens, animation patterns — all retained.                                                  |
| D9  | Full restructure in one pass                          | No incremental migration. Layout, nav, routing, and overview redesign ship together.                                                                        |

## Technical Design

### Layout Architecture

The current single-column layout with optional slide-over chat becomes a two-column shell:

```
┌─────────────────────────────────────────────────────────┐
│  ··· Expanding Domain Pills ···                    [⌘J] │  ← floating pill bar
├───────────────────────────────────┬─────────────────────┤
│                                   │                     │
│         Content Area              │    Chat Panel       │
│         (flex-1)                  │    (~35% / 420px)   │
│                                   │                     │
│                                   │                     │
│                                   │                     │
└───────────────────────────────────┴─────────────────────┘
```

- Shell: `flex` row. Content area is `flex-1`, chat column is fixed-width (`w-[420px]`).
- When chat is collapsed, content area expands to full width. Collapse animated with Framer Motion.
- Chat column renders `ChatPanel` directly — no longer a positioned overlay. Removes the `ChatPanelTrigger` floating button; replaced by a compact toggle in the pill bar.

### Navigation Component

The `NAV_ITEMS` flat array becomes a domain-grouped structure:

```typescript
const NAV_DOMAINS = [
  {
    id: 'overview',
    label: 'Overview',
    to: '/',
    // No children — single page, no expansion
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    to: '/intelligence/health', // default child
    children: [
      { to: '/intelligence/health', label: 'Health' },
      { to: '/intelligence/graph', label: 'Graph' },
      { to: '/intelligence/impact', label: 'Impact' },
      { to: '/intelligence/decay', label: 'Decay' },
      { to: '/intelligence/traceability', label: 'Traceability' },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    to: '/agents', // default child
    children: [
      { to: '/agents', label: 'Dashboard', end: true },
      { to: '/agents/attention', label: 'Attention' },
      { to: '/agents/analyze', label: 'Analyze' },
      { to: '/agents/maintenance', label: 'Maintenance' },
      { to: '/agents/streams', label: 'Streams' },
    ],
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    to: '/roadmap',
    children: [
      { to: '/roadmap', label: 'Roadmap', end: true },
      { to: '/roadmap/adoption', label: 'Adoption' },
    ],
  },
] as const;
```

#### Expanding Pill Behavior

1. **Domains without children** (Overview) — standard `NavLink`, no expansion.
2. **Domains with children** — clicking the domain pill expands it. The pill widens with `layout` animation to reveal child tabs as smaller inline links. Other domain pills slide aside via `layoutId`.
3. **Active domain** stays expanded while any child route is active. Navigating to a different domain collapses the previous, expands the new.
4. **Animation** uses `AnimatePresence` + `motion.div` with `layout` prop for smooth width transitions.

### Route Structure

```
/                          → Triage feed (new Overview)
/intelligence/health       → Health page
/intelligence/graph        → Graph page
/intelligence/impact       → Impact page
/intelligence/decay        → DecayTrends page
/intelligence/traceability → Traceability page
/agents                    → Orchestrator page
/agents/attention          → Attention page
/agents/analyze            → Analyze page
/agents/maintenance        → Maintenance page
/agents/streams            → Streams page
/roadmap                   → Roadmap page
/roadmap/adoption          → Adoption page
```

#### Legacy Redirects

All old routes redirect to their new equivalents to preserve bookmarks:

```
/health           → /intelligence/health
/graph            → /intelligence/graph
/impact           → /intelligence/impact
/decay-trends     → /intelligence/decay
/traceability     → /intelligence/traceability
/orchestrator     → /agents
/orchestrator/*   → /agents/*
```

### Triage Feed (New Overview at `/`)

The current Overview's 5 KPI sections are replaced with an attention-driven feed. Same SSE data sources, different presentation:

- **Alert cards** at the top: anything requiring action — errors > 0, blocked features, security threats, perf anomalies. Each card links to the relevant detail page.
- **Status strip** below: condensed single-row summary of all domains (roadmap progress, health score, graph connectivity, security status). Not the current 5 full grid sections — a compact at-a-glance row.
- **Recent activity / changelog** at the bottom: what changed since last visit (features shipped, issues resolved, new findings). Data sourced from existing SSE streams.
- Neural organism and "Command Center" branding retained in the header area.

### Files Modified

| File                                              | Change                                                          |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `src/client/main.tsx`                             | New route structure with domain prefixes, legacy redirects      |
| `src/client/components/Layout.tsx`                | Two-column shell, expandable domain nav, chat integration       |
| `src/client/pages/Overview.tsx`                   | Rewrite as triage feed                                          |
| `src/client/components/chat/ChatPanel.tsx`        | Adapt from slide-over to column layout                          |
| `src/client/components/chat/ChatPanelTrigger.tsx` | Remove (replaced by pill-bar toggle)                            |
| `src/client/hooks/useChatPanel.ts`                | Simplify — chat is open by default, toggle collapses the column |

### New Files

| File                                        | Purpose                                     |
| ------------------------------------------- | ------------------------------------------- |
| `src/client/components/DomainNav.tsx`       | Expandable domain pill navigation component |
| `src/client/components/LegacyRedirects.tsx` | Redirect routes for old URLs                |

### Unchanged

All page components except `Overview.tsx` are untouched internally — they are re-routed to new paths but their content, data fetching, and rendering remain identical.

## Success Criteria

| #    | Criterion                                                                                                   | Verification                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| SC1  | Nav shows exactly 4 domain pills (Overview, Intelligence, Agents, Roadmap)                                  | Visual inspection — no more than 4 top-level items visible at any time                                    |
| SC2  | Clicking a domain pill expands it inline to reveal sub-page tabs with smooth animation                      | Click each domain, verify expansion/collapse transitions use Framer Motion layout animations without jank |
| SC3  | Chat panel is visible by default on all routes as a right column                                            | Navigate to every route — chat column is rendered without user action                                     |
| SC4  | `Cmd+Ctrl+J` collapses/expands the chat column and content area fills the freed space                       | Toggle shortcut, verify layout reflows smoothly                                                           |
| SC5  | `/` renders a triage feed with alert cards, status strip, and recent activity — not the old KPI wall        | Load the app, verify the landing page shows attention-driven content                                      |
| SC6  | All 13 original pages are accessible under their new domain-prefixed routes                                 | Navigate to every route in the new structure, verify each page renders correctly                          |
| SC7  | Legacy routes (`/health`, `/orchestrator/streams`, etc.) redirect to their new equivalents                  | Visit each old URL, verify redirect to the correct new path                                               |
| SC8  | Full-screen `/orchestrator/chat` page is removed without loss of functionality                              | Chat features (sessions, skills, command palette, streaming) all work in the persistent column            |
| SC9  | Visual identity preserved — GlowCards, AuraBackground, neural organism, color tokens, animations all intact | Side-by-side comparison of detail pages (e.g., Health, Graph) before/after — visual parity                |
| SC10 | No page component internals modified (except Overview)                                                      | Git diff shows page files only changed their export location or imports, not content                      |

## Implementation Order

| Phase                | What                                                                                                                                                                                                                                         | Dependencies |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1. Layout shell      | Build the two-column layout (`Layout.tsx` rewrite). Content area + chat column side-by-side. Chat open by default, collapsible. Remove `ChatPanelTrigger`. Adapt `ChatPanel` from slide-over to column. Update `useChatPanel` default state. | None         |
| 2. Domain nav        | Create `DomainNav.tsx` — the expandable pill component. Wire up `NAV_DOMAINS` data structure. Implement expand/collapse with Framer Motion `layout` + `AnimatePresence`. Replace `NAV_ITEMS` in the pill bar.                                | Phase 1      |
| 3. Route migration   | Restructure `main.tsx` routes under domain prefixes. Create `LegacyRedirects.tsx` for old URLs. No page component changes — just new paths pointing to existing components.                                                                  | Phase 2      |
| 4. Triage feed       | Rewrite `Overview.tsx` as the attention-driven landing page. Alert cards for actionable items, compact status strip, recent activity section. Same SSE data sources, different presentation.                                                 | Phase 1      |
| 5. Polish and verify | Test every route, verify legacy redirects, confirm chat functionality in column mode, check animation performance, verify keyboard shortcut, visual comparison against current pages.                                                        | Phases 1–4   |

**Risk mitigation:** Phases 1–3 are structural and can be verified independently of content changes. If Phase 4 (triage feed) proves more complex than expected, the restructure still ships with a simplified overview — the architectural value is in phases 1–3.
