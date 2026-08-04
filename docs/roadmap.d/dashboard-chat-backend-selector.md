---
slug: "dashboard-chat-backend-selector"
milestone: "Intake"
order: 22
---

### Dashboard chat can target any configured backend (incl. local/ollama)

- **Status:** planned
- **Spec:** —
- **Summary:** Let a user manually drive any configured backend — including the local `ollama` model — from the dashboard chat, so they can eyeball local-model quality interactively before trusting it with autonomous dispatch. Today the chat is hardwired to Claude: `packages/orchestrator/src/server/routes/chat-proxy.ts` spawns `claude --print` as a subprocess (`command = 'claude'`), bypassing the orchestrator's `BackendRouter` entirely — so the OllamaBackend and local models are unreachable from chat even though they now work for dispatch (#841/#843). Rewire the `/api/chat` handler to dispatch through the backend router (or an explicit backend/model param) and add a backend picker to the chat UI (default to the existing `claude` path for back-compat). The pieces already exist: the **OllamaBackend** implements a streaming chat loop (`startSession`→`runTurn` yielding `AgentEvent`s: usage / tool_execution / heartbeat), and the dashboard has the chat surface (`client/types/chat-session.ts`, `utils/chat-stream.ts`, `utils/agent-events.ts`, `stores/threadStore.ts`) + SSE streaming. Mostly a wiring job: map the backend's `AgentEvent` stream to the chat SSE event contract the client already consumes, expose the configured `agent.backends` to the picker, and preserve tool-execution/streaming semantics. Consider read-only vs full-tool permission modes for an interactive chat session (a manual chat probably wants tools optional). Ties directly to the Agent-Autonomy adoption story — humans validate the local model in chat, then graduate it to unattended dispatch.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1003