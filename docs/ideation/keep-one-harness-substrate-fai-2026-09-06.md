---
topic: Keep one harness substrate faithfully usable across Claude Code, Cursor, Codex, Gemini CLI, and OpenCode without forking it — cross-client fidelity of skills, agents, hooks, and backend routing, plus the gateway for external bridges.
generated_at: 2026-09-06T16:32:48Z
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Keep one harness substrate faithfully usable across Claude Code, Cursor, Codex, Gemini CLI, and OpenCode without forking it — cross-client fidelity of skills, agents, hooks, and backend routing, plus the gateway for external bridges.

## Inputs

- Topic: Keep one harness substrate faithfully usable across Claude Code, Cursor, Codex, Gemini CLI, and OpenCode without forking it — cross-client fidelity of skills, agents, hooks, and backend routing, plus the gateway for external bridges.
- Generated: 2026-09-06T16:32:48Z
- Strategy grounding: enabled — `STRATEGY.md` present and valid; track **Multi-client portability** ("keep the harness usable across Claude Code, Cursor, Codex, Gemini CLI, and OpenCode without forking the substrate")
- Objection policy for this run: **none answered**. Every strongest objection below stands unrebutted and is recorded as an accepted downside.
- Scope boundary: this artifact covers cross-client substrate fidelity only. Off-repo distribution, adopter first-run value, marketplace publishing, courseware, and adoption telemetry are out of scope here.

## Ranked candidates

### 1. A build gate fails when any client's generated surface (skill mirrors, command files, plugin manifests) is stale against the claude-code source of truth — score: 6.00

- Persona: Harness contributor editing a single `SKILL.md` who cannot tell, from the diff, which of six client surfaces silently went stale.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 Our approach (drift caught mechanically rather than by convention) = +0.75 recorded, **not applied** (|Δ| to the next candidate is 1.50 > 0.05) — final score 6.00
- Strongest objection: The gate enforces freshness, not fidelity. A regenerated Codex command file, a re-emitted Gemini `.toml`, and a refreshed Cursor rule can all be byte-current against the claude-code source and still be unusable in their client — wrong tool names, an unsupported frontmatter key, a command shape that client never dispatches. The most likely failure mode is a green gate that manufactures false confidence: the team stops manually spot-checking the other clients precisely because CI says the mirrors are fresh, and a real portability regression rides in behind a passing check. For this objection not to hold, "generated surface" would have to be defined narrowly enough that freshness genuinely implies usability — which is only true for surfaces that are pure copies, and stops being true the moment a client needs a real transform.
- Objection answered: no — stands as an accepted downside.

### 2. A machine-readable client capability manifest declares, per client, which harness surfaces (skills, agents, commands, hooks, MCP transport, subagent spawn, interaction channel) are actually executable — score: 4.50

- Persona: Tech lead 3–6 months into agent adoption whose team runs two or more clients against one repo and cannot answer "does this skill actually work in Cursor?" without trying it.
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 Our approach (encodes a portability decision as a machine-checkable constraint rather than a conventions doc) = +0.75 recorded, **not applied** (|Δ| to adjacent candidates is 1.50 > 0.05) — final score 4.50
- Strongest objection: A manifest that nothing enforces is documentation, and documentation about capability drifts faster than the capability does — clients ship new primitives on their own release cadence, so the manifest is wrong the week after any of five vendors ships. The most likely failure mode is a manifest that is authored once, consulted by one generator, and then quietly diverges from reality; downstream code trusts a stale row and degrades a skill that the client can now actually run, or runs one it cannot. For this objection not to hold, the manifest would have to be derived from something executable — a probe against each client, or a conformance run — rather than hand-maintained, which makes it a consequence of candidate #9 rather than a standalone artifact.
- Objection answered: no — stands as an accepted downside.

### 3. A declared per-client interaction channel for human gates, so a confirmation prompt renders in that client's real surface or fails loudly rather than vanishing — score: 3.75

- Persona: Tech lead who relies on a skill's human gate to hold, and for whom a gate that silently no-ops is worse than no gate.
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 Our approach ("humans own the thinking layer" — a gate is where that ownership is exercised) = +0.75, **applied** (base tied at 3.00 with adjacent candidates, |Δ| = 0.00 ≤ 0.05) — final score 3.75
- Strongest objection: Some clients have no interactive channel at all, and in headless or CI invocation none of them do. Making the channel explicit therefore does not produce portability — it produces an honest refusal to run, which is a different and much less valuable outcome than the framing suggests. The most likely failure mode is that the abstraction is built, the truthful answer for three of six clients is "no channel", and every gated skill becomes unavailable there; the pressure then goes straight back onto auto-answering the gate, which is the exact silent failure this was meant to remove, only now with a config key blessing it. For this objection not to hold, gated skills would need a genuine non-interactive mode that is safe by construction — a design question upstream of the channel abstraction and untouched by it.
- Objection answered: no — stands as an accepted downside.

### 4. Every client's session instruction file (AGENTS.md, GEMINI.md, `.cursor/rules`, Codex config) is generated from one source so grounding and pre-warmed comprehension do not diverge by client — score: 3.75

- Persona: Tech lead watching agents re-litigate settled architectural decisions in one client while honoring them in another, with no visible reason why.
- Complexity: medium
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 Target problem (agents starting cold and re-litigating settled decisions is the stated problem) = +0.75, **applied** (base tied at 3.00, |Δ| = 0.00 ≤ 0.05) — final score 3.75
- Strongest objection: Clients differ in instruction-file size budget, precedence order, and how aggressively they attend to the file, so one source cannot be byte-identical everywhere and must fan out through per-client transforms — at which point the divergence has moved into the transforms rather than been eliminated. The most likely failure mode is that the largest client's file (already six figures of bytes here) is truncated or ignored by a smaller-budget client, producing exactly the silent per-client grounding gap the idea claims to close, now harder to see because a generator asserts they came from one source. For this objection not to hold, either the shared core would have to be small enough to fit every client's real budget — which discards most of the grounding — or each client's attention behavior would have to be measurable, which it currently is not.
- Objection answered: no — stands as an accepted downside.

### 5. OpenCode is promoted from npm-install-only to a generated first-class target with its own skill mirror and plugin manifest emitted by the same generator as the other clients — score: 3.50

- Persona: OpenCode-native developer who today gets the CLI but none of the per-client skill, command, or hook surface the other four clients receive.
- Complexity: medium
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:Multi-client portability (OpenCode is named in the track); no Target-problem/Our-approach persona match (`Who it's for` names Claude Code, Cursor, Gemini CLI, and Codex, but not OpenCode) = +0.5, **applied** (base tied at 3.00, |Δ| = 0.00 ≤ 0.05) — final score 3.50
- Strongest objection: OpenCode is the smallest client in the set and the one whose users are least represented in the stated primary persona, so full parity work buys the fewest additional users per unit of maintenance added — and every generated target is a permanent tax on all future skill changes, not a one-time build. The most likely failure mode is that the target is generated, lightly exercised, and becomes the mirror that is quietly broken for months because nobody on the team runs OpenCode daily, which degrades the credibility of "works across five clients" more than the current honest npm-only story does. For this objection not to hold, OpenCode usage would have to be materially larger than its current standing in the persona definition implies, or the marginal cost of an additional generated target would have to be genuinely near zero.
- Objection answered: no — stands as an accepted downside.

### 6. A client-neutral hook spec compiled into each client's native hook mechanism, with a git-hook or file-watcher fallback where the client has none — score: 2.75

- Persona: Tech lead whose team works in Codex or Gemini CLI and therefore receives none of the real-time constraint enforcement that is the harness's central claim.
- Complexity: high
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 Our approach (hooks are the mechanism by which constraints fire in real time so agents self-correct mid-stream) = +0.75, **applied** (base tied at 2.00 with adjacent candidates, |Δ| = 0.00 ≤ 0.05) — final score 2.75
- Strongest objection: A fallback hook fires at a categorically different moment than a native one — a native pre-tool hook can stop an agent mid-stream, while a git hook or watcher fires after the edit is already written and often after the agent has moved on. Shipping both under one name means "enforced" denotes five materially different guarantees, and the weakest of them is post-hoc cleanup, which is precisely the cleanup tax the strategy exists to remove. The most likely failure mode is a portability claim that is technically true and operationally hollow: users on fallback clients believe constraints are firing, discover the drift downstream anyway, and conclude the constraint system does not work. For this objection not to hold, the fallback would need to be able to interrupt the agent loop rather than observe it — which depends on client primitives that do not exist today.
- Objection answered: no — stands as an accepted downside.

### 7. Client identity becomes a first-class dimension in backend routing, so a session routes to a model the running client can actually reach — score: 2.50

- Persona: Engineer running harness inside Gemini CLI or Codex against a non-Anthropic model, where routing decisions made for a Claude-shaped session do not apply.
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track:Multi-client portability (per-client backend routing is named in the track); no Target-problem/Our-approach match = +0.5, **applied** (base tied at 2.00, |Δ| = 0.00 ≤ 0.05) — final score 2.50
- Strongest objection: Per-client model availability is external data owned by five vendors on five release cadences, and it goes stale faster than anything in this repo — a routing table that encodes it becomes a standing maintenance obligation with a hard freshness requirement and no internal source of truth. The most likely failure mode is that routing confidently sends a session to a model the client dropped, deprecated, or renamed, producing a failure that looks like a harness bug and is diagnosed slowly because the routing decision is several layers from the error. For this objection not to hold, availability would need to be discovered at runtime from the client itself rather than declared, which is a different and larger piece of work than adding a routing dimension.
- Objection answered: no — stands as an accepted downside.

### 8. The gateway is promoted from webhook and telemetry fan-out to the canonical client-neutral execution bridge — run a skill, stream stage events, return artifacts over HTTP — for clients with no plugin path — score: 2.50

- Persona: Platform engineer bridging an unsupported client, IDE, or internal tool into the harness without waiting for a native plugin target.
- Complexity: high
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.5 track:Multi-client portability ("gateway API for external bridges" is named in the track); no Target-problem/Our-approach match = +0.5, **applied** (base tied at 2.00, |Δ| = 0.00 ≤ 0.05) — final score 2.50
- Strongest objection: Putting a network boundary in the middle of the substrate creates a second product with its own auth model, API versioning contract, latency budget, failure semantics, and backward-compatibility obligations — and unlike the in-process path, every one of those must be right for the bridge to be trustworthy. The most likely failure mode is that the bridge works for a demo client and then accretes a long tail of per-consumer compatibility shims, reproducing the fork the track exists to prevent, only now across an HTTP contract that external consumers depend on and that therefore cannot be changed freely. For this objection not to hold, the set of bridged clients would have to stay small and the API surface genuinely narrow — an assumption that the word "canonical" in the premise directly contradicts.
- Objection answered: no — stands as an accepted downside.

### 9. A cross-client conformance suite drives a representative skill through each client's real entrypoint in CI and asserts the same artifact and the same verdict — score: 1.75

- Persona: Harness maintainer shipping a skill change who currently has no mechanical evidence it still behaves the same in the other four clients.
- Complexity: high
- Impact / Confidence / Effort: H/L/H — base score 1.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 Our approach (turns "works everywhere" from a convention into a machine-checkable constraint) = +0.75, **applied** (base tied at 1.00 with the adjacent candidate, |Δ| = 0.00 ≤ 0.05) — final score 1.75
- Strongest objection: Running five real client binaries in CI introduces a flake, credential, rate-limit, and licensing surface substantially larger than the bug class it catches, and the suite's own signal is nondeterministic because the things under test are LLM-driven clients whose outputs vary run to run. The most likely failure mode is the familiar one for expensive nondeterministic gates: it goes red for reasons unrelated to the change, gets marked continue-on-error or quarantined within a quarter, and thereafter provides the appearance of conformance coverage while asserting nothing. For this objection not to hold, the assertions would have to be narrow enough to be deterministic — file written, exit shape, artifact frontmatter — at which point the suite is verifying plumbing rather than fidelity, and much of the premise is gone.
- Objection answered: no — stands as an accepted downside.

### 10. Subagent fan-out routed through the orchestrator so fleet and multi-agent skills run on clients with no native Agent tool instead of failing — score: 1.50

- Persona: Senior engineer who wants the fleet skills from Cursor or Codex and today gets nothing, because the fleets assume a Claude Code subagent primitive.
- Complexity: high
- Impact / Confidence / Effort: H/L/H — base score 1.00
- Strategy alignment: +0.5 track:Multi-client portability; no Target-problem/Our-approach match = +0.5, **applied** (base tied at 1.00, |Δ| = 0.00 ≤ 0.05) — final score 1.50
- Strongest objection: No other client in the set exposes a real subagent primitive — isolated context, independent tool budget, parallel scheduling, resumable handoff — so this is not a portability shim but a from-scratch reimplementation of the single hardest capability the harness currently borrows from its host. The most likely failure mode is a sequential in-process emulation that shares one context window, which removes the isolation the fleets depend on for honest independent verification; the fleets would still "run" on those clients while producing verdicts that are no longer independently derived, which is worse than not running at all because the output is indistinguishable from the real thing. For this objection not to hold, the orchestrator would need to own agent execution end to end rather than delegate it to the host client — a substrate-level inversion far beyond a routing change.
- Objection answered: no — stands as an accepted downside.

## Ranking notes

- Base scores use the `low|medium|high → 1|2|3` mapping: `(impact × confidence) ÷ effort`.
- Three base-score tie groups occurred — {3.00: candidates 3, 4, 5}, {2.00: candidates 6, 7, 8}, {1.00: candidates 9, 10}. The strategy-alignment bonus was applied inside each group because `|Δbase| = 0.00 ≤ 0.05`, and ordered them.
- The two clear winners (6.00 and 4.50) had their alignment bonus recorded but **not** applied, since each is separated from its neighbours by 1.50 — well outside the 0.05 tie window. The bonus never reorders a clear base-score winner.
- Objections do not participate in ranking. All ten stand unrebutted by policy for this run; that is recorded risk information, not a score input.
