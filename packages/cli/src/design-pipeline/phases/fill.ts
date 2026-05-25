/**
 * Phase 5: FILL — two action sub-phases:
 *   5a. Bootstrap missing inputs (DESIGN.md / tokens.json /
 *       Component Registry / Brand Rules section stubs)
 *   5b. Invoke design-craft-elevator POLISH (ceiling-layer suggestions)
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Phase 5: FILL).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runDesignCraft } from '../../mcp/tools/design-craft.js';
import type { DesignPipelineContext } from '../context.js';

const DESIGN_MD_STUB = `# Design System

<!-- TODO: author this file. See harness-design skill for guidance. -->

## Aesthetic Direction

<!-- TODO: declare the design intent for this project. -->

## Component Registry

<!-- TODO: list registered components and their primitive mappings.
     audit-component-anatomy + detect-design-drift consume this section. -->

| Type   | File         | Notes |
|--------|--------------|-------|
|        |              |       |

## Anti-Patterns

<!-- TODO: list project-specific anti-patterns. -->

## Brand Rules

<!-- TODO: declare voice, tone, and asset rules.
     audit-brand-compliance consumes this section. -->

### Voice

forbidden_phrases: []
`;

const TOKENS_JSON_STUB = `{
  "$description": "TODO: declare design tokens (W3C DTCG format).",
  "$schema": "https://www.designtokens.org/"
}
`;

const COMPONENT_REGISTRY_STUB = `
## Component Registry

<!-- TODO: list registered components and their primitive mappings. -->

| Type   | File         | Notes |
|--------|--------------|-------|
|        |              |       |
`;

const BRAND_RULES_STUB = `
## Brand Rules

<!-- TODO: declare voice, tone, and asset rules. -->

### Voice

forbidden_phrases: []
`;

export interface FillInput {
  projectRoot: string;
  context: DesignPipelineContext;
  mode: 'fast' | 'full';
  files?: string[];
}

export async function runFill(input: FillInput): Promise<void> {
  bootstrapMissingInputs(input);
  await invokeCraftPolish(input);
}

function bootstrapMissingInputs(input: FillInput): void {
  const { projectRoot, context } = input;
  // FILL re-checks disk rather than trusting context.inputs flags. This
  // keeps FILL safe to invoke when --no-freshen was set (so context flags
  // are at defaults) without overwriting user files. The context flags
  // are updated as side-effects when a stub is actually written.
  const designMdPath = path.join(projectRoot, 'design-system', 'DESIGN.md');
  const tokensJsonPath = path.join(projectRoot, 'design-system', 'tokens.json');

  // 5a.1 — DESIGN.md (and its subsections, if file is newly written they
  // come for free)
  if (!fs.existsSync(designMdPath)) {
    fs.mkdirSync(path.dirname(designMdPath), { recursive: true });
    fs.writeFileSync(designMdPath, DESIGN_MD_STUB);
    context.bootstrapped.designMd = true;
    context.inputs.designMdExists = true;
    context.inputs.componentRegistryExists = true;
    context.inputs.brandRulesExist = true;
  } else {
    // File exists — check the subsections and append stubs if missing.
    const content = readFileSafe(designMdPath);
    if (content !== null) {
      if (!/^##\s+component\s+registry\b/im.test(content)) {
        appendToFile(designMdPath, COMPONENT_REGISTRY_STUB);
        context.bootstrapped.componentRegistry = true;
        context.inputs.componentRegistryExists = true;
      }
      if (!/^##\s+brand\s+rules\b/im.test(content)) {
        appendToFile(designMdPath, BRAND_RULES_STUB);
        context.bootstrapped.brandRules = true;
        context.inputs.brandRulesExist = true;
      }
    }
  }

  // 5a.2 — tokens.json (independent of DESIGN.md)
  if (!fs.existsSync(tokensJsonPath)) {
    fs.mkdirSync(path.dirname(tokensJsonPath), { recursive: true });
    fs.writeFileSync(tokensJsonPath, TOKENS_JSON_STUB);
    context.bootstrapped.tokensJson = true;
    context.inputs.tokensJsonExists = true;
  }
}

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

async function invokeCraftPolish(input: FillInput): Promise<void> {
  const { projectRoot, context, mode, files } = input;
  try {
    const result = await runDesignCraft({
      path: projectRoot,
      mode: mode === 'full' ? 'fast' : 'fast', // deep mode not in MVP
      phases: ['critique'],
      ...(files !== undefined && { files }),
    });
    if (result.ok) {
      context.craftFindings = [...result.value.findings];
      context.craftSuggestions = result.value.findings.length;
      context.verifiersRun.push('design-craft-critique');
    } else {
      context.verifiersFailed.push({
        name: 'design-craft-critique',
        error: result.error.message,
      });
    }
  } catch (err) {
    context.verifiersFailed.push({
      name: 'design-craft-critique',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function appendToFile(p: string, content: string): void {
  let existing = '';
  try {
    existing = fs.readFileSync(p, 'utf-8');
  } catch {
    /* file may not exist; treated as empty */
  }
  fs.writeFileSync(p, existing + content);
}
