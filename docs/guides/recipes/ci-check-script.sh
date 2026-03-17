#!/usr/bin/env bash
set -euo pipefail

# Harness CI Check Script — Platform-Agnostic
# Works on any CI platform that can run bash.
# Or generate this with: harness ci init --platform generic

# ---- Configuration ----
FAIL_ON="${HARNESS_FAIL_ON:-error}"       # "error" or "warning"
SKIP_CHECKS="${HARNESS_SKIP:-}"           # Comma-separated: "entropy,docs"
REPORT_FILE="${HARNESS_REPORT:-harness-report.json}"

# ---- Install ----
if ! command -v harness &> /dev/null; then
  echo "Installing @harness-engineering/cli..."
  npm install -g @harness-engineering/cli
fi

# ---- Build Command ----
CMD="harness ci check --json --fail-on ${FAIL_ON}"
if [ -n "${SKIP_CHECKS}" ]; then
  CMD="${CMD} --skip ${SKIP_CHECKS}"
fi

# ---- Run ----
echo "Running harness checks..."
echo "Command: ${CMD}"
echo ""

${CMD} > "${REPORT_FILE}" 2>&1 || true
EXIT_CODE=$(jq -r '.exitCode // 2' "${REPORT_FILE}")

# ---- Report ----
echo ""
echo "=== Harness CI Report ==="
jq -r '.checks[] | "  " + .name + ": " + .status + " (" + (.issues | length | tostring) + " issues)"' "${REPORT_FILE}"
echo ""
jq -r '"Summary: " + (.summary.passed | tostring) + " passed, " + (.summary.failed | tostring) + " failed, " + (.summary.warnings | tostring) + " warnings"' "${REPORT_FILE}"
echo "========================="

# ---- Exit ----
if [ "${EXIT_CODE}" -eq 0 ]; then
  echo "All harness checks passed."
elif [ "${EXIT_CODE}" -eq 1 ]; then
  echo "Harness checks failed."
else
  echo "Harness internal error."
fi

exit "${EXIT_CODE}"
