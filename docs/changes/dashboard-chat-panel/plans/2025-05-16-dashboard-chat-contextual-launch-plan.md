# Plan: Dashboard Chat Panel — Contextual Launch + Briefing Panel (Phase 2)

**Date:** 2025-05-16 | **Spec:** docs/changes/dashboard-chat-panel/proposal.md | **Tasks:** 6 | **Time:** 25 min

## Goal

Enable users to launch harness maintenance skills from the dashboard with pre-loaded context from findings (security, performance, architecture). A briefing panel will show a summary before the session is fully initiated.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** The system shall provide a `useChatContext()` hook that fetches relevant data from dashboard API endpoints based on the selected skill's `contextSources`.
2. **Event-driven:** When a skill is selected (via palette, slash command, or URL), if it has `contextSources`, the system shall display a `BriefingPanel` with a findings summary.
3. **State-driven:** While the `BriefingPanel` is visible, the system shall show a summary of relevant context (e.g., security errors, performance violations) gathered by the `useChatContext` hook.
4. **Event-driven:** When the user clicks "Execute" in the `BriefingPanel`, the system shall send the first message, including the generated system prompt and the slash command.
5. **Ubiquitous:** The system shall support deep-linking via `?command=harness:xxx` to automatically open the chat panel with the specified command pre-loaded.
6. **Event-driven:** On the Health page, "Fix" buttons shall be available next to findings, opening the chat panel with the relevant command and pre-loaded context.

## File Map

- CREATE packages/dashboard/src/client/hooks/useChatContext.ts
- CREATE packages/dashboard/tests/client/hooks/useChatContext.test.ts
- CREATE packages/dashboard/src/client/components/chat/BriefingPanel.tsx
- CREATE packages/dashboard/tests/client/components/chat/BriefingPanel.test.tsx
- CREATE packages/dashboard/src/client/utils/context-to-prompt.ts
- CREATE packages/dashboard/tests/client/utils/context-to-prompt.test.ts
- MODIFY packages/dashboard/src/client/components/chat/ChatPanel.tsx
- MODIFY packages/dashboard/src/client/pages/Health.tsx
- MODIFY packages/dashboard/src/client/types/skills.ts
- MODIFY packages/dashboard/src/client/constants/skills.ts

## Tasks

### Task 1: Extend Skill Registry with `contextSources`

**Depends on:** none | **Files:** packages/dashboard/src/client/types/skills.ts, packages/dashboard/src/client/constants/skills.ts

1. Modify `SkillEntry` interface in `packages/dashboard/src/client/types/skills.ts`:
   ```typescript
   export interface SkillEntry {
     id: string;
     name: string;
     description: string;
     category: SkillCategory;
     slashCommand: string;
     contextSources?: string[]; // ADDED
   }
   ```
2. Update `SKILL_REGISTRY` in `packages/dashboard/src/client/constants/skills.ts` to include `contextSources` for key skills:
   - `harness:security-scan`: `['/api/checks']`
   - `harness:check-perf`: `['/api/checks']`
   - `harness:check-arch`: `['/api/checks']`
3. Run: `harness validate`
4. Commit: `feat(dashboard-chat): add contextSources to skill registry`

### Task 2: Implement `useChatContext` hook

**Depends on:** Task 1 | **Files:** packages/dashboard/src/client/hooks/useChatContext.ts, packages/dashboard/tests/client/hooks/useChatContext.test.ts

1. Create `packages/dashboard/src/client/hooks/useChatContext.ts`:
   - Implement `useChatContext(sources?: string[])` hook.
   - It should fetch data from specified endpoints (using existing logic or standard `fetch`).
   - Use `useSSE` or standard fetches to get `overview` and `checks` data if needed.
2. Create test `packages/dashboard/tests/client/hooks/useChatContext.test.ts` to mock fetches and verify data resolution.
3. Run: `npx vitest packages/dashboard/tests/client/hooks/useChatContext.test.ts` — observe failure.
4. Complete implementation of `useChatContext`.
5. Run: `npx vitest packages/dashboard/tests/client/hooks/useChatContext.test.ts` — observe pass.
6. Run: `harness validate`
7. Commit: `feat(dashboard-chat): add useChatContext hook for data fetching`

### Task 3: Implement `contextToPrompt` utility

**Depends on:** none | **Files:** packages/dashboard/src/client/utils/context-to-prompt.ts, packages/dashboard/tests/client/utils/context-to-prompt.test.ts

1. Create `packages/dashboard/src/client/utils/context-to-prompt.ts`:
   - Function `generateSystemPrompt(skill: SkillEntry, data: any): string`.
   - Function `generateBriefingSummary(skill: SkillEntry, data: any): string`.
2. Create test `packages/dashboard/tests/client/utils/context-to-prompt.test.ts`.
3. Observe failure.
4. Implement formatting logic for different skill categories (Security, Performance, Architecture).
5. Observe pass.
6. Run: `harness validate`
7. Commit: `feat(dashboard-chat): add context-to-prompt utility`

### Task 4: Implement `BriefingPanel` component

**Depends on:** Task 3 | **Files:** packages/dashboard/src/client/components/chat/BriefingPanel.tsx, packages/dashboard/tests/client/components/chat/BriefingPanel.test.tsx

1. Create `packages/dashboard/src/client/components/chat/BriefingPanel.tsx`:
   - Display skill name/description.
   - Show context summary (e.g. "Found 3 high-severity security issues").
   - Include "Execute" button.
2. Create test `packages/dashboard/tests/client/components/chat/BriefingPanel.test.tsx`.
3. Observe failure.
4. Implement UI with Framer Motion animations.
5. Observe pass.
6. Run: `harness validate`
7. Commit: `feat(dashboard-chat): add BriefingPanel component`

### Task 5: Integrate Briefing Flow into `ChatPanel`

**Depends on:** Task 2, Task 4 | **Files:** packages/dashboard/src/client/components/chat/ChatPanel.tsx

1. Update `ChatPanel.tsx`:
   - Add state for `selectedSkill: SkillEntry | null`.
   - Update `handleSkillSelect` to set `selectedSkill` instead of immediately setting input.
   - Render `BriefingPanel` if `selectedSkill` exists and `messages` is empty.
   - When "Execute" is clicked in `BriefingPanel`:
     - Generate system prompt using `contextToPrompt`.
     - Call `handleSend` with the slash command and system prompt.
2. Run: `harness validate`
3. Commit: `feat(dashboard-chat): integrate briefing flow into ChatPanel`

### Task 6: Support Deep-linking and "Fix" Buttons

**Depends on:** Task 5 | **Files:** packages/dashboard/src/client/components/chat/ChatPanel.tsx, packages/dashboard/src/client/pages/Health.tsx

1. Modify `ChatPanel.tsx`:
   - Use `useSearchParams` (if available) or `window.location.search` to check for `?command=...` on mount.
   - Auto-select skill if `command` param matches a registry entry.
2. Update `packages/dashboard/src/client/pages/Health.tsx`:
   - Add "Fix" buttons next to findings in `SecuritySection`, `PerfSection`, `ArchSection`.
   - Clicking "Fix" should trigger `panel.open({ command: 'harness:xxx' })` or update URL/state to open the panel.
3. Run: `harness validate`
4. Commit: `feat(dashboard-chat): support contextual launch and Fix buttons`
