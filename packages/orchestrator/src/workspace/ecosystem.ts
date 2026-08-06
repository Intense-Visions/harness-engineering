import * as fs from 'node:fs';

/**
 * Language-aware workspace ecosystem detector.
 *
 * The local enforced gate (the mechanical verify that BLOCKS a dispatch) and the
 * workspace bootstrap step were both JS/pnpm-baked: verify shelled out to
 * `pnpm -w run …` unconditionally. For any non-JS workspace (Python, Rust, Go,
 * Ruby, Java, …) that fails ENVIRONMENTALLY — pnpm is absent or there is no
 * package.json — so the gate blocks every dispatch for a reason that has nothing
 * to do with the change under test.
 *
 * This module is the single, language-agnostic source of truth: given a
 * workspace it detects the ecosystem from the lockfiles/manifests present and
 * returns BOTH the dependency-install command (what a matching `hooks.afterCreate`
 * should scaffold) AND the ordered verify command set (what the enforced gate
 * should run). It hardcodes no package manager in orchestrator control flow — the
 * commands live in one declarative table here and every choice remains overridable
 * via config.
 *
 * The core matcher is PURE: it takes the set of filenames present at the workspace
 * root and returns a descriptor. A thin filesystem wrapper does the single
 * directory read and delegates, so the matching logic is unit-testable without
 * touching disk.
 */

export type EcosystemId =
  | 'node-pnpm'
  | 'node-npm'
  | 'node-yarn'
  | 'python-uv'
  | 'python-poetry'
  | 'python-pipenv'
  | 'python-pip'
  | 'rust-cargo'
  | 'go'
  | 'ruby-bundler'
  | 'java-maven'
  | 'java-gradle';

export interface Ecosystem {
  /** Stable identifier — language family + package manager / toolchain. */
  id: EcosystemId;
  /** Human-readable language family (node / python / rust / go / ruby / java). */
  language: string;
  /** Package manager or build tool (pnpm, npm, yarn, uv, poetry, cargo, go, …). */
  packageManager: string;
  /**
   * Command that installs the workspace's dependencies from a clean checkout —
   * the value a matching `hooks.afterCreate` should scaffold so the agent's fresh
   * worktree is not missing its deps when the gate runs.
   */
  installCommand: string;
  /**
   * Ordered mechanical verify steps (the ecosystem's build / typecheck / lint /
   * test analogues). The gate runs them in order and short-circuits on the first
   * failure. Each entry is a whole command line split on whitespace at execution
   * time — no shell is involved, so nothing here may rely on shell features.
   * Kept to each toolchain's ALWAYS-PRESENT commands (e.g. `go vet`, `cargo test`)
   * rather than optional add-ons (mypy, ruff, clippy) so a stock checkout does not
   * red the gate on a merely-missing linter; adopters add those via config.
   */
  verifyCommands: readonly string[];
}

/**
 * One detector rule: if ANY of `markers` is present at the workspace root, the
 * workspace IS `ecosystem`. Rules are evaluated in array order and the FIRST
 * match wins, so the array order encodes the detection priority.
 */
interface EcosystemRule {
  markers: readonly string[];
  ecosystem: Ecosystem;
}

/**
 * Detection rules in deterministic priority order (first match wins).
 *
 * Node is checked before every other family: the harness's own default is JS and
 * a polyglot repo that carries a `package.json` for tooling should still bootstrap
 * as node unless it is unambiguously another ecosystem. Within a family the more
 * specific lockfile precedes the looser manifest (e.g. `uv.lock` before
 * `poetry.lock` before a bare `pyproject.toml`) so a lockfile always pins the
 * package manager it belongs to. Every entry stays overridable via config.
 */
export const ECOSYSTEM_RULES: readonly EcosystemRule[] = [
  {
    markers: ['pnpm-lock.yaml'],
    ecosystem: {
      id: 'node-pnpm',
      language: 'node',
      packageManager: 'pnpm',
      installCommand: 'pnpm install',
      verifyCommands: ['pnpm -w run typecheck', 'pnpm -w run lint', 'pnpm -w run test'],
    },
  },
  {
    markers: ['package-lock.json', 'npm-shrinkwrap.json'],
    ecosystem: {
      id: 'node-npm',
      language: 'node',
      packageManager: 'npm',
      installCommand: 'npm install',
      verifyCommands: ['npm run typecheck', 'npm run lint', 'npm run test'],
    },
  },
  {
    markers: ['yarn.lock'],
    ecosystem: {
      id: 'node-yarn',
      language: 'node',
      packageManager: 'yarn',
      installCommand: 'yarn install',
      verifyCommands: ['yarn run typecheck', 'yarn run lint', 'yarn run test'],
    },
  },
  {
    // Bare manifest, no lockfile → default the node package manager to npm (the
    // one every Node install ships with).
    markers: ['package.json'],
    ecosystem: {
      id: 'node-npm',
      language: 'node',
      packageManager: 'npm',
      installCommand: 'npm install',
      verifyCommands: ['npm run typecheck', 'npm run lint', 'npm run test'],
    },
  },
  {
    markers: ['uv.lock'],
    ecosystem: {
      id: 'python-uv',
      language: 'python',
      packageManager: 'uv',
      installCommand: 'uv sync',
      verifyCommands: ['uv run pytest'],
    },
  },
  {
    markers: ['poetry.lock'],
    ecosystem: {
      id: 'python-poetry',
      language: 'python',
      packageManager: 'poetry',
      installCommand: 'poetry install',
      verifyCommands: ['poetry run pytest'],
    },
  },
  {
    markers: ['Pipfile.lock', 'Pipfile'],
    ecosystem: {
      id: 'python-pipenv',
      language: 'python',
      packageManager: 'pipenv',
      installCommand: 'pipenv install --dev',
      verifyCommands: ['pipenv run pytest'],
    },
  },
  {
    markers: ['requirements.txt'],
    ecosystem: {
      id: 'python-pip',
      language: 'python',
      packageManager: 'pip',
      installCommand: 'pip install -r requirements.txt',
      verifyCommands: ['pytest'],
    },
  },
  {
    // A `pyproject.toml` with no lockfile above → an editable install of the
    // project itself is the closest package-manager-agnostic bootstrap.
    markers: ['pyproject.toml'],
    ecosystem: {
      id: 'python-pip',
      language: 'python',
      packageManager: 'pip',
      installCommand: 'pip install .',
      verifyCommands: ['pytest'],
    },
  },
  {
    markers: ['Cargo.lock', 'Cargo.toml'],
    ecosystem: {
      id: 'rust-cargo',
      language: 'rust',
      packageManager: 'cargo',
      installCommand: 'cargo fetch',
      verifyCommands: ['cargo build', 'cargo test'],
    },
  },
  {
    markers: ['go.sum', 'go.mod'],
    ecosystem: {
      id: 'go',
      language: 'go',
      packageManager: 'go',
      installCommand: 'go mod download',
      verifyCommands: ['go build ./...', 'go vet ./...', 'go test ./...'],
    },
  },
  {
    markers: ['Gemfile.lock', 'Gemfile'],
    ecosystem: {
      id: 'ruby-bundler',
      language: 'ruby',
      packageManager: 'bundler',
      installCommand: 'bundle install',
      verifyCommands: ['bundle exec rake'],
    },
  },
  {
    markers: ['pom.xml'],
    ecosystem: {
      id: 'java-maven',
      language: 'java',
      packageManager: 'maven',
      installCommand: 'mvn --batch-mode dependency:go-offline',
      verifyCommands: ['mvn --batch-mode test'],
    },
  },
  {
    markers: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    ecosystem: {
      id: 'java-gradle',
      language: 'java',
      packageManager: 'gradle',
      installCommand: './gradlew dependencies',
      verifyCommands: ['./gradlew test'],
    },
  },
];

/**
 * PURE core: pick the ecosystem for a workspace from the set of filenames present
 * at its root. Returns the FIRST rule (in {@link ECOSYSTEM_RULES} priority order)
 * for which any marker is present, or `null` when nothing is recognized. Never
 * touches the filesystem, so it is fully unit-testable.
 */
export function detectEcosystemFromFiles(files: Iterable<string>): Ecosystem | null {
  const present = files instanceof Set ? files : new Set(files);
  for (const rule of ECOSYSTEM_RULES) {
    if (rule.markers.some((marker) => present.has(marker))) {
      return rule.ecosystem;
    }
  }
  return null;
}

/**
 * Filesystem wrapper around {@link detectEcosystemFromFiles}: read the workspace
 * root's directory entries ONCE and delegate to the pure matcher. Returns `null`
 * when the directory cannot be read (a missing/uninitialized workspace has no
 * detectable ecosystem) so callers degrade gracefully rather than throwing.
 */
export function detectEcosystem(workspacePath: string): Ecosystem | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(workspacePath);
  } catch {
    return null;
  }
  return detectEcosystemFromFiles(entries);
}
