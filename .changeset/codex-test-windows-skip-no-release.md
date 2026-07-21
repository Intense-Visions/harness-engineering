---

---

Test-only: POSIX-guard the three `CodexBackend` tests that spawn a `#!/bin/sh` `fakeCodex` stand-in (`it.skipIf(win32)`). Node's shell-less `child_process.spawn` can launch only a real `.exe` on Windows — not a shebang script or a `.cmd` (EINVAL) — so these fixture-spawn tests are POSIX-only, matching the repo's existing bash-hook e2e `skipIf(win32)` convention. Greens `build-and-test (windows-latest)`. No runtime change.
