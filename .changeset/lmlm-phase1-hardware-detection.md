---
'@harness-engineering/local-models': minor
---

Adds Phase 1 of the Local Model Lifecycle Manager — hardware detection.

The new `HardwareDetector` returns a `HardwareProfile` on macOS (Apple Silicon), Linux/Windows with NVIDIA, and CPU-only hosts. The dispatcher honors an operator override ahead of autodetection, caches results for 24h by default to match the spec's refresh cadence, and falls through to a CPU profile with a structured warning when a platform-specific probe fails — it never throws (S3).

- `detectMacOS` parses `system_profiler SPDisplaysDataType -json` + `sysctl` and maps Apple Silicon chips (M1 through M4 Max) to their published unified-memory bandwidths.
- `detectNVIDIA` parses `nvidia-smi --query-gpu=name,memory.total` and maps NVIDIA GPUs (Ada, Ampere, Hopper) to their published memory bandwidths. Multi-GPU hosts pick the highest-VRAM card and warn.
- `detectCPU` derives a conservative bandwidth heuristic by regex-matching the CPU brand string against known DDR4/DDR5 desktop and DDR5/DDR4 server families.
- Shell-outs are dependency-injected via a `ShellRunner` interface so unit tests stay deterministic across CI hosts.

No orchestrator wiring yet — the detector is consumed by the ranker (Phase 2), scheduler (Phase 6), and HTTP/dashboard surfaces (Phases 7–8). LMLM remains opt-in and disabled by default per Phase 0.
