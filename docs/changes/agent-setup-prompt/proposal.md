---
feature: agent-setup-prompt
status: draft
keywords:
  - agent-setup
  - prompt.md
  - generated-docs
  - drift-gate
  - multi-client
  - plugin-install
  - mcp
  - autonomous-install
---

# Agent Setup Prompt (`prompt.md`)

## Overview & Goals

A single hosted, agent-executable markdown file — `prompt.md` — that a user hands to
any coding agent ("follow the instructions at this URL"). The agent then **installs
harness into the current project by itself**: installs the right plugin/MCP for its
client, runs `harness setup`, then scaffolds harness via `harness init`. This is a
direct analog of Cloudflare's `agent-setup/prompt.md`
([reference](https://developers.cloudflare.com/agent-setup/prompt.md)).

**Goals:**

1. One canonical, fetchable "set up harness" entry point.
2. The agent does the work — it does not hand commands back to the user.
3. Content is **generated** from the real install matrix so it cannot drift.
4. Covers every supported client: Claude Code, Cursor, Gemini CLI, Codex, OpenCode,
   and plain CLI/CI.

**Non-goals (YAGNI):**

- No `harness prompt` CLI command (cut for v1).
- No new docs website / host.
- No per-client tailored copies of the file — one file branches internally, like the
  reference.
- Does not replace or re-implement `harness:onboarding` (orient a dev to an existing
  project) or `harness:initialize-project` (scaffold harness into a project). This is
  the missing third artifact: a fetchable, autonomous installer.

## Assumptions

- **Runtime:** Node.js (repo standard) — the generator is a `node`/`.mjs` script and
  `setup.ts` is TypeScript compiled/run in the existing toolchain.
- **URL target:** the raw-GitHub URL serves the `main` branch
  (`raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md`),
  so the file reflects the latest merged install steps, not an arbitrary ref.
- **Consuming agent:** the agent can fetch a URL and run both shell commands and its
  client's slash/plugin commands. Agents that cannot fetch fall back to the offline path
  (a maintainer pastes the file contents), which the file's self-contained wording
  supports.

## Decisions Made

| #   | Decision                                                                                                                                           | Rationale                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Deliverable is a committed, generated `prompt.md`; **no** new CLI command.                                                                         | A raw-GitHub URL can only serve a committed file; the generator keeps it truthful. `harness prompt` is YAGNI for v1.                                                        |
| D2  | Scope = **install + init** (plugin/MCP + `harness setup` + `harness init`).                                                                        | The harness "get productive" moment is harness _active in the project_, not just tooling installed.                                                                         |
| D3  | Install and `harness setup` run fully autonomously; **`harness init` is the one place the agent may pause** if scaffolding needs a human decision. | Resolves the tension between "do it yourself" and `harness init` being interactive. Install has no decisions; scaffolding sometimes does.                                   |
| D4  | Content is generated from a **shared, enriched client descriptor** that `setup.ts` also consumes.                                                  | Prevents the prompt from misdescribing what `harness setup` does — the exact drift the repo mechanically fights. Today's `setup.ts` array lacks plugin names (README-only). |
| D5  | Hosted at `docs/agent-setup/prompt.md` → raw-GitHub URL; mirrors Cloudflare's `/agent-setup/` path.                                                | No docs site exists; raw GitHub is the available stable host. A namespaced path keeps the repo root clean and leaves room for a redirect later.                             |
| D6  | Freshness-gated via the existing `generate-docs --check` pre-push / CI mechanism.                                                                  | Reuses the proven `docs/reference/*` drift gate — no new infrastructure.                                                                                                    |

## Technical Design

### Shared client descriptor

A new module `packages/cli/src/setup/clients.ts` becomes the single source of truth for
per-client install steps. It supersedes the inline `clients` array currently at
`packages/cli/src/commands/setup.ts:52` (evidence: that array carries
`name`/`dir`/`client`/`configTarget` but **no** plugin names — those live only in
`README.md:40-53`, so the two would drift).

```ts
export interface SetupClient {
  name: string; // "Claude Code"
  detectDir: string; // ".claude"
  client: string; // "claude"
  configTarget: string; // ".mcp.json"
  install: // how this client gets harness
    | { kind: 'plugin'; marketplace: 'Intense-Visions/harness-engineering'; plugin: string }
    | { kind: 'npm'; pkg: '@harness-engineering/cli'; setup: 'harness setup' };
}

export const SETUP_CLIENTS: SetupClient[] = [
  /* claude, cursor, gemini, codex, opencode, plain-cli */
];
```

`setup.ts` refactors its inline array to import `SETUP_CLIENTS`, using only the subset of
fields it needs (`name`/`detectDir`/`client`/`configTarget`). No behavior change to
`harness setup`.

### Generator

`scripts/generate-agent-setup-prompt.mjs`, styled after `scripts/generate-docs.mjs`
(same `AUTO-GENERATED — do not edit` header, same `--check` freshness mode). It reads the
descriptor and emits `docs/agent-setup/prompt.md`.

Because `.mjs` cannot `import` a `.ts` module directly (evidence: `generate-docs.mjs`
reads code metadata via file parsing / `execSync`, not TS imports), the descriptor is
authored so its data is reachable without a full build. Two acceptable implementations,
chosen at implementation time, both preserving a single source:

- a co-located `clients.json` that `clients.ts` re-exports (generator reads the JSON), or
- the generator runs via `tsx` and imports `clients.ts` directly.

### `prompt.md` content shape

Branches by agent, like the reference. Illustrative skeleton:

```markdown
# Set up Harness Engineering

Official instructions to install and initialize harness in this project.
Complete every step yourself by running the commands directly. Do not ask
the user to run them. These instructions are published at <URL>.

## 1. Install for your agent

### Claude Code

/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-claude

### Cursor / Gemini CLI / Codex → harness-cursor / harness-gemini / harness-codex

### OpenCode / any other CLI

npm install -g @harness-engineering/cli && harness setup

If the plugin marketplace is unavailable, fall back to:
npm install -g @harness-engineering/cli && harness setup
If you cannot identify your client, use the npm + `harness setup` path — it
auto-detects every supported client.

## 2. Initialize harness in the project

harness init # scaffold; skips cleanly if already initialized;

# pause only if it needs a human decision

## 3. Verify

harness validate # (and: harness doctor)

## Success

Harness is installed and initialized. Try `/harness:onboarding` to get oriented.
Docs: <README / docs links>
```

The harness prompt is _shorter_ than Cloudflare's because `harness setup` auto-wires MCP
for detected clients (evidence: `packages/cli/src/commands/setup.ts:47-73`), so we do not
hand-write per-client MCP JSON blobs.

### Drift enforcement

- `generate-agent-setup-prompt.mjs --check` fails when the committed `prompt.md` differs
  from freshly generated output (same contract as `generate-docs --check`).
- A vitest parity test asserts `SETUP_CLIENTS` covers exactly the clients `setup.ts`
  detects, so a client added in one place cannot silently miss the other.

## Integration Points

- **Entry Points:** new generated artifact `docs/agent-setup/prompt.md`; new generator
  `scripts/generate-agent-setup-prompt.mjs`; new shared module
  `packages/cli/src/setup/clients.ts`.
- **Registrations Required:** hook the new generator into the `generate-docs` pipeline (or
  add it to the pre-push / CI `--check` freshness set) so `prompt.md` is drift-gated; add
  `docs/agent-setup/prompt.md` to `.prettierignore` if the `AUTO-GENERATED` format trips
  prettier (established repo pattern for generated docs).
- **Documentation Updates:** README "Quick Start" gains a one-line pointer to the
  `prompt.md` URL for agent-driven setup. AGENTS.md unaffected.
- **Architectural Decisions:** **D4** (shared client descriptor as the single source of
  truth for install steps) warrants a short ADR — it establishes that setup-step
  documentation is generated-from-code, not hand-maintained, and that future clients must
  extend the descriptor rather than editing prose in two places.
- **Knowledge Impact:** concept "agent-setup prompt / fetchable autonomous installer";
  relationship "`prompt.md` generated-from `SETUP_CLIENTS`"; the three-way distinction
  between this installer, `harness:onboarding` (orient), and `harness:initialize-project`
  (scaffold).

## Success Criteria

1. `docs/agent-setup/prompt.md` exists and is served at a stable raw-GitHub URL.
2. When an agent fetches the URL, the system shall present autonomous steps to install
   harness for the agent's client, run `harness setup`, and run `harness init`, with no
   step that asks the user to run a command (except the permitted `harness init` pause).
3. Running the generator produces the committed file byte-for-byte; the `--check` mode
   fails if `prompt.md` is stale.
4. If a client is added to `SETUP_CLIENTS`, then the freshness gate shall block any push
   whose `prompt.md` was not regenerated.
5. `prompt.md` references only real commands and plugin names (`harness-claude`,
   `harness-cursor`, `harness-gemini`, `harness-codex`; `harness setup` / `init` /
   `validate`).
6. The parity test passes: `SETUP_CLIENTS` matches the clients `setup.ts` detects.
7. `prompt.md` contains an install branch for **every** client in `SETUP_CLIENTS`
   (Claude Code, Cursor, Gemini CLI, Codex, OpenCode, plain CLI), plus an explicit
   fallback path for unknown/undetected clients.

## Implementation Order

1. Extract the `SETUP_CLIENTS` descriptor; refactor `setup.ts` to consume it; add the
   parity test.
2. Write the generator `scripts/generate-agent-setup-prompt.mjs` (with `--check`); produce
   `docs/agent-setup/prompt.md`.
3. Wire the generator into `generate-docs` / the freshness gate; add to `.prettierignore`
   if needed.
4. Add the README pointer and a short ADR for D4.
