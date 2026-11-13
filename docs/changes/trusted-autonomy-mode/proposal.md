# Trusted Autonomy Mode

**Keywords:** autonomy, trusted-mode, pause-protocol, user-config, self-audit, blind-rederivation, auto-decision-log, session-override

## Overview

A user-level **autonomy** setting (`supervised` | `trusted`) that governs whether harness workflow skills stop for a human at non-mechanical pause points. In `trusted` mode, ceremony pauses auto-approve and judgment forks auto-resolve to the stated recommendation after an optional blind-then-adversarial self-audit; every skipped pause is written to a structured per-session log. Autonomy is orthogonal to autopilot's `rigorLevel`: autonomy decides **who decides**, rigor decides **how much is checked**.

### Goals

1. A user can run brainstorm → plan → execute → review without approving ceremony or judgment pauses.
2. Mechanical gates (red tests, high-confidence `NOT_SATISFIED`, taint, `--no-verify`, protected config) are never bypassed at any autonomy level.
3. Irreversible/outward actions still pause in `trusted` mode.
4. Every auto-taken decision is auditable after the run: a typed log entry plus an end-of-run summary with the audit agreement rate and denominator.
5. The setting is user-sourced only (flag, session override, env, `~/.harness/config.json`), and only `~/.harness/config.json` or an interactive `harness autonomy set` can raise it. A project config can never raise it.
6. A self-audit disagreement is the only judgment-fork pause that survives `trusted` mode.

### Non-goals

- Project-level cap/forbid of trusted mode (future consideration).
- Mechanical detection that a skill paused when it should not have (revisit if the decision log shows protocol non-compliance).
- Auto-approving irreversible actions.
- Changing what `rigorLevel` checks.

### Assumptions

- `~/.harness/config.json` is resolved via `os.homedir()` and is per OS user; it is a new file (no existing reader of that path in the repo).
- `auto-decisions.jsonl` lives under `.harness/sessions/<slug>/`, resolved by `resolveSessionDir` (`packages/core/src/state/session-resolver.ts`). Session overrides do **not** live there (D12): `.harness/sessions/` is gitignored in this repo but not in scaffolded templates, so a repo-carried file could reach another user.
- "Autonomy" also names the roadmap auto-triage `ratchetStage` setting; this feature is unrelated. Code lives under `packages/core/src/autonomy/` and types use the `Autonomy*` prefix only for this feature's contract.

### Threat model

The autonomy gate protects against **prompt-injected instructions, repo-carried configuration, and accidental raises** reaching the sanctioned paths (MCP tools, the `harness` CLI, environment, project files). It is **not** a sandbox against code running as the same OS user: an agent with an unrestricted shell can write `~/.harness/` directly. That residual is narrowed (not closed) by a PreToolUse guard hook (D16) and made visible by an append-only raise audit line. Every raise path therefore requires something only the human controls (an interactive confirm, or the user-config file), and every agent- or repo-reachable path may only lower.

### Strategy grounding

`STRATEGY.md#target-problem` names "babysitting the agent" as the pain this removes. The tension with `STRATEGY.md#our-approach` ("humans own the thinking layer") is resolved by moving human review of the thinking layer from **during** the run to **after** it, via the decision log. A contradiction between a proposed feature and `STRATEGY.md` is the exception: it is a `gate` pause that stops at every autonomy level and is never audited-and-proceeded, because humans own the strategy and AGENTS.md requires surfacing it explicitly rather than auto-resolving it.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                    | Rationale                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Four pause classes: `ceremony` (auto-approve), `judgment` (auto-take recommendation, audited), `irreversible` (always pause), `gate` (never bypassable).                                                                                                                                                                                    | Separates "asking permission" from "safety"; only the former is what the user wants removed.                                                                             |
| D2  | Autonomy is a new axis independent of `rigorLevel`. `--fast` no longer auto-approves plans by itself; plan auto-approval becomes an autonomy decision.                                                                                                                                                                                      | Today `fast` couples fewer pauses with less verification (`agents/skills/claude-code/harness-autopilot/SKILL.md:104-114`, `:174`); the user asked for the first only.    |
| D3  | User-level only. Precedence: session override > `HARNESS_AUTONOMY` env > `~/.harness/config.json` > default `supervised`. The flag and env tiers may only lower (D13, D17); the flag tier is API-only (skills apply flags via `set-autonomy`).                                                                                              | A cloned repo must not be able to switch a user into trusted mode. Env tier amended by D13; flag tier amended by D17.                                                    |
| D4  | No project-level cap in v1.                                                                                                                                                                                                                                                                                                                 | YAGNI; no requester. A cap could only lower autonomy, so it can be added later without a trust change.                                                                   |
| D5  | Central resolver + shared Pause Protocol template + typed decision-log MCP tool (Approach 2). Compliance remains instruction-level.                                                                                                                                                                                                         | ~80 differently-worded pause points across skills; one rule table and one typed log beat per-skill prose. Mechanical enforcement (Approach 3) is heuristic and deferred. |
| D6  | Every auto-taken decision appends to `.harness/sessions/<slug>/auto-decisions.jsonl`; run ends with a rendered summary.                                                                                                                                                                                                                     | Post-hoc audit is what makes trust compatible with the strategy anchor.                                                                                                  |
| D7  | Self-audit on judgment forks: blind re-derivation first (auditor never sees the recommendation); on agreement, an adversarial refuter attacks the pick.                                                                                                                                                                                     | A reviewer handed the conclusion confirms it; blind-first prevents echo, refuter catches shared-but-flawed picks.                                                        |
| D8  | Audit disagreement (blind pick differs, or refuter returns a `blocking` objection) escalates to the human even in `trusted` mode.                                                                                                                                                                                                           | Disagreement is real signal and should be rare; agreement rate is reported as a calibration metric.                                                                      |
| D9  | Audit runs in `trusted` by default; in `supervised` it is opt-in (`audit.supervised: true`) and shown beside the recommendation.                                                                                                                                                                                                            | The user nearly always accepts the recommendation, so recommendation quality matters in both modes.                                                                      |
| D10 | Session override for both `autonomy` and `audit`, in either direction, effective from the next pause point; past auto-decisions are never retroactively undone.                                                                                                                                                                             | Lets a user drop into trusted for one session, or out of it for one sensitive session.                                                                                   |
| D11 | When a subagent cannot be spawned (host lacks the capability), audit is recorded `unavailable`; the decision proceeds and the summary reports `audited N/M`.                                                                                                                                                                                | Report the denominator; never present an unaudited run as audited.                                                                                                       |
| D12 | Session overrides live in user home (`~/.harness/session-overrides/`), never in the repo. The agent-callable path (`manage_state set-autonomy`) may only **lower** autonomy (trusted→supervised, audit off→on); raising requires `harness autonomy set` on an interactive TTY.                                                              | The agent (or injected text) must not be able to raise its own autonomy, and a cloned repo must not carry an override. Only-lowering paths are safe from any source.     |
| D13 | The env tier (`HARNESS_AUTONOMY*`) is lower-only: it may set `supervised` / audit on, never raise. Headless trusted runs use `~/.harness/config.json` on the host.                                                                                                                                                                          | Env is repo-reachable (`.env` loaded by `dotenv`, `.mcp.json` / `.claude/settings.json` `env` blocks); a raising env tier violates Goal 5.                               |
| D14 | A raise override is bound to an existing `.harness/sessions/<slug>/` and expires (default 24h, `harness autonomy set --for <duration>`); lowerings are permanent.                                                                                                                                                                           | Otherwise an injected instruction need only name an old slug to inherit a past raise.                                                                                    |
| D15 | `repoKey` = sha256 of the realpath of `git rev-parse --git-common-dir` (fallback: the given path), so all worktrees of a repo share overrides.                                                                                                                                                                                              | A human lowering in the main checkout must reach agents running in sibling worktrees.                                                                                    |
| D16 | A PreToolUse hook blocks agent Bash invocations of `harness autonomy set` that raise, and agent writes targeting `~/.harness/session-overrides/` or `~/.harness/config.json`; every successful raise appends a line to `~/.harness/autonomy-audit.log`.                                                                                     | Narrows the same-user residual of the threat model and makes raises visible.                                                                                             |
| D17 | Invocation flags (`--supervised`, `--audit`) may only lower autonomy, like env (D13). `resolveAutonomy` ignores a flag that sets `trusted` or turns audit off, with a warning. A skill applies a lowering flag through `manage_state set-autonomy`, so subagents that re-read autonomy see it. `--trusted` / `--no-audit` are not accepted. | An agent cannot prove a human typed a raising flag. Raises come only from `~/.harness/config.json` or the human's TTY-confirmed `harness autonomy set`.                  |

## Technical Design

### User config

New file `~/.harness/config.json` (alongside the existing `~/.harness/` state, path helper pattern from `packages/cli/src/utils/first-run.ts:5`):

```jsonc
{
  "autonomy": {
    "level": "supervised", // "supervised" | "trusted"
    "audit": { "trusted": true, "supervised": false },
  },
}
```

Validated by a Zod `UserConfigSchema` in core; contract types in `packages/types/src/autonomy.ts`. Missing or malformed file → defaults (malformed also emits one warning). An unrecognised `HARNESS_AUTONOMY` / `HARNESS_AUTONOMY_AUDIT` value is ignored the same way (one warning) and resolution continues to the next source.

### Resolver

`packages/core/src/autonomy/resolve.ts`:

```ts
type AutonomyLevel = 'supervised' | 'trusted';
interface ResolvedAutonomy {
  level: AutonomyLevel;
  audit: boolean; // effective for this level
  source: { level: AutonomySource; audit: AutonomySource };
}
type AutonomySource = 'flag' | 'session' | 'env' | 'user-config' | 'default';

function resolveAutonomy(input: {
  flag?: { level?: AutonomyLevel; audit?: boolean }; // lower-only (D17): only supervised / audit=true are honoured
  sessionOverride?: { level?: AutonomyLevel; audit?: boolean };
  env?: NodeJS.ProcessEnv; // HARNESS_AUTONOMY, HARNESS_AUTONOMY_AUDIT
  userConfigPath?: string; // default ~/.harness/config.json
}): ResolvedAutonomy;
```

Pure aside from the config and override reads. Never reads `harness.config.json`.

### Session override

Overrides are stored at `~/.harness/session-overrides/<repoKey>/<slug>.json` (`repoKey` per D15, first 16 hex) as `{ level?: { value, setAt, origin }, audit?: { value, setAt, origin } }` with `origin: 'cli' | 'mcp'` (D12). Timestamps are per field: a single shared `setAt` would let a lower-only write to one field re-date a human-set value in the other. The agent path is lower-only **by value** (it may write only `supervised` / audit on). Writers:

- `manage_state` action `set-autonomy` (`packages/cli/src/mcp/tools/state.ts`, alongside `append_entry` / `task-transition`): rejects any write that would raise autonomy (`supervised`→`trusted`, or audit on→off) with a structured error. Every set-autonomy error is JSON `{ error, message, field? }` carrying core's own code (`AUTONOMY_RAISE_REJECTED`, `AUTONOMY_INVALID_SETTING`, `AUTONOMY_OVERRIDE_BUSY`, …), the same shape `record_auto_decision` uses.
- `harness autonomy set`: may raise or lower; raising refuses unless `process.stdin.isTTY` and the user confirms interactively.

`resolveAutonomy` breaks a flag-vs-override tie by recency (an override with a `setAt` later than the flag's `at` wins), but the flag tier is API-only: no production caller passes a flag, because skills apply invocation flags through `manage_state set-autonomy` (D17), so in practice a flag arrives as a session override and the tie-break does not occur. CLI: `harness autonomy set [supervised|trusted] [--audit on|off] [--for <duration>] --session <slug>` (a level or `--audit` is required; `--for` applies to raises only), `harness autonomy show [--session <slug>]` (prints resolved value and source of each field).

### Context delivery

`gather_context` gains an `autonomy` include key (`IncludeKey` union at `packages/cli/src/mcp/tools/gather-context.ts:108` and input-schema enum at `:131`) returning `ResolvedAutonomy` for the session. Skills read autonomy once at start and re-read at each pause point (so a mid-session override takes effect at the next pause).

### Pause Protocol

New shared template `agents/skills/templates/pause-protocol.md`. Every pause point in a workflow skill is labelled with one class and resolved by one table:

| Class          | Examples                                                                                                                                                                                                     | `supervised`                      | `trusted`                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------- |
| `ceremony`     | spec section review, plan approval, spec sign-off, next-skill choice, ADR draft review, phase continue                                                                                                       | pause                             | auto-approve, log                              |
| `judgment`     | EVALUATE questions, approach selection, decomposition, triage forks, `[checkpoint:decision]`, soundness findings with a recommended option                                                                   | pause (audit verdict shown if on) | audit → agree: auto-take, log; disagree: pause |
| `irreversible` | merge, push, open a PR, close/delete issues or branches, publish, force-push                                                                                                                                 | pause                             | pause                                          |
| `gate`         | red verify, high-confidence `NOT_SATISFIED`, blocking review findings, plan dependency cycles, a strategy contradiction, taint block, `--no-verify` block, protect-config, a step only the human can perform | stop                              | stop                                           |

Every pause point in a skill carries an inline marker `<!-- pause: <class> -->` so labelling is mechanically checkable.

Fail-safe rules (each resolves to **pause**): a pause with no recommendation; an unlabelled pause; no resolvable session slug when a log entry is required; a failed `record_auto_decision` write (an unlogged auto-decision is never taken).

### Self-audit procedure (judgment forks)

1. **Blind re-derivation.** Spawn a fresh subagent with the question, options (order shuffled), and cited evidence, never the recommendation or its rationale. It returns `{ pick, confidence, reason }`.
2. **Refutation** (only if `pick` matches). Spawn a fresh subagent given the pick and asked for the single strongest objection, rated `blocking | non-blocking`.
3. **Outcome.** Agree and non-blocking → auto-take. Pick differs, or objection `blocking` → escalate: present both positions to the human in plain text (headless: write the handoff with `blockers: ["audit-disagreement: <question>"]` and both positions in `concerns`, then stop; `HandoffSchema` has no `status` field, and routing this to the orchestrator's needs-human terminal is a future consideration).

### Decision log

New MCP tool `record_auto_decision` (tier `standard`, registered in `STANDARD_EXTRA`, `packages/cli/src/mcp/tool-tiers.ts:37`) appends to `.harness/sessions/<slug>/auto-decisions.jsonl`:

```ts
interface AutoDecision {
  ts: string;
  skill: string;
  phase: string;
  pauseClass: 'ceremony' | 'judgment';
  question: string;
  options: string[];
  chosen: string;
  rationale: string;
  autonomySource: AutonomySource;
  audit?:
    | {
        status: 'agreed';
        blindPick: string;
        objection?: { severity: 'non-blocking'; text: string };
      }
    | {
        status: 'escalated';
        blindPick: string;
        objection?: { severity: 'blocking' | 'non-blocking'; text: string };
        humanChoice: string;
      }
    | { status: 'unavailable' | 'off' };
}
```

`harness autonomy log --session <slug>` renders the summary: counts by class, `audited N/M`, agreement rate, escalations, and each judgment decision. Terminal skills (autopilot DONE, brainstorming sign-off, execution completion) print this summary when any auto-decision occurred.

## Integration Points

### Entry Points

- CLI: `harness autonomy show | set | log`.
- MCP: new tool `record_auto_decision`; new `manage_state` action `set-autonomy`; new `gather_context` include `autonomy`.
- Core: `resolveAutonomy`, `UserConfigSchema` (barrel export).
- Skill template: `agents/skills/templates/pause-protocol.md`.
- Flags `--supervised` / `--audit` on Tier-1 workflow skills (lower-only, D17; applied through `manage_state set-autonomy`). `--trusted` / `--no-audit` are refused with a raise hint.

### Registrations Required

- Core barrel: `scripts/generate-core-barrel.mjs` auto-discovers any `packages/core/src/<dir>/index.ts` not listed in `SELECTIVE_EXPORTS`, so a new `autonomy/index.ts` is exported by running `pnpm run generate:barrels` (no allowlist edit unless selective exports are wanted).
- MCP tool definition + handler registration in `packages/cli/src/mcp/server.ts`; `STANDARD_EXTRA` in `tool-tiers.ts`; `ALL_MCP_TOOLS` in `packages/cli/src/commands/setup-mcp.ts` (sync-tested by `setup-mcp.test.ts` "ALL_MCP_TOOLS sync") and `TOOL_CAPABILITY_DECLARATIONS` in `packages/cli/src/mcp/tool-capability-declarations.ts` (coverage-tested by `mcp-list-capabilities.test.ts`), both of which must list every registered tool; tool-count assertions `toHaveLength(115)` in `packages/cli/tests/mcp/server.test.ts` and `server-integration.test.ts` (`CURSOR_CURATED_TOOLS` changes only if the tool is added to the Cursor curated list).
- CLI command registry (`packages/cli/src/commands/_registry.ts`, auto-generated by `pnpm run generate-barrel-exports`); `pnpm run generate-docs` for `docs/reference/`.
- Slash-command regeneration after SKILL.md / skill.yaml edits (platform mirrors are symlinks).

### Documentation Updates

- AGENTS.md: new "Autonomy" subsection under Key Concepts.
- `docs/guides/trusted-autonomy.md`: enabling, session override, reading the decision log.
- Autopilot SKILL.md Rigor Levels table: drop "Auto-approve" from `fast` APPROVE_PLAN/INTEGRATE rows, add pointer to autonomy.
- `docs/reference/` regenerated for new CLI commands.

### Architectural Decisions

- D2 (autonomy orthogonal to rigor; `--fast` stops auto-approving): changes an existing skill contract.
- D3 + D12 (user-level-only precedence; overrides in user home, agent path lower-only): the trust boundary.
- D7/D8 (blind-then-refute audit; disagreement is the sole surviving judgment pause): defines the trust model.

### Knowledge Impact

- Concepts: pause class, autonomy level, self-audit agreement rate.
- `docs/knowledge/core/autonomy.md` business-process node; decision nodes for the three ADRs.

## Success Criteria

1. When autonomy resolves to `trusted`, the system shall not pause at any `ceremony` point in brainstorming, planning, autopilot, execution, soundness-review, code-review, or integration.
2. When a `judgment` fork is reached in `trusted` mode and the audit agrees, the system shall take the recommendation and append an `AutoDecision` with `audit.status: 'agreed'`.
3. If the blind pick differs from the recommendation, or the refuter returns `blocking`, then the system shall pause and present both positions, regardless of autonomy level.
4. If an `irreversible` or `gate` pause is reached, then the system shall not auto-proceed at any autonomy level.
5. When `harness.config.json` contains any autonomy key, `resolveAutonomy` shall ignore it (unit test with a project config setting `trusted` resolves `supervised`).
6. `resolveAutonomy` honours the precedence flag > session > env > user config > default, verified by a table-driven test that sets each source and asserts both value and `source`, with the flag and env tiers lower-only (D13, D17).
7. When `set-autonomy` is called mid-session, the next pause point shall use the new value; prior log entries are unchanged.
8. The blind auditor's prompt shall not contain the recommendation text (test asserts the rendered audit prompt omits it).
9. `harness autonomy log` reports `audited N/M` where M counts every judgment decision including `unavailable`/`off`.
10. With autonomy `supervised` and no overrides, every workflow skill behaves as today except that autopilot `--fast` no longer auto-approves plans or INTEGRATE.
11. When a terminal skill (autopilot DONE, brainstorming sign-off, execution completion) finishes a session with at least one `AutoDecision`, it shall print the summary: counts by class, `audited N/M`, agreement rate (`agreed` ÷ audited), and escalation count (traces Goal 4).
12. A test shall fail if any pause point in the seven workflow skills lacks a `<!-- pause: <class> -->` marker, or uses a class outside the four defined.
13. If `set-autonomy` is called through MCP with a value that raises autonomy, then the system shall reject it and leave the override unchanged; if `harness autonomy set trusted` runs without a TTY, then it shall refuse.
14. If `record_auto_decision` fails, then the skill shall pause instead of auto-proceeding.

## Implementation Order

### Phase 1: Resolver, user config, session override

<!-- complexity: medium -->

Types, `UserConfigSchema`, `resolveAutonomy`, home-dir override store + `set-autonomy` (lower-only), `gather_context` include, `harness autonomy show|set`. SC 5, 6, 13; SC 7 at resolver level (override written → next resolve returns it).

### Phase 2: Decision log

<!-- complexity: medium -->

`record_auto_decision` MCP tool, JSONL writer, `harness autonomy log` renderer. SC 9.

### Phase 3: Pause Protocol and self-audit

<!-- complexity: high -->

`pause-protocol.md` template with the class table and audit procedure; label every pause in the seven workflow skills named in SC 1 (five Tier-1, plus Tier-2 soundness-review and code-review); decouple autopilot `--fast` from plan auto-approval; end-of-run summary. SC 1-4, 7 (end-to-end), 8, 10, 11, 12, 14.

### Phase 4: Docs, ADRs, knowledge

<!-- complexity: low -->

Three ADRs, AGENTS.md, guide, knowledge node, reference-doc regeneration.

## Future Considerations

- Project-level cap (`autonomy.max`) for regulated repos.
- Mechanical non-compliance detection (hook) if the log shows skills pausing or skipping incorrectly.
- Separate opt-in for selected irreversible actions (e.g. push to a feature branch).
- Route a headless `audit-disagreement` handoff blocker to the orchestrator's needs-human terminal. The orchestrator reads no handoff status today (`needs-human` is reached only through routing decisions), so an orchestrator-dispatched agent's audit disagreement surfaces only through the handoff's `blockers` and `concerns`; nothing pages a human.
- Align the sentinel injection scanner with the decision log's character policy. `sentinel-post.js` (INJ-UNI-001, via `core/security/injection-patterns.ts`) treats U+200C / U+200D in tool output as a high-severity injection signal, while the decision log accepts them as legitimate text (review N1). A legitimate entry containing Persian text (ZWNJ) or an emoji ZWJ sequence, echoed back by `record_auto_decision`, can therefore taint the session under the sentinel hooks.
