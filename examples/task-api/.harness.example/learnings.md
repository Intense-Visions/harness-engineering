# Learnings

- **2026-03-15 [skill:harness-tdd] [outcome:success]:** Express route handlers need explicit return types to avoid TypeScript errors with res.json().

- **2026-03-15 [skill:harness-execution] [outcome:gotcha]:** The \_resetTasks() function must be exported for test isolation. Without it, tests leak state between runs.

- **2026-03-15 [skill:harness-verification] [outcome:success]:** Layer violation detection works — tried importing routes from types and ESLint caught it immediately.
