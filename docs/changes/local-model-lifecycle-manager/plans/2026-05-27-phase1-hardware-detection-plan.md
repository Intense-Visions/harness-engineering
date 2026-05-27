# Plan: LMLM Phase 1 — Hardware Detection

**Date:** 2026-05-27 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 1, lines 403–412) | **Tasks:** 8 | **Time:** ~2–3 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase1`

## Goal

Implement `HardwareDetector.detect()` so it returns a valid `HardwareProfile` on the three v1 platforms — macOS (Apple Silicon), Linux/Windows with NVIDIA, and CPU-only — with the operator override path honored ahead of autodetection. Detection failures must never throw: they fall through to a CPU profile and surface as a structured warning (S3). All shell-outs are dependency-injected so the unit tests are fully deterministic and CI-portable.

Phase 1 lands the detector and its fixture-driven tests inside `@harness-engineering/local-models`. It does **not** yet wire the detector to the orchestrator, dashboard, CLI, or config loader — those happen in Phase 4 / Phase 7 once the ranker and pool exist for the detector to feed.

## Phase 1 Scope (from spec, lines 403–412)

In:

- `src/hardware/types.ts` — `HardwareProfile`, `HardwareDetectionWarning`, `HardwareDetectionResult` shapes
- `src/hardware/shell.ts` — `ShellRunner` interface + default Node `child_process.execFile` implementation (DI seam for tests)
- `src/hardware/macos.ts` — `detectMacOS()` using `system_profiler SPDisplaysDataType -json` + `sysctl -n hw.memsize|machdep.cpu.brand_string|hw.model`; Apple Silicon bandwidth derived from a chip → GB/s lookup table seeded from publicly documented memory bandwidths
- `src/hardware/nvidia.ts` — `detectNVIDIA()` using `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`; per-GPU bandwidth derived from a name → GB/s lookup with a conservative fallback
- `src/hardware/cpu.ts` — `detectCPU()` using `os.cpus()` / `os.totalmem()`; bandwidth heuristic per detected CPU family (DDR4 vs DDR5, server vs desktop) with a conservative default
- `src/hardware/detector.ts` — `HardwareDetector` class: override path → platform dispatch (`darwin` → macOS, `linux`/`win32` → NVIDIA → CPU, else → CPU) → cache for `cacheTtlMs` (default 24h) → never throws (S3)
- `src/hardware/index.ts` — barrel re-export
- Update `src/index.ts` to surface `HardwareDetector`, `detectHardware`, and the public types
- Fixture-based tests per detector (`tests/hardware/{macos,nvidia,cpu,detector}.test.ts`) that mock the shell runner and `os` module

Out of Phase 1 (deferred):

- HTTP route `GET /api/v1/local-models/hardware` (Phase 7)
- `harness models status` CLI (Phase 7)
- Dashboard hardware card (Phase 8)
- AMD/ROCm support (deferred to v2 per D7)
- Live HF API, ranker, pool, installer, scheduler, proposal engine (Phases 2–6)
- Wiring the detector into the orchestrator at process start (Phase 6 — when the scheduler boots)

## Observable Truths (Acceptance Criteria — Phase 1 only)

1. **OT1**: `HardwareDetector.detect()` with a manual override returns the override verbatim and never invokes any shell command. Verified by spying on the injected `ShellRunner`.
2. **OT2**: On macOS (`process.platform === 'darwin'`), the detector parses `system_profiler -json` and `sysctl` outputs and returns a `HardwareProfile` whose `platform === 'macos'`, `vramGb` equals the unified memory size, `ramGb` equals total memory, `gpuName` is populated from `SPDisplaysDataType`, and `bandwidthGbps` matches the chip → bandwidth table (F1).
3. **OT3**: On Linux/Windows with `nvidia-smi` present and parseable, the detector returns a `HardwareProfile` whose `platform === 'nvidia'`, `vramGb` equals `memory.total / 1024`, `gpuName` is taken from the query, and `bandwidthGbps` matches the GPU → bandwidth table (F2).
4. **OT4**: When the macOS or NVIDIA detector throws or returns malformed output, the detector falls through to the CPU profile, returns `platform === 'cpu'`, and surfaces a structured warning in the returned `HardwareDetectionResult.warnings` (S3). It does **not** throw.
5. **OT5**: When no `nvidia-smi` is on PATH (the `ShellRunner.run` rejects with `ENOENT` or similar), the Linux/Windows detector falls through to CPU and adds a warning. No exception escapes `detect()`.
6. **OT6**: The CPU detector populates `cpuName` from `os.cpus()[0].model`, `ramGb` from `os.totalmem()`, `vramGb === 0`, and a conservative `bandwidthGbps` derived from a CPU-family lookup with a documented fallback constant.
7. **OT7**: Repeated calls to `detect()` within the cache TTL return the cached result (verified by counting shell invocations across two calls in a fixture test).
8. **OT8**: `detectedAt` on every `HardwareProfile` is an ISO string and parses round-trip via `new Date(profile.detectedAt).toISOString()`.
9. **OT9**: `pnpm --filter @harness-engineering/local-models build && test && typecheck` are all green.
10. **OT10**: Existing smoke test continues to pass; new tests run alongside it without flakes.

## Skill Recommendations

From `docs/changes/local-model-lifecycle-manager/SKILLS.md`:

- `gof-factory-method` (reference) — `HardwareDetector` dispatches to a platform-specific factory; the pattern keeps each detector independently testable.

## File Map

- CREATE `packages/local-models/src/hardware/types.ts`
- CREATE `packages/local-models/src/hardware/shell.ts`
- CREATE `packages/local-models/src/hardware/macos.ts`
- CREATE `packages/local-models/src/hardware/nvidia.ts`
- CREATE `packages/local-models/src/hardware/cpu.ts`
- CREATE `packages/local-models/src/hardware/detector.ts`
- CREATE `packages/local-models/src/hardware/index.ts`
- MODIFY `packages/local-models/src/index.ts` — re-export from `./hardware/index.js`
- CREATE `packages/local-models/tests/hardware/macos.test.ts`
- CREATE `packages/local-models/tests/hardware/nvidia.test.ts`
- CREATE `packages/local-models/tests/hardware/cpu.test.ts`
- CREATE `packages/local-models/tests/hardware/detector.test.ts`
- CREATE `packages/local-models/tests/fixtures/system_profiler.m3-max-36gb.json`
- CREATE `packages/local-models/tests/fixtures/nvidia-smi.rtx-4090.txt`
- CREATE `.changeset/lmlm-phase1-hardware-detection.md`

## Skeleton

1. Shared types + ShellRunner DI seam (~2 tasks)
2. Platform detectors with fixture-driven tests (~3 tasks)
3. Dispatcher + cache + fallback (~1 task)
4. Public surface + changeset + verification (~2 tasks)

**Estimated total:** 8 tasks, ~2–3 hours.

## Uncertainties

- **[ASSUMPTION]** Apple Silicon memory bandwidths come from Apple's published memory-subsystem specs; the table covers M1/M2/M3/M4 desktop and laptop variants. New chips that miss the table fall back to a conservative `100 GB/s` (M-series base bandwidth) so the detector degrades gracefully rather than crashes.
- **[ASSUMPTION]** NVIDIA bandwidths come from `nvidia.com` consumer/professional datasheet pages and are committed in `packages/local-models/src/hardware/nvidia.ts` as a static map. Unmapped GPUs fall back to a conservative `300 GB/s` and surface a warning so the operator knows the heuristic is rough.
- **[ASSUMPTION]** `system_profiler SPDisplaysDataType -json` is available on every supported macOS version (≥ Big Sur). If the `-json` flag is unrecognized, the parser falls through to CPU and emits a warning instead of throwing.
- **[ASSUMPTION]** `process.platform` is the canonical platform discriminator. WSL is treated as `linux` (it surfaces as `linux` to Node), which matches operator expectation.
- **[DEFERRABLE]** Memory bandwidth refresh tooling (a script that scrapes datasheets into JSON) is not in Phase 1; the static tables are committed as code for now.
- **[DEFERRABLE]** The detector cache lives in-process only. A persisted `~/.harness/local-models/hardware.json` cache is deferred until the scheduler exists (Phase 6) to own its lifecycle.

## Tasks

### Task 1: Hardware types + ShellRunner DI seam

**Depends on:** none | **Files:** `src/hardware/types.ts`, `src/hardware/shell.ts`

1. `types.ts` exports `HardwareProfile` matching the spec (lines 115–123) plus `HardwareDetectionWarning` (`{ code: string; message: string; cause?: string }`) and `HardwareDetectionResult` (`{ profile: HardwareProfile; warnings: HardwareDetectionWarning[]; source: 'override' | 'cache' | 'macos' | 'nvidia' | 'cpu' }`).
2. `shell.ts` defines `ShellRunner` (`{ run(cmd: string, args: readonly string[]): Promise<ShellResult> }`) and `ShellResult` (`{ stdout: string; stderr: string; code: number }`). Default implementation uses `node:util.promisify(child_process.execFile)` with a 5-second timeout and `{ windowsHide: true }`. Errors with `ENOENT`, non-zero exit, or timeout are surfaced as a rejected promise so the caller can decide whether to swallow or propagate.

### Task 2: macOS detector + fixture

**Depends on:** Task 1 | **Files:** `src/hardware/macos.ts`, `tests/fixtures/system_profiler.m3-max-36gb.json`, `tests/hardware/macos.test.ts`

1. `detectMacOS(shell: ShellRunner)` runs `system_profiler SPDisplaysDataType -json` to get the GPU display name, and `sysctl -n hw.memsize hw.model machdep.cpu.brand_string` to get unified memory + chip identifier. Parses `hw.model` (e.g., `"Mac15,9"`) plus the SPDisplaysDataType chip string (e.g., `"Apple M3 Max"`) into a chip key, looks up bandwidth in a `APPLE_SILICON_BANDWIDTH_GBPS` table, and returns a `HardwareProfile`.
2. Bandwidth table seeded with: `M1`, `M1 Pro`, `M1 Max`, `M1 Ultra`, `M2`, `M2 Pro`, `M2 Max`, `M2 Ultra`, `M3`, `M3 Pro`, `M3 Max`, `M3 Ultra`, `M4`, `M4 Pro`, `M4 Max`. Unknown chip → conservative `100 GB/s` + warning.
3. Fixture `system_profiler.m3-max-36gb.json` is a trimmed real-world output (just the fields the parser consumes); test injects the fixture via a mock `ShellRunner` and asserts the full profile.
4. Error-path tests: malformed JSON → throws (consumed by the dispatcher's fallback in Task 6); non-Apple-Silicon Mac (Intel) returns a CPU-shaped profile with a warning.

### Task 3: NVIDIA detector + fixture

**Depends on:** Task 1 | **Files:** `src/hardware/nvidia.ts`, `tests/fixtures/nvidia-smi.rtx-4090.txt`, `tests/hardware/nvidia.test.ts`

1. `detectNVIDIA(shell: ShellRunner)` runs `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`. Parses each CSV row; takes the first row (multi-GPU host quirk is handled in v2 — for now we pick the GPU with the most VRAM and warn that other GPUs exist).
2. `NVIDIA_BANDWIDTH_GBPS` table seeded with: `RTX 4090` (1008), `RTX 4080` (716), `RTX 4070 Ti SUPER` (672), `RTX 4070 Ti` (504), `RTX 4070` (504), `RTX 3090 Ti` (1008), `RTX 3090` (936), `RTX 3080 Ti` (912), `RTX 3080` (760), `RTX 3070 Ti` (608), `RTX 3070` (448), `RTX 3060 Ti` (448), `RTX 3060` (360), `A100 80GB` (2039), `A100 40GB` (1555), `H100` (3350), `L40` (864). Unknown GPU → conservative `300 GB/s` fallback + warning carrying the GPU name so the operator knows which entry to add.
3. Fixture `nvidia-smi.rtx-4090.txt` is the expected stdout (a single CSV line: `NVIDIA GeForce RTX 4090, 24564`); test asserts a profile with `vramGb ≈ 23.99` (we round to 1 decimal), `bandwidthGbps === 1008`, `gpuName === 'NVIDIA GeForce RTX 4090'`.
4. Error-path tests: `ENOENT` (no `nvidia-smi`) → throws; non-numeric output → throws (dispatcher catches both).

### Task 4: CPU detector

**Depends on:** Task 1 | **Files:** `src/hardware/cpu.ts`, `tests/hardware/cpu.test.ts`

1. `detectCPU(osModule: typeof import('node:os') = os)` reads `osModule.cpus()[0].model`, `osModule.totalmem()`, and `osModule.platform()`. Returns `platform: 'cpu'`, `vramGb: 0`, `cpuName: model`, `ramGb: bytes → GB`.
2. CPU bandwidth heuristic: regex match the model string against known families (DDR5 desktop: Intel 14/13/12 gen, Ryzen 7000+; DDR4 desktop: prior gens; server: Xeon-SP / EPYC). Provide a documented constant for each tier with a final fallback of `40 GB/s` (a conservative dual-channel DDR4 figure).
3. Tests use mocked `cpus()` / `totalmem()` to drive each branch — DDR5 desktop, DDR4 desktop, server-class, unknown family fallback.

### Task 5: Dispatcher + cache + fallback

**Depends on:** Tasks 2–4 | **Files:** `src/hardware/detector.ts`, `tests/hardware/detector.test.ts`

1. `HardwareDetector` constructor accepts `{ override?: LocalModelsHardwareOverride; shell?: ShellRunner; osModule?: typeof os; platform?: NodeJS.Platform; now?: () => Date; cacheTtlMs?: number }`. Defaults: `cacheTtlMs = 86_400_000` (24h, matching the spec's daily refresh cadence).
2. `detect()`:
   - If `override` is set → return `{ source: 'override', profile: { ...override, ramGb: override.ramGb ?? override.vramGb, cpuName: override.cpuName ?? 'override', gpuName: override.gpuName, detectedAt: now().toISOString() }, warnings: [] }`. Never shells out.
   - If a cached result is fresh → return it with `source: 'cache'`.
   - Otherwise dispatch on `platform`:
     - `'darwin'` → try `detectMacOS`; on error, fall to CPU with a warning whose `cause` carries `error.message`.
     - `'linux' | 'win32'` → try `detectNVIDIA`; on error, fall to CPU with a warning.
     - else → CPU directly.
   - CPU path never throws.
3. Tests cover: override short-circuit (OT1), darwin success (OT2), darwin failure → CPU with warning (OT4), linux nvidia success (OT3), linux ENOENT → CPU with warning (OT5), cache hit (OT7), `detectedAt` ISO round-trip (OT8).

### Task 6: Hardware barrel + package surface

**Depends on:** Tasks 1–5 | **Files:** `src/hardware/index.ts`, `src/index.ts`

1. `src/hardware/index.ts` re-exports `HardwareDetector`, the three detector functions, the types, and the default `ShellRunner`.
2. `src/index.ts` re-exports the public surface (`HardwareDetector` and types) and bumps the comment to mention Phase 1 is live while Phases 2–9 remain pending.

### Task 7: Changeset entry

**Depends on:** Tasks 1–6 | **Files:** `.changeset/lmlm-phase1-hardware-detection.md`

1. `minor` bump on `@harness-engineering/local-models` (new public surface). No other packages change.
2. Body: "Adds Phase 1 of the Local Model Lifecycle Manager — hardware detection. The new `HardwareDetector` returns a `HardwareProfile` on macOS (Apple Silicon), Linux/Windows with NVIDIA, and CPU-only hosts. Detection failures fall through to a CPU profile with a structured warning rather than throwing. Shell-outs are injectable so unit tests stay deterministic. No orchestrator wiring yet — that lands in Phase 6."

### Task 8: Verification gate — build, typecheck, test, validate

**Depends on:** Tasks 1–7 | **Files:** none

1. `pnpm install` at repo root if `node_modules/.modules.yaml` is older than `pnpm-lock.yaml`.
2. `pnpm --filter @harness-engineering/local-models build` — green (OT9).
3. `pnpm --filter @harness-engineering/local-models typecheck` — green (OT9).
4. `pnpm --filter @harness-engineering/local-models test` — green (OT9 + OT10).
5. `pnpm exec harness validate` from repo root — green (legacy config still parses).
6. If any step fails: stop, diagnose, fix, re-run.

## Integration Notes

Phase 1's integration footprint stays minimal — no new entry points, no new HTTP routes, no new CLI commands, no new dashboard panels. The detector is a leaf module the next phases will consume:

- **Phase 2 (Ranker)** consumes `HardwareProfile` from `HardwareDetector.detect()` to compute VRAM fit and speed estimates.
- **Phase 6 (Scheduler)** calls `HardwareDetector.detect()` once per tick (cache TTL aligned with the 24h refresh cadence) and includes the profile in the structured tick log.
- **Phase 7 (HTTP/WS)** wraps `detect()` in `GET /api/v1/local-models/hardware`.
- **Phase 8 (Dashboard)** renders the profile in the Hardware card.

**Knowledge graph**: no new concepts entered in Phase 1; the spec's listed concepts (Local Model Pool, Model Proposal, etc.) land alongside their implementations in Phases 3, 5, 6.

**ADRs**: none in Phase 1. The seven ADRs catalogued in the spec land with the code that justifies them (Phases 3, 5, 6 primarily).

**Docs**: none in Phase 1 beyond the changeset entry. The `local-model-lifecycle.md` knowledge entry and operator guide land in Phase 9.
