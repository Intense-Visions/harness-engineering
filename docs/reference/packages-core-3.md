# Reference: packages / core / 3

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/core/src/roadmap/store/factory.ts

[`packages/core/src/roadmap/store/factory.ts`](/packages/core/src/roadmap/store/factory.ts)

**Exports:** `ResolveRoadmapStoreOptions`, `roadmapSourceExists`, `roadmapAggregatePath`, `resolveRoadmapStore`, `ResolveRoadmapStoreForFileOptions`, `resolveRoadmapStoreForFile`

## packages/core/src/roadmap/store/meta.ts

[`packages/core/src/roadmap/store/meta.ts`](/packages/core/src/roadmap/store/meta.ts)

**Exports:** `parseMeta`, `serializeMeta`

## packages/core/src/roadmap/store/migration.ts

[`packages/core/src/roadmap/store/migration.ts`](/packages/core/src/roadmap/store/migration.ts)

**Exports:** `roadmapToShards`, `assertSemanticRoundTrip`, `assertRegeneratedRoundTrip`

## packages/core/src/roadmap/store/monolith-store.ts

[`packages/core/src/roadmap/store/monolith-store.ts`](/packages/core/src/roadmap/store/monolith-store.ts)

**Exports:** `FileIO`, `slugifyFeatureName`, `MonolithStoreOptions`, `MonolithStore`

## packages/core/src/roadmap/store/node-io.ts

[`packages/core/src/roadmap/store/node-io.ts`](/packages/core/src/roadmap/store/node-io.ts)

Node-fs `ShardIO` for core roadmap writers (sync-engine, prediction-engine, the `resolveRoadmapStore` factory).

**Exports:** `createNodeRoadmapIO`

## packages/core/src/roadmap/store/regenerator.ts

[`packages/core/src/roadmap/store/regenerator.ts`](/packages/core/src/roadmap/store/regenerator.ts)

**Exports:** `regenerate`, `writeRegeneratedRoadmap`

## packages/core/src/roadmap/store/roadmap-store.ts

[`packages/core/src/roadmap/store/roadmap-store.ts`](/packages/core/src/roadmap/store/roadmap-store.ts)

A single per-row shard: frontmatter metadata + the parsed row body.

**Exports:** `Shard`, `RoadmapMeta`, `FeatureMutation`, `AddFeatureInput`, `RoadmapStore`

## packages/core/src/roadmap/store/shard-store.ts

[`packages/core/src/roadmap/store/shard-store.ts`](/packages/core/src/roadmap/store/shard-store.ts)

**Exports:** `ShardIO`, `readShardDir`, `ShardStore`

## packages/core/src/roadmap/store/shard.ts

[`packages/core/src/roadmap/store/shard.ts`](/packages/core/src/roadmap/store/shard.ts)

**Exports:** `parseShard`, `serializeShard`

## packages/core/src/roadmap/store/yaml-scalar.ts

[`packages/core/src/roadmap/store/yaml-scalar.ts`](/packages/core/src/roadmap/store/yaml-scalar.ts)

Emit a free-form string as a deterministic, safe YAML double-quoted scalar.

**Exports:** `quoteYamlScalar`

## packages/core/src/roadmap/tracker/adapters/github-http.ts

[`packages/core/src/roadmap/tracker/adapters/github-http.ts`](/packages/core/src/roadmap/tracker/adapters/github-http.ts)

Shared HTTP plumbing for the Phase 2 GitHub Issues tracker adapter.

**Exports:** `GitHubHttpOptions`, `GitHubHttp`

## packages/core/src/roadmap/tracker/body-metadata.ts

[`packages/core/src/roadmap/tracker/body-metadata.ts`](/packages/core/src/roadmap/tracker/body-metadata.ts)

**Exports:** `BodyMeta`, `ParsedBody`, `parseBodyBlock`, `serializeBodyBlock`

## packages/core/src/roadmap/tracker/client.ts

[`packages/core/src/roadmap/tracker/client.ts`](/packages/core/src/roadmap/tracker/client.ts)

Phase 2 wide tracker interface (file-less roadmap mode).

**Exports:** `TrackedFeature`, `NewFeatureInput`, `FeaturePatch`, `HistoryEventType`, `HistoryEvent`, `ConflictError`, `RoadmapTrackerClient`

## packages/core/src/roadmap/tracker/conflict-body.ts

[`packages/core/src/roadmap/tracker/conflict-body.ts`](/packages/core/src/roadmap/tracker/conflict-body.ts)

Shared TRACKER_CONFLICT HTTP 409 body shape.

**Exports:** `TrackerConflictBody`, `MakeTrackerConflictBodyOptions`, `makeTrackerConflictBody`

## packages/core/src/roadmap/tracker/conflict.ts

[`packages/core/src/roadmap/tracker/conflict.ts`](/packages/core/src/roadmap/tracker/conflict.ts)

**Exports:** `CompareResult`, `refetchAndCompare`, `BackoffOpts`, `withBackoff`

## packages/core/src/roadmap/tracker/etag-store.ts

[`packages/core/src/roadmap/tracker/etag-store.ts`](/packages/core/src/roadmap/tracker/etag-store.ts)

Per-process LRU ETag cache.

**Exports:** `ETagStore`

## packages/core/src/roadmap/tracker/factory.ts

[`packages/core/src/roadmap/tracker/factory.ts`](/packages/core/src/roadmap/tracker/factory.ts)

**Exports:** `GitHubTrackerClientConfig`, `LinearTrackerClientConfig`, `TrackerClientConfig`, `createTrackerClient`

## packages/core/src/security/osv-client.ts

[`packages/core/src/security/osv-client.ts`](/packages/core/src/security/osv-client.ts)

Hermes Phase 2 — Pre-launch OSV malware guard.

**Exports:** `OsvPackageRef`, `OsvAdvisory`, `OsvCheckResult`, `OsvClientOptions`, `OsvClient`, `createOsvClient`
