---
'@harness-engineering/core': patch
---

Speed up entropy/cleanup API-signature drift detection (~2.7x faster `harness cleanup`). Fuzzy export matching now builds the lowercased export index once per drift check instead of per unresolved reference, skips the edit-distance DP when a candidate's length differs by more than the max distance, and uses a bounded (diagonal-band) Levenshtein with an exact early exit. Detection output is unchanged.
