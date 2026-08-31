# Captured `claude`-CLI envelopes

Real, on-disk captures of what the `claude` CLI emits on stdout, used by the
**Tier A** deterministic E2E tests to replay real external-tool behavior with **no
live network or LLM**. This is the fixture convention ADR 0111 calls for; it is
the systemic answer to the class of bug #1558 exposed.

## What an envelope is

The `claude` CLI prints a single JSON object (`--output-format json`). The fields
the harness reads:

- `structured_output` — the schema-conforming object, when the model actually
  emitted one. The provider prefers this.
- `result` — free-text. Sometimes the model **narrates** here and omits
  `structured_output` entirely (the #1558 bug); the provider must salvage /
  corrective-retry rather than degrade silently.
- `usage`, `model`, `type` — metadata.

## The fixtures

| File                     | Shape                                     | Replays                                                                 |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| `structured-output.json` | valid `structured_output`                 | the happy path                                                          |
| `chatty-narration.json`  | prose in `result`, NO `structured_output` | the exact #1558 miss ("I've already called the StructuredOutput tool…") |

## How to capture a new one

Run the real CLI once and save its stdout verbatim:

```bash
claude -p "…" --output-format json > fixtures/claude-cli/<name>.json
```

Redact any project-specific content down to a minimal reproduction. Load it in a
test with `loadClaudeEnvelope('<name>')` from the E2E support module and feed it
to a fake `claude` on `PATH` via `withFakeClaude(...)`.

## Why Tier B still matters

Captured envelopes can drift from real tool behavior over time. **Tier B** (the
gated live lane) is the backstop that re-checks the real CLI nightly and detects
that drift — letting Tier B rot silently would re-open the #1558 gap.

See `docs/guides/e2e-testing.md` for the full framework.
