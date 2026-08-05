# Strengthen telemetry consent surface (stdout notice)

**Roadmap item:** `strengthen-telemetry-consent-surface`
**External-ID:** github:Intense-Visions/harness-engineering#559
**Keywords:** telemetry, consent, first-run-notice, privacy, posthog, stdout

## Overview

`packages/cli/src/hooks/telemetry-reporter.js` shows a one-time first-run privacy
notice before it sends adoption telemetry to PostHog. The notice was written to
**stderr**, which is frequently hidden in IDE-hosted agent sessions, so the
consent surface was weaker than the real data flow (a live PostHog ingest).

This change makes the notice visible and truthful. It does **not** change when or
whether telemetry is sent.

### Problem

1. The notice went to `process.stderr.write`, invisible in most IDE sessions.
2. The wording ("No personal information is sent") understated the actual data
   flow: the PostHog `distinct_id` defaults to the git `user.name`
   (`identity.alias ?? installId`), and `project`/`team` names are also included
   when configured.

### Goals

1. Write the first-run notice to **stdout** so adopters see it. The notice is
   plain prose (never JSON), and the only caller that spawns this hook
   (`flushTelemetryBackground` in `command-telemetry.ts`) uses
   `stdio: ['pipe', 'ignore', 'ignore']`, so stdout is never consumed as a
   structured-output protocol. Diagnostic log lines stay on stderr.
2. Preserve the once-only behavior: the notice writes a
   `.harness/.telemetry-notice-shown` marker and only prints on the first run.
3. Reword the notice to truthfully enumerate what is collected (skill
   name/outcome/duration/phases, OS/Node/harness versions, a random install ID,
   and — when configured — git user.name and project/team names) and how to opt
   out (`DO_NOT_TRACK=1` or `harness.config.json → telemetry.enabled: false`).

### Non-goals

- **No `telemetry.consented` opt-in gate.** Gating the PostHog batch send on a new
  consent flag is a genuine privacy-policy decision — it would stop telemetry for
  existing installs until they opt in. That is deferred as a human decision (see
  the roadmap item's "optionally add" note), not implemented here.
- No change to the transport, batching, cursor, or consent-resolution logic.
