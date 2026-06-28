---
'@harness-engineering/orchestrator': patch
---

Implement `Last-Event-ID` reconnection for the `GET /api/v1/events` SSE stream, which was deferred ("clients lose events across reconnects"). Previously each frame carried a _random_ `id`, so a reconnecting client's `Last-Event-ID` pointed at nothing replayable.

A per-bus `SseEventLog` is now the single subscriber to the event bus: it stamps every event with a monotonic, gap-free sequence id, keeps the most recent events in a bounded in-memory ring buffer (default 1024), and fans them out to connected streams. A client that reconnects with `Last-Event-ID: <seq>` (browser `EventSource` sends this automatically) replays every buffered event strictly after that id — with no gap and no duplicate — before live delivery resumes. A non-numeric/absent `Last-Event-ID` (e.g. a legacy client) resumes live with no replay. The buffer is in-memory and bounded, so a server restart or an outage longer than the buffer simply resumes live from the next event, exactly like a first-time connection; the wire contract is unchanged so a durable store can replace the ring buffer later.
