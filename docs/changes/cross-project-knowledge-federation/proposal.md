# Cross-Project Knowledge Federation

> **Status: Deferred to Q3 2026.** Prerequisites: constraint sharing must ship and prove cross-project sharing patterns; 5+ active harness-managed projects needed for adoption density. Spec is approved and ready to plan against when conditions are met.

> Decentralized knowledge sharing across project boundaries via package-native federation.

**Keywords:** federation, knowledge-graph, decentralized, package-manifest, cross-project, learnings, constraints, structural-summaries, visibility-tags, node-modules

## Overview

Enable harness-managed projects to share and consume knowledge (learnings, constraints, patterns, structural summaries) across project boundaries through package-native federation. Any harness-enabled package — public or private — can participate by including a federation manifest. Discovery is automatic via `node_modules`, sync is background-driven, and visibility is tag-controlled.

### Goals

1. Decentralized knowledge sharing with zero central infrastructure
2. Automatic discovery of federated knowledge from installed dependencies
3. Privacy-preserving sharing via visibility tags (`org`, `team:<name>`, `private`)
4. Four federable knowledge types: learnings, constraints, patterns, structural summaries
5. Background sync keeps local cache fresh without impacting `harness scan` performance
6. Any harness-enabled npm package can participate — org-internal or public ecosystem

### Non-Goals

- Real-time cross-project graph queries (cached knowledge only)
- Full graph federation (raw nodes/edges do not leave projects)
- Non-npm resolvers (Cargo, pip, Go modules) — `PackageResolver` interface is defined in this spec, but only `NodeModulesResolver` is implemented
- Encrypted visibility enforcement (application-level tags, not cryptographic)

## Decisions

| #   | Decision                                                                        | Rationale                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hybrid architecture: git-backed index + local graphs                            | Projects keep autonomous local graphs. Shared knowledge flows through packages. No central service — git is the transport.                                                                                 |
| 2   | Full knowledge scope: learnings + constraints + patterns + structural summaries | Go straight to full scope rather than incremental widening. Pipeline architecture is the same regardless — only extraction logic differs per type.                                                         |
| 3   | Tag-based visibility with three levels (`org`, `team:<name>`, `private`)        | Minimal viable access control. Enforced at application level. Hard boundaries (repo-level ACLs, encryption) deferred unless compliance requires them.                                                      |
| 4   | Package-native discovery via `PackageResolver` interface                        | Zero config, fully decentralized. Ships with `NodeModulesResolver` for npm/pnpm. Resolver abstraction enables future support for Yarn PnP, Cargo, pip, Go modules without changing discovery architecture. |
| 5   | Background sync via harness hooks + optional cron                               | Harness hooks trigger non-blocking cache refresh after common commands. Optional `harness federation schedule` for always-fresh caches. Scan reads from cache with staleness threshold.                    |
| 6   | Scan-time cache read with staleness threshold                                   | `harness scan` reads from local cache, never fetches. Background sync keeps cache fresh. Configurable staleness threshold (default 30 min). Graceful degradation if cache is stale.                        |
| 7   | Spec full system, phase implementation                                          | Spec covers all four knowledge types end-to-end. Implementation phases: learnings first, then constraints/patterns, then structural summaries.                                                             |
| 8   | Structural summaries, not raw graph data                                        | Projects publish aggregated metrics (hotspot scores, coupling trends, complexity distributions). No raw nodes/edges cross project boundaries — preserves privacy and keeps payload small.                  |

## Technical Design

### Federation Manifest

Each harness-enabled package includes `.harness/federation.manifest.yaml`:

```yaml
schema_version: '1.0'
package: '@yourorg/auth-service'
visibility: org # org | team:<name> | private
knowledge:
  learnings: true
  constraints: true
  patterns: true
  structural_summaries: true
published_at: '2026-03-28T12:00:00Z'
```

Knowledge data lives alongside the manifest:

```
.harness/
  federation.manifest.yaml
  federation/
    learnings.yaml
    constraints.yaml
    patterns.yaml
    structural-summary.yaml
```

### Knowledge Schemas

#### Learnings (`learnings.yaml`)

```yaml
- id: 'auth-service:learning:001'
  type: learning
  title: 'JWT refresh race condition under load'
  description: 'Concurrent refresh requests can invalidate tokens mid-flight'
  context: 'auth middleware, high-concurrency environments'
  resolution: 'Implemented token rotation with grace period'
  tags: [auth, jwt, concurrency]
  visibility: org
  created: '2026-02-15'
```

#### Constraints (`constraints.yaml`)

```yaml
- id: 'auth-service:constraint:001'
  type: constraint
  rule: 'no-direct-db-access-from-handlers'
  description: 'HTTP handlers must not import database modules directly'
  layer: handler
  forbidden_imports: ['src/db/*']
  severity: error
  visibility: org
```

#### Patterns (`patterns.yaml`)

```yaml
- id: 'auth-service:pattern:001'
  type: pattern
  name: 'repository-pattern'
  description: 'Data access via repository interfaces, not direct DB calls'
  applies_to: [typescript, node]
  example_files: ['src/repos/UserRepo.ts']
  tags: [architecture, data-access]
  visibility: org
```

#### Structural Summaries (`structural-summary.yaml`)

```yaml
snapshot_date: '2026-03-28'
metrics:
  total_files: 342
  total_functions: 1847
  hotspots:
    - path: 'src/middleware/auth.ts'
      score: 8.7
      reason: 'High churn + high coupling'
    - path: 'src/services/token.ts'
      score: 7.2
      reason: 'High fan-in'
  coupling:
    avg_fan_in: 3.2
    avg_fan_out: 4.1
    max_fan_in: { path: 'src/utils/errors.ts', value: 47 }
  complexity:
    p50: 4
    p90: 12
    p99: 31
  health_grade: 'B'
```

### Discovery

Discovery is mediated by a `PackageResolver` interface, decoupling manifest detection from any specific package manager or language ecosystem:

```typescript
interface PackageResolver {
  /** Human-readable name (e.g., "node_modules", "cargo", "pip") */
  name: string;
  /** Return all discovered federation manifests from installed dependencies */
  resolve(projectPath: string): Promise<FederatedPackage[]>;
}

interface FederatedPackage {
  /** Package identifier (e.g., "@yourorg/auth-service", "serde") */
  name: string;
  /** Absolute path to the .harness/federation.manifest.yaml */
  manifestPath: string;
  /** Package version */
  version: string;
}
```

**Built-in resolver:** `NodeModulesResolver` — walks `node_modules/` breadth-first, skipping `.cache` dirs. Additional resolvers (Yarn PnP, Cargo, pip, Go modules) can be registered via `.harness/federation.yaml`:

```yaml
# .harness/federation.yaml
identity:
  org: 'yourorg'
  teams: ['platform', 'backend']
staleness_threshold_minutes: 30
resolvers:
  - node_modules # built-in, default
  # - yarn_pnp   # future
  # - cargo       # future
```

On `harness scan`, after graph construction:

1. Invoke each configured `PackageResolver` to collect `FederatedPackage[]`
2. For each package, read `.harness/federation.manifest.yaml`
3. Filter by visibility: compare manifest's `visibility` against project's own identity
4. Eligible knowledge is merged into the local federation cache

### Cache Layer

Location: `~/.harness/federation/cache/`

```
~/.harness/federation/cache/
  index.json              # manifest of all discovered packages + timestamps
  @yourorg/
    auth-service/
      learnings.yaml
      constraints.yaml
      patterns.yaml
      structural-summary.yaml
      _meta.json          # last_synced, source_version, staleness_check
```

**Staleness logic:**

- Default threshold: 30 minutes (configurable in `.harness/federation.yaml`)
- `harness scan` reads from cache. If cache age < threshold, skip re-discovery
- If cache age > threshold but background sync has not run, scan triggers discovery (non-blocking — uses stale cache for current scan, refreshes for next)

### Background Sync

**Harness hooks (default):**

- `post:scan`, `post:validate`, `post:plan` hooks trigger `harness federation sync --background`
- Sync is non-blocking — forks to background, does not delay the parent command
- Sync walks `node_modules`, refreshes cache for any changed manifests

**Optional cron:**

- `harness federation schedule` installs a platform-native scheduled task:
  - macOS: `launchd` plist
  - Linux: user crontab
- Default interval: 30 minutes (matches staleness threshold)
- Runs `harness federation sync` for all projects registered in `~/.harness/federation/projects.json`

### Publish Workflow

`harness federation publish` extracts shareable knowledge from the local project:

1. Read local graph from `.harness/graph/`
2. Extract learnings from `KnowledgeIngestor` output (ADRs, learnings.md)
3. Extract constraints from `.harness/constraints.yaml`
4. Extract patterns from graph's `pattern` nodes
5. Generate structural summary from graph adapters (`GraphComplexityAdapter`, `GraphCouplingAdapter`)
6. Apply visibility tags from project's `.harness/federation.yaml`
7. Write to `.harness/federation/` in the project root
8. Files are committed and published with the next package release

**Pre-publish validation:**

- Schema validation on all output files
- Visibility tag sanity check (no `private` entries in published output)
- Structural summary anonymization check (no absolute paths, no file contents)
- `package.json` `files` field check — warn if `.harness/` is not included (npm excludes dotfiles by default)

### Federation-Aware Query

Extends existing `FusionLayer` and `ContextQL`:

- `query_graph` gains an optional `include_federated: true` parameter
- When enabled, FusionLayer searches local graph + federated cache
- Federated results carry a `source` field (package name + version)
- Results ranked: local matches weighted higher than federated by default (configurable)
- `ask_graph` natural language queries automatically include federated context when relevant

### CLI Commands

| Command                       | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| `harness federation init`     | Set up project identity (org, teams) in `.harness/federation.yaml` |
| `harness federation publish`  | Extract and write shareable knowledge                              |
| `harness federation sync`     | Refresh local cache from `node_modules`                            |
| `harness federation status`   | Show cache freshness, discovered packages, knowledge counts        |
| `harness federation schedule` | Install platform-native background sync                            |

### Visibility & Privacy

**Visibility matching rules:**

| Manifest Visibility | Consumer Matches If                                                            |
| ------------------- | ------------------------------------------------------------------------------ |
| `org`               | Consumer's `identity.org` matches publisher's org (derived from package scope) |
| `team:<name>`       | Consumer's `identity.teams` array includes `<name>`                            |
| `private`           | Never published — `harness federation publish` rejects `private` entries       |

**Privacy guarantees:**

- No raw graph nodes or edges cross project boundaries
- Structural summaries use relative paths only (absolute paths stripped at publish time)
- No file contents are included in any knowledge type
- `example_files` in patterns are path references only, not file contents

## Assumptions

- **Runtime:** Node.js >= 18.x (LTS). TypeScript codebase following existing harness conventions.
- **Package manager:** Discovery uses a `PackageResolver` interface. Ships with a `NodeModulesResolver` for npm/pnpm. Alternative resolvers (Yarn PnP, pnpm strict, Cargo, pip, Go modules) can be added without changing the discovery architecture.
- **Dotfile publishing:** Packages must include `.harness/` in their `files` field in `package.json` or configure `.npmignore` to allow it. `harness federation publish` will emit a warning if `package.json` does not include `.harness/` in its `files` array.
- **Concurrency:** Background sync uses a lockfile (`~/.harness/federation/sync.lock`) to prevent concurrent sync processes. If a lock is held, the second sync exits silently.
- **Schema evolution:** Unknown `schema_version` values in federation manifests are skipped with a warning. Forward compatibility is opt-in — consumers only process versions they understand.
- **ID uniqueness:** Knowledge entry IDs are scoped by package name (`<package>:<type>:<id>`). Cross-package ID collisions are impossible by construction.

## Success Criteria

1. When `harness scan` runs on a project with harness-enabled dependencies, the system shall discover their federation manifests without any manual configuration.
2. When a package has `visibility: team:platform`, the system shall only make its knowledge available to projects whose identity includes `team:platform`.
3. When a harness hook fires (`post:scan`, `post:validate`, `post:plan`), the system shall trigger a non-blocking background cache refresh. If a subsequent scan runs within the staleness threshold (default 30 min), it shall use the cache without re-discovery.
4. When `harness federation publish` runs in Project A and Project B installs Project A, then Project B's scan shall discover all four knowledge types from Project A.
5. When a user queries `ask_graph` with `include_federated: true`, the system shall include learnings from federated dependencies in the results with source attribution.
6. When federated constraints are discovered, the system shall evaluate them during `harness verify` with clear attribution to the source package.
7. When `harness federation status` runs, the system shall display aggregated health grades and hotspot counts across all federated dependencies.
8. If the cache is stale and `node_modules` is unavailable, the system shall complete the scan using last cached data and emit a warning (not an error).
9. If `harness federation publish` encounters entries marked `private`, the system shall reject them. If structural summaries contain absolute paths, the system shall strip them.
10. If any publish output contains raw graph nodes, edges, or file contents, the system shall not write the output and shall report a validation error.
11. When the system encounters no central registry or coordination service, federation shall still function end-to-end using only package-embedded manifests and local cache.
12. When a public (non-org) npm package includes a `.harness/federation.manifest.yaml`, the system shall discover and ingest its knowledge without requiring org identity configuration.
13. If a dependency ships a malformed `federation.manifest.yaml`, the system shall skip that package with a warning and continue discovering other packages.
14. If a dependency uses a `schema_version` the consumer does not understand, the system shall skip that package with a warning.

## Implementation Order

### Phase 1: Manifest & Discovery (~2.5 weeks)

- Define federation manifest schema (`federation.manifest.yaml`)
- Define project identity schema (`.harness/federation.yaml`)
- Define `PackageResolver` interface and resolver registration
- Implement `NodeModulesResolver` (default built-in resolver)
- Build cache layer at `~/.harness/federation/cache/`
- `harness federation init` CLI command
- `harness federation status` CLI command

### Phase 2: Learnings Pipeline (~1.5 weeks)

- Define learnings schema
- Implement learnings extraction from local graph (`KnowledgeIngestor` output)
- `harness federation publish` for learnings only
- Cache ingestion — merge federated learnings into local query results
- Federation-aware `FusionLayer` with `include_federated` flag
- `ask_graph` integration for federated learnings

### Phase 3: Constraints & Patterns (~2 weeks)

- Define constraints and patterns schemas
- Implement extraction for both types
- Extend `harness federation publish` for constraints and patterns
- Federated constraint evaluation in `harness verify`
- Source attribution on federated constraints (which package imposed this rule)
- Pattern discovery in federated query results

### Phase 4: Structural Summaries (~1.5 weeks)

- Define structural summary schema
- Implement summary generation from graph adapters (`GraphComplexityAdapter`, `GraphCouplingAdapter`)
- Anonymization pass (strip absolute paths, validate no raw data)
- Extend `harness federation publish` and cache for summaries
- `harness federation status` shows aggregated health across dependencies

### Phase 5: Background Sync & Scheduling (~2 weeks)

- Implement post-command hook system (no hook infrastructure exists today — this is new)
  - Hook runner that executes registered callbacks after CLI commands complete
  - Hook registration API for `post:scan`, `post:validate`, `post:plan` events
  - Non-blocking execution model (fork to background, do not delay parent command)
- Implement `harness federation sync` command
- Wire sync to post-command hooks
- Staleness threshold logic in scan
- Sync lockfile to prevent concurrent sync processes
- `harness federation schedule` with platform-native cron/launchd
- Graceful degradation when cache is stale

### Phase 6: Visibility & Privacy (~1 week)

- Visibility tag filtering on discovery
- Pre-publish validation (no `private` entries, no absolute paths, no raw nodes)
- Project identity matching (`org`, `team:<name>`)
- Integration tests for visibility boundary enforcement
