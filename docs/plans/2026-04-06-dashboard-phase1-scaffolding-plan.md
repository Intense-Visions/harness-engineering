# Plan: Dashboard Phase 1 -- Package Scaffolding

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Create `packages/dashboard` with Vite + React + Tailwind + Tremor setup, Hono API server skeleton, and dev proxy config, wired into the monorepo so that a dev command starts and serves a hello-world page with a working `/api/health-check` endpoint.

## Observable Truths (Acceptance Criteria)

1. `packages/dashboard/package.json` exists with name `@harness-engineering/dashboard` and dependencies: hono, @hono/node-server, react, react-dom, react-router, @tailwindcss/vite, @tremor/react, vite.
2. When `pnpm install` runs from monorepo root, it succeeds without errors (the workspace resolves the new package).
3. When `pnpm --filter @harness-engineering/dashboard build` runs, it produces `dist/client/` (Vite SPA build) and `dist/server/` (compiled Hono server) without errors.
4. When `pnpm --filter @harness-engineering/dashboard dev` runs, a Vite dev server starts on port 3700 and GET `http://localhost:3700` returns HTML containing "Harness Dashboard".
5. When the dev servers are running, GET `http://localhost:3700/api/health-check` returns `{ "status": "ok" }` (Vite proxy forwarding to Hono).
6. The root `tsconfig.json` includes `{ "path": "./packages/dashboard" }` in its references array.
7. `npx vitest run` in `packages/dashboard` passes with at least one test (health-check route test).
8. The `src/` directory respects the internal boundary: `server/`, `client/`, `shared/` -- no cross-imports between server and client.

## File Map

```
CREATE packages/dashboard/package.json
CREATE packages/dashboard/tsconfig.json
CREATE packages/dashboard/tsconfig.build.json
CREATE packages/dashboard/vite.config.ts
CREATE packages/dashboard/tailwind.config.ts
CREATE packages/dashboard/postcss.config.js
CREATE packages/dashboard/vitest.config.mts
CREATE packages/dashboard/src/server/index.ts
CREATE packages/dashboard/src/server/routes/health-check.ts
CREATE packages/dashboard/src/server/serve.ts
CREATE packages/dashboard/src/client/index.html
CREATE packages/dashboard/src/client/main.tsx
CREATE packages/dashboard/src/client/App.tsx
CREATE packages/dashboard/src/client/index.css
CREATE packages/dashboard/src/shared/constants.ts
CREATE packages/dashboard/src/shared/types.ts
CREATE packages/dashboard/tests/server/health-check.test.ts
MODIFY tsconfig.json (add dashboard reference)
```

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Create package.json and TypeScript configs

**Depends on:** none
**Files:** `packages/dashboard/package.json`, `packages/dashboard/tsconfig.json`, `packages/dashboard/tsconfig.build.json`

Evidence: Root `tsconfig.base.json` uses `module: "ESNext"`, `moduleResolution: "bundler"`, `composite: true` (`tsconfig.base.json:1-26`). Existing packages extend it and add `outDir`, `rootDir`, `jsx` (`packages/orchestrator/tsconfig.json:1-12`). Build configs disable `composite` and `incremental` (`packages/orchestrator/tsconfig.build.json:1-12`). Clean script exists at `scripts/clean.mjs`.

1. Create `packages/dashboard/package.json`:

```json
{
  "name": "@harness-engineering/dashboard",
  "version": "0.1.0",
  "private": true,
  "description": "Local web dashboard for harness project health and roadmap visualization",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:client\"",
    "dev:server": "tsx watch src/server/serve.ts",
    "dev:client": "vite --config vite.config.ts",
    "build": "pnpm build:server && pnpm build:client",
    "build:server": "tsup src/server/serve.ts --format esm --outDir dist/server --tsconfig tsconfig.build.json",
    "build:client": "vite build --config vite.config.ts",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "node ../../scripts/clean.mjs dist"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "@hono/node-server": "^1.14.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router": "^7.5.0",
    "@tremor/react": "^3.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.19.15",
    "@types/react": "^18.3.28",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.5.2",
    "@tailwindcss/vite": "^4.1.0",
    "tailwindcss": "^4.1.0",
    "concurrently": "^9.1.0",
    "tsx": "^4.19.0",
    "tsup": "^8.5.1",
    "vite": "^6.3.0",
    "vitest": "^4.1.2",
    "@vitest/coverage-v8": "^4.1.2"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/Intense-Visions/harness-engineering.git",
    "directory": "packages/dashboard"
  }
}
```

2. Create `packages/dashboard/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "references": [{ "path": "../types" }],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Note: `noUnusedLocals` and `noUnusedParameters` are relaxed during scaffolding to avoid errors from placeholder exports. They should be tightened in a later phase.

3. Create `packages/dashboard/tsconfig.build.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": false,
    "incremental": false,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

4. Run: `pnpm install` from monorepo root to verify workspace resolution.
5. Observe: install succeeds, `packages/dashboard/node_modules` is created.
6. Commit: `feat(dashboard): add package.json and TypeScript configs`

---

### Task 2: Create Vite, Tailwind, PostCSS, and Vitest configs

**Depends on:** Task 1
**Files:** `packages/dashboard/vite.config.ts`, `packages/dashboard/tailwind.config.ts`, `packages/dashboard/postcss.config.js`, `packages/dashboard/vitest.config.mts`

1. Create `packages/dashboard/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  plugins: [react(), tailwindcss()],
  server: {
    port: 3700,
    proxy: {
      '/api': {
        target: 'http://localhost:3701',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
```

2. Create `packages/dashboard/tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/client/**/*.{ts,tsx,html}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

3. Create `packages/dashboard/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
  },
};
```

4. Create `packages/dashboard/vitest.config.mts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      exclude: ['node_modules/', 'tests/', '**/*.test.ts', '**/*.spec.ts', 'src/client/**'],
    },
  },
});
```

5. Commit: `feat(dashboard): add Vite, Tailwind, PostCSS, and Vitest configs`

---

### Task 3: Create shared constants and types

**Depends on:** Task 1
**Files:** `packages/dashboard/src/shared/constants.ts`, `packages/dashboard/src/shared/types.ts`

1. Create `packages/dashboard/src/shared/constants.ts`:

```typescript
/** Default port for the Hono API server */
export const API_PORT = 3701;

/** Default port for the Vite dev server / dashboard UI */
export const DASHBOARD_PORT = 3700;

/** API route prefix */
export const API_PREFIX = '/api';

/** SSE polling interval in milliseconds (default 30s) */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;
```

2. Create `packages/dashboard/src/shared/types.ts`:

```typescript
/** Health check response shape */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
}

/**
 * Placeholder for API response types.
 * Will be expanded in Phase 2 (shared types + data gathering layer).
 */
export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}
```

3. Commit: `feat(dashboard): add shared constants and types`

---

### Task 4: Create Hono server skeleton with health-check route

**Depends on:** Task 3
**Files:** `packages/dashboard/src/server/index.ts`, `packages/dashboard/src/server/routes/health-check.ts`, `packages/dashboard/src/server/serve.ts`

1. Create test file `packages/dashboard/tests/server/health-check.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { app } from '../../src/server/index';

describe('GET /api/health-check', () => {
  it('returns status ok', async () => {
    const res = await app.request('/api/health-check');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/health-check.test.ts`
3. Observe failure: module `../../src/server/index` not found.

4. Create `packages/dashboard/src/server/routes/health-check.ts`:

```typescript
import { Hono } from 'hono';
import type { HealthCheckResponse } from '../../shared/types';

const healthCheck = new Hono();

healthCheck.get('/health-check', (c) => {
  const response: HealthCheckResponse = { status: 'ok' };
  return c.json(response);
});

export { healthCheck };
```

5. Create `packages/dashboard/src/server/index.ts`:

```typescript
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { healthCheck } from './routes/health-check';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// API routes
app.route('/api', healthCheck);

export { app };
```

6. Create `packages/dashboard/src/server/serve.ts`:

```typescript
import { serve } from '@hono/node-server';
import { app } from './index';
import { API_PORT } from '../shared/constants';

const port = Number(process.env['DASHBOARD_API_PORT'] ?? API_PORT);

console.log(`Hono server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
```

7. Run test: `cd packages/dashboard && npx vitest run tests/server/health-check.test.ts`
8. Observe: test passes.
9. Run: `harness validate`
10. Commit: `feat(dashboard): add Hono server skeleton with health-check route`

---

### Task 5: Create React client entry with Tailwind and routing

**Depends on:** Task 2, Task 3
**Files:** `packages/dashboard/src/client/index.html`, `packages/dashboard/src/client/main.tsx`, `packages/dashboard/src/client/App.tsx`, `packages/dashboard/src/client/index.css`

1. Create `packages/dashboard/src/client/index.css`:

```css
@import 'tailwindcss';
```

2. Create `packages/dashboard/src/client/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router';

function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-4">Harness Dashboard</h1>
      <p className="text-gray-400 mb-6">Project health and roadmap visualization.</p>
      <nav className="flex gap-4">
        <Link to="/" className="text-blue-400 hover:underline">
          Overview
        </Link>
        <Link to="/roadmap" className="text-blue-400 hover:underline">
          Roadmap
        </Link>
        <Link to="/health" className="text-blue-400 hover:underline">
          Health
        </Link>
        <Link to="/graph" className="text-blue-400 hover:underline">
          Graph
        </Link>
      </nav>
      <div className="mt-8 p-4 bg-gray-900 rounded-lg border border-gray-800">
        <p className="text-sm text-gray-500">
          Dashboard scaffolding complete. Pages will be built in subsequent phases.
        </p>
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-4">{title}</h1>
      <Link to="/" className="text-blue-400 hover:underline">
        Back to Overview
      </Link>
      <p className="mt-4 text-gray-500">Coming in a future phase.</p>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/roadmap" element={<Placeholder title="Roadmap" />} />
        <Route path="/health" element={<Placeholder title="Health" />} />
        <Route path="/graph" element={<Placeholder title="Graph" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

3. Create `packages/dashboard/src/client/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

4. Create `packages/dashboard/src/client/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Harness Dashboard</title>
  </head>
  <body class="bg-gray-950">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

5. Commit: `feat(dashboard): add React client entry with routing and Tailwind`

---

### Task 6: Wire into monorepo (tsconfig references)

**Depends on:** Task 1
**Files:** MODIFY `tsconfig.json`

Evidence: Root `tsconfig.json` has references array with all existing packages (`tsconfig.json:4-12`).

1. Add `{ "path": "./packages/dashboard" }` to the root `tsconfig.json` references array. The updated references should be:

```json
{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./packages/types" },
    { "path": "./packages/graph" },
    { "path": "./packages/core" },
    { "path": "./packages/cli" },
    { "path": "./packages/eslint-plugin" },
    { "path": "./packages/linter-gen" },
    { "path": "./packages/orchestrator" },
    { "path": "./packages/dashboard" }
  ]
}
```

2. Run: `pnpm install` from monorepo root to verify workspace integrity.
3. Observe: install succeeds.
4. Run: `harness validate`
5. Commit: `feat(dashboard): wire package into monorepo tsconfig references`

---

### Task 7: Integration verification

[checkpoint:human-verify]

**Depends on:** Tasks 1-6
**Files:** none (verification only)

This task verifies all observable truths. No new files are created.

1. Run from monorepo root: `pnpm install`
2. Observe: succeeds.

3. Run: `pnpm --filter @harness-engineering/dashboard build`
4. Observe: `packages/dashboard/dist/client/` contains `index.html` and JS/CSS assets. `packages/dashboard/dist/server/` contains compiled `serve.js`.

5. Run: `pnpm --filter @harness-engineering/dashboard test`
6. Observe: health-check test passes (1 test, 1 pass).

7. Start the dev servers: `cd packages/dashboard && pnpm dev`
8. In another terminal, verify the UI: `curl -s http://localhost:3700 | grep -o "Harness Dashboard"`
9. Observe: outputs "Harness Dashboard".

10. Verify the API proxy: `curl -s http://localhost:3700/api/health-check`
11. Observe: returns `{"status":"ok"}`.

12. Stop the dev servers (Ctrl+C).

13. Verify directory structure respects internal boundaries:
    - `src/server/` contains only server code (Hono app, routes, serve entry)
    - `src/client/` contains only client code (React, CSS, HTML)
    - `src/shared/` contains only types and constants imported by both

14. Run: `harness validate`
15. Observe: passes.

If all checks pass, the scaffolding phase is complete. Commit any fixes discovered during verification, then:

16. Commit: `chore(dashboard): verify scaffolding integration`

---

## Dependency Graph

```
Task 1 (package.json, tsconfigs)
  |-- Task 2 (Vite, Tailwind, Vitest configs)
  |     |-- Task 5 (React client)
  |-- Task 3 (shared constants/types)
  |     |-- Task 4 (Hono server + test)
  |     |-- Task 5 (React client)
  |-- Task 6 (monorepo wiring)
  |
  All --> Task 7 (integration verification)
```

**Parallel opportunities:** Tasks 2, 3, and 6 can run in parallel after Task 1. Tasks 4 and 5 can run in parallel after their respective dependencies.

## Notes

- Hono is NOT currently a dependency in any existing package (the spec mentions it is in orchestrator, but inspection shows it is not in `packages/orchestrator/package.json`). It will be added fresh to the dashboard package.
- The CLI `harness dashboard` command is deferred to Phase 9 per the spec's implementation order. This scaffolding phase only needs `pnpm dev` to work.
- Tailwind v4 uses `@import 'tailwindcss'` instead of the v3 `@tailwind` directives.
- Tremor v3 is included as a dependency but not used in this scaffolding phase. It will be used starting in Phase 4 (Overview page).
- The `postcss.config.js` is needed for Tailwind CSS processing via Vite.
- The server runs on port 3701 (internal) and Vite proxies `/api/*` from port 3700 to 3701, so the user only interacts with port 3700.
