---
'@harness-engineering/core': patch
---

fix(core): stop the decision-log append lock from failing on Windows when the lock file is busy. While a lock file is still being deleted, Windows reports EPERM, EBUSY or EACCES instead of EEXIST, and the lock treated those codes as a failed append (`AUTO_DECISION_WRITE_FAILED`). On win32 it now retries them with bounded backoff on both create and release. A lock still held past the total wait (now 30 s, up from 8 s) still fails closed. POSIX behaviour is unchanged. (#2596)
