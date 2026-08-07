/**
 * AUTHORITATIVE, evidence-based per-tool capability declarations.
 *
 * This is the single audit surface for "what can an agent do through the MCP
 * server?" — the data `harness mcp list-capabilities` reads. Each entry was
 * derived by reading the tool's handler and the core/graph function it calls,
 * grepping for concrete signals rather than guessing from the tool name:
 *   - `write`   — `writeFile*`, `mkdir`, config/state persistence, graph
 *                 ingest/upsert, lock files, generated artifacts.
 *   - `exec`    — `child_process` / `execFile*` / `execSync` / `spawn`,
 *                 shelling to git/lint/CLI, dispatching an agent runner.
 *   - `read`    — none of the above; observation only.
 *   - `network` — outbound `fetch`/HTTP: Gateway API, webhook registration,
 *                 external issue-tracker sync, PR comment posting.
 *
 * Because this is authored DATA compiled into the registry, the runtime reads
 * these declared values — it never scans source at runtime (the published CLI
 * ships no TypeScript). New tools MUST add an entry here; the coverage test in
 * `tests/commands/mcp-list-capabilities.test.ts` fails otherwise, and a missing
 * entry degrades gracefully to the name heuristic (see `tool-capabilities.ts`).
 *
 * Notable heuristic-vs-reality corrections captured below (why declared data
 * matters): `run_ci_checks` and `run_skill` LOOK like `exec` by name but run
 * in-process / just return SKILL.md (`read`); `run_code_review` reads in-process
 * but posts PR comments (`read` + network); `outcome_eval` reads a diff but
 * persists an execution_outcome graph node (`read`+`write`); `manage_roadmap`
 * syncs to GitHub (`write` + network).
 *
 * Keyed by the tool's registered `name` (matching `def.name` in the registry).
 */
import type { ToolCapabilityDeclaration } from './tool-types.js';

export const TOOL_CAPABILITY_DECLARATIONS: Readonly<Record<string, ToolCapabilityDeclaration>> = {
  // --- read-only: validation / analysis / graph queries / retrieval ---
  validate_project: { scopes: ['read'] },
  check_dependencies: { scopes: ['read'] },
  check_docs: { scopes: ['read'] },
  detect_entropy: { scopes: ['read'] },
  generate_linter: { scopes: ['read'] }, // returns config JSON; never writes to disk
  validate_linter_config: { scopes: ['read'] },
  list_personas: { scopes: ['read'] },
  create_self_review: { scopes: ['read'] }, // parseDiff(input) + returns a review; no fs write
  analyze_diff: { scopes: ['read'] },
  request_peer_review: { scopes: ['read'] }, // returns a review request; no fs write
  check_phase_gate: { scopes: ['read'] },
  validate_cross_check: { scopes: ['read'] },
  query_graph: { scopes: ['read'] },
  search_similar: { scopes: ['read'] },
  find_context_for: { scopes: ['read'] },
  get_relationships: { scopes: ['read'] },
  get_impact: { scopes: ['read'] },
  get_security_trends: { scopes: ['read'] },
  check_performance: { scopes: ['read'] },
  get_perf_baselines: { scopes: ['read'] },
  get_critical_paths: { scopes: ['read'] },
  list_streams: { scopes: ['read'] },
  gather_context: { scopes: ['read'] },
  canary_probe: { scopes: ['read'] },
  canary_recommend_framework: { scopes: ['read'] },
  canary_run_history: { scopes: ['read'] },
  canary_discover_test_command: { scopes: ['read'] },
  detect_anomalies: { scopes: ['read'] },
  ask_graph: { scopes: ['read'] },
  check_task_independence: { scopes: ['read'] },
  predict_conflicts: { scopes: ['read'] },
  plan_parallelization: { scopes: ['read'] },
  detect_stale_constraints: { scopes: ['read'] },
  search_skills: { scopes: ['read'] },
  code_outline: { scopes: ['read'] },
  code_search: { scopes: ['read'] },
  code_unfold: { scopes: ['read'] },
  get_decay_trends: { scopes: ['read'] },
  check_traceability: { scopes: ['read'] },
  predict_failures: { scopes: ['read'] },
  recommend_skills: { scopes: ['read'] },
  advise_skills: { scopes: ['read'] },
  compute_blast_radius: { scopes: ['read'] },
  compact: { scopes: ['read'] }, // in-process compaction of provided content; no fs write
  detect_constraint_emergence: { scopes: ['read'] },
  generate_blueprint: { scopes: ['read'] }, // returns blueprint JSON; never writes to disk
  run_ci_checks: { scopes: ['read'] }, // core runCIChecks runs all checks IN-PROCESS; no subprocess
  run_skill: { scopes: ['read'] }, // loads and RETURNS SKILL.md content; does not execute anything
  search_sessions: { scopes: ['read'] },
  summarize_session: { scopes: ['read'] },
  insights_summary: { scopes: ['read'] },
  audit_anatomy: { scopes: ['read'] },
  detect_drift: { scopes: ['read'] }, // reports only; explicitly never modifies source
  audit_brand: { scopes: ['read'] },
  naming_craft: { scopes: ['read'] },
  naming_craft_finalize: { scopes: ['read'] },
  spec_craft: { scopes: ['read'] },
  copy_craft: { scopes: ['read'] },
  test_craft: { scopes: ['read'] }, // emits telemetry only; critique is returned, not persisted
  knowledge_craft: { scopes: ['read'] },
  security_craft: { scopes: ['read'] }, // AST critique; "child_process" match was a rubric string
  docs_craft: { scopes: ['read'] },
  code_craft: { scopes: ['read'] }, // per-unit AST critique; returns findings, not persisted
  code_craft_finalize: { scopes: ['read'] },
  cli_ergonomics_craft: { scopes: ['read'] },
  cli_ergonomics_craft_finalize: { scopes: ['read'] },
  api_craft: { scopes: ['read'] }, // per-surface API critique; returns findings, not persisted
  api_craft_finalize: { scopes: ['read'] },
  acceptance_eval: { scopes: ['read'] }, // advisory verdict; not persisted
  validate_strategy: { scopes: ['read'] },
  read_strategy: { scopes: ['read'] },
  seed_pulse_from_strategy: { scopes: ['read'] }, // seedFromStrategy returns a seed; write_pulse_config persists

  // --- write: mutate files / config / state / graph / locks / artifacts ---
  init_project: { scopes: ['write'] }, // scaffolds project + persistToolingConfig
  generate_persona_artifacts: { scopes: ['write'] }, // generateAgentsMd / CIWorkflow / Runtime
  manage_state: { scopes: ['write'] }, // event-sourced state persistence
  create_skill: { scopes: ['write'] }, // generateSkillFiles
  generate_slash_commands: { scopes: ['write'] }, // writes command files (has dryRun preview)
  ingest_source: { scopes: ['write'] }, // fs.mkdir + graph ingest/write
  generate_agent_definitions: { scopes: ['write'] }, // writes agent defs (has dryRun preview)
  update_perf_baselines: { scopes: ['write'] }, // BaselineManager.save
  emit_interaction: { scopes: ['write'] }, // persists interaction/approval events
  edit_file: { scopes: ['write'] }, // surgical writeFile to a single file
  emit_skill_proposal: { scopes: ['write'] }, // createProposal writes .harness/proposals/
  align_design_system: { scopes: ['write'] }, // applies codemods + writes last-batch/handoff
  outcome_eval: { scopes: ['read', 'write'] }, // reads diff/tests; persists execution_outcome graph node
  uat_signoff: { scopes: ['read', 'write'] }, // loads graph; persists one human-signoff execution_outcome node
  run_design_pipeline: { scopes: ['read', 'write'] }, // detect (read) + align FIX writes codemods/handoff
  write_strategy: { scopes: ['write'] }, // writeStrategyDoc
  write_pulse_config: { scopes: ['write'] }, // core.writePulseConfig
  acquire_compound_lock: { scopes: ['write'] }, // writes on-disk lock
  release_compound_lock: { scopes: ['write'] }, // removes on-disk lock

  // --- exec: spawn a subprocess / shell out / dispatch an agent runner ---
  run_persona: { scopes: ['exec'] }, // execFileSync('npx', ['harness', <persona cmd>])
  run_agent_task: { scopes: ['write', 'exec'] }, // execFileSync npx harness agent run; agent mutates workspace
  add_component: { scopes: ['write', 'exec'] }, // execFileSync npx harness add; scaffolds files
  run_security_scan: { scopes: ['read', 'exec'] }, // scans + execSync('git rev-parse HEAD')
  assess_project: { scopes: ['read', 'exec'] }, // execFileSync lint runner
  review_changes: { scopes: ['read', 'exec'] }, // execFileSync('git', ['diff', ...])
  dispatch_skills: { scopes: ['read', 'exec'] }, // execSync git rev-parse/HEAD to compute diff-based dispatch
  design_craft: { scopes: ['read', 'exec'] }, // execSync(command) for BENCHMARK judging

  // --- network: outbound HTTP (Gateway / webhook / tracker / PR comments) ---
  trigger_maintenance_job: { scopes: ['exec'], network: true }, // Gateway API triggers a remote job
  list_gateway_tokens: { scopes: ['read'], network: true }, // Gateway API HTTP (reads, but remote)
  subscribe_webhook: { scopes: ['write'], network: true }, // registers webhook (outbound) + persists sub
  manage_roadmap: { scopes: ['write'], network: true }, // persistRoadmap + GitHub tracker fetch()/fullSync
  run_code_review: { scopes: ['read'], network: true }, // in-process review; posts PR comments to GitHub
};
