---
slug: "strengthen-telemetry-consent-surface"
milestone: "v5.0 — Trust & Security Model"
order: 3
---

### Strengthen telemetry consent surface

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/telemetry-reporter.js` prints first-run privacy notice to stderr. In IDE sessions stderr is often invisible — adopters technically opted in by installing the plugin but the consent surface is weak. Move the notice to stdout. Optionally add a `harness.config.json` `telemetry.consented: true` field that the adopter must set before first batch send. The PostHog ingest is real (1319 dogfood records over 80 days); the consent surface should match the data flow. Source: Pass 5 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#559
