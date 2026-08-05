import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getPersonaWorkflowTargets,
  renderPersonaWorkflowFile,
  checkPersonaWorkflows,
  writePersonaWorkflows,
  resolveWorkflowsDir,
  PERSONA_WORKFLOW_PREFIX,
} from '../../../src/persona/generators/repo-workflows';
import { resolvePersonasDir } from '../../../src/utils/paths';

// A persona that opts into a CI workflow, declares a CI trigger, and has a
// runnable command step — the canonical "should get a workflow" shape.
const CI_PERSONA = `version: 1
name: Fixture Enforcer
description: fixture
role: fixture
skills: []
commands:
  - validate
  - check-deps
triggers:
  - event: on_pr
    conditions:
      paths: ["src/**"]
  - event: scheduled
    cron: "0 6 * * 1"
config:
  severity: error
outputs:
  ci-workflow: true
`;

// ci-workflow: false → excluded.
const OPTED_OUT = `version: 1
name: Fixture Optout
description: fixture
role: fixture
skills: []
commands:
  - validate
triggers:
  - event: on_pr
config:
  severity: warning
outputs:
  ci-workflow: false
`;

// ci-workflow: true but only a manual trigger → excluded (no CI trigger).
const MANUAL_ONLY = `version: 2
name: Fixture Manual
description: fixture
role: fixture
skills: []
steps:
  - command: validate
    when: manual
triggers:
  - event: manual
config:
  severity: error
outputs:
  ci-workflow: true
`;

// ci-workflow: true, CI trigger, but only skill steps → excluded (nothing to run).
const SKILL_ONLY = `version: 2
name: Fixture Skillonly
description: fixture
role: fixture
skills: []
steps:
  - skill: harness-code-review
    when: on_pr
    output: auto
triggers:
  - event: on_pr
config:
  severity: warning
outputs:
  ci-workflow: true
`;

describe('getPersonaWorkflowTargets', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-targets-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('includes only personas with ci-workflow + a CI trigger + a command step', () => {
    fs.writeFileSync(path.join(dir, 'a-enforcer.yaml'), CI_PERSONA);
    fs.writeFileSync(path.join(dir, 'b-optout.yaml'), OPTED_OUT);
    fs.writeFileSync(path.join(dir, 'c-manual.yaml'), MANUAL_ONLY);
    fs.writeFileSync(path.join(dir, 'd-skillonly.yaml'), SKILL_ONLY);

    const targets = getPersonaWorkflowTargets(dir);
    expect(targets.map((t) => t.persona.name)).toEqual(['Fixture Enforcer']);
    expect(targets[0].filename).toBe(`${PERSONA_WORKFLOW_PREFIX}fixture-enforcer.yml`);
  });

  it('returns [] for a missing directory', () => {
    expect(getPersonaWorkflowTargets(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('renderPersonaWorkflowFile', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-render-'));
    fs.writeFileSync(path.join(dir, 'fixture-enforcer.yaml'), CI_PERSONA);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('emits an advisory workspace-runner workflow with a generated header', () => {
    const [target] = getPersonaWorkflowTargets(dir);
    const rendered = renderPersonaWorkflowFile(target);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.value).toContain('# GENERATED FILE — do not edit by hand.');
    expect(rendered.value).toContain('continue-on-error: true');
    expect(rendered.value).toContain('node packages/cli/dist/bin/harness.js validate');
    expect(rendered.value).toContain('pnpm build');
  });
});

describe('checkPersonaWorkflows / writePersonaWorkflows', () => {
  let root: string;
  let personasDir: string;
  let workflowsDir: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-sync-'));
    personasDir = path.join(root, 'agents', 'personas');
    fs.mkdirSync(personasDir, { recursive: true });
    fs.writeFileSync(path.join(personasDir, 'fixture-enforcer.yaml'), CI_PERSONA);
    workflowsDir = resolveWorkflowsDir(personasDir);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('resolveWorkflowsDir points at <root>/.github/workflows', () => {
    expect(workflowsDir).toBe(path.join(root, '.github', 'workflows'));
  });

  it('reports missing when nothing is committed', () => {
    const result = checkPersonaWorkflows(personasDir, workflowsDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issues).toHaveLength(1);
    expect(result.value.issues[0].kind).toBe('missing');
  });

  it('write then check is clean', () => {
    const write = writePersonaWorkflows(personasDir, workflowsDir);
    expect(write.ok).toBe(true);
    if (!write.ok) return;
    expect(write.value.written).toEqual([`${PERSONA_WORKFLOW_PREFIX}fixture-enforcer.yml`]);
    const check = checkPersonaWorkflows(personasDir, workflowsDir);
    if (!check.ok) return;
    expect(check.value.issues).toHaveLength(0);
  });

  it('detects stale content', () => {
    writePersonaWorkflows(personasDir, workflowsDir);
    const file = path.join(workflowsDir, `${PERSONA_WORKFLOW_PREFIX}fixture-enforcer.yml`);
    fs.appendFileSync(file, '\n# hand edit\n');
    const check = checkPersonaWorkflows(personasDir, workflowsDir);
    if (!check.ok) return;
    expect(check.value.issues.map((i) => i.kind)).toContain('stale');
  });

  it('detects and prunes orphaned persona workflows', () => {
    writePersonaWorkflows(personasDir, workflowsDir);
    const orphan = path.join(workflowsDir, `${PERSONA_WORKFLOW_PREFIX}ghost.yml`);
    fs.writeFileSync(orphan, 'name: Ghost\n');
    const check = checkPersonaWorkflows(personasDir, workflowsDir);
    if (!check.ok) return;
    expect(check.value.issues.map((i) => i.kind)).toContain('orphaned');
    // Re-writing prunes the orphan.
    writePersonaWorkflows(personasDir, workflowsDir);
    expect(fs.existsSync(orphan)).toBe(false);
  });
});

// Drift guard living in the suite: the committed .github/workflows/ must stay
// in sync with agents/personas/. Complements the CI `generate:persona-workflows:check`.
describe('committed persona workflows (repo drift guard)', () => {
  it('every persona-declared CI trigger has an up-to-date committed workflow', () => {
    const personasDir = resolvePersonasDir();
    const workflowsDir = resolveWorkflowsDir(personasDir);
    const result = checkPersonaWorkflows(personasDir, workflowsDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const detail = result.value.issues
      .map((i) => `[${i.kind}] ${i.filename}: ${i.detail}`)
      .join('\n');
    expect(result.value.issues, `Persona workflow drift:\n${detail}`).toHaveLength(0);
    // Sanity: the repo really does have persona workflows to guard.
    expect(result.value.targets.length).toBeGreaterThan(0);
  });
});
