---
number: 0137
title: 'Autonomy trust boundary: user-level only, raised only by the human, every sanctioned agent- or repo-reachable path lower-only'
date: 2026-11-13
status: accepted
tier: large
source: docs/changes/trusted-autonomy-mode/proposal.md
---

## Context

> **Record of an operative decision.** This ADR documents spec decisions **D3, D4, D12, D13,
> D14, D15, D16 and D17** of `docs/changes/trusted-autonomy-mode/proposal.md` and the spec's
> threat model. Every citation below was checked against the code as it shipped in
> `packages/core/src/autonomy/`, `packages/cli/src/commands/autonomy/` and
> `packages/cli/src/hooks/autonomy-guard.js`.

Trusted mode lets an agent auto-approve ceremony and auto-resolve judgment forks (ADR 0136,
ADR 0138). A setting with that power is only as safe as the set of things that can turn it on.
An agent reads untrusted text all day (issues, specs, tool output, web pages, a cloned repo's
files), and any of it can carry an instruction. If any path an agent or a repository can reach
were able to **raise** autonomy, an injected sentence or a malicious repo could grant itself
trusted mode. The design question was therefore not "where is the setting stored" but "which
paths may raise it, and which may only lower it".

The spec's threat model (`#threat-model`) scopes the answer: the gate protects against
**prompt-injected instructions, repo-carried configuration, and accidental raises** reaching the
sanctioned paths (MCP tools, the `harness` CLI, environment, project files). It is **not** a
sandbox against code running as the same OS user.

## Decision

### Precedence (D3)

Per field (`level` and `audit` resolve independently), highest first: the more recent of
{invocation flag, session override}, then the `HARNESS_AUTONOMY` / `HARNESS_AUTONOMY_AUDIT` env,
then `~/.harness/config.json`, then the default `supervised`. Implemented by `resolveAutonomy` (`packages/core/src/autonomy/resolve.ts:252`;
`resolveLevel` picks the flag/session tier first, then env, then user config, then default).
`resolveAutonomy` never reads `harness.config.json`: a project key is ignored (SC5).

### Lower-only tiers

Every **sanctioned** path an agent or a repository can reach (MCP tools, env, invocation flags,
project files, a non-interactive `harness autonomy set`) may only lower autonomy (`trusted` →
`supervised`, audit off → on). "Sanctioned" is load-bearing: an agent writing `~/.harness/`
directly through an unrestricted shell is the same-user residual described below, narrowed by a
hook but not closed.

- **Env (D13).** Env is repo-reachable: `.env` loaded by `dotenv`, and `env` blocks in
  `.mcp.json` and `.claude/settings.json`. A raising env value is ignored with a warning.
- **Invocation flags (D17).** `--supervised` and `--audit` lower; `--trusted` and `--no-audit` are
  refused, because an agent cannot prove a human typed them. A skill applies a lowering flag
  through `manage_state set-autonomy` so subagents that re-read autonomy see it.
- **The agent-callable writer (D12).** `manage_state` action `set-autonomy` goes through
  `writeLoweringOverride` (`packages/core/src/autonomy/lower-only.ts:25`), the only override
  writer an MCP surface may use; a raise is rejected with `AUTONOMY_RAISE_REJECTED` and the
  override is left unchanged (SC13).

### Raise paths

Exactly two, and both need something only the human controls:

1. **`~/.harness/config.json`**, the user-level file the human edits.
2. **`harness autonomy set`** with both stdin and stdout a TTY (`defaultIsInteractive`,
   `packages/cli/src/commands/autonomy/set.ts:37`) plus an interactive confirm. Without a TTY it
   refuses (SC13). Every successful raise appends a line to `~/.harness/autonomy-audit.log`
   (`autonomyAuditLogPath`, `packages/core/src/autonomy/paths.ts:29`).

### Overrides live in the user's home, never the repo (D12, D15)

Session overrides are stored at `~/.harness/session-overrides/<repoKey>/<slug>.json`. `repoKey`
is the first 16 hex chars of the sha256 of the realpath of `git rev-parse --git-common-dir`
(`computeRepoKey`, `packages/core/src/autonomy/paths.ts:93`), so every worktree of a repo
shares overrides: a human lowering in the main checkout reaches agents in sibling worktrees. A
raise does not travel the same way (see D14 below): it is honoured only where its session
directory exists in the worktree that reads it.
Each written field carries its own `setAt` and origin, so "the more recent of flag and session"
is decided per field.

### Raises are session-bound and expire; lowerings do not expire (D14)

A raise must name an existing `.harness/sessions/<slug>/` directory, checked before the human
is prompted, and it expires: default 24 hours (`DEFAULT_RAISE_TTL_MS`,
`packages/core/src/autonomy/override-store.ts:27`), adjustable with `--for <duration>` (`--for`
on a lowering is refused). Lowerings do not expire; only a later interactive raise replaces one.
Otherwise an injected instruction need only name an old slug to inherit a past grant.

The shipped resolver enforces this again at read time, per field:

- **Session dir at read time.** A raised field is honoured only while `.harness/sessions/<slug>/`
  exists in the worktree resolving it (`resolveAutonomyForSession`,
  `packages/core/src/autonomy/session.ts`). Because the override file is shared across worktrees
  (D15) but the session dir is not, a raise made for a session in one worktree does not reach a
  sibling worktree, whereas a lowering does.
- **No expiry means expired.** A raised field without `expiresAt` (or with an unparseable one) is
  ignored with a warning, the same as an expired one (`liveField`,
  `packages/core/src/autonomy/resolve.ts`).
- **Corrupt fields fail closed, per field.** A present-but-corrupt `level` or `audit` field reads
  as its lowest-autonomy value (`supervised`, audit on) without discarding the other field, and
  the next write persists that value (`readSessionOverride`,
  `packages/core/src/autonomy/override-store.ts`).
- **Strict validation.** A change must be exactly typed (for example a string `"false"` for
  `audit` is invalid, not falsy); anything else is rejected with `AUTONOMY_INVALID_SETTING`
  before the raise/lower policy check runs (`packages/core/src/autonomy/schema.ts`,
  `lower-only.ts`).

### The same-user residual is narrowed and made visible (D16)

The `autonomy-guard` PreToolUse hook (`packages/cli/src/hooks/autonomy-guard.js`) blocks agent
Bash invocations of `harness autonomy set` that raise (or whose level is not literally a
lowering), agent Bash/Write/Edit aimed at `~/.harness/config.json`,
`~/.harness/session-overrides/` and `~/.harness/autonomy-audit.log`, and agent writes to the
append-only decision log. It is in the `minimal` hook profile, the safety floor every profile
includes (`packages/cli/src/hooks/profiles.ts:5`).

### Alternatives rejected

- **A project-level setting in `harness.config.json`.** A cloned repo could raise its reader into
  trusted mode. Rejected outright; SC5 pins it with a test.
- **Raising env or flags.** Both are reachable by an agent or a repo; an agent cannot prove a
  human set them (D13, D17).
- **Overrides under `.harness/sessions/`.** That directory is gitignored in this repo but not in
  scaffolded templates, so a repo-carried override could reach another user (spec Assumptions).

## Consequences

- **Headless trusted runs must configure the host.** CI, the orchestrator and any non-TTY run can
  only be trusted through `~/.harness/config.json` on the machine that runs them; env and flags
  can only lower.
- **A tripwire, not a sandbox.** An agent with an unrestricted shell running as the same OS user
  can still write `~/.harness/` through indirection the hook does not follow (another
  interpreter, a decoded payload, a script written then executed, symlinks). The hook header
  lists the known residual evasions. The raise audit log makes successful raises visible after
  the fact; it does not prevent them.
- **No project cap in v1 (D4).** A regulated repo cannot forbid trusted mode today. A cap could
  only lower autonomy, so it can be added later without changing this trust boundary (spec
  Future Considerations).
- **Persona subagents cannot read autonomy, so they fail safe.** All 16 generated persona
  subagents, including `harness-planner` and `harness-task-executor` that autopilot dispatches for
  PLAN and EXECUTE, are generated with a fixed allow-list `Bash, Read, Write, Edit, Glob, Grep`
  (`DEFAULT_TOOLS`, `packages/cli/src/agent-definitions/generator.ts:33`, applied to every
  persona at `:70`). The Claude Code subagent docs (code.claude.com/docs/en/sub-agents,
  "Restrict which tools a subagent can use"; tools-reference) state that a `tools` field is an
  allowlist and that a subagent given `tools: Read, Grep, Glob, Bash` cannot "use any MCP
  tools"; MCP tools reach a `tools`-restricted subagent only when named there (as a tool or as a
  whole-server `mcp__<server>__*` entry). So inside those subagents `gather_context` (autonomy)
  and `record_auto_decision` are unreachable: autonomy cannot be resolved and decisions cannot be
  logged or audited. Under the Pause Protocol both are fail-safe pauses, so every ceremony and
  judgment fork inside a persona subagent pauses and comes back to autopilot as a handoff
  concern rather than auto-resolving. Autopilot's own pauses (plan approval, phase transitions,
  sign-offs, gates) run in the main session, where trusted mode works. The boundary fails safe,
  not open, but Goal 1 (brainstorm → plan → execute → review without approvals) does **not** hold
  end-to-end inside those subagents. Follow-up options, not implemented here:
  1. Name the harness MCP tools in the personas' `tools` list. The server name is
     install-dependent: `mcp__harness__*` for a project `.mcp.json` server named `harness`, versus
     `mcp__plugin_harness-claude_harness__*` (the docs' `mcp__plugin_<plugin>_<server>__*` form)
     when the server comes from the `harness-claude` plugin, so the generator would have to emit
     both or detect the install.
  2. Switch personas from a `tools` allowlist to `disallowedTools`-based restriction, so they
     inherit the session's MCP tools. That widens what every persona can call and is a
     security-posture decision, not a docs fix.

  Neither option adds a subagent-spawning tool by itself; without one, a persona that could log
  decisions would still record audits as `unavailable` (ADR 0138).

## References

- Spec: `docs/changes/trusted-autonomy-mode/proposal.md` (D3, D4, D12-D17; `#threat-model`;
  SC5, SC6, SC13).
- Code: `packages/core/src/autonomy/resolve.ts`, `lower-only.ts`, `override-store.ts`,
  `paths.ts`; `packages/cli/src/commands/autonomy/set.ts`;
  `packages/cli/src/hooks/autonomy-guard.js`; `packages/cli/src/hooks/profiles.ts`;
  `packages/cli/src/agent-definitions/generator.ts`.
- Claude Code docs: <https://code.claude.com/docs/en/sub-agents> ("Available tools", "Restrict
  which tools a subagent can use"), <https://code.claude.com/docs/en/tools-reference>,
  <https://code.claude.com/docs/en/mcp> (plugin-provided server tool names). Read 2026-11-13.
- Related: [ADR 0136](./0136-autonomy-is-orthogonal-to-rigor.md),
  [ADR 0138](./0138-blind-then-refute-self-audit-for-auto-resolved-judgment-forks.md).
- Guide: `docs/guides/trusted-autonomy.md` ("Known limitations").
