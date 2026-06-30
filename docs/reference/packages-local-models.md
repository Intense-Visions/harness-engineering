# Reference: packages / local / models

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/local-models/src/hardware/cpu.ts

[`packages/local-models/src/hardware/cpu.ts`](/packages/local-models/src/hardware/cpu.ts)

CPU-only fallback detector.

**Exports:** `OsModule`, `DetectCPUResult`, `detectCPU`

## packages/local-models/src/hardware/detector.ts

[`packages/local-models/src/hardware/detector.ts`](/packages/local-models/src/hardware/detector.ts)

`HardwareDetector` — the platform-aware dispatcher.

**Exports:** `HardwareDetectorOptions`, `HardwareDetector`, `detectHardware`

## packages/local-models/src/hardware/macos.ts

[`packages/local-models/src/hardware/macos.ts`](/packages/local-models/src/hardware/macos.ts)

Apple Silicon detection.

**Exports:** `DetectMacOSResult`, `detectMacOS`

## packages/local-models/src/hardware/nvidia.ts

[`packages/local-models/src/hardware/nvidia.ts`](/packages/local-models/src/hardware/nvidia.ts)

NVIDIA GPU detection.

**Exports:** `OsModule`, `DetectNVIDIAResult`, `detectNVIDIA`

## packages/local-models/src/hardware/shell.ts

[`packages/local-models/src/hardware/shell.ts`](/packages/local-models/src/hardware/shell.ts)

`ShellRunner` — the dependency-injection seam for hardware-detection probes.

**Exports:** `ShellResult`, `ShellRunner`, `defaultShellRunner`

## packages/local-models/src/huggingface/client.ts

[`packages/local-models/src/huggingface/client.ts`](/packages/local-models/src/huggingface/client.ts)

`HuggingFaceClient` — typed wrapper over the public HF REST endpoints LMLM needs (`/api/models`, `/api/models/:repo`).

**Exports:** `HuggingFaceClientError`, `HuggingFaceClient`

## packages/local-models/src/installer/advisory.ts

[`packages/local-models/src/installer/advisory.ts`](/packages/local-models/src/installer/advisory.ts)

`AdvisoryInstallAdapter` — install adapter for backends whose lifecycle is operator-driven (D4).

**Exports:** `AdvisoryBackend`, `AdvisoryInstallAdapterOptions`, `AdvisoryRenderRequest`, `AdvisoryInstallAdapter`

## packages/local-models/src/installer/ollama.ts

[`packages/local-models/src/installer/ollama.ts`](/packages/local-models/src/installer/ollama.ts)

`OllamaInstallAdapter` — first-class install backend speaking Ollama's REST API.

**Exports:** `OllamaInstallAdapterOptions`, `OllamaInstallAdapter`

## packages/local-models/src/pool/eviction.ts

[`packages/local-models/src/pool/eviction.ts`](/packages/local-models/src/pool/eviction.ts)

`planEviction` — lowest-score-LRU eviction planner.

**Exports:** `EvictionRequest`, `planEviction`, `sortByEvictionOrder`

## packages/local-models/src/ranker/algorithm.ts

[`packages/local-models/src/ranker/algorithm.ts`](/packages/local-models/src/ranker/algorithm.ts)

`RankedModel` orchestrator.

**Exports:** `SPEED_CONFIDENCE_MULTIPLIER`, `BENCHMARK_CONFIDENCE_MULTIPLIER`, `rankModels`, `weakestEvidence`, `scaleScore`

## packages/local-models/src/ranker/benchmarks/sources.ts

[`packages/local-models/src/ranker/benchmarks/sources.ts`](/packages/local-models/src/ranker/benchmarks/sources.ts)

Benchmark source adapters.

**Exports:** `SourceWarningCode`, `SourceWarning`, `BenchmarkSourceResult`, `Fetcher`, `FetcherResponse`, `BenchmarkSourceFetchOptions`, `BenchmarkSource`, `OPEN_LLM_LEADERBOARD_URL`

## packages/local-models/src/ranker/evidence.ts

[`packages/local-models/src/ranker/evidence.ts`](/packages/local-models/src/ranker/evidence.ts)

Evidence grader for benchmark observations.

**Exports:** `EVIDENCE_CONFIDENCE`, `EvidenceGrade`, `EvidenceInput`, `gradeEvidence`

## packages/local-models/src/ranker/quants.ts

[`packages/local-models/src/ranker/quants.ts`](/packages/local-models/src/ranker/quants.ts)

Canonical quantization table shared by the VRAM and speed estimators.

**Exports:** `QUANT_BITS_PER_WEIGHT`, `UNKNOWN_QUANT_BITS_PER_WEIGHT`, `NormalizedQuant`, `normalizeQuantId`

## packages/local-models/src/ranker/recency.ts

[`packages/local-models/src/ranker/recency.ts`](/packages/local-models/src/ranker/recency.ts)

Lineage-aware recency demotion.

**Exports:** `HALFLIFE_MONTHS`, `MIN_RECENCY_WEIGHT`, `LINEAGE_STEP_PENALTY`, `RecencyInput`, `RecencyDecay`, `applyRecencyDecay`

## packages/local-models/src/ranker/speed.ts

[`packages/local-models/src/ranker/speed.ts`](/packages/local-models/src/ranker/speed.ts)

Bandwidth-bound token-throughput estimator.

**Exports:** `SpeedBackend`, `BACKEND_EFFICIENCY`, `CPU_BANDWIDTH_FLOOR_GBPS`, `SpeedEstimateInput`, `SpeedEstimate`, `estimateSpeed`

## packages/local-models/src/ranker/vram.ts

[`packages/local-models/src/ranker/vram.ts`](/packages/local-models/src/ranker/vram.ts)

VRAM footprint estimator.

**Exports:** `KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS_FP16`, `ACTIVATIONS_GB`, `FRAMEWORK_OVERHEAD_GB`, `DEFAULT_CONTEXT_TOKENS`, `KV_QUANT_MULTIPLIER`, `KvCacheQuant`, `VramEstimateInput`, `VramEstimate`
