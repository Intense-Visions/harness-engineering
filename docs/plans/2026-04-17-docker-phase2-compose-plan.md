# Plan: Docker Phase 2 — docker-compose.yml

**Date:** 2026-04-17 | **Spec:** docs/changes/docker-containerization/proposal.md | **Tasks:** 1 | **Time:** 2 min

## Goal

A `docker-compose.yml` at the repo root orchestrates the orchestrator and dashboard services with correct networking, volumes, health checks, and restart policies.

## Observable Truths (Acceptance Criteria)

1. When `docker compose up -d` is run from the repo root, the system shall start `orchestrator` and `dashboard` services with the orchestrator starting first.
2. When the orchestrator is healthy (HTTP 200 at `/api/v1/state`), the dashboard service shall start (gated by `depends_on: orchestrator: condition: service_healthy`).
3. The system shall mount the project root read-only at `/project` for both services, and a named `workspaces` volume at `/app/.harness/workspaces` for the orchestrator.
4. The system shall set `HARNESS_PROJECT_PATH=/project` for both services and `ORCHESTRATOR_URL=http://orchestrator:8080` for the dashboard.
5. Both services shall have health checks (curl-based, 30s interval, 10s timeout, 3 retries, 10s start period) and `restart: unless-stopped`.
6. The docker-compose.yml shall include a commented-out Docker socket mount for opt-in container-based agent execution.

## File Map

- CREATE docker-compose.yml

## Tasks

### Task 1: Create docker-compose.yml

**Depends on:** Phase 1 (Dockerfile) — complete | **Files:** docker-compose.yml

1. Create `docker-compose.yml` at the repo root with the following exact content:

```yaml
services:
  orchestrator:
    build:
      context: .
      target: orchestrator
    ports:
      - '8080:8080'
    volumes:
      - ./:/project:ro
      - workspaces:/app/.harness/workspaces
      # Uncomment for container-based agent execution:
      # - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - HARNESS_PROJECT_PATH=/project
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/api/v1/state']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  dashboard:
    build:
      context: .
      target: dashboard
    ports:
      - '3701:3701'
    volumes:
      - ./:/project:ro
    environment:
      - HARNESS_PROJECT_PATH=/project
      - ORCHESTRATOR_URL=http://orchestrator:8080
    depends_on:
      orchestrator:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3701/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: unless-stopped

volumes:
  workspaces:
```

2. Run: `harness validate`
3. Commit: `feat(docker): add docker-compose.yml for orchestrator + dashboard stack`

[checkpoint:human-verify] — After committing, verify with `docker compose config` to confirm YAML is syntactically valid and services are correctly defined.
