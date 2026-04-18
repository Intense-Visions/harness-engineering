# Plan: Docker CI Workflow

**Date:** 2026-04-17 | **Spec:** docs/changes/docker-containerization/proposal.md (Phase 3) | **Tasks:** 1 | **Time:** ~5 min

## Goal

When a git tag matching `v*` is pushed, a GitHub Actions workflow builds all 4 Docker image targets and pushes them to ghcr.io with semver tags.

## Observable Truths (Acceptance Criteria)

1. `.github/workflows/docker.yml` exists and contains a valid GitHub Actions workflow definition
2. When tag `v1.24.3` is pushed, the workflow triggers and builds targets `cli`, `mcp-server`, `orchestrator`, `dashboard` via matrix strategy
3. Each image is pushed to `ghcr.io/intense-visions/harness-{target}` with tags `1.24.3`, `1.24`, `1`, `latest`
4. Docker layer caching uses GitHub Actions cache (`type=gha`)
5. The workflow uses `docker/build-push-action` with BuildKit via `docker/setup-buildx-action`
6. The workflow authenticates to ghcr.io using `GITHUB_TOKEN` with `packages: write` permission

## File Map

- CREATE `.github/workflows/docker.yml`

## Tasks

### Task 1: Create Docker CI workflow

**Depends on:** none | **Files:** `.github/workflows/docker.yml`

1. Create `.github/workflows/docker.yml` with the following exact content:

```yaml
name: Docker

on:
  push:
    tags: ['v*']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - target: cli
            image: ghcr.io/intense-visions/harness-cli
          - target: mcp-server
            image: ghcr.io/intense-visions/harness-mcp
          - target: orchestrator
            image: ghcr.io/intense-visions/harness-orchestrator
          - target: dashboard
            image: ghcr.io/intense-visions/harness-dashboard

    steps:
      - uses: actions/checkout@v6

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract version from tag
        id: version
        run: |
          TAG="${GITHUB_REF#refs/tags/v}"
          MAJOR="${TAG%%.*}"
          MINOR="${TAG%.*}"
          echo "full=${TAG}" >> "$GITHUB_OUTPUT"
          echo "minor=${MINOR}" >> "$GITHUB_OUTPUT"
          echo "major=${MAJOR}" >> "$GITHUB_OUTPUT"

      - uses: docker/build-push-action@v6
        with:
          context: .
          target: ${{ matrix.target }}
          push: true
          tags: |
            ${{ matrix.image }}:${{ steps.version.outputs.full }}
            ${{ matrix.image }}:${{ steps.version.outputs.minor }}
            ${{ matrix.image }}:${{ steps.version.outputs.major }}
            ${{ matrix.image }}:latest
          cache-from: type=gha,scope=${{ matrix.target }}
          cache-to: type=gha,mode=max,scope=${{ matrix.target }}
```

2. Validate the YAML syntax:

   ```
   python3 -c "import yaml; yaml.safe_load(open('.github/workflows/docker.yml'))"
   ```

3. Run: `harness validate`

4. Commit: `feat(docker): add CI workflow to build and push images on tag`

### Design Notes

**Convention alignment with existing workflows:**

- `actions/checkout@v6` matches `release.yml` and `harness.yml` (the newer workflows)
- `concurrency` block follows the same pattern as `ci.yml` and `harness.yml`
- `cancel-in-progress: false` because release builds should not be cancelled mid-push
- `fail-fast: false` so all images attempt to build even if one fails

**Tagging logic:**

- Tag `v1.24.3` produces version parts: `full=1.24.3`, `minor=1.24`, `major=1`
- Each image gets 4 tags: `1.24.3`, `1.24`, `1`, `latest`
- Uses shell parameter expansion (POSIX-compatible, no external tools needed)

**Caching:**

- `type=gha` uses GitHub Actions built-in cache backend
- `scope=${{ matrix.target }}` isolates cache per target so they do not collide
- `mode=max` exports all layers (not just final) for maximum cache hits

**Matrix vs. docker/metadata-action:**

- The spec calls for `docker/build-push-action` with matrix strategy (not `docker/metadata-action`)
- Manual tag extraction is simpler and more transparent than metadata-action for this use case
