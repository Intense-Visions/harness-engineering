---
topic: 'Multi-client portability: keep the harness usable across Claude Code, Cursor, Codex, Gemini CLI and OpenCode without forking the substrate — marketplace plugins per client, per-skill/per-cognitive-mode backend routing, gateway API for external bridges'
generated_at: '2026-08-13T12:00:00Z'
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Multi-client portability

## Inputs

- Topic: Multi-client portability — keep the harness usable across Claude Code, Cursor, Codex, Gemini CLI and OpenCode without forking the substrate (marketplace plugins per client, per-skill/per-cognitive-mode backend routing, gateway API for external bridges).
- Generated: 2026-08-13T12:00:00Z
- Strategy grounding: enabled — STRATEGY.md present and valid; track match "Multi-client portability". Objection policy: none (every objection recorded as a standing accepted downside; none rebutted).

## Ranked candidates

### 1. A single generative cross-client parity conformance test asserts every client plugin exposes the identical skill, command, agent, and hook set the generator claims — score: 9.00

- Persona: The harness maintainer shipping a new skill or hook who must fan it out across five client plugins and has no signal today when one client silently drifts.
- Complexity: medium
- Impact / Confidence / Effort: H/H/L — base score 9.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 approach (constraints-as-code that removes a class of drift) — recorded +0.75, not applied (no adjacent base-score tie) — final score 9.00
- Strongest objection: A conformance test only checks that generated outputs agree with each other, not that each client actually loads and honors them at runtime — so it can pass green while a real Cursor or Gemini install is broken because the client silently ignored a field the generator emitted. The most likely failure mode is a false sense of safety: the test enforces internal generator self-consistency (the exact thing the generator is already deterministic about) while the genuinely lossy step — the client's own parser dropping unsupported hooks/agents fields — happens downstream where this test never looks. For the objection to not hold, the test would need to assert against a captured fixture of what each client genuinely ingests (a golden snapshot per client parser), not merely against the generator's own manifest.

### 2. Extend the strict routing config schema so `routing.policy` and per-backend capabilities are accepted from the config file, not only via the live `PUT /routing/policy` endpoint — score: 6.00

- Persona: The tech lead standardizing a team on a mixed local+cloud backend setup who wants routing declared as reviewable, version-controlled config rather than a runtime API call.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:Multi-client portability (per-skill/per-cognitive-mode backend routing), +0.25 approach (declarative machine-checkable config) — recorded +0.75, applied within base-score tie — final score 6.75
- Strongest objection: The types already allow it and the code already reads it — only the Zod schema rejects it — so this looks like a trivial one-line schema widening, but that framing hides the real cost: once the config surface is public, its shape becomes a compatibility contract you can never quietly change, and the runtime `PUT` path and the file path will drift in validation semantics unless they share exactly one schema. The most likely failure mode is two subtly different validators (file vs endpoint) accepting different policies, so a config that loads locally is rejected by the gateway or vice versa. For the objection to not hold, both surfaces must be provably routed through a single shared schema with a test pinning their equivalence.

### 3. `harness plugin doctor` — a CLI diagnostic that verifies a client's installed plugin matches the freshly generated marketplace (skill count, version, missing/extra commands) and prints actionable drift — score: 6.00

- Persona: The adopter three months in who reinstalled the harness and cannot figure out why a skill shows up in Claude Code but not in their Cursor install.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 approach (mechanical drift detection surfaced to the human) — recorded +0.75, applied within base-score tie — final score 6.75
- Strongest objection: A doctor command is only consulted after something already feels broken, so its value is capped by how often adopters think to run it — and the failure it diagnoses (stale installed plugin vs generated marketplace) is one a `harness update` step could prevent outright, making the diagnostic a treatment for a disease better cured upstream. The most likely failure mode is that it becomes a rarely-run command whose own drift-detection logic silently rots because nothing exercises it on the happy path. For the objection to not hold, the doctor check would need to run automatically (as a post-install/pre-run hook) rather than waiting to be invoked by a confused user.

### 4. Client-agnostic skill authoring: `create-skill` emits one canonical skill and mechanically generates all client mirrors and the Gemini TOML, eliminating the current four-hand-copies-plus-symlink authoring ritual — score: 4.50

- Persona: The contributor authoring a new skill who today must produce four byte-identical platform directory copies (or manage symlinks) and regenerate the Gemini `.toml`, and gets no error when one copy is forgotten.
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 approach (remove a manual drift source via generation) — recorded +0.75, applied within base-score tie — final score 5.25
- Strongest objection: Collapsing four copies into one canonical source assumes the four clients are genuinely the same skill with cosmetic differences, but they are not — Gemini needs TOML with no agents field, Cursor runs in commands mode, and the substrate difference is exactly what forced the per-client trees in the first place; a single generator that papers over these will accrete client-specific escape hatches until it is as complex as the thing it replaced. The most likely failure mode is a canonical format expressive enough to be lossless becoming a de-facto fifth dialect nobody wants to learn. For the objection to not hold, the per-client deltas must be provably small and fully data-describable (a capability manifest), not code branches.

### 5. Complete OpenCode as a first-class plugin target, generating its marketplace/plugin artifacts from the same generator the other five clients already use — score: 4.50

- Persona: The senior engineer on a team that has standardized on OpenCode and currently cannot adopt the harness at all because only Claude Code, Cursor, Gemini, Codex, and Antigravity are wired.
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: +0.5 track:Multi-client portability (OpenCode named explicitly in the track) — recorded +0.50, applied within base-score tie — final score 5.00
- Strongest objection: OpenCode is named in the strategy but its actual adoption footprint among the primary persona (tech leads paying the cleanup tax on Claude Code / Cursor / Gemini / Codex) is unknown and plausibly small, so this could be substantial generator and capability-mapping work to reach a client almost nobody on the target team uses — spending portability budget on breadth rather than the depth (parity, conformance) the already-wired clients still lack. The most likely failure mode is a sixth half-supported target that dilutes maintenance attention and degrades because OpenCode lacks native fields for hooks or agents. For the objection to not hold, there must be concrete pull (an actual team blocked on OpenCode) rather than strategy-completeness for its own sake.

### 6. Ship curated per-cognitive-mode backend routing presets (reasoner-vs-coder, thinking-on-vs-off) as an installable bundle, generalizing the proven design-vs-execution split — score: 4.00

- Persona: The adopter running local models who wants sane routing defaults (a strong reasoner for design, a fast coder for execution) without hand-tuning the routing graph themselves.
- Complexity: medium
- Impact / Confidence / Effort: M/M/L — base score 4.00
- Strategy alignment: +0.5 track:Multi-client portability (per-cognitive-mode backend routing), +0.25 approach (curated defaults as shareable constraints) — recorded +0.75, not applied (base-score delta > 0.05 to neighbors) — final score 4.00
- Strongest objection: Routing presets bake a point-in-time judgment about which model is good at what into a shipped artifact, and the local-model landscape churns fast enough that a "reasoner" preset can be obsolete within a quarter — turning a convenience into stale, misleading advice that adopters trust precisely because it shipped with the harness. The most likely failure mode is a preset that silently routes to a weak model for a cognitive mode it is no longer suited to, with the adopter never realizing the default is the problem. For the objection to not hold, presets would need a freshness/versioning story and a way to be corroborated against live benchmarks rather than frozen at author time.

### 7. A single declarative source of truth for hook membership that both `profiles.ts` and `plugin-config.mjs` STANDARD_HOOKS consume, eliminating the dual-source desync that no test catches today — score: 3.00

- Persona: The harness maintainer who changes a hook's profile membership and must remember to edit two unrelated files or silently desync the plugin and Cursor configurations.
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 approach (single source of truth = constraints-as-code removing a drift class) — recorded +0.75, applied within base-score tie — final score 3.75
- Strongest objection: The two files live in different runtimes and package boundaries (a TS source consumed at runtime vs a build-time `.mjs` script), so unifying them means one has to import across a boundary that was deliberately kept separate, or a third generated artifact both derive from — either of which adds a build-order dependency that can fail in ways more confusing than the current "remember to edit both." The most likely failure mode is a generated hook manifest going stale relative to its source and now BOTH consumers being wrong in lockstep, which is harder to notice than one being out of sync with the other. For the objection to not hold, the generation step must be enforced in CI so a stale manifest cannot merge.

### 8. A per-client capability-matrix manifest (hooks / agents / slash-commands / TOML-vs-MD support) declared as data, driving graceful generator degradation and an auto-rendered parity matrix in the docs — score: 3.00

- Persona: The adopter evaluating which client to standardize their team on, who needs to know up front that Gemini has no native agents field and Cursor runs commands-mode before they commit.
- Complexity: medium
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:Multi-client portability, +0.25 approach (capability declared as machine-checkable data) — recorded +0.75, applied within base-score tie — final score 3.75
- Strongest objection: The capability knowledge already exists — it is encoded implicitly in `plugin-config.mjs`'s per-client branches and comments — so extracting it into a formal manifest is a refactor whose payoff (an auto-rendered docs table, graceful degradation) is real but modest relative to lifting every client's generation path onto a data-driven model without regressing the five that work today. The most likely failure mode is the manifest becoming a second description of capabilities that drifts from the actual code branches it was supposed to replace, leaving two sources of truth instead of one. For the objection to not hold, the generator must be refactored to READ the manifest as its only capability authority, not merely to publish it alongside the existing branches.

### 9. Publish a thin typed gateway client SDK plus one reference external bridge (e.g., a GitHub Action or chatops hook) that drives the harness through the existing gateway API — score: 2.00

- Persona: The platform engineer integrating the harness into an external CI or chatops system who today has only a raw OpenAPI spec and must hand-roll the client and auth flow.
- Complexity: high
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.5 track:Multi-client portability (gateway API for external bridges) — recorded +0.50, not applied (base-score delta > 0.05 to neighbors) — final score 2.00
- Strongest objection: A first-party SDK plus a reference bridge is a large, open-ended surface (auth, versioning, retries, an example integration to maintain) built on the bet that external bridges are a real adoption vector — but the primary persona is a tech lead cleaning up drift inside their own repo, not a platform team wiring the harness into external systems, so this may be depth invested where the demand is thinnest. The most likely failure mode is a shipped SDK and example that go stale because too few external integrators exercise them, becoming a maintenance liability that suggests support the team cannot actually sustain. For the objection to not hold, there must be a concrete external integrator committed to consuming it before the SDK is built.

### 10. A Gemini/Cursor persona shim that synthesizes multi-persona behavior from commands plus context files, since neither client has a native agents/subagents field — score: 0.67

- Persona: The adopter on Gemini CLI or Cursor who wants the harness's multi-persona review to work with the same fidelity it has on Claude Code.
- Complexity: high
- Impact / Confidence / Effort: M/L/H — base score 0.67
- Strategy alignment: +0.5 track:Multi-client portability — recorded +0.50, not applied (base-score delta > 0.05 to neighbors) — final score 0.67
- Strongest objection: Personas on Claude Code work because the client natively dispatches subagents with isolated context; simulating that on clients with no agents primitive means faking isolation through prompt-stuffing and command chaining, which reproduces the shape of multi-persona review without its actual property (independent contexts that cannot contaminate each other) — so the shim risks looking like parity while delivering a single context wearing several hats. The most likely failure mode is a shim that passes a visual check but produces reviews that are not genuinely independent, quietly undermining the trust the persona system exists to create. For the objection to not hold, the target clients would need some real isolation primitive to build on, which by the premise they lack.
