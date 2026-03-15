# Learnings

- **2026-03-01 [skill:harness-tdd] [outcome:success]:** Map partition by tenantId gives O(1) tenant lookup. Flat array with filter would be O(n) per request.

- **2026-03-01 [skill:harness-execution] [outcome:gotcha]:** Express global type augmentation (declare global { namespace Express }) must be in a .ts file that gets included by tsconfig, not in a .d.ts file.

- **2026-03-02 [skill:harness-verification] [outcome:success]:** Tenant isolation holds — getUserById('tenant-2', user.id) returns undefined when user belongs to tenant-1.

- **2026-03-02 [skill:harness-planning] [outcome:success]:** Splitting middleware into its own layer (between types and services) keeps tenant extraction logic separate from business logic.

- **2026-03-15 [skill:harness-execution] [outcome:gotcha]:** Zod's .parse() throws ZodError, not a plain Error. Catch blocks should handle both for user-friendly messages.
