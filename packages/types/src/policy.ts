import { z } from 'zod';

/**
 * Per-call governance envelope describing the policy under which an agent
 * subprocess is spawned. Stamped into the append-only governance audit trail
 * (`.harness/audit.log`) so every agent dispatch carries a durable record of
 * the isolation posture it ran with. NONE of these fields are secrets — they
 * describe posture, never payloads or credentials.
 */

/**
 * How the spawned agent treats permission prompts.
 * - `bypass`  — permission prompts skipped (the agent acts without confirmation).
 * - `auto`    — non-destructive actions auto-approved, destructive ones prompt.
 * - `prompt`  — every action requires confirmation.
 * - `plan`    — read-only planning mode; no mutations.
 */
export const PolicyApprovalModeSchema = z.enum(['bypass', 'auto', 'prompt', 'plan']);
export type PolicyApprovalMode = z.infer<typeof PolicyApprovalModeSchema>;

/**
 * Process-isolation applied around the subprocess.
 * - `none`       — spawned directly on the host.
 * - `docker`     — wrapped in a container (ContainerBackend).
 * - `serverless` — dispatched to an ephemeral serverless runtime.
 */
export const PolicySandboxModeSchema = z.enum(['none', 'docker', 'serverless']);
export type PolicySandboxMode = z.infer<typeof PolicySandboxModeSchema>;

/**
 * Network egress posture of the subprocess.
 * - `unrestricted` — full outbound access (needed for cloud provider APIs).
 * - `restricted`   — egress limited by the sandbox to an allowlist.
 * - `none`         — no outbound network (fully air-gapped).
 */
export const PolicyNetworkModeSchema = z.enum(['unrestricted', 'restricted', 'none']);
export type PolicyNetworkMode = z.infer<typeof PolicyNetworkModeSchema>;

/**
 * The policy envelope for a single agent dispatch. `dangerousFlags` records the
 * elevated/permission-bypassing CLI flags the subprocess was launched with (the
 * governance-relevant subset of argv, never the full prompt/payload).
 */
export const PolicyMetadataSchema = z.object({
  approvalMode: PolicyApprovalModeSchema,
  sandboxMode: PolicySandboxModeSchema,
  networkMode: PolicyNetworkModeSchema,
  /** Elevated flags the subprocess was spawned with (e.g. permission bypass). */
  dangerousFlags: z.array(z.string()),
  /** Agent family, e.g. `claude`, `codex`, `gemini`. */
  agentFamily: z.string(),
  /** Best-effort agent/CLI version, or `unknown` when not detected. */
  agentVersion: z.string(),
});
export type PolicyMetadata = z.infer<typeof PolicyMetadataSchema>;

/**
 * Append-only JSONL governance record for a single agent subprocess dispatch,
 * written to the same `.harness/audit.log` as {@link AuthAuditEntry}. Kept as a
 * distinct record (discriminated by `event`) because an agent dispatch and an
 * HTTP request carry disjoint required fields.
 *
 * Forbidden by design: NO prompt, NO payload, NO env VALUES. `strippedEnvKeys`
 * records only the NAMES of parent-env vars withheld from the subprocess so the
 * air-gap is auditable without ever logging a secret.
 */
export const PolicyAuditEntrySchema = z.object({
  timestamp: z.string().datetime(),
  event: z.literal('agent_dispatch'),
  sessionId: z.string(),
  /** Workspace path (a directory path, not a payload) the agent ran in. */
  workspacePath: z.string().optional(),
  policy: PolicyMetadataSchema,
  /** Count of parent-env vars withheld from the subprocess. */
  strippedEnvKeyCount: z.number().int().nonnegative(),
  /** NAMES only of withheld env vars — never their values. */
  strippedEnvKeys: z.array(z.string()),
  /**
   * `true` when the env allowlist was actually applied (secrets stripped);
   * `false` in advisory passthrough mode (nothing stripped, names logged only).
   */
  enforced: z.boolean(),
});
export type PolicyAuditEntry = z.infer<typeof PolicyAuditEntrySchema>;
