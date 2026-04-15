# Plan: Dashboard Chat Panel — Phase 3: Session Management

**Date:** 2024-10-31 | **Spec:** docs/changes/dashboard-chat-panel/proposal.md | **Tasks:** 12 | **Time:** 45 min

## Goal
Implement Phase 3: Session Management for the Dashboard Chat Panel, enabling multiple concurrent chat sessions with persistence to `.harness/sessions/` and localStorage.

## Observable Truths (Acceptance Criteria)
1. `GET /api/sessions` returns a list of existing chat sessions from `.harness/sessions/`.
2. `POST /api/sessions` creates or updates a `session.json` file in the corresponding `.harness/sessions/<id>/` directory.
3. The Chat Panel displays a `SessionTabBar` with tabs for each active session.
4. Clicking "New Session" (+) in the `SessionTabBar` creates a new blank session and shows the `CommandPalette`.
5. Switching between tabs restores the message history and input state for that specific session.
6. Sessions created with an `interactionId` (e.g., from the Attention page) correctly link to that interaction in their metadata.
7. `harness validate` passes.

## File Map
- CREATE `packages/dashboard/src/client/types/chat-session.ts`
- MODIFY `packages/dashboard/src/client/types/chat.ts` (export types)
- CREATE `packages/orchestrator/src/server/routes/sessions.ts`
- MODIFY `packages/orchestrator/src/server/http.ts` (register session routes)
- CREATE `packages/dashboard/src/client/hooks/useChatSessions.ts`
- CREATE `packages/dashboard/src/client/components/chat/SessionTabBar.tsx`
- MODIFY `packages/dashboard/src/client/hooks/useChatPanel.ts` (integrate session management)
- MODIFY `packages/dashboard/src/client/components/chat/ChatPanel.tsx` (integrate session UI)

## Tasks

### Task 1: Define ChatSession type
**Depends on:** none | **Files:** `packages/dashboard/src/client/types/chat-session.ts`, `packages/dashboard/src/client/types/chat.ts`

1. Create `packages/dashboard/src/client/types/chat-session.ts`:
   ```typescript
   import type { ChatMessage } from './chat';

   export interface ChatSession {
     sessionId: string;            // Claude Code session ID
     command: string | null;       // Skill that seeded it, e.g. "harness:security-scan"
     interactionId: string | null; // Link to escalated interaction if applicable
     label: string;                // User-visible name
     createdAt: string;            // ISO timestamp
     lastActiveAt: string;         // Updated on each message
     artifacts: string[];          // Paths to specs, plans, etc. produced during session
     status: 'active' | 'idle' | 'completed';
     messages: ChatMessage[];      // Cached message history for UI state
     input: string;                // Unsent input state
   }
   ```
2. Update `packages/dashboard/src/client/types/chat.ts` to export everything from `chat-session.ts`.
3. Run: `harness validate`
4. Commit: `feat(chat): define ChatSession interface`

### Task 2: Implement Orchestrator Session API (GET/POST)
**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/server/routes/sessions.ts`

1. Create `packages/orchestrator/src/server/routes/sessions.ts` with basic GET and POST handlers:
   ```typescript
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import { readBody } from '../utils';

   const SESSIONS_DIR = path.resolve('.harness', 'sessions');

   export function handleSessionsRoute(req: IncomingMessage, res: ServerResponse): boolean {
     const { method, url } = req;
     if (url?.startsWith('/api/sessions')) {
       if (method === 'GET') {
         void (async () => {
           try {
             const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
             const sessions = [];
             for (const entry of entries) {
               if (entry.isDirectory()) {
                 try {
                   const content = await fs.readFile(path.join(SESSIONS_DIR, entry.name, 'session.json'), 'utf-8');
                   sessions.push(JSON.parse(content));
                 } catch { /* skip non-chat sessions */ }
               }
             }
             res.writeHead(200, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify(sessions));
           } catch (err) {
             res.writeHead(500, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ error: 'Failed to list sessions' }));
           }
         })();
         return true;
       }
       if (method === 'POST') {
         void (async () => {
           try {
             const body = await readBody(req);
             const session = JSON.parse(body);
             const sessionDir = path.join(SESSIONS_DIR, session.sessionId);
             await fs.mkdir(sessionDir, { recursive: true });
             await fs.writeFile(path.join(sessionDir, 'session.json'), JSON.stringify(session, null, 2));
             res.writeHead(200, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ ok: true }));
           } catch (err) {
             res.writeHead(500, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ error: 'Failed to save session' }));
           }
         })();
         return true;
       }
     }
     return false;
   }
   ```
2. Run: `harness validate`
3. Commit: `feat(orchestrator): add session persistence API`

### Task 3: Register Session routes in HTTP server
**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/server/http.ts`

1. Import `handleSessionsRoute` in `packages/orchestrator/src/server/http.ts`.
2. Register it before `handleStaticFile`.
3. Run: `harness validate`
4. Commit: `feat(orchestrator): register session routes`

### Task 4: Create useChatSessions hook
**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/hooks/useChatSessions.ts`

1. Create `packages/dashboard/src/client/hooks/useChatSessions.ts` to manage a list of `ChatSession` objects and the `activeSessionId`.
2. Use `localStorage` to persist the `activeSessionId`.
3. Fetch all sessions from `/api/sessions` on mount.
4. Implement `addSession()`, `switchSession(id)`, and `updateSession(id, data)`:
   ```typescript
   import { useState, useEffect, useCallback } from 'react';
   import type { ChatSession } from '../types/chat-session';

   export function useChatSessions() {
     const [sessions, setSessions] = useState<ChatSession[]>([]);
     const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
       if (typeof window === 'undefined') return null;
       return localStorage.getItem('active-chat-session');
     });

     useEffect(() => {
       if (activeSessionId) localStorage.setItem('active-chat-session', activeSessionId);
     }, [activeSessionId]);

     useEffect(() => {
       fetch('/api/sessions')
         .then(res => res.json())
         .then(setSessions)
         .catch(console.error);
     }, []);

     const updateSession = useCallback(async (id: string, data: Partial<ChatSession>) => {
       setSessions(prev => prev.map(s => s.sessionId === id ? { ...s, ...data } : s));
       const session = sessions.find(s => s.sessionId === id);
       if (session) {
         await fetch('/api/sessions', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ ...session, ...data })
         });
       }
     }, [sessions]);

     return { sessions, activeSessionId, setActiveSessionId, updateSession, setSessions };
   }
   ```
5. Run: `harness validate`
6. Commit: `feat(chat): add useChatSessions hook`

### Task 5: Implement SessionTabBar component
**Depends on:** Task 4 | **Files:** `packages/dashboard/src/client/components/chat/SessionTabBar.tsx`

1. Create a component that renders tabs for each session in `sessions`.
2. Include a "+" button for a new session.
3. Use `Lucide` icons for session status and active state.
4. Run: `harness validate`
5. Commit: `feat(chat): implement SessionTabBar component`

### Task 6: Refactor useChatPanel to include session management
**Depends on:** Task 4 | **Files:** `packages/dashboard/src/client/hooks/useChatPanel.ts`

1. Integrate `useChatSessions` into `useChatPanel`.
2. Add `createNewSession({ command, interactionId })` helper.
3. Run: `harness validate`
4. Commit: `refactor(chat): integrate session management into useChatPanel`

### Task 7: Update ChatPanel to support multiple sessions
**Depends on:** Task 5, Task 6 | **Files:** `packages/dashboard/src/client/components/chat/ChatPanel.tsx`

1. Render `SessionTabBar` at the top of the panel.
2. Use active session's state (messages, input, skill, sessionId) for rendering.
3. Ensure switching tabs updates the UI correctly by syncing local state back to the active session when switching.
4. Run: `harness validate`
5. Commit: `feat(chat): support multi-session tabs in ChatPanel`

### Task 8: Persist chat messages to session state
**Depends on:** Task 7 | **Files:** `packages/dashboard/src/client/components/chat/ChatPanel.tsx`

1. Update the session's message history in state when chunks arrive.
2. Debounce persisting the updated session metadata to `/api/sessions`.
3. Run: `harness validate`
4. Commit: `feat(chat): persist message history to session metadata`

### Task 9: Implement session naming logic
**Depends on:** Task 8 | **Files:** `packages/dashboard/src/client/hooks/useChatSessions.ts`

1. Auto-generate labels like "Security Scan" or "Chat with Claude" based on the command or first message.
2. If `interactionId` exists, fetch interaction title for the label.
3. Run: `harness validate`
4. Commit: `feat(chat): auto-generate session labels`

### Task 10: Interaction Linkage
**Depends on:** Task 8 | **Files:** `packages/dashboard/src/client/hooks/useChatPanel.ts`

1. When opening via `?interactionId=...`, check if a session already exists for that ID.
2. If yes, switch to it. If no, create it.
3. Run: `harness validate`
4. Commit: `feat(chat): link sessions to interactions`

### Task 11: Implement session cleanup (delete tab)
**Depends on:** Task 7 | **Files:** `packages/dashboard/src/client/components/chat/SessionTabBar.tsx`

1. Add a close button (x) to tabs.
2. Implement removal logic (client-side only for now, or PATCH status to 'completed').
3. Run: `harness validate`
4. Commit: `feat(chat): allow closing session tabs`

### Task 12: Final validation and polish
**Depends on:** Task 11 | **Files:** `packages/dashboard/src/client/components/chat/ChatPanel.tsx`

1. Ensure everything works seamlessly together.
2. Fix any UI/UX issues with tab switching and persistence.
3. Ensure `sessionId` is correctly passed to `streamChat` for resumed sessions.
4. Run: `harness validate`
5. Commit: `feat(chat): finalize session management`
