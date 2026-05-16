# Hermes Phase 0.2 — Gateway Tunnel Guide

**Keywords:** hermes, gateway-api, tunnel, tailscale, cloudflare-tunnel, ngrok, documentation, slack-bridge

**Parent meta-spec:** `docs/changes/hermes-adoption/proposal.md`
**Parent phase spec:** `docs/changes/hermes-phase-0-gateway-api/proposal.md` (§D5, §547)
**Roadmap item:** `Hermes Phase 0.2: Gateway Tunnel Guide` (external-id `github:Intense-Visions/harness-engineering#328`)

## Overview

Phase 0 of the Orchestrator Gateway API shipped with a deliberate decision (`§D5`) that the orchestrator binds `127.0.0.1` by default and that public exposure of bridge endpoints is a **documentation problem, not a code problem** — operators reach for an existing tunnel tool (Tailscale, Cloudflare Tunnel, or ngrok) rather than building a public-binding code path into harness. Phase 0 deferred the actual guide that explains how to do this; Phase 0.1 then shipped the canonical reference consumer (`examples/slack-echo-bridge/`) which references the missing guide by path with an inline "forthcoming" note (`examples/slack-echo-bridge/README.md:91`).

Phase 0.2 closes that loop by writing `docs/guides/gateway-tunnel.md`: the canonical, copy-pasteable, end-to-end procedure for exposing a webhook-receiving bridge to a live harness orchestrator using each of the three supported tunnel patterns, with the reference Slack bridge as the worked example.

### Problem

Three concrete frictions exist today:

1. **The bridge README points at a non-existent file.** `examples/slack-echo-bridge/README.md` references `docs/guides/gateway-tunnel.md` as the canonical setup; the link is dead until this phase ships.
2. **The orchestrator's network constraints are documented only in code.** A bridge author hitting `POST /api/v1/webhooks` with `http://localhost:3000/...` gets a 422 (`URL must use https` or `URL must not target private or loopback addresses`) with no obvious next step. The fix is "use a tunnel" — but nothing in the docs tree names the supported tunnel patterns.
3. **Three tunnel tools have meaningfully different operational profiles.** Tailscale (private mesh, signed-in peers), Cloudflare Tunnel (anonymous public HTTPS, free, persistent), and ngrok (ephemeral, easiest for one-shot demos) each suit a different deployment shape. Without comparison the operator must read three sets of vendor docs, run three abandoned setups, and stitch together which step is harness-specific.

### Goals

1. **Reproducible end-to-end procedure** for each of Tailscale, Cloudflare Tunnel, and ngrok — fresh developer machine → tunnel up → live orchestrator → Slack message received, in one read.
2. **Explicit citation of orchestrator constraints** so the guide stays correct even if the orchestrator's URL validator changes: `https://` only, `isPrivateHost()` rejects loopback / RFC-1918 / link-local / `*.local`, body cap 1 MiB.
3. **Trade-off matrix** so the operator can pick a tool by deployment shape (private mesh vs. anonymous public vs. one-shot demo), not by alphabetical order.
4. **Cross-link from the bridge README and docs index** so anyone arriving from the Phase 0.1 reference consumer or the guides landing page finds it.

### Non-goals

- **Tunnel tool comparison beyond the three named patterns.** SSH reverse tunnels, Wireguard hand-rolled, frp, localtunnel — out of scope; the spec named the canonical three.
- **Production deployment guidance.** This guide targets a developer machine + a deployed orchestrator OR a deployed bridge + a developer-laptop orchestrator. Multi-tenant SaaS deployment, autoscaling, HA tunneling — out of scope.
- **A second worked example.** The Slack bridge IS the worked example (proposal §547: "includes a sample Slack-bot bridge as the end-to-end example"). Discord/GitHub-app/custom examples are deferred.
- **Codifying the tunnel as a harness-managed primitive.** Proposal §D5 explicitly rejected `HARNESS_LISTEN_MODE=public` and a harness-owned tunnel. Nothing in this phase adds code to the orchestrator or CLI.

### Scope

**In-scope:**

- `docs/guides/gateway-tunnel.md` (NEW)
- `docs/guides/index.md` — add entry pointing at the new guide
- `examples/slack-echo-bridge/README.md` — remove the inline "forthcoming" `_Note:_` block (the dead-link disclaimer at lines 91); the link itself is preserved
- `docs/roadmap.md` — flip the Phase 0.2 item status from `planned` to `done` and link the plan

**Out-of-scope:**

- Orchestrator code changes (no new env vars, no new validators, no public-binding code path)
- New examples directory or new reference consumer
- Knowledge graph node additions (no `business_concept` / `business_process` / `business_rule` nodes — this is operator documentation, not a knowledge primitive)

## Decisions

| #   | Decision                                                                                                                                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Three tunnel patterns covered in fixed order: Cloudflare Tunnel → Tailscale → ngrok                                                                                                                                     | Cloudflare Tunnel is the "production-shaped" default (free, persistent hostname, anonymous public HTTPS, no peer-install on the orchestrator side); Tailscale is the right answer when both sides are owned by the same operator and want a private mesh; ngrok is the right answer for a 5-minute demo or CI smoke run. Ordering signals the recommended-first choice. **Rejected:** alphabetical (Cloudflare/Tailscale/ngrok would not survive a rename and obscures the recommendation). |
| 2   | The Slack bridge is the only worked example                                                                                                                                                                             | Proposal §547 explicitly names it as the end-to-end example. A second example would double maintenance burden without changing the tunnel shape. **Rejected:** generic curl-receiver example (no Slack proof, easier to write incorrectly), Discord adapter (no reference consumer exists yet).                                                                                                                                       |
| 3   | Each pattern documents two topology variants: **bridge-local + orchestrator-remote** and **bridge-remote + orchestrator-local**                                                                                         | These are the two real shapes a developer faces. Bridge-local + orchestrator-remote is the deployed-orchestrator-on-a-VPS case; bridge-remote + orchestrator-local is the developer-laptop-running-the-orchestrator case. Skipping either leaves a 50% reader stranded. **Rejected:** single bidirectional topology (overspecifies, doesn't match either real shape).                                                                  |
| 4   | The HMAC verification snippet from `examples/slack-echo-bridge/src/signer.ts` is NOT duplicated into the guide — only linked                                                                                             | Duplicated code rots. The bridge owns the canonical 5-line snippet; the guide links to it. **Rejected:** inline the snippet (rot risk; proposal §792 already places the snippet in the bridge, not in this guide).                                                                                                                                                                                                                    |
| 5   | The guide cites orchestrator constraints by file path + line range (`packages/orchestrator/src/server/routes/v1/webhooks.ts:143-150`, `packages/orchestrator/src/server/utils/url-guard.ts`) rather than restating them | Restated constraints drift; cited constraints stay correct or fail loudly under `harness check-docs`. **Rejected:** restate inline (drift risk).                                                                                                                                                                                                                                                                                      |
| 6   | A "Troubleshooting" table mirrors the Slack-bridge README shape                                                                                                                                                         | Operators land on the troubleshooting table 80% of the time after the happy-path fails. Bridge README already established the table shape (`README.md:117-126`); the guide reuses the convention. **Rejected:** free-form troubleshooting prose (less scannable).                                                                                                                                                                     |
| 7   | No code, no tests, no harness CLI surface added                                                                                                                                                                         | The whole point of §D5 was to keep this out of code. Phase 0.2 IS the documentation deliverable.                                                                                                                                                                                                                                                                                                                                      |

## Technical Design

### File layout

**New:**

```
docs/guides/gateway-tunnel.md
docs/changes/hermes-phase-0-2-gateway-tunnel-guide/proposal.md   -- this file
docs/changes/hermes-phase-0-2-gateway-tunnel-guide/plans/<dated>-gateway-tunnel-guide-plan.md
```

**Modified:**

- `docs/guides/index.md` — add "Gateway Tunnel Guide" entry under the existing alphabetical-ish guide list (between "Docker Deployment" and "Features Overview" by natural ordering).
- `examples/slack-echo-bridge/README.md` — delete the "forthcoming" disclaimer paragraph at line 91. The pointer at line 89 stays exactly as-is and now resolves.
- `docs/roadmap.md` — Phase 0.2 entry: `Status: planned` → `done`, `Plan:` set to the plan path.

### Guide structure (`docs/guides/gateway-tunnel.md`)

```
# Gateway Tunnel Guide

## Why this guide exists
   - Orchestrator binds 127.0.0.1 by default
   - Bridges must register `https://` URLs that resolve to non-private hosts
   - Tunnel is the operator-side solution; harness does not own one

## What you need before starting
   - A running harness orchestrator with a token that has `subscribe-webhook` scope
   - The Slack echo bridge (examples/slack-echo-bridge/) built and runnable locally
   - Slack workspace + bot token + channel id

## Pick a tunnel
   - Quick comparison table (anonymity, persistence, install footprint, recommended for)
   - Pattern 1: Cloudflare Tunnel (recommended for production-shaped use)
   - Pattern 2: Tailscale (recommended for private mesh)
   - Pattern 3: ngrok (recommended for demos / one-shot tests)

## Per-pattern recipe (×3)
   Each pattern includes:
     - Install + auth one-time setup
     - Start the bridge on 127.0.0.1:3000
     - Bring up the tunnel
     - Capture the public https URL
     - POST /api/v1/webhooks with the public URL
     - Trigger maintenance.completed, watch Slack
     - Teardown
   Each pattern documents BOTH topology variants:
     (a) bridge-local, orchestrator-remote
     (b) bridge-remote, orchestrator-local

## Verifying it worked
   - Bridge logs: webhook.received → webhook.delivered
   - Orchestrator dashboard: webhook delivery status row
   - Slack: message visible in channel

## Constraints (cited from code)
   - https only (routes/v1/webhooks.ts:143)
   - non-private host (utils/url-guard.ts)
   - 1 MiB body cap

## Troubleshooting
   - URL must use https → tunnel not started or http url copied
   - URL must not target private or loopback addresses → public hostname mismatch
   - 401 webhook.signature.mismatch → secret swap missed
   - Tunnel reset / 502 from public endpoint → bridge not listening or port mismatch

## Security notes
   - Tunnel public URL = world-readable; HMAC signature is your authn
   - Tailscale: peers are signed-in; the bridge still validates HMAC
   - Cloudflare Tunnel: optional Cloudflare Access in front for IP allowlisting
   - ngrok free plan rotates URLs; recreate the subscription on each restart

## Next steps
   - Build a non-Slack bridge: link bridge README signer snippet
   - Production deployment: link Docker guide, mention HOST=0.0.0.0 for container orchestrators
```

### Integration Points

This is the section the workflow explicitly requires. Documents how the new guide wires into the surrounding system.

1. **Bridge README (`examples/slack-echo-bridge/README.md`)** — already links to `docs/guides/gateway-tunnel.md` at line 89. The "forthcoming" disclaimer at line 91 gets removed; the link goes live. No other text changes.

2. **Guides index (`docs/guides/index.md`)** — gains a new "### Gateway Tunnel Guide" section in the same shape as the existing entries (one-line summary, "Best for:" line). Placement: just after "Docker Deployment" since they're both operational-deployment guides.

3. **Roadmap (`docs/roadmap.md`)** — Phase 0.2 entry flips to `done`, the `Plan:` line points at the dated plan file, and the GitHub external-id is preserved. The `manage_roadmap` MCP tool handles the GitHub-side close as part of integration.

4. **Top-level README (`README.md`)** — line 30's Orchestrator Gateway API bullet currently links to the Slack bridge but not to the tunnel guide. NOT modified in this phase: the guide is downstream of the bridge in the natural reading order (bridge README is the entry point; the guide is the bridge's deeper-dive). Cross-linking from the top-level README adds a fourth link to an already-dense bullet without a navigation win.

5. **Knowledge pipeline** — no new nodes. The guide is operator-facing, not knowledge-graph material. The phase ships zero updates to `docs/knowledge/`.

6. **Code citations** — the guide cites `packages/orchestrator/src/server/routes/v1/webhooks.ts:143-150` (https + private-host check) and `packages/orchestrator/src/server/utils/url-guard.ts:1-12` (full `isPrivateHost` regex). `harness check-docs` (drift detector) will surface line-number drift on future edits; the integration step verifies the citations resolve at write-time.

7. **ADR linkage** — `docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md` lines 82-83 already note that the gateway-tunnel guide is the deferred Phase 0.2 deliverable. The ADR text remains correct after this phase (still "the deferred deliverable" — done is also a kind of resolution; the ADR's "deferred" reads as "carved out", not "still pending"). No ADR edit required, but the integration step double-checks by grep.

## Success Criteria

### Level 1 — Functional

- [ ] `docs/guides/gateway-tunnel.md` exists at the path the bridge README points to
- [ ] The guide includes a section for each of Cloudflare Tunnel, Tailscale, and ngrok
- [ ] Each pattern includes copy-pasteable commands ending in a `curl POST /api/v1/webhooks` step
- [ ] The HMAC verification reference points at `examples/slack-echo-bridge/src/signer.ts`, not an inline copy
- [ ] The orchestrator-constraint citations resolve to the correct line ranges at write time
- [ ] `docs/guides/index.md` lists the new guide
- [ ] `examples/slack-echo-bridge/README.md` no longer carries the "forthcoming" disclaimer
- [ ] `docs/roadmap.md` Phase 0.2 entry status is `done`

### Level 2 — Reproducibility (manual)

- [ ] A fresh developer machine + Cloudflare Tunnel + a remote orchestrator URL completes the worked example end-to-end (proposal §675's reproducibility criterion, scoped to the Cloudflare path as the recommended default)

### Level 3 — Integration

- [ ] `harness validate` passes after the changes
- [ ] `harness check-docs` reports zero new drift on the touched files
- [ ] The roadmap GitHub issue is closed via `manage_roadmap` (handled at integration step)

## Risk register

- **Vendor-doc rot.** Tunnel CLIs evolve. The guide leans on copy-pasteable commands for `cloudflared tunnel`, `tailscale serve`, `ngrok http`. **Mitigation:** include the canonical vendor-docs URL inline for each pattern + a maintenance note that the harness team re-validates the recipes when re-running Phase 0.2 reproducibility.
- **Tunnel security misimplication.** A reader might assume "tunnel = secure" and skip HMAC verification. **Mitigation:** the Security notes section is explicit that the HMAC signature is the authn boundary, NOT the tunnel.
- **ngrok-URL rotation under free plan.** ngrok free re-rotates the URL on restart, invalidating the orchestrator's stored subscription. **Mitigation:** explicit teardown step + retry recipe in the ngrok pattern.
- **The Slack bridge worked example references a future-tense doc that this guide now realizes.** A reader following the bridge README → guide → bridge README loop should not feel like they hit a circular reference. **Mitigation:** the guide's "What you need" section states "the Slack echo bridge … built and runnable locally" and links forward; the loop terminates at the curl POST step.
