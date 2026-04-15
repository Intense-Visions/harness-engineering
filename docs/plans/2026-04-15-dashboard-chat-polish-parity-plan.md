# Plan: Dashboard Chat Panel — Phase 4: Polish + Standalone Parity

**Date:** 2026-04-15 | **Spec:** `docs/changes/dashboard-chat-panel/proposal.md` | **Tasks:** 11 | **Time:** 55 min

## Goal

Polish the Dashboard Chat Panel with responsive design, keyboard shortcuts, session management enhancements, and full parity between the side panel and the standalone chat page.

## Observable Truths (Acceptance Criteria)

1. **Responsive Behavior:** The chat panel is responsive, taking 100% width on narrow viewports (below 768px) and 420px on desktop.
2. **Keyboard Shortcut:** `Cmd+J` (or `Ctrl+J` on Windows/Linux) toggles the chat panel open/closed.
3. **Standalone Parity:** The `/orchestrator/chat` route renders the `ChatPanel` in a full-screen ("maximized") mode with the same session management and message history.
4. **Session Renaming:** Users can rename chat sessions by double-clicking a tab or clicking an edit icon.
5. **Attention Flow:** "Claim" links on the Attention page now open a new session in the side panel instead of navigating away.
6. **Backend Persistence:** `PATCH /api/sessions/:id` endpoint is implemented and used for metadata updates (renaming, status changes).
7. **`harness validate`** passes and the dashboard builds successfully.

## File Map

- CREATE `packages/dashboard/src/client/hooks/useKeyboardShortcut.ts`
- MODIFY `packages/orchestrator/src/server/routes/sessions.ts` (add `PATCH` support)
- MODIFY `packages/dashboard/src/client/hooks/useChatSessions.ts` (PATCH integration)
- MODIFY `packages/dashboard/src/client/hooks/useChatPanel.ts` (add renaming/status logic)
- MODIFY `packages/dashboard/src/client/components/chat/ChatPanel.tsx` (responsive, maximized mode)
- MODIFY `packages/dashboard/src/client/components/chat/SessionTabBar.tsx` (renaming UI)
- MODIFY `packages/dashboard/src/client/components/Layout.tsx` (register keyboard toggle)
- MODIFY `packages/dashboard/src/client/pages/Chat.tsx` (refactor to full-screen `ChatPanel`)
- MODIFY `packages/dashboard/src/client/pages/Attention.tsx` (Claim -> side panel session)

## Skeleton

1. **Backend & Foundation** (~2 tasks, ~10 min)
   - Add `PATCH /api/sessions/:id` to orchestrator and `useChatSessions`.
2. **Keyboard Control** (~1 task, ~5 min)
   - `useKeyboardShortcut` hook and `Layout.tsx` integration.
3. **Layout & Responsive Polish** (~2 tasks, ~10 min)
   - `ChatPanel` CSS updates for mobile and "maximized" mode.
4. **Session UX Polish** (~3 tasks, ~15 min)
   - Tab renaming logic and UI in `SessionTabBar`.
5. **Standalone & Attention Parity** (~3 tasks, ~15 min)
   - Refactor `Chat.tsx` and update `Attention.tsx` Claim behavior.
**Estimated total:** 11 tasks, ~55 minutes

## Tasks

### Task 1: Implement PATCH endpoint for Sessions
**Depends on:** none | **Files:** `packages/orchestrator/src/server/routes/sessions.ts`

1. Modify `packages/orchestrator/src/server/routes/sessions.ts` to add `PATCH` method handler:
```typescript
    if (method === 'PATCH') {
      void (async () => {
        try {
          const id = url.split('/').pop();
          if (!id || id === 'sessions') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing sessionId' }));
            return;
          }

          const body = await readBody(req);
          const updates = JSON.parse(body);
          const sessionFilePath = path.join(SESSIONS_DIR, id, 'session.json');
          
          const currentContent = await fs.readFile(sessionFilePath, 'utf-8');
          const current = JSON.parse(currentContent);
          const updated = { ...current, ...updates };
          
          await fs.writeFile(sessionFilePath, JSON.stringify(updated, null, 2));
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update session' }));
        }
      })();
      return true;
    }
```
2. Run: `harness validate`
3. Commit: `feat(orchestrator): add PATCH support for chat sessions`

### Task 2: Integrate PATCH into useChatSessions hook
**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/hooks/useChatSessions.ts`

1. Update `packages/dashboard/src/client/hooks/useChatSessions.ts` to use `PATCH` for partial updates:
```typescript
  /** Partial update session on the server */
  const patchSession = useCallback(async (id: string, data: Partial<ChatSession>) => {
    setSessions(prev => prev.map(s => s.sessionId === id ? { ...s, ...data } : s));
    
    try {
      await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (err) {
      console.error('Failed to patch session update:', err);
    }
  }, []);
```
2. Ensure `updateSession` still exists for full rewrites (if needed) but `patchSession` is preferred for metadata.
3. Run: `harness validate`
4. Commit: `feat(chat): add patchSession helper to useChatSessions`

### Task 3: Create useKeyboardShortcut hook
**Depends on:** none | **Files:** `packages/dashboard/src/client/hooks/useKeyboardShortcut.ts`

1. Create `packages/dashboard/src/client/hooks/useKeyboardShortcut.ts`:
```typescript
import { useEffect } from 'react';

interface Options {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export function useKeyboardShortcut(key: string, callback: () => void, options: Options = {}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isKey = e.key.toLowerCase() === key.toLowerCase();
      const isCtrl = options.ctrl ? e.ctrlKey : true;
      const isMeta = options.meta ? e.metaKey : true;
      const isShift = options.shift ? e.shiftKey : true;

      // Special handling for Cmd on Mac vs Ctrl on Windows/Linux if both provided
      const platformMatch = (options.meta && options.ctrl) 
        ? (e.metaKey || e.ctrlKey)
        : ((options.meta === undefined || e.metaKey === options.meta) && 
           (options.ctrl === undefined || e.ctrlKey === options.ctrl));

      if (isKey && platformMatch && (options.shift === undefined || e.shiftKey === options.shift)) {
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, options]);
}
```
2. Run: `harness validate`
3. Commit: `feat(dashboard): add useKeyboardShortcut hook`

### Task 4: Register Cmd+J Shortcut in Layout
**Depends on:** Task 3 | **Files:** `packages/dashboard/src/client/components/Layout.tsx`

1. Update `packages/dashboard/src/client/components/Layout.tsx` to use the `useChatPanel` hook's `toggle` method with `useKeyboardShortcut`:
```typescript
  const { toggle } = useChatPanel();
  useKeyboardShortcut('j', toggle, { meta: true, ctrl: true }); // Cmd+J or Ctrl+J
```
2. Run: `harness validate`
3. Commit: `feat(layout): toggle chat panel with Cmd+J`

### Task 5: Responsive & Maximized mode in ChatPanel
**Depends on:** none | **Files:** `packages/dashboard/src/client/components/chat/ChatPanel.tsx`

1. Update `ChatPanel.tsx` to accept a `maximized` prop:
```typescript
interface Props {
  isOpen: boolean;
  onClose?: () => void;
  maximized?: boolean;
}
```
2. Update the `motion.div` classes for responsiveness and maximized mode:
```typescript
className={[
  "fixed inset-y-0 right-0 z-50 flex flex-col border-white/10 bg-neutral-bg/60 backdrop-blur-3xl shadow-2xl",
  maximized 
    ? "left-0 w-full" 
    : "w-full sm:w-[420px] border-l"
].join(' ')}
```
3. Hide the `X` (close) button if `maximized` and no `onClose` provided.
4. Run: `harness validate`
5. Commit: `feat(chat): support maximized mode and responsive width in ChatPanel`

### Task 6: Implement Rename logic in useChatPanel
**Depends on:** Task 2 | **Files:** `packages/dashboard/src/client/hooks/useChatPanel.ts`

1. Add `renameSession(id, label)` to `useChatPanel` which calls `patchSession`:
```typescript
  const renameSession = useCallback((id: string, label: string) => {
    patchSession(id, { label });
  }, [patchSession]);
```
2. Export it from the hook.
3. Run: `harness validate`
4. Commit: `feat(chat): add renameSession to useChatPanel`

### Task 7: Tab Renaming UI in SessionTabBar
**Depends on:** Task 6 | **Files:** `packages/dashboard/src/client/components/chat/SessionTabBar.tsx`

1. Update `SessionTabBar.tsx` to allow renaming tabs.
2. Add double-click handler on the label or an edit icon (visible on hover) to switch to an input field.
3. On `Enter` or `Blur`, call `onRename(id, newLabel)`.
4. Run: `harness validate`
5. Commit: `feat(chat): allow renaming session tabs in UI`

### Task 8: Update Chat.tsx to use maximized ChatPanel
**Depends on:** Task 5 | **Files:** `packages/dashboard/src/client/pages/Chat.tsx`

1. Refactor `packages/dashboard/src/client/pages/Chat.tsx` to simply render `ChatPanel` with `maximized={true}` and `isOpen={true}`.
2. The `ChatPanel` already handles `interactionId` and `command` params from `useSearchParams`.
3. Ensure existing interaction logic (like saving plans) is moved or accessible if needed (or deferred if `ChatPanel` now handles interaction-specific actions).
   _Note: Interaction saving logic might need to be moved to a block renderer or a separate context menu in ChatPanel._
4. Run: `harness validate`
5. Commit: `refactor(chat): unify interaction chat with ChatPanel in maximized mode`

### Task 9: Refine Session Metadata Linkage
**Depends on:** Task 8 | **Files:** `packages/dashboard/src/client/components/chat/ChatPanel.tsx`

1. Ensure that when an `interactionId` is present in the URL, `ChatPanel` finds or creates a session linked to it.
2. Add a `Save Plan` button to the `ChatPanel` header or context bar when an `interactionId` is present in the active session's metadata.
3. Run: `harness validate`
4. Commit: `feat(chat): restore Save Plan functionality in ChatPanel for interactions`

### Task 10: Update Attention page "Claim" links
**Depends on:** Task 9 | **Files:** `packages/dashboard/src/client/pages/Attention.tsx`

1. Modify `packages/dashboard/src/client/pages/Attention.tsx` to use a button for "Claim" instead of a `Link`.
2. Use the `useChatPanel` hook to open the panel with the interaction context:
```typescript
  const { createNewSession } = useChatPanel();
  // ...
  <button
    onClick={() => createNewSession({ interactionId: interaction.id, label: interaction.context.issueTitle })}
    className="..."
  >
    Claim
  </button>
```
3. Run: `harness validate`
4. Commit: `feat(attention): open side panel on claim instead of navigating`

### Task 11: Final Polish and Regression Testing
**Depends on:** Task 10 | **Files:** `packages/dashboard/src/client/components/chat/ChatPanel.tsx`, `packages/dashboard/src/client/pages/Chat.tsx`

1. Verify that both side panel and full-page `/orchestrator/chat` work identically.
2. Test responsive behavior by resizing the window.
3. Test keyboard shortcut `Cmd+J`.
4. Verify "Claim" flow correctly creates and selects a linked session.
5. Run: `harness validate`
6. Commit: `polish(chat): finalize standalone parity and polish`
