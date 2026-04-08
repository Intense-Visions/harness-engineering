# OWASP Injection Prevention

> Eliminate SQL, NoSQL, and command injection by never concatenating untrusted input into queries or commands

## When to Use

- Writing database queries that accept user-supplied parameters
- Building CLI wrappers or any code that spawns child processes
- Reviewing code that uses string concatenation to build queries
- Implementing search, filter, or dynamic query features
- Working with ORMs, raw query builders, or MongoDB operators

## Instructions

### SQL Injection

Never build queries with string concatenation. Always use parameterized queries or a query builder.

```typescript
// BAD — direct interpolation
const query = `SELECT * FROM users WHERE id = ${userId}`;

// GOOD — parameterized (node-postgres)
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// GOOD — TypeORM query builder
const user = await userRepo
  .createQueryBuilder('user')
  .where('user.id = :id', { id: userId })
  .getOne();

// GOOD — Prisma (always parameterized)
const user = await prisma.user.findUnique({ where: { id: userId } });
```

For raw SQL that must be dynamic (table/column names), use an allowlist — never accept these from user input:

```typescript
const ALLOWED_SORT_COLUMNS = ['name', 'created_at', 'email'] as const;
type SortColumn = (typeof ALLOWED_SORT_COLUMNS)[number];

function buildSortedQuery(column: SortColumn) {
  // column is validated at the type level AND runtime
  if (!ALLOWED_SORT_COLUMNS.includes(column)) throw new Error('Invalid column');
  return `SELECT * FROM users ORDER BY ${column}`;
}
```

### NoSQL Injection (MongoDB)

MongoDB operators like `$where`, `$gt`, `$regex` can be injected through JSON body parsing. Validate and sanitize all operator keys.

```typescript
// BAD — passes user object directly to find
app.post('/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username, password: req.body.password });
  // Attacker sends: { "username": "admin", "password": { "$gt": "" } }
});

// GOOD — extract and validate specific string fields
app.post('/login', async (req, res) => {
  const username = String(req.body.username ?? '');
  const password = String(req.body.password ?? '');
  const user = await User.findOne({ username, password });
});

// GOOD — use express-mongo-sanitize middleware to strip $ keys
import mongoSanitize from 'express-mongo-sanitize';
app.use(mongoSanitize());
```

### Command Injection

Never pass user input to `exec`, `execSync`, or shell: true spawns.

```typescript
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// BAD
exec(`convert ${userFilename} output.png`);

// GOOD — execFile does NOT invoke a shell; args are passed directly
await execFileAsync('convert', [userFilename, 'output.png']);

// GOOD — spawn with shell: false (default)
const proc = spawn('convert', [userFilename, 'output.png']);
```

### Input Validation with Zod

Validate all external input at system boundaries before it reaches any query or command:

```typescript
import { z } from 'zod';

const SearchSchema = z.object({
  query: z
    .string()
    .max(100)
    .regex(/^[\w\s]+$/),
  page: z.number().int().min(1).max(1000),
  sortBy: z.enum(['name', 'date', 'score']),
});

app.get('/search', async (req, res) => {
  const params = SearchSchema.parse(req.query); // throws ZodError on invalid input
  const results = await db.search(params.query, params.page, params.sortBy);
  res.json(results);
});
```

## Details

OWASP consistently ranks injection as a top-3 vulnerability. The root cause is always the same: user-controlled data is interpreted as code or a query operator rather than data.

**Defense layers:**

1. Parameterized queries / prepared statements (primary)
2. Input validation with allowlists (secondary)
3. ORM/query builder abstractions (structural)
4. Least-privilege database accounts (defense-in-depth)

**Common bypasses to watch for:**

- Second-order injection: input is stored then later interpolated in a different query
- Encoding tricks: `%27` → `'`, `--` URL-encoded as `%2D%2D`
- JSON body parsing creating unexpected object structures

**ORMs do NOT automatically protect you** if you use raw query escape hatches (`Prisma.$queryRaw` without template literals, TypeORM `query()`, etc.).

```typescript
// STILL vulnerable with Prisma if you concatenate
const bad = await prisma.$queryRaw(`SELECT * FROM users WHERE id = ${id}`);

// SAFE — template literal version uses parameterization automatically
const good = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;
```

## Source

https://owasp.org/www-project-top-ten/
