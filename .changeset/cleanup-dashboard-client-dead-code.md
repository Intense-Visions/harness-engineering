---
'@harness-engineering/dashboard': patch
---

chore(cleanup): remove dead dashboard/client code. Un-export the intra-file-only `PHASE_COLORS` constant, delete the unused `CONFLICT_PULSE_OUTLINE_COLOR` constant, and delete seven unused client files: the `useKeyboardShortcut` hook and the unreferenced React components `NeuralDecryptionLoader`, `ThreadMote`, `ScrambleText`, `HoloTooltip`, `CorePulse`, and `Biolume`. Pure dead-code removal; no behavior change.
