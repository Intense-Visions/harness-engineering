# Reference: packages / dashboard / 4

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/dashboard/src/client/components/analyze/AnalyzeActionBar.tsx

[`packages/dashboard/src/client/components/analyze/AnalyzeActionBar.tsx`](/packages/dashboard/src/client/components/analyze/AnalyzeActionBar.tsx)

Post-analysis action row — Add to Roadmap, Dispatch Now, Refine, and Export Spec buttons, each with its own pending spinner / done check / disabled state (Refine is disabled when the SEL result reports no unknowns or ambiguities), plus an inline action-error line.

**Exports:** `AnalyzeActionBar`

## packages/dashboard/src/client/components/analyze/AnalyzeCards.tsx

[`packages/dashboard/src/client/components/analyze/AnalyzeCards.tsx`](/packages/dashboard/src/client/components/analyze/AnalyzeCards.tsx)

Result cards for the three analyze pipeline stages: SEL (intent, summary, affected systems), CML (animated score bars per complexity dimension, blast radius, risk and route badges), and PESL (execution confidence, simulated plan, predicted failures) — plus the concern-signal badge row.

**Exports:** `SELCard`, `CMLCard`, `PESLCard`, `SignalsBadges`

## packages/dashboard/src/client/components/analyze/AnalyzeForm.tsx

[`packages/dashboard/src/client/components/analyze/AnalyzeForm.tsx`](/packages/dashboard/src/client/components/analyze/AnalyzeForm.tsx)

Controlled input panel for the Analyze page — title, description, and comma-separated labels, with Enter-to-submit on the title field and a cancel control while a stream is in flight.

**Exports:** `AnalyzeForm`

## packages/dashboard/src/client/components/analyze/AnalyzeResults.tsx

[`packages/dashboard/src/client/components/analyze/AnalyzeResults.tsx`](/packages/dashboard/src/client/components/analyze/AnalyzeResults.tsx)

Composes the streamed SEL/CML/PESL cards, the signals section, and (once the stream is done) the action bar from an `AnalyzeController`. Only mounted when the controller reports results.

**Exports:** `AnalyzeResults`

## packages/dashboard/src/client/components/analyze/AnalyzeStates.tsx

[`packages/dashboard/src/client/components/analyze/AnalyzeStates.tsx`](/packages/dashboard/src/client/components/analyze/AnalyzeStates.tsx)

Page chrome and the non-result states of the Analyze page: the title header, the animated streaming-status line, the error panel, and the pre-submit empty state.

**Exports:** `AnalyzeHeader`, `AnalyzeStatus`, `AnalyzeError`, `AnalyzeEmptyState`

## packages/dashboard/src/client/components/analyze/buildSpecMarkdown.ts

[`packages/dashboard/src/client/components/analyze/buildSpecMarkdown.ts`](/packages/dashboard/src/client/components/analyze/buildSpecMarkdown.ts)

Renders the SEL, CML, and PESL results into a Markdown spec document (intent, summary, affected systems, complexity scores, simulated plan, predicted failures, recommended changes) for the Export Spec action.

**Exports:** `buildSpecMarkdown`

## packages/dashboard/src/client/components/analyze/streamAnalyze.ts

[`packages/dashboard/src/client/components/analyze/streamAnalyze.ts`](/packages/dashboard/src/client/components/analyze/streamAnalyze.ts)

POSTs the analyze request to `/api/analyze` and decodes the SSE response line by line, dispatching each typed event to the matching callback and stopping on the `[DONE]` sentinel or a terminal error. Accepts an `AbortSignal` so the page can cancel a stream.

**Exports:** `AnalyzeCallbacks`, `streamAnalyze`

## packages/dashboard/src/client/components/analyze/useAnalyze.ts

[`packages/dashboard/src/client/components/analyze/useAnalyze.ts`](/packages/dashboard/src/client/components/analyze/useAnalyze.ts)

The Analyze page controller hook — owns the form fields, the abortable streaming lifecycle, the per-stage results, and the four post-analysis actions (add to roadmap, dispatch, refine, export spec) with their shared action/error state.

**Exports:** `AnalyzeController`, `useAnalyze`

## packages/dashboard/src/client/components/attention/AttentionHeader.tsx

[`packages/dashboard/src/client/components/attention/AttentionHeader.tsx`](/packages/dashboard/src/client/components/attention/AttentionHeader.tsx)

Heading and escalation search box for the Needs Attention page, including the clear-search affordance that appears once a query is typed.

**Exports:** `AttentionHeader`

## packages/dashboard/src/client/components/attention/AttentionStates.tsx

[`packages/dashboard/src/client/components/attention/AttentionStates.tsx`](/packages/dashboard/src/client/components/attention/AttentionStates.tsx)

The two non-list states of the Needs Attention page: a spinner while interactions load, and a search-aware empty panel that offers to clear the query when a search produced no matches.

**Exports:** `AttentionLoading`, `AttentionEmpty`

## packages/dashboard/src/client/components/attention/helpers.ts

[`packages/dashboard/src/client/components/attention/helpers.ts`](/packages/dashboard/src/client/components/attention/helpers.ts)

Pure list logic for the Needs Attention page — drops resolved interactions, applies the free-text filter across title, description, reasons, and ids, and sorts newest-first — plus a lookup for an interaction's existing attention thread in the thread store.

**Exports:** `filterAndSortInteractions`, `findAttentionThreadId`

## packages/dashboard/src/client/components/local-models/HardwareCard.tsx

[`packages/dashboard/src/client/components/local-models/HardwareCard.tsx`](/packages/dashboard/src/client/components/local-models/HardwareCard.tsx)

Props-only card rendering the resolved hardware profile from `GET /api/v1/local-models/hardware`, degrading on its own to a disabled state (LMLM off), a "no hardware detected" state, or a loading state.

**Exports:** `HardwareCardProps`, `HardwareCard`

## packages/dashboard/src/client/components/local-models/PoolCard.tsx

[`packages/dashboard/src/client/components/local-models/PoolCard.tsx`](/packages/dashboard/src/client/components/local-models/PoolCard.tsx)

Model-pool card — lists pool members with disk used-versus-budget and `pendingEviction` badges, and carries a per-member Remove that POSTs to `/api/v1/local-models/pool/remove` as an auto-approved evict proposal, deferring with a "removes after current run" note when the member is in use.

**Exports:** `PoolCardProps`, `PoolCard`

## packages/dashboard/src/client/components/local-models/RecommendationsCard.tsx

[`packages/dashboard/src/client/components/local-models/RecommendationsCard.tsx`](/packages/dashboard/src/client/components/local-models/RecommendationsCard.tsx)

Two-section card for the local-models panel: hardware-ranked model recommendations with a per-row Install (already-pooled models read "installed") and a live download-progress bar, and the pending model-proposal queue with Approve/Reject. Both paths mutate the pool through proposals and call back so the page refetches.

**Exports:** `RecommendationsCardProps`, `RecommendationsCard`

## packages/dashboard/src/client/components/local-models/format.ts

[`packages/dashboard/src/client/components/local-models/format.ts`](/packages/dashboard/src/client/components/local-models/format.ts)

Shared number formatting for the local-models panel so raw floats never reach the DOM: sizes and VRAM round to one decimal with a trailing `.0` dropped, absolute ranking scores render as whole numbers.

**Exports:** `round1`, `fmtScore`

## packages/dashboard/src/client/components/maintenance/MaintenanceBanners.tsx

[`packages/dashboard/src/client/components/maintenance/MaintenanceBanners.tsx`](/packages/dashboard/src/client/components/maintenance/MaintenanceBanners.tsx)

Banner stack above the maintenance page — the running-tasks indicator, the last `maintenance:error` event, and a dismissible baseref-fallback notice that stays dismissed for the `(ref, repoRoot)` pair the user closed.

**Exports:** `MaintenanceBanners`

## packages/dashboard/src/client/components/maintenance/MaintenanceContent.tsx

[`packages/dashboard/src/client/components/maintenance/MaintenanceContent.tsx`](/packages/dashboard/src/client/components/maintenance/MaintenanceContent.tsx)

Body of the maintenance page: scheduler KPI cards, the schedule section (with its own error and loading handling and the run-now hook-up), and the run-history table.

**Exports:** `MaintenanceContent`

## packages/dashboard/src/client/components/maintenance/MaintenanceTables.tsx

[`packages/dashboard/src/client/components/maintenance/MaintenanceTables.tsx`](/packages/dashboard/src/client/components/maintenance/MaintenanceTables.tsx)

The two maintenance tables — memoized run history (status-accented rows, a compound-candidates badge) and the task schedule with per-row Run now — plus the duration and timestamp formatters they share with the page.

**Exports:** `formatDuration`, `formatTime`, `HistoryTable`, `ScheduleTable`

## packages/dashboard/src/client/components/maintenance/useMaintenanceData.ts

[`packages/dashboard/src/client/components/maintenance/useMaintenanceData.ts`](/packages/dashboard/src/client/components/maintenance/useMaintenanceData.ts)

Owns all maintenance-page data flow: initial fetch of scheduler status, history, and schedule (each independently fallible), WebSocket-driven refetch off orchestrator maintenance events, in-flight task tracking with a polling fallback, and the manual run-now trigger.

**Exports:** `SchedulerStatus`, `HistoryEntry`, `ScheduleRow`, `MaintenanceData`, `useMaintenanceData`

## packages/dashboard/src/client/components/orchestrator/navigation.ts

[`packages/dashboard/src/client/components/orchestrator/navigation.ts`](/packages/dashboard/src/client/components/orchestrator/navigation.ts)

Shared lookup for the agent- and session-navigation callbacks: returns the id of an existing `agent` thread for a given issue, or `undefined` when none is open.

**Exports:** `findAgentThreadId`

## packages/dashboard/src/client/components/roadmap/AuthorIntentForm.tsx

[`packages/dashboard/src/client/components/roadmap/AuthorIntentForm.tsx`](/packages/dashboard/src/client/components/roadmap/AuthorIntentForm.tsx)

Plain-language intent-capture panel for the PM/BA roadmap lane — appends a backlog item through `appendToRoadmap` (`POST /api/roadmap/append`), preserves the typed content for a retry on a tracker conflict, and asks the page to re-fetch the roadmap on success.

**Exports:** `AuthorIntentForm`

## packages/dashboard/src/client/components/webhooks/CreateSubscriptionForm.tsx

[`packages/dashboard/src/client/components/webhooks/CreateSubscriptionForm.tsx`](/packages/dashboard/src/client/components/webhooks/CreateSubscriptionForm.tsx)

Registration form for a webhook subscription (URL plus comma-separated event globs) with inline error display, and the one-time banner that reveals the signing secret of a just-created subscription.

**Exports:** `CreatedSubscription`, `CreateSubscriptionForm`, `CreatedSecretBanner`

## packages/dashboard/src/client/components/webhooks/QueueStatsPanel.tsx

[`packages/dashboard/src/client/components/webhooks/QueueStatsPanel.tsx`](/packages/dashboard/src/client/components/webhooks/QueueStatsPanel.tsx)

Counter grid for the SQLite delivery queue (pending, retrying, in flight, dead, delivered) fed by polled `GET /api/v1/webhooks/queue/stats` snapshots, highlighting a non-zero dead count in red.

**Exports:** `QueueStats`, `QueueStatsPanel`

## packages/dashboard/src/client/components/webhooks/SubscriptionList.tsx

[`packages/dashboard/src/client/components/webhooks/SubscriptionList.tsx`](/packages/dashboard/src/client/components/webhooks/SubscriptionList.tsx)

Lists the active webhook subscriptions with id, target URL, and subscribed events, each row carrying a delete action; renders a "no subscriptions yet" line when the list is empty.

**Exports:** `SubscriptionList`

## packages/dashboard/src/client/hooks/useLocalModelsPanel.ts

[`packages/dashboard/src/client/hooks/useLocalModelsPanel.ts`](/packages/dashboard/src/client/hooks/useLocalModelsPanel.ts)

The single data hook behind the local-models page — fetches hardware, pool, recommendations, and proposals as independently degradable resources, owns the panel's one WebSocket with exponential-backoff reconnect, coalesces delta-driven refetches on a trailing debounce window with a generation guard, and tracks per-repo install progress from `local-models:install` frames.

**Exports:** `Resource`, `InstallProgressState`, `UseLocalModelsPanelResult`, `useLocalModelsPanel`
