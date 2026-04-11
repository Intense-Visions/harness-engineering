# Environment Variable Risks

> Environment variables are visible in process listings, inherited by child processes,
> captured in crash dumps, and logged by every debugging tool -- they are the worst place
> to store secrets

## When to Use

- Evaluating how to pass secrets to applications at runtime
- Auditing existing applications that use environment variables for secrets
- Designing a safer alternative to `.env` files and environment variable injection
- Understanding why secrets leak in CI/CD pipelines and container orchestrators
- Migrating from env-var-based secrets to a vault or mounted-file approach

## Threat Context

The 12-factor app methodology (2011) recommended environment variables for configuration,
including secrets. This advice was reasonable for its time but has aged poorly.
Environment variables are exposed in: `/proc/<pid>/environ` on Linux (readable by
same-user processes), `docker inspect` output, Kubernetes pod descriptions
(`kubectl describe pod`), CI/CD build logs (many CI systems log env vars by default or on
error), crash dumps and core files, error reporting services (Sentry, Datadog, etc.
capture environment), child processes (env vars are inherited by all child processes,
including those you did not write). The 2021 Codecov supply chain attack exfiltrated
secrets by reading environment variables from thousands of CI/CD pipelines. The modified
Bash Uploader script silently sent every environment variable to an attacker-controlled
server, compromising CI tokens, AWS keys, and database credentials across the software
industry.

## Instructions

1. **Understand the leakage surface.** Environment variables are: visible to any process
   running as the same user via `/proc/<pid>/environ`, inherited by all child processes
   and subshells, captured in core dumps, logged by many frameworks in debug mode, exposed
   in container inspection commands, and often included in error reports sent to
   third-party services. Every layer of the stack is a potential leak point. A single
   `console.log(process.env)` in a debugging session, a stack trace in Sentry, or a
   `docker inspect` command exposes every secret in the process environment.

2. **Prefer mounted files over environment variables.** Instead of
   `DATABASE_URL=postgres://user:pass@host/db`, mount a file at
   `/var/secrets/database-url` and read it at startup. Files can have restricted
   permissions (0400, owned by the application user), are not inherited by child
   processes, do not appear in process listings, and are not captured in crash dumps.
   Kubernetes Secrets can be mounted as files. Vault Agent writes secrets to files in a
   tmpfs mount (in-memory filesystem, never touches disk).

3. **If you must use env vars, limit exposure.** Read the env var once at startup, store
   it in application memory, and unset the env var immediately
   (`delete process.env.DATABASE_URL` in Node.js, `os.environ.pop('DATABASE_URL')` in
   Python). This limits the window during which the secret is visible in `/proc/environ`.
   However, this does not prevent inheritance by child processes started during the window,
   and the string may persist in the process heap even after unsetting.

4. **Audit CI/CD for env var logging.** Many CI systems (GitHub Actions, GitLab CI,
   CircleCI) mask secrets in logs but only if the secrets are registered as secret
   variables. Unregistered env vars containing secrets are logged in plaintext on every
   build. Audit all env vars in CI/CD for secrets that should be registered as
   masked/secret variables. Use CI secret scanning tools (gitleaks, truffleHog) on CI
   logs to detect accidental exposure.

5. **Use runtime secret injection.** Instead of setting env vars in Dockerfiles or
   docker-compose files (which bakes them into images or version-controlled files), inject
   secrets at runtime via: Kubernetes Secrets mounted as files, Vault Agent sidecar, cloud
   provider secret injection (AWS Secrets Manager + ECS task definitions, GCP Secret
   Manager + Cloud Run), or init containers that fetch secrets and write them to shared
   volumes. The secret should never exist in a layer that is persisted or version
   controlled.

6. **Never put secrets in Dockerfiles or docker-compose.yml.** `ENV DATABASE_PASSWORD=hunter2`
   in a Dockerfile bakes the secret into every image layer. Docker layer caching means
   the secret persists even if you delete it in a later layer (`RUN unset` does not remove
   it from the layer that set it). Use multi-stage builds with the `--secret` flag
   (BuildKit) or runtime injection. Similarly, `docker-compose.yml` with inline
   environment values is version-controlled -- secrets in it are secrets in git.

## Details

### Leakage Vector Inventory

Every path through which environment variables can leak:

- `/proc/<pid>/environ` -- readable by any process running as the same user on Linux
- `ps e` command -- shows environment of running processes
- `docker inspect <container>` -- displays all env vars in the container config
- `kubectl describe pod` -- shows env vars defined in the pod spec
- `heroku config` -- displays all config vars in plaintext
- CI/CD build logs -- many systems echo env vars on failure or in debug mode
- Crash dumps and core files -- include the full process environment
- Error reporting services -- Sentry, Bugsnag, Datadog APM capture environment
- Child process inheritance -- every spawned subprocess inherits all env vars
- Shell history -- if secrets are set via `export SECRET=value` on command line
- `.env` files committed to git -- even with `.gitignore`, mistakes happen
- Docker image layers -- `ENV` instructions are baked into the image
- Terraform state files -- store plaintext values of env vars set via `TF_VAR_*`

### Safer Alternatives Comparison

| Method                | Leakage Risk | Rotation Support | Audit Trail | Complexity |
| --------------------- | ------------ | ---------------- | ----------- | ---------- |
| Environment variables | High         | Manual           | None        | Low        |
| Mounted files (tmpfs) | Low          | Manual/Auto      | OS-level    | Low        |
| Vault Agent injection | Low          | Automatic        | Full        | Medium     |
| K8s CSI Secret Store  | Low          | Auto-sync        | K8s audit   | Medium     |
| SOPS-encrypted files  | Medium       | Manual           | Git history | Low        |
| Runtime API fetch     | Low          | Automatic        | Full        | Medium     |

### The Codecov Attack Case Study

In January 2021, attackers modified Codecov's Bash Uploader script (used in CI/CD
pipelines across the industry) to exfiltrate all environment variables to an
attacker-controlled server. The attack persisted for two months before discovery. It
worked because CI pipelines routinely have dozens of secrets in environment variables --
AWS keys, database credentials, API tokens, signing keys -- and any script with process
access can read them all. Affected organizations included Twitch, Hashicorp, Confluent,
and hundreds of others.

### 12-Factor App Reinterpretation

The 12-factor app's "store config in environment" principle was about separating config
from code, not about security. The spirit of the principle (externalize configuration)
can be achieved more securely with mounted files, secret managers, or runtime injection.
The letter of the principle (use env vars specifically) has known security limitations
that its authors did not anticipate in 2011. Modern best practice: use env vars for
non-secret configuration (feature flags, log levels, service URLs) and mounted files or
vault injection for secrets.

## Anti-Patterns

1. **`.env` files committed to version control.** Even with `.gitignore`, `.env` files
   end up in git history through mistakes. Once committed, the secrets are in every clone
   forever (until the repository is purged with BFG or git-filter-branch). Use
   `.env.example` with placeholder values; actual `.env` files must never be committed.

2. **Secrets in Docker Compose files.** `docker-compose.yml` is version-controlled.
   Secrets in it are secrets in git. Use `docker-compose.yml` with `env_file` pointing to
   a file not in version control, or use Docker secrets for swarm mode deployments.

3. **CI/CD secrets as unmasked env vars.** If a CI secret is not registered as a masked
   variable, any `printenv` or debug log step exposes it in plaintext build logs that may
   be retained for months. Audit all CI/CD env vars and register secrets as masked/secret
   variables in the CI system's secret management.

4. **Trusting `unset` to remove secrets.** Unsetting an env var removes it from the
   process environment listing but does not scrub it from memory (the string may persist
   in the heap until garbage collected or overwritten). It also does not affect child
   processes that already inherited the variable before the unset.

5. **Using the same env var across all environments.** `DATABASE_URL` set to the
   production database URL in development environments means a development machine
   compromise leaks production credentials. Use environment-specific secret injection with
   separate credentials per environment. Development should use development-only
   credentials that cannot access production data.
