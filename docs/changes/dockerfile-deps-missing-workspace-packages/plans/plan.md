# Remediation plan: Dockerfile deps stage missing workspace packages

## Symptom

The `Release` workflow on `main` is red. The npm `release` job succeeds, but all
four `docker / build-and-push` matrix jobs fail. The build dies during the
`build` stage of the multi-stage `Dockerfile` when `pnpm build` (turbo) runs:

```
@harness-engineering/burn: node_modules missing
```

Failing run for reference:
https://github.com/Intense-Visions/harness-engineering/actions/runs/31980109793

## Root cause

The repo-root `Dockerfile` `deps` stage provisions per-package `node_modules` by
copying each workspace package's `package.json` before `pnpm install
--frozen-lockfile`. That manifest was stale: it listed only 9 of the 12
workspace packages.

`pnpm-workspace.yaml` globs `packages/*`, which now resolves to 12 packages:
`burn`, `cli`, `core`, `dashboard`, `eslint-plugin`, `graph`, `intelligence`,
`linter-gen`, `local-models`, `orchestrator`, `signals`, `types`.

Three packages — `burn`, `local-models`, `signals` — were absent from the
Dockerfile `COPY packages/<name>/package.json` block. Their `node_modules` were
therefore never provisioned inside the image, so the later `pnpm build` (turbo)
fails on the first missing dependency (`@harness-engineering/burn`).

This is purely a Docker build-context manifest drift; the npm `release` job is
unaffected because it does not use the Dockerfile.

## Fix (approach A — human-approved)

Add the three missing per-package COPY lines to the `deps` stage of the root
`Dockerfile`, placed in the existing alphabetical order alongside the other
per-package COPY lines:

```
COPY packages/burn/package.json packages/burn/
COPY packages/local-models/package.json packages/local-models/
COPY packages/signals/package.json packages/signals/
```

- `burn` inserted before `cli`.
- `local-models` inserted between `linter-gen` and `orchestrator`.
- `signals` inserted between `orchestrator` and `types`.

No other change is made to the Dockerfile or anywhere else. The `ssh2` gyp
warning in the build log is a known non-fatal red herring and is intentionally
left untouched, as are the node/python base layers.

## Verification

- Static: the `deps` stage now COPYs a `package.json` for all 12 packages
  matched by `pnpm-workspace.yaml`'s `packages/*` glob (confirmed each of the
  three dirs has a real `package.json`).
- CI: the pushed branch's `Release` / `CI` checks run on current `main`; the
  four `docker / build-and-push` jobs are expected to go green now that
  `pnpm install --frozen-lockfile` provisions `node_modules` for `burn`,
  `local-models`, and `signals` before `pnpm build`.
- No local `docker build` was attempted (no daemon assumed); remote CI is the
  source of truth for green.

## Remediation actions / assumptions

- Actions: edited `Dockerfile` deps stage (+3 lines); added this plan artifact;
  added a patch changeset documenting the Docker fix.
- Assumptions: the `pnpm-lock.yaml` already contains resolutions for the three
  packages (they are committed workspace members), so `--frozen-lockfile` will
  not need regeneration. The only gap was the image build context, not the
  lockfile.
- Scope discipline: no changes to node/python/ssh2 lines or any non-Dockerfile
  source; single-purpose remediation.
