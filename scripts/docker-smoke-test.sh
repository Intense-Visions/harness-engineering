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
MAX_IMAGE_SIZE_MB=800
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
