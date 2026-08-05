# Trust Model — Harness Marketplace Plugins

This document explains, for an adopter installing a Harness marketplace plugin
(`harness-claude`, `harness-cursor`, `harness-gemini`, or `harness-codex`), exactly
what code they run, what the version pin protects against, how to verify integrity,
and how updates reach them. It describes how Harness _actually_ ships today — it does
not promise guarantees the project does not provide.

## What you are trusting

Installing a Harness plugin runs code from two distinct supply lines. Both execute
with your local user privileges.

### 1. Bundled git artifacts (skills, slash commands, subagents, hooks)

The plugin manifest ships alongside a copy of this git repository, which the host tool
(Claude Code, Cursor, etc.) checks out into your plugin install directory. From that
checkout you run:

- **Skills** — the `SKILL.md` procedures under `agents/skills/<platform>/`.
- **Slash commands** — `/harness:*` command wrappers under `<pluginDir>/commands/`.
- **Persona subagents** — the reviewer/planner/executor definitions under
  `<pluginDir>/agents/` (Claude and Cursor only).
- **Lifecycle hooks** — the standard-profile hook scripts wired in
  `<pluginDir>/hooks.json`, which run `node "…/.harness/hooks/<name>.js"` on tool-use
  and stop events (Claude and Cursor only).

These artifacts are versioned by the plugin's own `version` field and by the git
revision the marketplace serves. You trust the contents of this repository at the
revision you install, and any repository the host tool pins the marketplace source to.

### 2. The pinned CLI package and its MCP server binary

Every plugin's manifest declares an MCP server launched with:

```
npx -y -p @harness-engineering/cli@10.2.0 harness-mcp
```

At the start of each session the host tool runs this command, which fetches
`@harness-engineering/cli` **at the exact pinned version** from the public npm registry
and executes its `harness-mcp` binary (`dist/bin/harness-mcp.js`). That binary is the
MCP server exposing the `harness_*` tools to the agent. You trust:

- the published `@harness-engineering/cli` package at the pinned version, and
- its runtime dependencies, resolved from npm at fetch time (see
  [What the pin does **not** cover](#what-the-pin-does-not-cover)).

The published package bundles the Harness workspace packages (`core`, `graph`,
`linter-gen`, `types`, and the other `@harness-engineering/*` libraries) into its
`dist/`, so those are frozen inside the pinned version. Its remaining third-party
dependencies are ordinary npm dependencies resolved at install time.

## What the pin protects against

The manifest previously used `@harness-engineering/cli@latest`. Under `@latest`, every
new session pulls whatever is newest on npm, subject only to npx's roughly 24-hour
cache. A single malicious or compromised publish would therefore propagate to **every
active adopter within about a day**, with no adopter action and no review step in
between.

Pinning to an exact version (`@10.2.0`) removes that automatic-propagation path:

- Every adopter runs the **same, specific, reviewable build** — the one named in the
  manifest — rather than a moving target.
- A new npm publish (benign or malicious) does **not** reach pinned adopters until the
  manifest's pin is deliberately bumped and shipped through a plugin update.
- The pinned version is auditable: you can read the exact version in the manifest,
  inspect the corresponding git tag and source, and check its npm provenance before
  updating.

The intent is that adopters receive CLI/MCP updates **deliberately, through the plugin
update flow** — not silently on every session.

## How to verify integrity

- **Read the pin.** The exact version is in the plugin manifest's `mcpServers.harness`
  entry (`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`,
  `.codex-plugin/plugin.json`, `.gemini-extension/gemini-extension.json`). Nothing is
  hidden behind `@latest`.

- **Check npm provenance.** Releases publish `@harness-engineering/cli` from CI via npm
  trusted publishing (OIDC) with provenance enabled (`NPM_CONFIG_PROVENANCE=true` in
  `.github/workflows/release.yml`). npm records a signed provenance attestation binding
  the published tarball to the GitHub Actions workflow and source commit that built it.
  You can inspect it on the package's npm page or verify locally:

  ```bash
  npm view @harness-engineering/cli@10.2.0
  npm audit signatures      # run inside a project that installed the package
  ```

- **Review the pinned source.** The pinned version corresponds to a git tag in this
  repository. Review that tag's source (the `packages/cli` tree and the workspace
  packages it bundles) before adopting or bumping the pin.

- **Lock everything to one build.** If you want the CLI/MCP binary and the git
  artifacts moving in lockstep with no npx resolution at all, install the CLI globally
  (`npm install -g @harness-engineering/cli@<version>`) and use `harness setup` instead
  of the plugin's npx launcher.

## How updates flow

Updates are deliberate, not ambient:

1. A maintainer publishes a new `@harness-engineering/cli` version (changesets → npm,
   with provenance).
2. The pin in the plugin manifests is bumped to that version (see
   [Maintainer: bumping the pin](#maintainer-bumping-the-pin)).
3. Adopters run `/plugin update harness-claude` (or the sibling command for their
   tool). This pulls the new manifest revision, and the next session's npx invocation
   fetches the newly pinned version.

Because the bundled git artifacts and the pinned MCP version travel in the same manifest
revision, a single plugin update moves both channels together.

## What the pin does **not** cover

State the limits honestly:

- **Transitive npm dependencies are not pinned by the manifest.** The pin fixes the
  top-level `@harness-engineering/cli` version and the workspace packages bundled into
  its `dist/`. Its remaining third-party runtime dependencies are resolved from npm at
  npx time according to the published package's own semver ranges. A compromised
  _transitive_ dependency is out of scope for this manifest-level pin; npm provenance
  and standard supply-chain hygiene (see `docs/supply-chain-audit-*.md`) are the
  relevant controls there.
- **The pin is a version, not a content hash.** It guarantees you request a specific
  published version, not a specific bit-for-bit artifact. npm provenance is what ties
  that version to the build that produced it — pinning and provenance are complementary.
- **Everything runs with your privileges.** Hooks and the MCP server run as local
  `node` processes with your user's permissions. Pinning bounds _which_ code runs; it
  does not sandbox that code.
- **First fetch still hits the network.** `npx` downloads the pinned package (and
  resolves its deps) on first use within the cache window. Provenance verification is
  your assurance for that download.

## Maintainer: bumping the pin

The pin is **hand-maintained** — the plugin manifests are not regenerated by
`scripts/generate-plugin.mjs` (that generator only produces commands, agents, and
`hooks.json`), and `changesets` does not touch them. On each `@harness-engineering/cli`
release that adopters should receive, bump the pinned version in **all five** locations
so they stay in lockstep:

1. `.claude-plugin/plugin.json` — `mcpServers.harness.args`
2. `.cursor-plugin/plugin.json` — `mcpServers.harness.args`
3. `.codex-plugin/plugin.json` — `mcpServers.harness.args`
4. `.gemini-extension/gemini-extension.json` — `mcpServers.harness.args`
5. `README.md` — the `<pinned-version>` reference in the _Updates_ section

The target version is the current published latest:

```bash
npm view @harness-engineering/cli version
```

Bumping deliberately (rather than tracking `@latest`) is the whole point of the pin: it
is the review gate between a new publish and every adopter.
