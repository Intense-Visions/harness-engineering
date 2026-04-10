# Race Conditions

> When security depends on the order of operations but the system does not enforce that
> order, attackers exploit the gap between check and use -- turning microsecond timing windows
> into privilege escalation, double-spend, and data corruption

## When to Use

- Designing financial transactions, balance checks, or any operation where concurrent
  requests could produce incorrect results
- Reviewing code that checks a condition and then acts on it without holding a lock
- Building file operations that create, read, or write files based on prior checks
- Implementing coupon redemption, vote counting, inventory management, or any system where
  duplicate processing has business impact
- Choosing database isolation levels and locking strategies for concurrent access
- Reviewing authentication or authorization flows for time-of-check-to-time-of-use gaps

## Threat Context

Race conditions are among the most underestimated vulnerability classes because they are
non-deterministic -- they may not appear in testing but are reliably exploitable by an
attacker who controls timing:

- **Ethereum DAO hack (2016)**: A reentrancy race condition in the DAO smart contract
  allowed the attacker to recursively withdraw funds before the balance was updated.
  The attacker drained 3.6 million ETH (approximately $50 million at the time). The
  vulnerability existed because the contract sent ETH to the caller before updating the
  caller's balance -- the caller's receive function re-entered the withdraw function and
  repeated the withdrawal against the stale balance.
- **Dirty COW (CVE-2016-5195)**: A race condition in the Linux kernel's memory management
  subsystem allowed an unprivileged local user to gain write access to read-only memory
  mappings. The race existed in the copy-on-write (COW) mechanism -- by racing two threads
  (one faulting on the mapping, one calling `madvise(MADV_DONTNEED)`), the attacker could
  write to files they had only read permission for, including `/etc/passwd`. This privilege
  escalation vulnerability existed in the Linux kernel for 9 years before discovery.
- **Web application double-spend**: An e-commerce platform allowed customers to apply a
  discount code. Two concurrent requests, each checking that the code had not been used and
  then marking it as used, both read the code as unused and both applied the discount. At
  scale, automated tools send hundreds of concurrent requests to exploit such windows.
- **Symlink race in temporary files**: A privileged program checks that a temporary file
  does not exist, then creates it. Between the check and the creation, the attacker creates
  a symlink at that path pointing to `/etc/shadow`. The privileged program writes to the
  symlink, overwriting the password file. This classic TOCTOU pattern has affected `sudo`,
  `sendmail`, and numerous other privileged Unix programs.

## Instructions

1. **Recognize the TOCTOU pattern.** Time-of-check-to-time-of-use vulnerabilities follow a
   universal structure: the program checks a condition (file exists, balance is sufficient,
   user is authorized, code is unused), then performs an action based on that condition (write
   the file, deduct the balance, grant access, apply the discount). If the condition can
   change between the check and the action, the action operates on a stale assumption. The
   fix is always the same principle: make the check and the action atomic -- either they
   happen as one indivisible operation, or a lock ensures nothing changes between them.

2. **Use database-level atomicity for business logic.** The database is the only reliable
   point of serialization in a multi-instance web application:
   - **SELECT FOR UPDATE**: Acquires a row-level lock that prevents other transactions from
     reading or modifying the row until the lock is released. Use for balance checks followed
     by balance updates: `SELECT balance FROM accounts WHERE id = ? FOR UPDATE`, verify
     balance is sufficient, then `UPDATE accounts SET balance = balance - ? WHERE id = ?`.
   - **Serializable isolation**: The strictest isolation level. Transactions execute as if
     they ran sequentially. Use for financial operations where phantom reads or write skew
     would cause incorrect results. Be aware of the performance cost -- serializable isolation
     increases lock contention and aborted transactions.
   - **Unique constraints**: For operations that must happen exactly once (coupon redemption,
     account creation with a unique email), enforce uniqueness at the database level with a
     UNIQUE constraint or UNIQUE INDEX. The database rejects the duplicate insert atomically.
     Do not rely on application-level checks (`SELECT` to see if exists, then `INSERT`).
   - **Advisory locks**: Database-specific named locks (`pg_advisory_lock` in PostgreSQL,
     `GET_LOCK` in MySQL) for coordinating operations that span multiple tables or require
     application-level logic between the check and the action.
   - **Atomic updates**: Use `UPDATE accounts SET balance = balance - 100 WHERE id = ? AND
balance >= 100` -- this combines the check and the update in a single atomic statement.
     If the balance is insufficient, zero rows are updated. No race window exists.

3. **Implement idempotency keys for external-facing operations.** Idempotency ensures that
   processing the same request multiple times produces the same result as processing it once:
   - The client generates a unique idempotency key (UUID) and includes it in the request.
   - The server stores the key and the result of the first processing.
   - Subsequent requests with the same key return the stored result without re-executing the
     operation.
   - Store idempotency keys with a UNIQUE constraint. The database prevents duplicate
     processing atomically.
   - Idempotency keys protect against network retries, client bugs, and deliberate duplicate
     submissions.

4. **Use optimistic locking for low-contention updates.** Add a version column to the row.
   Every update includes `WHERE version = ?` with the version the client read. If another
   transaction modified the row (incrementing the version), the update affects zero rows and
   the application knows to retry with the new version:
   - Read: `SELECT id, balance, version FROM accounts WHERE id = ?`
   - Update: `UPDATE accounts SET balance = ?, version = version + 1 WHERE id = ? AND
version = ?`
   - If zero rows affected: re-read and retry (with a retry limit to prevent infinite loops)
   - Optimistic locking avoids holding database locks during user think-time and is preferred
     for web applications where contention is typically low.

5. **Eliminate file system race conditions.** File operations are particularly vulnerable
   because the file system namespace is shared:
   - **Atomic file creation**: Use `O_CREAT | O_EXCL` flags with `open()`. This creates the
     file only if it does not already exist, atomically. If the file exists (including as a
     symlink), the call fails. Do not use `access()` or `stat()` followed by `open()`.
   - **Operate on file descriptors, not paths**: After opening a file, use `fstat()`,
     `fchmod()`, `fchown()` instead of `stat()`, `chmod()`, `chown()`. File descriptor
     operations act on the actual file, not the path -- an attacker cannot redirect them via
     symlink replacement.
   - **Use `mkstemp()` or `tmpfile()`**: These create temporary files with unique names
     atomically. Do not use `tmpnam()` or `tempnam()` followed by `open()` -- the name can
     be predicted and replaced between generation and use.
   - **Use `renameat2()` with `RENAME_NOREPLACE`** (Linux) for atomic file placement.
     Write content to a temporary file, then atomically rename it to the target path. The
     rename is atomic -- readers see either the old file or the new file, never a partial
     write.

6. **Design for concurrent execution from the start.** Assume every operation will be
   executed concurrently by multiple instances:
   - Never assume single-instance deployment. Even if there is one instance today, horizontal
     scaling or failover will introduce concurrency.
   - Use atomic compare-and-swap (CAS) operations for in-memory state in multi-threaded
     applications. CAS is the primitive that makes lock-free data structures possible.
   - Identify all "check-then-act" sequences in the codebase and evaluate whether the check
     and act are atomic. If they are not, add appropriate locking or use atomic operations.

## Details

- **How attackers exploit web application race conditions at scale**: Tools like Turbo
  Intruder (Burp Suite extension) and custom scripts send dozens to hundreds of concurrent
  HTTP requests, all arriving at the server within a few milliseconds. The attacker does not
  need precise timing -- they flood the server with concurrent requests and statistical
  probability ensures that some requests hit the race window. A discount code that can be
  used once is used 50 times. A bank transfer of $100 from a $150 account is executed 10
  times. A free trial activation creates 100 accounts. The defense must be correct under
  maximum concurrency, not just typical load.

- **Database isolation levels and their race condition implications**: READ UNCOMMITTED allows
  dirty reads (seeing uncommitted changes from other transactions). READ COMMITTED (the
  default in PostgreSQL and Oracle) prevents dirty reads but allows non-repeatable reads (a
  row read twice in the same transaction returns different values) and phantom reads (a range
  query returns different rows). REPEATABLE READ (the default in MySQL/InnoDB) prevents dirty
  and non-repeatable reads but allows phantom reads in the SQL standard (though InnoDB's
  implementation also prevents phantoms). SERIALIZABLE prevents all anomalies but increases
  contention. For financial transactions, READ COMMITTED with explicit `SELECT FOR UPDATE`
  locking is the most common practical approach -- it provides the necessary atomicity
  without the global performance cost of serializable isolation.

- **The double-spend pattern in detail**: User has $150. Two concurrent transfers of $100
  each arrive. Thread A: `SELECT balance FROM accounts WHERE id = 1` returns $150. Thread B:
  `SELECT balance FROM accounts WHERE id = 1` returns $150 (Thread A has not yet updated).
  Thread A: balance >= 100, so `UPDATE accounts SET balance = 50 WHERE id = 1`. Thread B:
  balance >= 100 (it read $150), so `UPDATE accounts SET balance = 50 WHERE id = 1`. Both
  succeed. The user transferred $200 from a $150 balance. With `SELECT FOR UPDATE`, Thread B
  blocks until Thread A commits, then re-reads balance as $50 and correctly rejects the
  transfer.

## Anti-Patterns

1. **Check-then-act without holding a lock.** Reading a value, making a decision based on
   that value, and then writing -- without ensuring the value has not changed. This is the
   fundamental race condition pattern. The gap between the check and the act is the
   vulnerability window. Use atomic operations, database locks, or optimistic locking to
   close the window.

2. **Using READ COMMITTED isolation for financial transactions without explicit locking.**
   READ COMMITTED does not prevent two transactions from reading the same balance and both
   deducting from it. Without `SELECT FOR UPDATE` or an atomic `UPDATE ... WHERE balance >=
?`, the double-spend pattern is exploitable. READ COMMITTED is safe for reads that do not
   influence writes, but financial transactions require explicit serialization.

3. **Relying on application-level uniqueness checks without database constraints.** Checking
   `SELECT COUNT(*) FROM users WHERE email = ?` and then `INSERT INTO users (email, ...)
VALUES (?, ...)` if the count is zero. Two concurrent registrations with the same email
   both read count = 0 and both insert. Add a UNIQUE constraint on the email column and
   handle the constraint violation error -- the database enforces uniqueness atomically.

4. **Non-atomic file operations with predictable temporary filenames.** Using `tempnam()` to
   generate a filename, then `open()` to create it. An attacker predicts the filename (or
   creates symlinks for all likely names) and interposes between generation and creation.
   Use `mkstemp()` which generates and opens the file in a single atomic operation.

5. **Assuming single-threaded execution in a multi-instance deployment.** Code that uses
   in-memory locks (`synchronized` in Java, `threading.Lock` in Python) to prevent race
   conditions. These locks protect against concurrency within a single process but do nothing
   when the application runs as multiple instances behind a load balancer. The lock must be
   at the shared state level -- typically the database or a distributed lock (Redis SETNX,
   ZooKeeper, etcd).
