# Plan: Dashboard Chat Panel - Phase 1: Command Palette + Skill Registry

**Date:** 2025-05-15 | **Spec:** docs/changes/dashboard-chat-panel/proposal.md | **Tasks:** 7 | **Time:** 30 min

## Goal

Implement a searchable command palette and skill registry for the dashboard chat panel to enable users to discover and launch harness maintenance skills with slash commands and a categorized grid view.

## Observable Truths (Acceptance Criteria)

1. The `SkillRegistry` contains 15+ harness skills categorized by type (health, security, etc.).
2. The `CommandPalette` component is displayed in the `ChatPanel` when the session has no messages.
3. The `CommandPalette` allows searching skills by name, ID, or description, with real-time filtering.
4. Clicking a skill in the `CommandPalette` populates the `ChatInput` with the skill's slash command (e.g., `/harness:security-scan`).
5. Typing `/` at the start of the `ChatInput` triggers the `SlashAutocomplete` dropdown showing matching skills.
6. The `SlashAutocomplete` dropdown supports keyboard navigation (Arrow keys, Enter to select).
7. Selection from `SlashAutocomplete` replaces the input content with the full slash command.

## File Map

- CREATE `packages/dashboard/src/client/types/skills.ts`
- CREATE `packages/dashboard/src/client/constants/skills.ts`
- CREATE `packages/dashboard/src/client/components/chat/SkillCard.tsx`
- CREATE `packages/dashboard/src/client/components/chat/CommandPalette.tsx`
- CREATE `packages/dashboard/src/client/components/chat/SlashAutocomplete.tsx`
- MODIFY `packages/dashboard/src/client/components/chat/ChatPanel.tsx`
- MODIFY `packages/dashboard/src/client/components/chat/ChatInput.tsx`
- CREATE `packages/dashboard/tests/client/components/chat/CommandPalette.test.tsx`
- CREATE `packages/dashboard/tests/client/components/chat/SlashAutocomplete.test.tsx`

## Tasks

### Task 1: Define skill types and registry

**Depends on:** none | **Files:** packages/dashboard/src/client/types/skills.ts, packages/dashboard/src/client/constants/skills.ts

1. Create `packages/dashboard/src/client/types/skills.ts`:

   ```typescript
   export type SkillCategory =
     | 'health'
     | 'security'
     | 'performance'
     | 'architecture'
     | 'code-quality'
     | 'workflow';

   export interface SkillEntry {
     id: string;
     name: string;
     description: string;
     category: SkillCategory;
     slashCommand: string;
     contextSources?: string[];
   }
   ```

2. Create `packages/dashboard/src/client/constants/skills.ts` with the full registry defined in the spec.
3. Run: `harness validate`
4. Commit: `feat(dashboard-chat): define SkillEntry types and registry`

### Task 2: Implement the SkillCard component

**Depends on:** Task 1 | **Files:** packages/dashboard/src/client/components/chat/SkillCard.tsx

1. Create `packages/dashboard/src/client/components/chat/SkillCard.tsx`:
   - Visual card representing a single skill.
   - Props: `skill: SkillEntry`, `onClick: () => void`.
   - Use Lucide icons based on category (health -> Heart/CheckCircle, security -> Shield, etc.).
   - Hover effects with Framer Motion.
2. Run: `harness validate`
3. Commit: `feat(dashboard-chat): implement SkillCard component`

### Task 3: Implement the CommandPalette component

**Depends on:** Task 2 | **Files:** packages/dashboard/src/client/components/chat/CommandPalette.tsx, packages/dashboard/tests/client/components/chat/CommandPalette.test.tsx

1. Create `packages/dashboard/src/client/components/chat/CommandPalette.tsx`:
   - Search input for filtering skills.
   - Categorized grid of `SkillCard` components.
   - Props: `onSelect: (skill: SkillEntry) => void`.
2. Create test file `packages/dashboard/tests/client/components/chat/CommandPalette.test.tsx` and verify search/filtering.
3. Run tests: `npx vitest run packages/dashboard/tests/client/components/chat/CommandPalette.test.tsx`
4. Run: `harness validate`
5. Commit: `feat(dashboard-chat): implement CommandPalette component`

### Task 4: Integrate CommandPalette into ChatPanel

**Depends on:** Task 3 | **Files:** packages/dashboard/src/client/components/chat/ChatPanel.tsx

1. Modify `ChatPanel.tsx` to conditionally render `CommandPalette`:
   - If `messages.length === 0`, show `CommandPalette`.
   - On skill selection, `setInput(skill.slashCommand)` and `focus()` the input.
2. Run: `harness validate`
3. Commit: `feat(dashboard-chat): integrate CommandPalette into ChatPanel`

### Task 5: Implement the SlashAutocomplete component

**Depends on:** Task 1 | **Files:** packages/dashboard/src/client/components/chat/SlashAutocomplete.tsx, packages/dashboard/tests/client/components/chat/SlashAutocomplete.test.tsx

1. Create `packages/dashboard/src/client/components/chat/SlashAutocomplete.tsx`:
   - Dropdown portal (or relative position) showing matching skills.
   - Props: `filter: string`, `onSelect: (skill: SkillEntry) => void`, `onClose: () => void`.
   - Support keyboard navigation: `selectedIndex` state, Enter to select.
2. Create test file `packages/dashboard/tests/client/components/chat/SlashAutocomplete.test.tsx` and verify filtering and navigation.
3. Run tests: `npx vitest run packages/dashboard/tests/client/components/chat/SlashAutocomplete.test.tsx`
4. Run: `harness validate`
5. Commit: `feat(dashboard-chat): implement SlashAutocomplete component`

### Task 6: Integrate SlashAutocomplete into ChatInput

**Depends on:** Task 5 | **Files:** packages/dashboard/src/client/components/chat/ChatInput.tsx

1. Modify `ChatInput.tsx`:
   - Detect if the input starts with `/`.
   - If so, render `SlashAutocomplete` above the `textarea`.
   - Handle selection by replacing text and closing the dropdown.
   - Handle keyboard events (up/down/enter/esc) when the dropdown is open.
2. Run: `harness validate`
3. Commit: `feat(dashboard-chat): integrate SlashAutocomplete into ChatInput`

### Task 7: Final Verification and Polish

**Depends on:** Task 6 | **Files:** packages/dashboard/src/client/components/chat/\*.tsx

1. Perform a final pass on styling, transitions, and accessibility.
2. Ensure all tests in the dashboard pass.
3. Run: `harness validate`
4. Commit: `feat(dashboard-chat): polish Phase 1 Command Palette and Registry`
