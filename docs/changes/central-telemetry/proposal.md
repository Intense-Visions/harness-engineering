# Central Telemetry Collection

> Extend the harness CLI to report anonymized product analytics to a central PostHog instance via its HTTP capture API. Zero vendor SDK dependency — a thin transport layer in `packages/core` handles event dispatch using Node's built-in `fetch()`.

## Goals

1. Understand which skills are used, how often, and whether they succeed — to prioritize roadmap work
2. Collect anonymous data by default with zero PII; allow users to opt in to sharing project, team, or personal identity
3. Honor ecosystem privacy conventions (`DO_NOT_TRACK`, `HARNESS_TELEMETRY_OPTOUT`)
4. Add zero vendor dependencies to `node_modules`
5. Reuse the proven stop-hook + JSONL pipeline — no new collection mechanisms

## Non-Goals (Deferred)

- Operational health metrics (error rates, latency distributions) — future phase
- Real-time streaming — batch at session end is sufficient
- Feature flags or A/B testing via PostHog
- Self-hosted PostHog deployment (use cloud initially)

## Decisions

| Decision                         | Choice                                           | Rationale                                                                                                |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Analytics vs. operational health | Product analytics first                          | Higher value at current stage; operational health deferred                                               |
| Destination                      | PostHog via HTTP API                             | Ecosystem standard for dev tools; self-hostable if needed later; no SDK dependency                       |
| Transport                        | Built-in `fetch()` with basic retry              | Zero vendor deps; Node 22 ships fetch; ~300 lines vs SDK's 200KB                                         |
| Default mode                     | Anonymous                                        | Random install ID only; no PII without explicit opt-in                                                   |
| Identity model                   | Granular opt-in fields                           | Users choose independently which identity fields to share (project, team, alias) — not forced into tiers |
| Repo config                      | `harness.config.json` → `telemetry.enabled` only | On/off toggle is project-level and safe to commit                                                        |
| User identity storage            | `.harness/telemetry.json` (gitignored)           | Identity fields must not enter version control                                                           |
| Env override                     | `DO_NOT_TRACK=1` / `HARNESS_TELEMETRY_OPTOUT=1`  | De facto ecosystem standard; overrides config regardless                                                 |
| Collection mechanism             | Existing stop-hook pipeline                      | Proven pattern from cost-tracker and adoption-tracker; no new collection path                            |
| First-run notice                 | One-time stderr message                          | Respects user awareness; flag stored in `.harness/.telemetry-notice-shown`                               |

## Technical Design

### File Layout

**New files in `packages/core/src/telemetry/`:**

```
telemetry/
├── index.ts           — public API (collectAndReport)
├── consent.ts         — config + env var checks, returns consent state
├── collector.ts       — reads adoption.jsonl, formats TelemetryEvent payloads
├── transport.ts       — HTTP POST to PostHog /batch with retry
├── install-id.ts      — reads/creates .harness/.install-id (UUIDv4)
└── types.ts           — TelemetryEvent, ConsentState, TelemetryConfig
```

**New file in `packages/cli/src/hooks/`:**

```
telemetry-reporter.js  — stop hook, calls core telemetry module
```

### Data Structures

```typescript
// packages/types/src/telemetry.ts (shared types)
interface TelemetryConfig {
  enabled: boolean; // default: true
  identity?: {
    project?: string;
    team?: string;
    alias?: string;
  };
}

interface ConsentState {
  allowed: boolean; // false if DO_NOT_TRACK, config disabled, or env optout
  identity: {
    // only populated fields from .harness/telemetry.json
    project?: string;
    team?: string;
    alias?: string;
  };
  installId: string; // UUIDv4, always present when allowed
}

interface TelemetryEvent {
  event: string; // e.g. "skill_invocation", "session_end"
  distinctId: string; // installId (anonymous) or alias (identified)
  properties: {
    installId: string;
    os: string;
    nodeVersion: string;
    harnessVersion: string;
    // event-specific fields
    skillName?: string;
    duration?: number;
    outcome?: 'success' | 'failure';
    phasesReached?: string[];
    // identity fields (only if opted in via .harness/telemetry.json)
    project?: string;
    team?: string;
  };
  timestamp: string; // ISO 8601
}
```

### Config Split

| File                      | Location        | Git-tracked     | Contents                                              |
| ------------------------- | --------------- | --------------- | ----------------------------------------------------- |
| `harness.config.json`     | Project root    | Yes             | `telemetry.enabled` (project-level default)           |
| `.harness/telemetry.json` | `.harness/` dir | No (gitignored) | `identity.project`, `identity.team`, `identity.alias` |

The consent module merges both: project config controls the on/off toggle, the local-only file holds identity fields. A team can ship `telemetry.enabled: true` in the repo without leaking anyone's identity into version control.

**Config schema addition (`packages/cli/src/config/schema.ts`):**

```typescript
telemetry: z.object({
  enabled: z.boolean().default(true),
}).optional();
```

**`.harness/telemetry.json` (user-local, gitignored):**

```json
{
  "identity": {
    "project": "myapp",
    "team": "platform",
    "alias": "cwarner"
  }
}
```

### Transport

```typescript
// transport.ts
async function send(events: TelemetryEvent[], apiKey: string): Promise<void> {
  const payload = { api_key: apiKey, batch: events };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://app.posthog.com/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    if (attempt < 2) await sleep(1000 * (attempt + 1)); // 1s, 2s backoff
  }
  // silent failure — never block session teardown
}
```

### Consent Check Flow

```
telemetry-reporter.js (stop hook)
  → consent.check()
    1. if process.env.DO_NOT_TRACK === "1" → { allowed: false }
    2. if process.env.HARNESS_TELEMETRY_OPTOUT === "1" → { allowed: false }
    3. read harness.config.json → telemetry.enabled
    4. if false → { allowed: false }
    5. read .harness/telemetry.json → identity fields
    6. return { allowed: true, identity, installId }
  → if !allowed, exit silently
  → collector.collect() — read adoption.jsonl, format events
  → transport.send(events)
```

### First-Run Notice

Printed to stderr once per install:

```
Harness collects anonymous usage analytics to improve the tool.
No personal information is sent. Disable with:
  DO_NOT_TRACK=1  or  harness.config.json → telemetry.enabled: false
```

Flag file: `.harness/.telemetry-notice-shown` — if exists, skip notice.

### CLI Identity Command

```
harness telemetry identify --project myapp --team platform --alias cwarner
harness telemetry identify --clear
harness telemetry status
```

Reads/writes `.harness/telemetry.json`. The `status` subcommand shows current consent state, install ID, and configured identity fields.

## Success Criteria

1. When `telemetry.enabled: true` (default), skill invocations appear in PostHog with install ID, OS, harness version, skill name, duration, and outcome. No PII.
2. Events include project/team/alias only when `.harness/telemetry.json` has those fields set.
3. `DO_NOT_TRACK=1` disables all reporting — no HTTP requests made, verified by test.
4. `HARNESS_TELEMETRY_OPTOUT=1` disables all reporting — same behavior as `DO_NOT_TRACK`.
5. `telemetry.enabled: false` in config disables all reporting — no HTTP requests made.
6. First-run notice shown exactly once on stderr — not repeated after flag file exists.
7. Zero new production dependencies — no additions to `package.json` beyond dev dependencies for tests.
8. Silent failure — network errors, timeouts, or PostHog downtime never block session teardown or produce user-visible errors.
9. Transport completes within 5 seconds — abort signal enforced; 3 retries with linear backoff.
10. `harness telemetry identify` CLI command sets/clears identity in `.harness/telemetry.json`.

## Implementation Order

### Phase 1 — Types and consent module

- Add `TelemetryEvent`, `ConsentState`, `TelemetryConfig` types to `packages/types`
- Implement `consent.ts` in `packages/core/src/telemetry/` (config merge, env var checks)
- Implement `install-id.ts` (UUIDv4 creation/persistence)
- Extend config schema with `telemetry.enabled`
- Unit tests for consent logic and env var overrides

### Phase 2 — Collector and transport

- Implement `collector.ts` (reads adoption.jsonl, formats events)
- Implement `transport.ts` (PostHog HTTP `/batch`, retry, timeout)
- Unit tests with mocked fetch for transport
- Integration test: collector → transport with a local HTTP server

### Phase 3 — Stop hook and first-run notice

- Implement `telemetry-reporter.js` stop hook
- First-run notice logic with `.harness/.telemetry-notice-shown` flag
- Register hook in CLI hook pipeline
- End-to-end test: skill invocation → JSONL → hook → HTTP capture

### Phase 4 — CLI identity command

- `harness telemetry identify --project --team --alias`
- `harness telemetry identify --clear`
- `harness telemetry status` (shows current consent state and identity)
- Reads/writes `.harness/telemetry.json`

### Phase 5 — Validation and docs

- Update `docs/reference/configuration.md` with telemetry config
- Add telemetry section to README or AGENTS.md
- Run `harness validate`
- Verify PostHog dashboard receives events from a real session
