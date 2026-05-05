# Harness Pulse

> Single-page time-windowed product pulse. **Phase 3 ships the first-run interview only**: it converts vague intent into a concrete `pulse:` block in `harness.config.json`, refuses read-write DB credentials, and seeds from `STRATEGY.md` when present. The actual `harness pulse run` (Phases 2-4 of the runtime) is deferred to spec Phase 4.

## When to Use

- Manually, when a project wants to start receiving daily pulse reports
- When `harness.config.json` has no `pulse:` block and the user invokes `/harness:pulse`
- NOT for ad-hoc one-off metric queries (that's the analytics tool's job)
- NOT for replacing dashboards (pulse is a single-page summary, not a metrics platform)
- NOT for projects that have not yet decided what their key metrics are (run `harness-strategy` first to write `STRATEGY.md`; pulse seeds from it)

## Process

### Iron Law

**No PII reaches `harness.config.json` and no read-write DB credential is accepted.** Both are interview-time gates; both are hard refusals (no warnings, no overrides without an explicit user-typed escape).

---

### Phase 0: ROUTE BY CONFIG STATE

1. Read `harness.config.json`.
2. If `pulse.enabled` is set (true OR false), skip directly to "Phase 2: RUN" — **deferred to spec Phase 4**. For now, surface "pulse already configured; the run path ships in Phase 4" and stop.
3. Otherwise enter Phase 1.

---

### Phase 1: FIRST-RUN INTERVIEW

Read `references/interview.md` for the SMART pushback rules and the READ-WRITE-DB rejection rule. Both are mandatory.

1. **Seed from STRATEGY.md.** Shell out to a Node one-liner that imports `seedFromStrategy` from `@harness-engineering/core`. Capture `{ name, keyMetrics, warnings }`.
   - Surface `warnings` to the user verbatim.
   - If `name` is non-null, confirm it as the product name; otherwise prompt.
   - For each `keyMetric`, walk it through the SMART bar in step 4.

2. **Pick the lookback default.** Use `emit_interaction` (type: `question`) when in MCP mode; otherwise present numbered options in chat: `["24h", "7d", "30d", "custom"]`. Default `24h` per spec.

3. **Identify the primary engagement event** (e.g. `session_started`). Apply the SMART bar. If the user can't name one, set `null` and add a pending entry. Record the event name in `primaryEvent`.

4. **Identify the value-realization event** (e.g. `plan_completed`). SMART bar applies. Record in `valueEvent`.

5. **Identify completion events** (zero or more). SMART bar per item. Record in `completionEvents`.

6. **Quality scoring (optional).** Ask whether the user wants quality sampling on a single dimension (e.g. "did the plan deliver value"). Default off. If enabled, set `qualityScoring: true` and record `qualityDimension`.

7. **Wire data sources.** Ask which providers are available:
   - `analytics`: posthog, amplitude, mixpanel, custom — or null
   - `tracing`: sentry, datadog, custom — or null
   - `payments`: stripe, custom — or null
   - `db`: opt-in only, with the **READ-WRITE-DB rejection rule** active
     For each non-null choice, check `getPulseAdapter(name)`. If absent, surface the "Phase 4 will ship the adapter" warning from `references/interview.md`.

8. **Walk every STRATEGY.md key metric** through SMART. Map to an event when wired; otherwise append to `pendingMetrics` (or `excludedMetrics` if explicitly skipped). Cite `STRATEGY.md` when seeding so the user understands provenance.

9. **Confirm the assembled config.** Show the user the proposed `pulse:` block; ask for confirmation.

10. **Write the config.** Shell out to a Node one-liner that imports `writePulseConfig` from `@harness-engineering/core`. Pipe the JSON through stdin so user-supplied event names, qualityDimension, and pendingMetrics never cross the shell tokenizer (quotes, backticks, `$()`, `$VAR` in user input would otherwise break the command or allow injection):

    ```bash
    echo '<json-blob>' | node -e "import('@harness-engineering/core').then(m => m.writePulseConfig(JSON.parse(require('fs').readFileSync(0, 'utf-8')), { configPath: 'harness.config.json' })).catch(err => { console.error(err.message); process.exit(1); })"
    ```

    The writer preserves all other config keys and writes a `.bak`.

11. **Offer to register the `product-pulse` maintenance task.** Deferred: Phase 6 of the spec wires it. For now, surface "the daily 8am `product-pulse` task will be registered automatically once Phase 6 of the feedback-loops spec ships; you can also run pulse on demand with `/harness:pulse [window]` once Phase 4 ships."

12. **Run `harness validate`** to confirm the new `pulse:` block parses.

---

### Phase 2: RUN — deferred to spec Phase 4

Stub: when `pulse.enabled === true`, this phase will dispatch analytics/tracing/payments queries in parallel, run the SanitizeFn for each provider's response, and stash sanitized results for Phase 3. NOT YET IMPLEMENTED. The skill exits early with a "deferred to Phase 4" message if it reaches this phase.

### Phase 3: ASSEMBLE — deferred

### Phase 4: SAVE — deferred

## Harness Integration

- **`harness validate`** — Run after `writePulseConfig`; the existing pulse-schema validator catches malformed blocks.
- **`@harness-engineering/core`** primitives consumed by this skill:
  - `writePulseConfig(config, { configPath })` — atomic config update with .bak.
  - `seedFromStrategy({ cwd })` — defensive STRATEGY.md reader.
  - `getPulseAdapter(name)` / `listPulseAdapters()` — adapter discovery (Phase 4 populates).
  - `PulseConfigSchema` / `PII_FIELD_DENYLIST` — schema and PII contracts (already shipped Phase 1).
- **Boundary with `harness-strategy`** — Strategy writes `STRATEGY.md`; pulse reads it to seed. Pulse never writes to `STRATEGY.md`.
- **Boundary with `harness-observability`** — Observability designs _what_ to instrument; pulse is the read-side companion that surfaces what was instrumented.
- **Decision 6 (read-only)** — Pulse refuses read-write DB credentials. Documented in `references/interview.md`.
- **Decision 7 (PII contract)** — Every provider source must have a registered `SanitizeFn` adapter. Phase 3 ships the registry; Phase 4 ships the adapters.

## Success Criteria

- On a project with no `pulse:` block, the interview produces a valid `pulse:` block in `harness.config.json` with all non-pulse keys preserved.
- A `harness.config.json.bak` is written before mutation.
- A read-write DB credential is refused; the interview either accepts a read-only credential or sets `sources.db.enabled: false`.
- When `STRATEGY.md` exists, `name` and `Key metrics` seed the interview; missing/malformed STRATEGY.md soft-fails with warnings.
- `harness validate` passes after the interview completes.

## Examples

### Example: greenfield (no STRATEGY.md, no existing pulse block)

- Phase 0: route to Phase 1.
- Phase 1.1: `seedFromStrategy` returns `{ name: null, keyMetrics: [], warnings: ['STRATEGY.md not found'] }`.
- Phase 1.2-7: prompt user; collect `lookbackDefault: '24h'`, `primaryEvent: 'session_started'`, `valueEvent: 'plan_completed'`, `sources.analytics: 'posthog'` (with adapter-availability warning), `sources.db.enabled: false`.
- Phase 1.10: `writePulseConfig` writes the block; `.bak` saved.
- Phase 1.12: `harness validate` passes.

### Example: STRATEGY.md present with 3 Key metrics

- Phase 1.1: seed returns `{ name: 'Acme', keyMetrics: ['DAU', 'plans/week', 'p95 latency'] }`.
- Phase 1.8: walk each metric through SMART.
  - "DAU" → mapped to `session_started` count over 24h, accepted.
  - "plans/week" → mapped to `plan_completed` count over 7d, accepted (recorded as a future custom window).
  - "p95 latency" → no tracing source wired yet; lands in `pendingMetrics`.

### Example: user offers an admin DB credential

- Phase 1.7: user pastes `postgresql://admin:pwd@host/db`.
- Skill matches `admin` username against the rejection list; refuses; cites Decision 6.
- User declines to provide a read-only credential; skill writes `sources.db.enabled: false`.

## Gates

- **READ-WRITE-DB rejection is non-negotiable.** No flag, no override, no "I know what I'm doing" path. Refuse and document.
- **SMART pushback is mandatory on every proposed metric/event.** Silently accepting a vague name pollutes the corpus.
- **`writePulseConfig` is the only sanctioned write path.** Do not hand-edit `harness.config.json`. The writer is the layer that preserves non-pulse keys and writes the .bak.
- **`harness validate` must pass before exit.** A malformed `pulse:` block silently breaks the daily task once Phase 4 ships.

## Escalation

- **User insists on read-write DB credentials:** Refuse. Set `sources.db.enabled: false`. Stop.
- **Adapter not registered for a chosen provider:** Warn, record the choice, continue. The runtime gate (Phase 4) refuses to run until the adapter ships.
- **STRATEGY.md frontmatter is malformed but H1 is present:** Use H1 as `name` and surface a warning. If neither is parseable, prompt the user.
- **`writePulseConfig` throws:** Report the validator error verbatim. Do not retry without user fix.
