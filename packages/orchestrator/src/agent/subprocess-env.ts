// packages/orchestrator/src/agent/subprocess-env.ts
//
// Subprocess air-gap: build an ALLOWLISTED environment for a spawned agent CLI
// instead of handing it the FULL parent `process.env`. Historically the claude/
// codex backends spawned with `env: process.env`, leaking every secret the
// orchestrator process happened to hold (DATABASE_URL, STRIPE_SECRET_KEY,
// NPM_TOKEN, internal service creds, …) into a subprocess that has no business
// seeing them.
//
// The goal is NOT to lock the subprocess down to nothing — agents legitimately
// need PATH/HOME/SHELL/locale/TLS/proxy vars, provider credentials
// (ANTHROPIC_API_KEY and friends), and the HARNESS_*/session vars the runtime
// sets. The goal is to DROP arbitrary unrelated secrets. So the allowlist is a
// conservative-but-permissive base set plus well-known provider/tooling
// prefixes, and it is extensible at three levels (constructor option, an env
// escape hatch, and an operator passthrough kill-switch) so a surprising flow
// can always be un-broken without a code change.
//
// This mirrors the `analysis-env.ts` pattern (pure functions over env) and is
// reused by any backend that spawns an agent CLI.

/**
 * Exact env var names always forwarded to an agent subprocess. These are the
 * "runtime plumbing" vars a CLI, git, node, and the OS need to function — none
 * are secrets in the credential sense, and withholding them breaks spawning.
 */
const SUBPROCESS_ENV_ALLOWLIST: readonly string[] = [
  // OS / shell / user identity
  'PATH',
  'HOME',
  'SHELL',
  'USER',
  'LOGNAME',
  'TERM',
  'TZ',
  'PWD',
  'OLDPWD',
  'HOSTNAME',
  'DISPLAY',
  'LANG',
  'LANGUAGE',
  // Temp dirs
  'TMPDIR',
  'TMP',
  'TEMP',
  // TLS / CA trust (needed for HTTPS to provider APIs behind custom CAs)
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'CURL_CA_BUNDLE',
  'REQUESTS_CA_BUNDLE',
  // Node / nvm runtime (Node 22 via nvm is a hard requirement here)
  'NODE_OPTIONS',
  'NODE_PATH',
  'NVM_DIR',
  'NVM_BIN',
  'NVM_INC',
  // Corporate proxy (both canonical casings)
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  // SSH agent (git push over ssh)
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  // Terminal color / CI hints
  'COLORTERM',
  'FORCE_COLOR',
  'NO_COLOR',
  'CI',
  // Windows OS plumbing. Windows processes (including node.exe itself) FAIL to
  // initialize without these — most critically SystemRoot (ntdll/crypto) and
  // PATHEXT/COMSPEC (executable resolution). Withholding them doesn't just hide
  // a var, it makes every subprocess spawn crash or hang on Windows. Listed in
  // their canonical Windows casing; matching is case-insensitive (see
  // isEnvKeyAllowed) so the OS's actual casing (`Path`, `Temp`, …) resolves too.
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_ARCHITEW6432',
  'PROCESSOR_IDENTIFIER',
  'PROCESSOR_LEVEL',
  'PROCESSOR_REVISION',
  'OS',
  'USERPROFILE',
  'USERNAME',
  'USERDOMAIN',
  'USERDOMAIN_ROAMINGPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'ALLUSERSPROFILE',
  'PUBLIC',
  'SESSIONNAME',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'COMMONPROGRAMFILES',
  'COMMONPROGRAMFILES(X86)',
  'COMMONPROGRAMW6432',
];

/**
 * Prefixes: any env var whose name starts with one of these passes through.
 * Covers locale (`LC_*`), XDG dirs, the harness runtime + session vars
 * (`HARNESS_*`), the agent CLIs' own config (`CLAUDE_*`), git tooling
 * (`GIT_*`, `GH_*`, `GITHUB_*` — the agent opens PRs), and the well-known
 * cloud model providers' credential/config namespaces.
 *
 * Provider prefixes DO admit secrets (e.g. `AWS_SECRET_ACCESS_KEY` for Bedrock,
 * `GOOGLE_APPLICATION_CREDENTIALS` for Vertex) — that is intentional: those are
 * the creds the agent needs to reach its model. The win is that non-provider
 * secrets (which match no prefix) are dropped.
 */
const SUBPROCESS_ENV_ALLOWED_PREFIXES: readonly string[] = [
  'LC_',
  'XDG_',
  'GIT_',
  'GH_',
  'GITHUB_',
  'HARNESS_',
  'CLAUDE_',
  'ANTHROPIC_',
  'AWS_',
  'AZURE_',
  'GOOGLE_',
  'GEMINI_',
  'VERTEX_',
  'BEDROCK_',
  'OPENAI_',
  'GROQ_',
  'MISTRAL_',
  'COHERE_',
  'OLLAMA_',
  'DEEPSEEK_',
  'XAI_',
  'TOGETHER_',
  'FIREWORKS_',
  'PERPLEXITY_',
];

/**
 * Suffix rule: forward any var whose name ends with `_API_KEY`. This admits
 * provider keys for backends not enumerated above (e.g. a future
 * `SOMEPROVIDER_API_KEY`) without widening the prefix list, while still
 * dropping non-key secrets from unknown namespaces.
 */
const API_KEY_SUFFIX = '_API_KEY';

/** Comma/space-separated extra allow names an operator can inject at runtime. */
export const SUBPROCESS_ENV_ALLOW_VAR = 'HARNESS_SUBPROCESS_ENV_ALLOW';

/**
 * Kill-switch. When truthy, NOTHING is stripped (advisory mode): the full parent
 * env passes through and callers still learn which names WOULD have been
 * withheld, so the audit trail stays honest while an operator diagnoses a
 * broken flow. Default (unset) = enforce.
 */
export const SUBPROCESS_ENV_PASSTHROUGH_VAR = 'HARNESS_SUBPROCESS_ENV_UNSAFE_PASSTHROUGH';

export interface BuildSubprocessEnvOptions {
  /** Extra exact var names to allow (merged with the built-in allowlist). */
  extraAllow?: readonly string[];
  /**
   * When true, do not strip — pass the full env through but still report the
   * names that WOULD be stripped. Defaults to the value of
   * {@link SUBPROCESS_ENV_PASSTHROUGH_VAR} in `source`.
   */
  passthrough?: boolean;
}

export interface SubprocessEnvResult {
  /** The env to hand to `spawn` (undefined values dropped). */
  env: Record<string, string>;
  /** Names of parent-env vars withheld from the subprocess (never values). */
  stripped: string[];
  /** `false` when passthrough/advisory mode left the env untouched. */
  enforced: boolean;
}

function isTruthyFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function parseAllowList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Precomputed uppercase forms for case-insensitive matching. Windows env var
// names are case-insensitive and the OS supplies them in mixed case (`Path`,
// `SystemRoot`, `Temp`), so an exact case-sensitive check would strip even PATH
// on Windows and break every spawn. Normalizing to uppercase makes the allowlist
// resolve identically on every platform; the small extra permissiveness on
// POSIX (a var literally named `path`) only ever admits OS-plumbing names, never
// a credential the rules didn't already admit via prefix/suffix.
const ALLOWLIST_UPPER: ReadonlySet<string> = new Set(
  SUBPROCESS_ENV_ALLOWLIST.map((n) => n.toUpperCase())
);
const ALLOWED_PREFIXES_UPPER: readonly string[] = SUBPROCESS_ENV_ALLOWED_PREFIXES.map((p) =>
  p.toUpperCase()
);

/** Is `name` permitted through the air-gap given the merged allow set? */
export function isEnvKeyAllowed(name: string, extraAllow: ReadonlySet<string>): boolean {
  const upper = name.toUpperCase();
  if (extraAllow.has(name)) return true;
  for (const e of extraAllow) {
    if (e.toUpperCase() === upper) return true;
  }
  if (ALLOWLIST_UPPER.has(upper)) return true;
  if (upper.endsWith(API_KEY_SUFFIX)) return true;
  return ALLOWED_PREFIXES_UPPER.some((prefix) => upper.startsWith(prefix));
}

/**
 * Build the allowlisted subprocess environment from `source` (defaults to
 * `process.env`). Returns the env to spawn with, the names of everything
 * withheld, and whether stripping was actually enforced.
 *
 * Pure: no mutation of `source`, no I/O.
 */
export function buildSubprocessEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: BuildSubprocessEnvOptions = {}
): SubprocessEnvResult {
  const extra = new Set<string>([
    ...(options.extraAllow ?? []),
    ...parseAllowList(source[SUBPROCESS_ENV_ALLOW_VAR]),
  ]);
  const passthrough = options.passthrough ?? isTruthyFlag(source[SUBPROCESS_ENV_PASSTHROUGH_VAR]);

  const env: Record<string, string> = {};
  const stripped: string[] = [];

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const allowed = isEnvKeyAllowed(key, extra);
    if (allowed || passthrough) {
      env[key] = value;
    }
    if (!allowed) {
      stripped.push(key);
    }
  }

  stripped.sort();
  return { env, stripped, enforced: !passthrough };
}
