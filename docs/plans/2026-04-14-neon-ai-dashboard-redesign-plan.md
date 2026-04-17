# Plan: Neon AI Dashboard Redesign

**Date:** 2026-04-14 | **Tasks:** 10 | **Time:** ~80 min

## Goal

Redesign the Harness Engineering dashboard to implement the "Neon AI" design system, transitioning from the current gray/white theme to a high-contrast, tech-forward aesthetic with electric indigo and cyber cyan accents.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** The dashboard background shall use the `neutral.bg` token (`#09090b`) and text shall use `neutral.text` (`#fafafa`).
2. **Ubiquitous:** All page headers and card surfaces shall use the `neutral.surface` token (`#18181b`) with `neutral.border` (`#27272a`) thin borders.
3. **Ubiquitous:** Primary actions and active navigation states shall use the `primary.500` token (`#4f46e5`).
4. **Event-driven:** When a tool is in use or an AI state is active, the system shall use the `secondary.400` token (`#22d3ee`).
5. **State-driven:** While viewing code or terminal output, the system shall use the `mono` font family (JetBrains Mono) as defined in tokens.
6. **Ubiquitous:** `harness validate` shall pass, and all contrast ratios for text-on-background pairs shall exceed 4.5:1.

## File Map

- MODIFY `packages/dashboard/src/client/index.css`
- MODIFY `packages/dashboard/src/client/components/Layout.tsx`
- MODIFY `packages/dashboard/src/client/components/ActionButton.tsx`
- MODIFY `packages/dashboard/src/client/components/KpiCard.tsx`
- MODIFY `packages/dashboard/src/client/pages/Chat.tsx`
- MODIFY `packages/dashboard/src/client/components/StaleIndicator.tsx`
- MODIFY `packages/dashboard/src/client/components/BlastRadiusGraph.tsx`
- MODIFY `packages/dashboard/src/client/components/DependencyGraph.tsx`
- MODIFY `packages/dashboard/src/client/components/GanttChart.tsx`
- MODIFY `packages/dashboard/src/client/components/ProgressChart.tsx`

## Tasks

### Task 1: Inject Neon AI tokens into Tailwind Theme

**Files:** `packages/dashboard/src/client/index.css`

1. Add a `@theme` block to `index.css` with the following variables:
   ```css
   @theme {
     --color-neutral-bg: #09090b;
     --color-neutral-surface: #18181b;
     --color-neutral-text: #fafafa;
     --color-neutral-muted: #71717a;
     --color-neutral-border: #27272a;
     --color-primary-500: #4f46e5;
     --color-secondary-400: #22d3ee;
     --color-accent-500: #d946ef;
     --font-mono: 'JetBrains Mono', monospace;
   }
   ```
2. Commit: `feat(dashboard): inject neon-ai tokens into tailwind theme`

### Task 2: Redesign Core Layout & Global Styles

**Files:** `packages/dashboard/src/client/components/Layout.tsx`

1. Update root `div` classes from `bg-gray-950 text-gray-100` to `bg-neutral-bg text-neutral-text`.
2. Update `header` classes from `bg-gray-900 border-gray-800` to `bg-neutral-surface border-neutral-border`.
3. Update `NavLink` active styles to use `text-primary-500` instead of `text-white`.
4. Commit: `feat(dashboard): apply neon-ai theme to main layout`

### Task 3: Redesign ActionButton

**Files:** `packages/dashboard/src/client/components/ActionButton.tsx`

1. Update component to use `bg-primary-500` for primary actions.
2. Ensure hover states utilize `bg-primary-600` or equivalent.
3. Commit: `feat(dashboard): redesign action buttons with neon tokens`

### Task 4: Redesign KPI Cards

**Files:** `packages/dashboard/src/client/components/KpiCard.tsx`

1. Update card container to use `bg-neutral-surface` and `border-neutral-border`.
2. Update title to use `text-neutral-muted`.
3. Commit: `feat(dashboard): apply neon-ai surface styles to kpi cards`

### Task 5: Redesign Chat Interface (Structure)

**Files:** `packages/dashboard/src/client/pages/Chat.tsx`

1. Update message container `div` to use `bg-neutral-bg` and `border-neutral-border`.
2. Update the input container to use `bg-neutral-surface` and `border-neutral-border`.
3. Apply `focus:ring-primary-500` to the text input.
4. Commit: `feat(dashboard): apply neon-ai base styles to chat page`

### Task 6: Redesign Chat Blocks (Glassmorphism)

**Files:** `packages/dashboard/src/client/pages/Chat.tsx`

1. Update `ThinkingBlockView` and `ToolUseBlockView` containers to use `bg-neutral-surface/50 backdrop-blur-sm border-neutral-border/50`.
2. Update tool activity indicators (e.g., arrow, status text) to use `text-secondary-400` (Cyber Cyan).
3. Ensure code blocks (`pre`) use `font-mono`.
4. Commit: `feat(dashboard): implement neon-ai glassmorphism for chat blocks`

### Task 7: Redesign Status Indicators

**Files:** `packages/dashboard/src/client/components/StaleIndicator.tsx`

1. Update status pulse and text to use `text-secondary-400`.
2. Commit: `feat(dashboard): apply cyber-cyan tokens to status indicators`

### Task 8: Update Visualization Charts (Part 1)

**Files:** `packages/dashboard/src/client/components/BlastRadiusGraph.tsx`, `packages/dashboard/src/client/components/DependencyGraph.tsx`

1. Update internal SVG color constants:
   - `neutral`: `#71717a` (Zinc 500)
   - `border`: `#27272a` (Zinc 800)
   - `background`: `#18181b` (Surface)
2. Ensure active/highlighted nodes use `primary-500`.
3. Commit: `feat(dashboard): update graph visualization colors to neon-ai palette`

### Task 9: Update Visualization Charts (Part 2)

**Files:** `packages/dashboard/src/client/components/GanttChart.tsx`, `packages/dashboard/src/client/components/ProgressChart.tsx`

1. Update chart bars and label text to use the neutral-text and neon accent tokens.
2. Commit: `feat(dashboard): update gantt and progress charts to neon-ai palette`

### Task 10: Final Validation & Contrast Check

1. Run `node packages/cli/dist/bin/harness.js validate`.
2. Manual visual verification of all pages.
3. Commit: `chore(dashboard): final redesign validation`
