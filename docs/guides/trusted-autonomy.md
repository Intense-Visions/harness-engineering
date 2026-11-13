# Trusted Autonomy — operator guide

> How to let harness workflow skills run without stopping for approvals, what still stops them,
> and how to check afterwards what they decided.

Harness workflow skills (brainstorming, planning, autopilot, execution, soundness-review,
code-review, integration) stop at pause points: approve this plan, pick approach A or B, continue
to the next phase. **Autonomy** decides who decides at those pauses. In `supervised` mode (the
default) every pause waits for you. In `trusted` mode, ceremony pauses auto-approve, judgment forks
auto-take the skill's stated recommendation after a self-audit, and every skipped pause is written
to a per-session decision log you can read after the run. Irreversible actions and mechanical
gates still stop at every level.

Autonomy is separate from autopilot's rigor level: rigor decides **how much is checked**,
autonomy decides **who approves**. `--fast` checks less but no longer approves anything on its
own ([ADR 0136](../knowledge/decisions/0136-autonomy-is-orthogonal-to-rigor.md)).

## Enabling trusted mode

Autonomy is a **user-level** setting. Put it in `~/.harness/config.json` in your home directory:

```json
{ "autonomy": { "level": "trusted", "audit": { "trusted": true, "supervised": false } } }
```

- `level` is `supervised` (default) or `trusted`.
- `audit.trusted` (default `true`) turns the self-audit on for trusted runs; `audit.supervised`
  (default `false`) shows an audit verdict beside each recommendation in supervised runs.
- An `autonomy` key in a project's `harness.config.json` is **ignored**. A cloned repo cannot
  switch you into trusted mode through its configuration.
- A malformed `~/.harness/config.json` is ignored with one warning, and the defaults apply.

Check what is in effect, and where it came from:

```bash
harness autonomy show                    # resolved level + audit, with their source
harness autonomy show --session <slug>   # including that session's override
```

## Trusting one session

To trust a single session without changing your user config:

```bash
harness autonomy set trusted --session <slug>            # raise for 24h
harness autonomy set trusted --session <slug> --for 2h   # 90m, 2h, 7d, ...
```

- A raise needs an **interactive terminal** (stdin and stdout both a TTY) and an explicit yes at
  the confirm prompt. Without a TTY it refuses.
- The session must already exist (`.harness/sessions/<slug>/`). A raise cannot target a
  session that has not started, and naming an old slug does not inherit an old raise.
- A raise expires after 24 hours unless you pass `--for`. `--for` applies only to a raise; passing
  it with a lowering is refused.
- Lowering needs no TTY: `harness autonomy set supervised --session <slug>` or `--audit on`.
  Lowerings do not expire; only a later interactive raise replaces one. Agents may lower too
  (through `manage_state` action `set-autonomy`); through that sanctioned path they can never
  raise.
- The change takes effect at the next pause point. Decisions already taken are not undone.

Overrides are stored in your home directory, at
`~/.harness/session-overrides/<repoKey>/<slug>.json`, never in the repo. `repoKey` is derived from
the repo's git common directory, so every worktree of a repo shares them: lowering in your main
checkout reaches an agent working in a sibling worktree. A raise does **not** travel the same way:
it is honoured only where `.harness/sessions/<slug>/` exists under the project path reading it, so
a raise for a session in one worktree does not reach a sibling worktree that lacks that session
directory. The session directory is found exactly where `manage_state` writes it: the project path
as given, not the git toplevel. In a monorepo subproject that is `app/.harness/sessions/<slug>/`, so
run `harness autonomy` from the same directory the session was started in.
A raised field with no expiry is treated as expired, and a corrupt field reads as its
lowest-autonomy value (`supervised`, audit on). Every successful raise appends a line to
`~/.harness/autonomy-audit.log`.

The full flag reference is in [`harness autonomy`](../reference/cli-commands.md#harness-autonomy-log)
(`log`, [`set`](../reference/cli-commands.md#harness-autonomy-set-level),
[`show`](../reference/cli-commands.md#harness-autonomy-show)).

## Headless runs (CI, orchestrator, `claude -p`)

A headless run has no terminal, so it cannot raise with `harness autonomy set`. Environment
variables and invocation flags can only **lower** autonomy, because a repository can set them
(`.env`, `env` blocks in `.mcp.json` and `.claude/settings.json`). To run headless in trusted mode,
set `~/.harness/config.json` on the host that runs the agent.

- `HARNESS_AUTONOMY=supervised` lowers; `trusted` is ignored with a warning. The env tier ranks
  below a session override, so `HARNESS_AUTONOMY=supervised` does **not** override an unexpired
  session raise. To lower a raised session, run
  `harness autonomy set supervised --session <slug>`.
- `HARNESS_AUTONOMY_AUDIT=on` (or `true`, `1`) turns the audit on; `off` is ignored with a warning.

## Lowering flags

The workflow skills that take invocation flags (brainstorming, planning, autopilot, execution,
integration) accept two lowering flags:

- `--supervised`: pause at every pause point for this session.
- `--audit`: run the self-audit on judgment forks for this session.

The skill stores the lowering as a session override, so subagents that re-read autonomy see it.
`--trusted` and `--no-audit` are refused: the skill changes nothing and prints
`Ignoring <flag>: autonomy can only be raised by ~/.harness/config.json or an interactive harness
autonomy set.`, naming the flag it received. An agent cannot prove a human typed a raising flag.

## What still pauses in trusted mode

Every pause point is one of four classes (the table lives in
[`agents/skills/templates/pause-protocol.md`](../../agents/skills/templates/pause-protocol.md)):

| Class          | In trusted mode                                     |
| -------------- | --------------------------------------------------- |
| `ceremony`     | auto-approved and logged                            |
| `judgment`     | self-audit; agree → recommendation taken and logged |
| `irreversible` | **pauses**                                          |
| `gate`         | **stops**                                           |

So trusted mode still pauses for:

- **Irreversible actions:** merge, push, opening a PR, publishing, force-push, closing issues,
  and deleting: deleting branches, issues, remote resources, or local work not recoverable from
  git (for example `git reset --hard`, `git clean -fdx`, `git stash drop`, or removing untracked or
  uncommitted user files). Removing scratch files the run itself created is not in this class.
  The roadmap sync steps a skill already performed before this feature (`manage_roadmap` `sync`),
  and the tracker auto-sync side effects of `manage_roadmap` `update` and `add` calls the skill text prescribes, are deliberately
  **not** treated as new irreversible pauses, even though both can write to an external tracker.
- **Gates:** a red verify, a high-confidence `NOT_SATISFIED` outcome, blocking review findings,
  plan dependency cycles, a contradiction with `STRATEGY.md`, a step only a human can perform, and
  the taint, `--no-verify` and protect-config blocks.
- **Audit disagreements:** the blind auditor picked a different option, or the refuter raised a
  blocking objection. You see both positions and choose.
- **Every fail-safe:** the pause has no stated recommendation, has no class marker, there is no
  session to log to, the decision could not be written to the log, or autonomy could not be
  resolved. When in doubt, the skill pauses.

A class only ever rounds **up**: if the action behind a pause is irreversible or a gate, it is
treated that way whatever its marker says, including commands inside a plan task.

## Reading the decision log

Every auto-taken decision is appended to `.harness/sessions/<slug>/auto-decisions.jsonl` through
the `record_auto_decision` MCP tool, which refuses entries outside trusted mode. A supervised run
writes no log.

```bash
harness autonomy log --session <slug>
```

prints counts by class, `audited N/M`, the agreement rate and the escalations:

- **`audited N/M`**: N is the judgment decisions whose audit actually ran (agreed or escalated);
  M is every judgment decision, including those recorded `unavailable` (the host could not spawn
  a subagent) and `off` (audit was off). A gap between N and M is decisions nobody checked.
- **Agreement rate** (agreed ÷ audited) is a calibration signal for how often the skill's
  recommendation survives a blind re-derivation.
- The audit prompts and raw replies are kept under `.harness/sessions/<slug>/audits/`
  (`<n>.md`, `<n>.reply.json`, `<n>.refuter.json`), so you can inspect what the auditor was shown
  and what it replied; these files are agent-written and not tamper-evident.

Skills print this summary themselves at terminal points (autopilot DONE, brainstorming sign-off,
execution completion) when the session has at least one auto-decision. If the live session was
archived, `harness autonomy log` reads the newest archived copy and says so.

## Threat model in plain words

Trusted mode is protected against **injected instructions** (text in an issue, spec, web page or
tool output telling the agent to trust itself), **repo-carried configuration** (a cloned repo's
`harness.config.json`, `.env` or settings files) and **accidental raises**. Every sanctioned path
an agent or repo can reach (MCP tools, env, invocation flags, project files, a non-interactive
`harness autonomy set`) may only lower autonomy; only your user config or your own interactive
terminal can raise it ([ADR 0137](../knowledge/decisions/0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md)).

It is **not a sandbox** against code running as your OS user. An agent with an unrestricted shell
can still write `~/.harness/` through enough indirection. The
[`autonomy-guard` hook](./hooks-system.md#autonomy-guard-js) narrows that gap by blocking agent
raises and agent writes to `~/.harness/config.json`, `~/.harness/session-overrides/`,
`~/.harness/autonomy-audit.log` and the decision log; it is in the `minimal` hook profile, so every
profile includes it. `~/.harness/autonomy-audit.log` makes successful raises visible afterwards.
Treat the hook as a tripwire, not a wall.

## Known limitations

1. **Compliance is instruction-level.** The Pause Protocol is text the skills follow; nothing
   mechanically forces a skill to pause or to run the audit. Tests prove the protocol and the
   pause markers say the right thing. The decision log, the saved audit files and the
   `audited N/M` denominator are how you spot a skill that did not follow it; the audit files are
   agent-written and not tamper-evident.
2. **Persona subagents auto-resolve ceremony only.** Autopilot runs PLAN and EXECUTE in persona
   subagents (`harness-planner`, `harness-task-executor`). Their Claude Code definitions name the
   four harness MCP tools the Pause Protocol needs (`gather_context`, `manage_state`,
   `record_auto_decision`, `emit_interaction`), under both server names a Claude Code install can
   use: `mcp__harness__…` (`harness setup-mcp`) and `mcp__plugin_harness-claude_harness__…` (the
   `harness-claude` plugin). Exact names are listed rather than `mcp__harness__*`, so a persona
   gains nothing else; it already holds `Bash`, which reaches the same harness CLI. Inside a
   persona, trusted mode therefore resolves autonomy and logs ceremony pauses as in the main
   session. A subagent cannot spawn the blind auditor, so it never takes a judgment fork
   unaudited: it hands the fork back as a `judgment-fork:` handoff blocker, and autopilot audits
   and resolves it in the main session ("Handing a fork back" in the Pause Protocol). If harness
   is installed under some other MCP server name, or on Gemini CLI (whose persona definitions list
   only the six mapped built-in tools), personas still fail safe: their pauses come back to
   autopilot as handoff concerns. Cursor and Codex persona definitions carry no tool list, so
   there the host's own permissions decide.
3. **Only autopilot and the orchestrator read headless blockers.** A headless run that hits an
   audit disagreement, or a judgment fork it cannot audit, does not choose: it writes
   `audit-disagreement: <question>` or `judgment-fork: <question>` to the handoff's `blockers` and
   stops. Autopilot resolves these after every dispatch. The orchestrator scans a finished run's
   session handoffs, queues a `needs-human` interaction, records the `needs-human` verdict, and
   neither ships nor re-dispatches the unit. A headless run started some other way pages nobody;
   check its handoff.
4. **Zero-width characters outside a script context still taint.** The sentinel injection
   scanner (INJ-UNI-001) accepts ZERO WIDTH NON-JOINER / JOINER only between characters of a
   joining script (Arabic, Syriac, N'Ko, Mongolian, the Indic scripts, Sinhala) or inside an emoji
   ZWJ sequence, so Persian text and family emoji in a decision-log entry no longer taint the
   session. A ZWNJ/ZWJ next to Latin text, or at a word edge, and every ZERO WIDTH SPACE, BOM and
   WORD JOINER, still do.
5. **Unenumerated choices are not audited.** A spec or plan approval is a ceremony unless it embeds
   a choice between alternatives the skill text or the run's output explicitly listed. Option
   choices made inside the content without being presented as alternatives are approved as
   ceremony and never audited; otherwise every spec and plan approval would become a judgment
   fork.
6. **No project-level cap.** A repo cannot forbid trusted mode for its contributors yet. A cap
   could only lower autonomy, so it can be added later without changing the trust model.

## See also

- [ADR 0136](../knowledge/decisions/0136-autonomy-is-orthogonal-to-rigor.md): autonomy is
  orthogonal to rigor.
- [ADR 0137](../knowledge/decisions/0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md):
  the trust boundary.
- [ADR 0138](../knowledge/decisions/0138-blind-then-refute-self-audit-for-auto-resolved-judgment-forks.md):
  the blind-then-refute self-audit.
- [Autonomy knowledge node](../knowledge/core/autonomy.md): concepts and source map.
- [Pause Protocol](../../agents/skills/templates/pause-protocol.md): the rule table every
  workflow skill follows.
- [Hooks system: `autonomy-guard.js`](./hooks-system.md#autonomy-guard-js).
- Spec: [`docs/changes/trusted-autonomy-mode/proposal.md`](../changes/trusted-autonomy-mode/proposal.md).
