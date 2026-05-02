# Deep-Dive Report: Awesome Claude Code Resources

**Date:** 2026-03-29/30
**Status:** 7 of 8 deep-dives completed (pattern inspiration agent hit rate limit)

---

## 1. parry — Prompt Injection Scanner

**Repo:** https://github.com/vaporif/parry
**Language:** Rust (7 crates)
**License:** MIT

### Architecture: 6-Layer Defense-in-Depth

| Layer                  | Technique                                                             | Speed |
| ---------------------- | --------------------------------------------------------------------- | ----- |
| 1. Unicode Analysis    | Invisible chars, homoglyphs, RTL overrides                            | <1ms  |
| 2. Substring Matching  | Aho-Corasick, ~80 phrases in 10 languages                             | <1ms  |
| 3. Encoding Decode     | Recursive (3 layers): base64, hex, URL, HTML, ROT13 + Shannon entropy | <5ms  |
| 4. Secret Detection    | RegexSet, 40+ patterns (AWS, GitHub, Stripe, JWT, etc.)               | <1ms  |
| 5. AST Exfil Detection | tree-sitter bash parser, pipeline/cmdsub/procsub analysis             | <5ms  |
| 6. ML Classification   | DeBERTa v3 small (ONNX ~10ms), optional Llama Prompt Guard 2 ensemble | ~10ms |

### Key Design Decisions

- **Fail-closed**: ML scan failure → block the tool
- **Taint model**: Confirmed injection in PostToolUse → `.parry-tainted` file blocks ALL tools until manual removal
- **Bash exemption**: No ML on bash (high FP rate); uses tree-sitter AST instead
- **MCP scanning**: Recursively extracts all string values from JSON, skips <10 char strings
- **CLAUDE.md threshold**: 0.9 (vs 0.7 default) because instruction files score higher naturally
- **Encoding-aware**: Catches base64/hex-encoded injection payloads via entropy-based region detection

### Harness Integration Paths

1. **Zero-code**: Install parry-guard as Claude Code hook alongside harness (immediate)
2. **Port patterns**: Extract Aho-Corasick phrases + secret regexes to TypeScript (medium effort)
3. **Adopt taint model**: Session-level taint on confirmed injection in issue/PR bodies
4. **Scan CLAUDE.md in cloned repos**: Before executing orchestrator plans

---

## 2. Container Use (Dagger) — Sandboxed Agent Execution

**Repo:** https://github.com/dagger/container-use
**Language:** Go (96.8%)
**License:** Apache 2.0
**Status:** Experimental (v0.4.2, 3.7k stars)

### Architecture

- Uses **Dagger Engine** (BuildKit-based) — not raw Docker
- **Immutable state model**: Every operation produces content-addressed container ID
- **Git-branch isolation**: Each environment gets its own `container-use/<env-id>` branch
- File changes auto-committed to environment's git branch
- **13 MCP tools** (create, run, read/write/edit files, add services, checkpoint)
- Secret backends: 1Password, env vars, HashiCorp Vault, file references

### Integration Assessment

- **No TypeScript SDK** — Go only
- **MCP client is the recommended integration** (Option A):
  - Spawn `container-use stdio` as subprocess
  - Communicate via MCP JSON-RPC protocol
  - Map 13 tools to `ContainerBackend` interface
  - **Effort: ~1-2 days**
- Alternative: Dagger TypeScript SDK (`@dagger.io/dagger`) for full control (~1-2 weeks)

### ContainerBackend Interface Sketch

```typescript
interface ContainerBackend {
  create(title: string, gitRef?: string): Promise<EnvironmentInfo>;
  run(command: string, opts?: RunOpts): Promise<RunResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  editFile(path: string, search: string, replace: string): Promise<void>;
  addService(name: string, image: string, ports: number[]): Promise<ServiceInfo>;
  destroy(envId: string): Promise<void>;
}
```

---

## 3. Trail of Bits Security Skills

**Repo:** https://github.com/trailofbits/skills
**Format:** Claude Code plugins (SKILL.md + references/ + scripts/)
**Coverage:** 15+ specialized skills across crypto, supply chain, smart contracts, static analysis, fuzzing

### Key Patterns Worth Adopting

1. **"Rationalizations to Reject" sections** — Every security skill lists shortcuts the AI must refuse. Example from zeroize-audit:
   - "The compiler won't optimize away the wipe"
   - "The data is handled briefly"
   - "memset suffices"

2. **Evidence thresholds** — 3-tier confidence (confirmed/likely/needs_review) requiring 2+ independent signals

3. **Progressive disclosure** — SKILL.md → references/ → workflows/ hierarchy (no chaining)

### Top 5 Skills to Adapt

| Skill                         | Why                                                                  | Harness Gap Filled                                              |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| **fp-check**                  | Structured FP verification workflow                                  | No formal gate between "scanner flagged" and "human suppressed" |
| **insecure-defaults**         | Fail-open vs fail-secure detection                                   | Pattern scanning misses silent degradation to weak defaults     |
| **supply-chain-risk-auditor** | 6-factor dependency risk evaluation                                  | No dedicated supply-chain analysis                              |
| **sharp-edges**               | API footgun detection (weak algo selection, stringly-typed security) | No design-level security analysis                               |
| **differential-review**       | Security-focused diff with risk classification by change type        | Code review lacks security-specific diff methodology            |

### Comparison: ToB vs Harness Security

- Harness `security-scan`: Fast mechanical triage (pattern matching, binary PASS/FAIL)
- Harness `security-review`: Broader OWASP + stack-adaptive (241 lines, single file)
- ToB skills: Deep domain-expert analysis per specialty, multi-phase with gate reviews
- **Complementary, not competitive** — ToB deepens specific domains harness covers broadly

---

## 4. Dippy — AST-Based Command Safety

**Repo:** https://github.com/ldayton/Dippy
**Language:** Python (100%, zero dependencies)
**Parser:** Parable — hand-written recursive-descent bash parser (MIT, 14,000+ tests)

### Three-Decision Model

- `deny` > `ask` > `allow` (strict priority hierarchy)
- **Tier 1**: User config rules (glob patterns, custom messages)
- **Tier 2**: SIMPLE_SAFE allowlist (~200 read-only commands)
- **Tier 3**: 130+ per-CLI handler modules (git.py, docker.py, aws.py, kubectl.py, etc.)
- **Fallback**: Unknown → `ask` (never silently approve)

### AST Analysis Capabilities

- **Pipelines**: All commands must be safe; one unsafe → whole pipeline blocked
- **Command substitution**: Inner command recursively analyzed + injection check
- **Subshells, brace groups, process substitution**: Recursive analysis
- **Heredocs**: Scanned for embedded `$(...)` and backticks
- **Wrapper stripping**: `time`, `timeout`, `nice`, `nohup`, `strace` → transparent
- **Delegate pattern**: `bash -c`, `docker exec`, `ssh` → extract + recurse inner command

### Harness Integration Value

- **130 handler modules = massive domain knowledge** about which subcommands are read-only vs mutating
- Parable parser is MIT, zero-dependency Python — could be ported or called
- Three-decision model (allow/ask/deny) maps well to orchestrator approval pipeline
- `deny` with custom messages can teach AI to use safe alternatives

---

## 5. ccflare + ccusage — Usage Tracking

**ccflare:** https://github.com/snipeship/ccflare (web dashboard, proxy-based)
**ccusage:** https://github.com/ryoppippi/ccusage (CLI, file-based)

### Claude Code Token Data Location

```
~/.claude/projects/{encoded-project-path}/{sessionId}.jsonl
```

- Entry format: `type: "assistant"` entries contain `message.usage` with:
  - `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
  - `model`, `timestamp`, `sessionId`
- Deduplicate by `message.id + requestId`

### Pricing Model

Per 1M tokens (current Anthropic rates):

| Model      | Input  | Output | Cache Read | Cache Write |
| ---------- | ------ | ------ | ---------- | ----------- |
| Haiku 3.5  | $0.80  | $4.00  | $0.08      | $1.00       |
| Sonnet 4.6 | $3.00  | $15.00 | $0.30      | $3.75       |
| Opus 4.6   | $15.00 | $75.00 | $1.50      | $18.75      |

### Recommended `harness usage` Implementation

1. **Extend `TokenUsage`** — add `cacheCreationTokens`, `cacheReadTokens`, `model`, `costUSD`
2. **Read JSONL directly** — glob `~/.claude/projects/**/*.jsonl`, stream, filter assistant entries
3. **Fetch pricing from LiteLLM** — `github.com/BerriAI/litellm/.../model_prices_and_context_window.json`, cache 24h, static fallback
4. **Commands**: `harness usage daily`, `harness usage session`, `harness usage current` (live burn rate)
5. **Correlate with harness sessions** — match by timestamp + cwd

---

## 6. agnix — Agent Config Linter

**Repo:** https://github.com/agent-sh/agnix
**Language:** Rust (90.3%) + editor plugins
**Stats:** 385 rules, MIT/Apache-2.0

### Rule Coverage (385 rules, 15+ prefixes)

| Category                | Rules | Examples                                                                    |
| ----------------------- | ----- | --------------------------------------------------------------------------- |
| Claude Memory (CC-MEM)  | 11    | Token count limits, generic instructions, weak language, README duplication |
| Claude Agents (CC-AG)   | 17    | Frontmatter schema, model validation, skill references, tool conflicts      |
| Claude Hooks (CC-HK)    | 25    | Event names, timeout limits, dangerous commands, script existence           |
| Agent Skills (AS/CC-SK) | 30    | Kebab-case naming, reserved words, trigger phrases, unreachable skills      |
| Claude Plugins (CC-PL)  | 14    | Semver, path traversal, LSP requirements                                    |
| MCP Config (MCP)        | 24    | Server types, insecure HTTP, plaintext secrets, duplicate servers           |
| AGENTS.md (AGM)         | 8     | Structure, character limits, secrets detection                              |
| Cross-Platform (XP)     | 8     | Claude-specific leaks into shared files, conflicting commands               |
| Prompt Engineering (PE) | 6     | Lost-in-middle positioning, chain-of-thought misuse, ambiguous terms        |
| Cursor (CUR)            | 16    | MDC file validation                                                         |
| Kiro (KIRO)             | 51    | Steering, skills, agents, hooks, MCP                                        |
| Others                  | ~175  | Copilot, Cline, Gemini, version pinning                                     |

### What Harness Misses (That agnix Catches)

1. CLAUDE.md quality (token count, generic instructions, weak language, positioning)
2. Agent frontmatter validation (model, permissionMode, effort, maxTurns, skill refs)
3. Hook JSON structure (event names, timeouts, dangerous commands, script existence)
4. Skill validation (kebab-case, reserved words, triggers, unreachable skills)
5. MCP config (insecure HTTP, plaintext secrets, dangerous commands)
6. Rules file glob pattern syntax
7. Prompt engineering anti-patterns
8. Auto-fix with confidence ratings (HIGH/MEDIUM/LOW)

### Integration: Hybrid Approach (Recommended)

- `harness validate --agent-configs` checks for agnix binary
- If present: shell out with pre-configured `.agnix.toml` (Claude Code rules only)
- If absent: fall back to ~20 highest-value rules in TypeScript
- Ship `.agnix.toml` template in `harness init`
- Highest-priority rules to port: CC-AG-_ (broken agents are silent failures), CC-HK-_ (invalid hooks), CC-SK-011 (unreachable skills), CC-MEM-009 (oversized CLAUDE.md)

---

## 7. claude-hooks + TDD Guard

### claude-hooks (John Lindquist)

**Repo:** https://github.com/johnlindquist/claude-hooks
**Type:** Code generator (oclif CLI), not runtime framework
**Runtime:** Bun (hard requirement)

**What it generates:**

- `.claude/hooks/index.ts` — single entrypoint, dispatches by `hook_event_name`
- `.claude/hooks/lib.ts` — typed payload interfaces for all 8 hook events
- `.claude/hooks/session.ts` — audit trail to temp directory
- Wires hooks into `.claude/settings.json`

**8 hook events supported:**
SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop, PreCompact, Notification

**Harness adaptation → `harness generate hooks`:**

- Template-based scaffolding (like claude-hooks)
- Typed payload library (DX win — autocomplete for all payloads)
- Composable presets: `--preset tdd`, `--preset security`, `--preset lint`, `--preset audit`
- Target Node.js (not Bun) for broader compatibility
- Pre-wire with harness tools (e.g., `harness validate` in PostToolUse)

### TDD Guard (nizos)

**Repo:** https://github.com/nizos/tdd-guard
**Approach:** Hook-based interception (NOT file-watching)

**How it works:**

1. PreToolUse hook intercepts Write/Edit/MultiEdit/TodoWrite
2. AST-based test counting via `@ast-grep/napi` (7 languages)
3. Single-test allowance: adding exactly 1 test always passes (Red phase)
4. AI validator (Claude CLI/SDK/API) checks TDD compliance
5. Returns `block` with reason or `approve`
6. PostToolUse lint handler enforces Refactor phase

**Harness adaptation → enhance `harness:tdd`:**

- Hook-based hard gates (not soft instructions)
- AST test counting via `@ast-grep/napi`
- Phase-aware enforcement (Red/Green/Refactor state in `.harness/`)
- Multi-language reporter integration (Vitest, Jest, pytest, Go, Rust, etc.)
- `tdd-guard on/off` toggle for spike/prototype work

---

## Summary: Integration Priority Matrix

| Resource            | Effort                                        | Impact                                  | Risk                       | Recommended Action                                                          |
| ------------------- | --------------------------------------------- | --------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| **parry**           | Tiny (hook install) to Medium (port patterns) | Very High — fills critical security gap | Low                        | Install as hook immediately; port patterns to TS long-term                  |
| **Container Use**   | Small (~1-2 days MCP client)                  | High — enables sandboxed orchestrator   | Medium (Dagger dependency) | Prototype MCP client `ContainerBackend`                                     |
| **Trail of Bits**   | Medium (adapt 5 skills)                       | High — deepens security expertise       | Low                        | Adapt fp-check + supply-chain first; add Rationalizations to Reject pattern |
| **Dippy**           | Medium (port or call Python)                  | Medium — better command approval        | Low                        | Study handler modules; consider calling via subprocess                      |
| **ccflare/ccusage** | Small (~2-3 days)                             | Medium — budget visibility              | Very Low                   | Build `harness usage` reading JSONL + LiteLLM pricing                       |
| **agnix**           | Small (hybrid integration)                    | Medium — catches silent config failures | Low                        | Hybrid: shell out when available, port 20 rules as fallback                 |
| **claude-hooks**    | Medium (build generator)                      | Medium — DX for hook authoring          | Low                        | Build `harness generate hooks` with presets                                 |
| **TDD Guard**       | Medium (adapt enforcement)                    | Medium — mechanical TDD gates           | Low                        | Enhance `harness:tdd` with hook-based enforcement + AST counting            |
