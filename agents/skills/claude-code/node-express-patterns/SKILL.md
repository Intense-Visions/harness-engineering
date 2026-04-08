# Node.js Express Patterns

> Structure Express applications with middleware chains, routers, and proper error handling

## When to Use

- Building REST APIs with Express
- Structuring middleware for authentication, logging, and error handling
- Organizing routes with Express Router
- Adding proper error handling to async route handlers

## Instructions

1. **Application setup:**

```typescript
import express from 'express';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
```

2. **Router organization:**

```typescript
// routes/users.ts
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  const users = await userService.findAll();
  res.json(users);
});

router.get('/:id', async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.post('/', async (req, res) => {
  const user = await userService.create(req.body);
  res.status(201).json(user);
});

export { router as userRouter };

// app.ts
app.use('/api/users', userRouter);
```

3. **Async error wrapper** — Express does not catch async errors by default:

```typescript
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await userService.findById(req.params.id);
    if (!user) throw new NotFoundError('User', req.params.id);
    res.json(user);
  })
);
```

4. **Middleware order matters:**

```typescript
// 1. Parsing (runs first)
app.use(express.json());

// 2. Logging
app.use(requestLogger);

// 3. Authentication
app.use('/api', authenticate);

// 4. Routes
app.use('/api/users', userRouter);
app.use('/api/posts', postRouter);

// 5. 404 handler (after all routes)
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// 6. Error handler (must have 4 parameters)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

5. **Request validation middleware:**

```typescript
import { z, ZodSchema } from 'zod';

function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten().fieldErrors });
    }
    req.body = result.data;
    next();
  };
}

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

router.post(
  '/',
  validate(CreateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.create(req.body); // req.body is validated
    res.status(201).json(user);
  })
);
```

6. **Authentication middleware:**

```typescript
async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const payload = await verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

7. **Graceful shutdown:**

```typescript
const server = app.listen(3000);

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
```

## Details

Express uses a middleware chain pattern where each middleware receives `(req, res, next)` and either responds or calls `next()` to pass control to the next middleware.

**Error handling middleware** must have exactly 4 parameters `(err, req, res, next)`. Express identifies error handlers by their arity. Place them after all routes.

**Express 5 (beta):** Automatically catches async errors without the `asyncHandler` wrapper. Until Express 5 is stable, the wrapper is required.

**Trade-offs:**

- Express is the most popular Node.js framework — but lacks built-in TypeScript types, validation, and async error handling
- Middleware chains are flexible — but ordering bugs are hard to diagnose
- Router modularity enables clean organization — but deeply nested routers can be confusing
- Express is mature and well-documented — but Fastify offers better performance and built-in schema validation

## Source

https://expressjs.com/en/guide/routing.html
