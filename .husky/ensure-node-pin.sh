# shellcheck shell=sh
# ensure-node-pin.sh — activate (or fail fast on) the repo's pinned Node toolchain.
#
# Why: git hooks run their gates with whatever `node` is first on the ambient
# PATH, which may differ from the version this repo pins (.nvmrc / package.json
# engines). Native modules such as better-sqlite3 are compiled against the pin,
# so a mismatched major aborts deep inside a gate with an opaque ABI error
# (`NODE_MODULE_VERSION NNN ... requires NODE_MODULE_VERSION MMM`) instead of a
# clear, early signal (#910).
#
# What: resolve the pinned major; if the active node already matches, do
# nothing; else try to activate the pin via an available version manager
# (mise, then nvm); if none can, fail fast with an actionable message naming
# the active vs required version — never let the gate fail inside a native
# module.
#
# How it's used: this script is *sourced* by .husky/pre-commit and
# .husky/pre-push (`. ./scripts/ensure-node-pin.sh`) so that a PATH change (or
# `nvm use`) persists for the rest of the hook. It is POSIX sh only (husky
# invokes hooks via `sh -e`, which may be dash): no bashisms, no `pipefail`.
#
# Inputs (env, all optional):
#   HARNESS_REPO_ROOT  directory holding .nvmrc / package.json (default: cwd,
#                      which is the working-tree root for every git hook).
#   NVM_DIR            nvm install dir (default: $HOME/.nvm).
# Contract: returns 0 to continue; calls `exit 1` (aborting the sourcing hook)
# when the pin cannot be satisfied.

# Required major version (digits only) from .nvmrc, falling back to the
# package.json engines floor. Empty when neither is resolvable.
_harness_pin_major() {
  _root="${HARNESS_REPO_ROOT:-.}"
  if [ -f "$_root/.nvmrc" ]; then
    _raw=$(tr -d ' \t\r' <"$_root/.nvmrc" | head -n 1)
    _raw=${_raw#v}
    printf '%s' "${_raw%%.*}"
    return 0
  fi
  if [ -f "$_root/package.json" ]; then
    # e.g. "node": ">=22.0.0"  ->  22
    _spec=$(grep -o '"node"[^,}]*' "$_root/package.json" | head -n 1)
    printf '%s' "$_spec" | grep -o '[0-9][0-9]*' | head -n 1
    return 0
  fi
  printf '%s' ''
}

# Major version of the node currently first on PATH, or empty when node is
# absent or unruns.
_harness_active_major() {
  _v=$(node --version 2>/dev/null) || return 0
  _v=${_v#v}
  printf '%s' "${_v%%.*}"
}

_harness_ensure_node_pin() {
  _pin=$(_harness_pin_major)
  if [ -z "$_pin" ]; then
    # No pin declared — nothing to enforce. Don't block on an unpinned repo.
    return 0
  fi

  _active=$(_harness_active_major)
  if [ "$_active" = "$_pin" ]; then
    return 0
  fi

  # Try mise: resolve where the pinned node is installed and prepend its bin.
  if command -v mise >/dev/null 2>&1; then
    _dir=$(mise where "node@$_pin" 2>/dev/null) || _dir=''
    if [ -n "$_dir" ] && [ -x "$_dir/bin/node" ]; then
      PATH="$_dir/bin:$PATH"
      export PATH
      if [ "$(_harness_active_major)" = "$_pin" ]; then
        return 0
      fi
    fi
  fi

  # Try nvm: sourcing nvm.sh + `nvm use` mutates PATH in this (sourced) shell.
  _nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$_nvm_dir/nvm.sh" ]; then
    # nvm.sh is noisy and not -e-clean; isolate it from the hook's `set -e`.
    NVM_DIR="$_nvm_dir"
    export NVM_DIR
    # shellcheck disable=SC1090
    . "$_nvm_dir/nvm.sh" >/dev/null 2>&1 || true
    nvm use "$_pin" >/dev/null 2>&1 || true
    if [ "$(_harness_active_major)" = "$_pin" ]; then
      return 0
    fi
  fi

  # No version manager could satisfy the pin — fail fast, clearly.
  printf '%s\n' "harness git hook: Node version mismatch." >&2
  printf '%s\n' "  This repo pins Node ${_pin} (.nvmrc / package.json engines)," >&2
  printf '%s\n' "  but the active node is ${_active:-none}." >&2
  printf '%s\n' "  Native modules (better-sqlite3) are built for Node ${_pin} and will" >&2
  printf '%s\n' "  ABI-mismatch deep inside the gates. Activate the pin first, e.g.:" >&2
  printf '%s\n' "    mise use node@${_pin}          # or" >&2
  printf '%s\n' "    nvm install ${_pin} && nvm use ${_pin}" >&2
  printf '%s\n' "  then retry." >&2
  exit 1
}

_harness_ensure_node_pin
