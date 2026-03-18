## 2026-01-20 — Task 3: Auth refactor

- [skill:harness-execution] [outcome:gotcha] hashPassword in hash.ts uses SHA-256 which is not suitable for production password hashing
- [skill:harness-execution] [outcome:success] AuthService correctly delegates token generation
