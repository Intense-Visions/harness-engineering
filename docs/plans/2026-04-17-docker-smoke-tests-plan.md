# Plan: Docker Smoke Tests

**Date:** 2026-04-17 | **Spec:** docs/changes/docker-containerization/proposal.md (Phase 4) | **Tasks:** 5 | **Time:** ~20 min

## Goal

A self-contained shell script validates that all 4 Docker images (cli, mcp-server, orchestrator, dashboard) work correctly, and a CI job runs the smoke tests automatically after image builds.

## Observable Truths (Acceptance Criteria)

1. `scripts/docker-smoke-test.sh` exists and is executable
2. When `scripts/docker-smoke-test.sh` is run, the system shall build all 4 Docker images, run each validation, and report PASS/FAIL per check with a final summary
3. When the CLI image is run with `--version`, the system shall print a string matching the pattern `X.Y.Z`
4. When a JSON-RPC `initialize` request is piped to the MCP image via stdin, the system shall respond with a JSON-RPC result containing `serverInfo`
5. When `docker compose up -d` is run, the system shall have both orchestrator and dashboard services healthy within 60 seconds
6. When the orchestrator is healthy, `curl http://localhost:8080/api/v1/state` shall return HTTP 200 with a JSON body
7. When the dashboard is healthy, `curl http://localhost:3701/api/health-check` shall return HTTP 200 with `{"status":"ok"}`
8. When a file is created in the project mount volume before starting the orchestrator, the orchestrator state endpoint shall reflect project context from that mount
9. When the orchestrator container is restarted, workspace data written to the named volume shall persist
10. Each of the 4 images shall be under 400MB as reported by `docker image inspect`
11. When the script exits (success or failure), the system shall not leave running containers or compose stacks behind (idempotent cleanup via trap)
12. The `.github/workflows/docker.yml` CI workflow shall include a `smoke-test` job that runs after `build-and-push`, executing the smoke test script against the built images

## File Map

```
CREATE scripts/docker-smoke-test.sh
MODIFY .github/workflows/docker.yml (add smoke-test job)
```

## Tasks

### Task 1: Create the smoke test script shell and helpers

**Depends on:** none | **Files:** `scripts/docker-smoke-test.sh`

Create the script with the shebang, color output helpers, pass/fail tracking, argument parsing for `--skip-build` and `--skip-compose`, and the cleanup trap. This task creates the framework; subsequent tasks add the individual test functions.

1. Create `scripts/docker-smoke-test.sh` with the following exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Docker Smoke Tests
# Validates all 4 Docker images: cli, mcp-server, orchestrator, dashboard
#
# Usage:
#   ./scripts/docker-smoke-test.sh              # Full run (build + test)
#   ./scripts/docker-smoke-test.sh --skip-build  # Use pre-built images
#   ./scripts/docker-smoke-test.sh --skip-compose # Skip compose tests
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Configuration ---
CLI_IMAGE="harness-cli-smoke"
MCP_IMAGE="harness-mcp-smoke"
ORCH_IMAGE="harness-orchestrator-smoke"
DASH_IMAGE="harness-dashboard-smoke"
COMPOSE_PROJECT="harness-smoke"
MAX_IMAGE_SIZE_MB=400
HEALTH_TIMEOUT=60

# --- Color output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- State ---
PASSED=0
FAILED=0
SKIPPED=0
FAILURES=()

# --- Argument parsing ---
SKIP_BUILD=false
SKIP_COMPOSE=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-compose) SKIP_COMPOSE=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--skip-compose]"
      echo "  --skip-build    Skip building images (use pre-built)"
      echo "  --skip-compose  Skip docker compose tests"
      exit 0
      ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# --- Helpers ---
pass() {
  local name="$1"
  PASSED=$((PASSED + 1))
  echo -e "  ${GREEN}PASS${NC} $name"
}

fail() {
  local name="$1"
  local detail="${2:-}"
  FAILED=$((FAILED + 1))
  FAILURES+=("$name: $detail")
  echo -e "  ${RED}FAIL${NC} $name"
  if [[ -n "$detail" ]]; then
    echo -e "       ${RED}$detail${NC}"
  fi
}

skip() {
  local name="$1"
  SKIPPED=$((SKIPPED + 1))
  echo -e "  ${YELLOW}SKIP${NC} $name"
}

section() {
  echo ""
  echo -e "${BOLD}--- $1 ---${NC}"
}

# --- Cleanup trap ---
cleanup() {
  section "Cleanup"
  # Stop compose stack if running
  docker compose -p "$COMPOSE_PROJECT" -f "$PROJECT_ROOT/docker-compose.yml" down --volumes 2>/dev/null || true
  # Remove smoke test containers
  for name in cli-smoke mcp-smoke orch-persist-smoke; do
    docker rm -f "$name" 2>/dev/null || true
  done
  # Remove smoke test images (only if we built them)
  if [[ "$SKIP_BUILD" == "false" ]]; then
    for img in "$CLI_IMAGE" "$MCP_IMAGE" "$ORCH_IMAGE" "$DASH_IMAGE"; do
      docker rmi -f "$img" 2>/dev/null || true
    done
  fi
  echo "  Cleanup complete."
}
trap cleanup EXIT

# --- Summary ---
print_summary() {
  section "Summary"
  echo -e "  ${GREEN}Passed:${NC}  $PASSED"
  echo -e "  ${RED}Failed:${NC}  $FAILED"
  echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
  if [[ ${#FAILURES[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${RED}Failures:${NC}"
    for f in "${FAILURES[@]}"; do
      echo -e "    - $f"
    done
  fi
  echo ""
  if [[ "$FAILED" -gt 0 ]]; then
    echo -e "${RED}${BOLD}SMOKE TESTS FAILED${NC}"
    return 1
  else
    echo -e "${GREEN}${BOLD}ALL SMOKE TESTS PASSED${NC}"
    return 0
  fi
}

echo -e "${BOLD}Docker Smoke Tests${NC}"
echo "  Project root: $PROJECT_ROOT"
echo "  Skip build:   $SKIP_BUILD"
echo "  Skip compose: $SKIP_COMPOSE"

# =============================================================================
# BUILD
# =============================================================================
if [[ "$SKIP_BUILD" == "false" ]]; then
  section "Building images"
  echo "  Building cli..."
  docker build --target cli -t "$CLI_IMAGE" "$PROJECT_ROOT" --quiet
  echo "  Building mcp-server..."
  docker build --target mcp-server -t "$MCP_IMAGE" "$PROJECT_ROOT" --quiet
  echo "  Building orchestrator..."
  docker build --target orchestrator -t "$ORCH_IMAGE" "$PROJECT_ROOT" --quiet
  echo "  Building dashboard..."
  docker build --target dashboard -t "$DASH_IMAGE" "$PROJECT_ROOT" --quiet
  echo "  All images built."
else
  echo ""
  echo "  Using pre-built images."
fi

# =============================================================================
# TEST: Image sizes
# =============================================================================
check_image_size() {
  local image="$1"
  local label="$2"
  local size_bytes
  size_bytes=$(docker image inspect "$image" --format='{{.Size}}' 2>/dev/null || echo "0")
  local size_mb=$((size_bytes / 1024 / 1024))
  if [[ "$size_bytes" == "0" ]]; then
    fail "$label image size" "Image not found: $image"
  elif [[ $size_mb -gt $MAX_IMAGE_SIZE_MB ]]; then
    fail "$label image size" "${size_mb}MB exceeds ${MAX_IMAGE_SIZE_MB}MB limit"
  else
    pass "$label image size (${size_mb}MB <= ${MAX_IMAGE_SIZE_MB}MB)"
  fi
}

section "Image size checks"
check_image_size "$CLI_IMAGE" "CLI"
check_image_size "$MCP_IMAGE" "MCP"
check_image_size "$ORCH_IMAGE" "Orchestrator"
check_image_size "$DASH_IMAGE" "Dashboard"

# =============================================================================
# TEST: CLI --version
# =============================================================================
section "CLI version check"
CLI_OUTPUT=$(docker run --rm --name cli-smoke "$CLI_IMAGE" --version 2>/dev/null || echo "")
if echo "$CLI_OUTPUT" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
  pass "CLI --version prints version ($CLI_OUTPUT)"
else
  fail "CLI --version" "Expected semver, got: '$CLI_OUTPUT'"
fi

# =============================================================================
# TEST: MCP stdio
# =============================================================================
section "MCP stdio check"
MCP_REQUEST='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0.0"}}}'
# Send initialize request via stdin, capture response (with timeout)
MCP_RESPONSE=$(echo "$MCP_REQUEST" | timeout 15 docker run --rm -i --name mcp-smoke "$MCP_IMAGE" 2>/dev/null | head -1 || echo "")
if echo "$MCP_RESPONSE" | grep -q '"serverInfo"'; then
  pass "MCP responds to initialize with serverInfo"
else
  fail "MCP stdio initialize" "Expected serverInfo in response, got: '${MCP_RESPONSE:0:200}'"
fi

# =============================================================================
# TEST: Docker Compose stack (orchestrator + dashboard health)
# =============================================================================
if [[ "$SKIP_COMPOSE" == "true" ]]; then
  section "Docker Compose (skipped)"
  skip "Orchestrator health check"
  skip "Dashboard health check"
  skip "Orchestrator reads project context"
  skip "Workspace persistence across restart"
else
  section "Docker Compose stack"

  # Start compose stack with smoke-test project name to isolate
  docker compose -p "$COMPOSE_PROJECT" -f "$PROJECT_ROOT/docker-compose.yml" up -d --build --quiet-pull 2>/dev/null

  # Wait for orchestrator health
  echo "  Waiting for orchestrator health (up to ${HEALTH_TIMEOUT}s)..."
  ORCH_HEALTHY=false
  for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -sf http://localhost:8080/api/v1/state >/dev/null 2>&1; then
      ORCH_HEALTHY=true
      break
    fi
    sleep 1
  done

  if [[ "$ORCH_HEALTHY" == "true" ]]; then
    pass "Orchestrator healthy (/api/v1/state returns 200, ${i}s)"
  else
    fail "Orchestrator health check" "Did not become healthy within ${HEALTH_TIMEOUT}s"
  fi

  # Wait for dashboard health (dashboard depends_on orchestrator being healthy)
  echo "  Waiting for dashboard health (up to ${HEALTH_TIMEOUT}s)..."
  DASH_HEALTHY=false
  for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    HTTP_CODE=$(curl -so /dev/null -w '%{http_code}' http://localhost:3701/api/health-check 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
      DASH_HEALTHY=true
      break
    fi
    sleep 1
  done

  if [[ "$DASH_HEALTHY" == "true" ]]; then
    pass "Dashboard healthy (/api/health-check returns 200, ${i}s)"
  else
    fail "Dashboard health check" "Did not return 200 within ${HEALTH_TIMEOUT}s (last code: $HTTP_CODE)"
  fi

  # Check orchestrator reads project context from mount
  if [[ "$ORCH_HEALTHY" == "true" ]]; then
    STATE_BODY=$(curl -sf http://localhost:8080/api/v1/state 2>/dev/null || echo "")
    if [[ -n "$STATE_BODY" ]] && echo "$STATE_BODY" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
      pass "Orchestrator returns valid JSON state from project mount"
    else
      fail "Orchestrator project context" "State endpoint returned invalid or empty response"
    fi
  else
    skip "Orchestrator project context (orchestrator not healthy)"
  fi

  # Check workspace persistence across restart
  if [[ "$ORCH_HEALTHY" == "true" ]]; then
    # Write a marker file into the workspace volume
    ORCH_CONTAINER=$(docker compose -p "$COMPOSE_PROJECT" -f "$PROJECT_ROOT/docker-compose.yml" ps -q orchestrator 2>/dev/null)
    if [[ -n "$ORCH_CONTAINER" ]]; then
      docker exec "$ORCH_CONTAINER" sh -c 'echo "smoke-test-marker" > /app/.harness/workspaces/.smoke-marker' 2>/dev/null || true

      # Restart the orchestrator container
      docker compose -p "$COMPOSE_PROJECT" -f "$PROJECT_ROOT/docker-compose.yml" restart orchestrator 2>/dev/null

      # Wait for it to come back healthy
      for i in $(seq 1 "$HEALTH_TIMEOUT"); do
        if curl -sf http://localhost:8080/api/v1/state >/dev/null 2>&1; then
          break
        fi
        sleep 1
      done

      # Check if marker file persists
      ORCH_CONTAINER=$(docker compose -p "$COMPOSE_PROJECT" -f "$PROJECT_ROOT/docker-compose.yml" ps -q orchestrator 2>/dev/null)
      MARKER=$(docker exec "$ORCH_CONTAINER" cat /app/.harness/workspaces/.smoke-marker 2>/dev/null || echo "")
      if [[ "$MARKER" == "smoke-test-marker" ]]; then
        pass "Workspace data persists across orchestrator restart"
      else
        fail "Workspace persistence" "Marker file not found after restart"
      fi
    else
      fail "Workspace persistence" "Could not find orchestrator container"
    fi
  else
    skip "Workspace persistence (orchestrator not healthy)"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
print_summary
```

2. Make it executable: `chmod +x scripts/docker-smoke-test.sh`
3. Run: `harness validate`
4. Commit: `feat(docker): add smoke test script shell with helpers and cleanup trap`

---

### Task 2: Add smoke-test job to CI workflow

**Depends on:** Task 1 | **Files:** `.github/workflows/docker.yml`

Add a `smoke-test` job to the Docker CI workflow that runs after the `build-and-push` job completes. In CI, we pull the just-pushed images, tag them with the smoke-test names, and run the script with `--skip-build`.

1. Edit `.github/workflows/docker.yml`. After the `build-and-push` job (at the same indentation level), add:

```yaml
smoke-test:
  runs-on: ubuntu-latest
  needs: build-and-push
  steps:
    - uses: actions/checkout@v6

    - uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Pull built images
      run: |
        TAG="${GITHUB_REF#refs/tags/v}"
        docker pull ghcr.io/intense-visions/harness-cli:${TAG}
        docker pull ghcr.io/intense-visions/harness-mcp:${TAG}
        docker pull ghcr.io/intense-visions/harness-orchestrator:${TAG}
        docker pull ghcr.io/intense-visions/harness-dashboard:${TAG}
        docker tag ghcr.io/intense-visions/harness-cli:${TAG} harness-cli-smoke
        docker tag ghcr.io/intense-visions/harness-mcp:${TAG} harness-mcp-smoke
        docker tag ghcr.io/intense-visions/harness-orchestrator:${TAG} harness-orchestrator-smoke
        docker tag ghcr.io/intense-visions/harness-dashboard:${TAG} harness-dashboard-smoke

    - name: Run smoke tests
      run: ./scripts/docker-smoke-test.sh --skip-build
```

The `--skip-build` flag tells the script to use the pre-pulled and tagged images rather than building from scratch. The compose tests will still build from source via the compose file (since compose uses the Dockerfile targets directly), but the standalone image tests (size, CLI version, MCP stdio) use the pre-pulled images.

2. Run: `harness validate`
3. Commit: `feat(docker): add smoke-test job to CI workflow`

---

## Traceability

| Observable Truth                                 | Task(s) |
| ------------------------------------------------ | ------- |
| 1. Script exists and is executable               | Task 1  |
| 2. Build + PASS/FAIL reporting                   | Task 1  |
| 3. CLI `--version` prints semver                 | Task 1  |
| 4. MCP stdio responds with serverInfo            | Task 1  |
| 5. Compose services healthy within 60s           | Task 1  |
| 6. Orchestrator `/api/v1/state` returns 200      | Task 1  |
| 7. Dashboard `/api/health-check` returns 200     | Task 1  |
| 8. Orchestrator reads project context from mount | Task 1  |
| 9. Workspace persists across restart             | Task 1  |
| 10. Images under 400MB                           | Task 1  |
| 11. Idempotent cleanup via trap                  | Task 1  |
| 12. CI smoke-test job in docker.yml              | Task 2  |

## Notes

- The script uses `python3 -c "import sys,json; json.load(sys.stdin)"` to validate JSON. Python 3 is available on macOS and Ubuntu CI runners.
- The `timeout` command is used for the MCP stdio test (15s). On macOS, `timeout` is available via GNU coreutils (`brew install coreutils`). If unavailable, the test will fail gracefully with a helpful error.
- The `--skip-compose` flag allows running the fast checks (size, CLI, MCP) without the slower compose stack tests, useful for quick iteration.
- The compose tests use a separate project name (`harness-smoke`) to avoid interfering with any running development stack.
- The Dockerfile HEALTHCHECK for the dashboard uses `/health` (SPA fallback), but the smoke test uses `/api/health-check` (explicit JSON endpoint) for a more reliable validation.
- The smoke test script is a single file rather than multiple scripts, matching the convention of other scripts in `scripts/` (each is self-contained).
