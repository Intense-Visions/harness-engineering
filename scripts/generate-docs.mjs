#!/usr/bin/env node

/**
 * Documentation generator — produces reference docs from code metadata.
 *
 * Usage:
 *   node scripts/generate-docs.mjs           # generate all reference docs
 *   node scripts/generate-docs.mjs --check   # verify docs are fresh (CI mode)
 *
 * Outputs:
 *   docs/reference/cli-commands.md    — CLI command reference
 *   docs/reference/mcp-tools.md       — MCP tools reference
 *   docs/reference/skills-catalog.md  — Skills catalog by tier
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const REFERENCE_DIR = join(ROOT, 'docs', 'reference');
const HEADER = '<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->\n\n';

// Ensure output directory exists
if (!existsSync(REFERENCE_DIR)) {
  mkdirSync(REFERENCE_DIR, { recursive: true });
}

// ─── CLI Command Reference ───────────────────────────────────────────────────

async function generateCliReference() {
  // Import the CLI program to walk its command tree
  const { createProgram } = await import(join(ROOT, 'packages', 'cli', 'dist', 'index.js'));
  const program = createProgram();

  const lines = [
    HEADER,
    '# CLI Command Reference\n\n',
    'Complete reference for all `harness` CLI commands and subcommands. ',
    'See the [Features Overview](../guides/features-overview.md) for narrative documentation.\n\n',
  ];

  // Collect commands grouped by parent
  const topLevel = [];
  const groups = new Map(); // groupName -> commands[]

  for (const cmd of program.commands) {
    if (cmd.commands && cmd.commands.length > 0) {
      // This is a command group (e.g., skill, state, graph)
      groups.set(cmd.name(), { description: cmd.description(), commands: cmd.commands });
    } else {
      topLevel.push(cmd);
    }
  }

  // Top-level commands
  lines.push('## Top-Level Commands\n\n');
  for (const cmd of topLevel.sort((a, b) => a.name().localeCompare(b.name()))) {
    lines.push(formatCommand(cmd, 'harness'));
  }

  // Grouped commands
  for (const [name, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const title = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`## ${title} Commands\n\n`);
    if (group.description) {
      lines.push(`${group.description}\n\n`);
    }
    for (const cmd of group.commands.sort((a, b) => a.name().localeCompare(b.name()))) {
      lines.push(formatCommand(cmd, `harness ${name}`));
    }
  }

  return lines.join('');
}

function formatCommand(cmd, prefix) {
  const lines = [];
  const args = cmd._args || [];
  const argStr = args.map(a => a.required ? `<${a.name()}>` : `[${a.name()}]`).join(' ');
  const fullName = argStr ? `${prefix} ${cmd.name()} ${argStr}` : `${prefix} ${cmd.name()}`;

  lines.push(`### \`${fullName}\`\n\n`);
  if (cmd.description()) {
    lines.push(`${cmd.description()}\n\n`);
  }

  // Arguments with descriptions
  if (args.length > 0) {
    const describedArgs = args.filter(a => a.description);
    if (describedArgs.length > 0) {
      lines.push('**Arguments:**\n\n');
      for (const a of describedArgs) {
        const req = a.required ? 'required' : 'optional';
        lines.push(`- \`${a.name()}\` (${req}) — ${a.description}\n`);
      }
      lines.push('\n');
    }
  }

  // Options (excluding inherited --help)
  const options = cmd.options.filter(o => o.long !== '--help' && o.long !== '--version');
  if (options.length > 0) {
    lines.push('**Options:**\n\n');
    for (const opt of options) {
      const flags = opt.short ? `\`${opt.short}, ${opt.long}\`` : `\`${opt.long}\``;
      const defaultStr = opt.defaultValue !== undefined && opt.defaultValue !== false
        ? ` (default: ${JSON.stringify(opt.defaultValue)})`
        : '';
      lines.push(`- ${flags} — ${opt.description}${defaultStr}\n`);
    }
    lines.push('\n');
  }

  return lines.join('');
}

// ─── MCP Tools Reference ─────────────────────────────────────────────────────

async function generateMcpReference() {
  // Read tool definitions by importing the server module
  let toolDefinitions;
  try {
    const cliModule = await import(join(ROOT, 'packages', 'cli', 'dist', 'index.js'));
    toolDefinitions = cliModule.getToolDefinitions?.() || cliModule.TOOL_DEFINITIONS;
  } catch {
    // Fallback: parse the source files for tool metadata
    toolDefinitions = parseToolDefinitionsFromSource();
  }

  if (!toolDefinitions || toolDefinitions.length === 0) {
    toolDefinitions = parseToolDefinitionsFromSource();
  }

  const lines = [
    HEADER,
    '# MCP Tools Reference\n\n',
    'Complete reference for all harness MCP (Model Context Protocol) tools.\n',
    'These tools are available to AI agents via the harness MCP server.\n\n',
  ];

  // Group tools by category (inferred from name prefix)
  const categories = new Map();
  for (const tool of toolDefinitions) {
    const category = categorizeToolName(tool.name);
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category).push(tool);
  }

  for (const [category, tools] of [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${category}\n\n`);
    for (const tool of tools.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`### \`${tool.name}\`\n\n`);
      lines.push(`${tool.description}\n\n`);

      if (tool.inputSchema && tool.inputSchema.properties) {
        const props = tool.inputSchema.properties;
        const required = new Set(tool.inputSchema.required || []);
        const paramEntries = Object.entries(props);
        if (paramEntries.length > 0) {
          lines.push('**Parameters:**\n\n');
          for (const [pName, pSchema] of paramEntries) {
            const req = required.has(pName) ? 'required' : 'optional';
            const type = pSchema.type || 'any';
            const desc = pSchema.description || '';
            lines.push(`- \`${pName}\` (${type}, ${req})${desc ? ` — ${desc}` : ''}\n`);
          }
          lines.push('\n');
        }
      }
    }
  }

  return lines.join('');
}

function categorizeToolName(name) {
  if (name.startsWith('check_') || name.startsWith('validate_') || name.startsWith('assess_')) return 'Checkers & Validators';
  if (name.startsWith('generate_') || name.startsWith('create_')) return 'Generators & Creators';
  if (name.startsWith('query_') || name.startsWith('search_') || name.startsWith('find_') || name.startsWith('get_') || name.startsWith('ask_')) return 'Queries & Search';
  if (name.startsWith('run_') || name.startsWith('review_')) return 'Runners & Reviewers';
  if (name.startsWith('manage_') || name.startsWith('list_') || name.startsWith('emit_')) return 'State & Management';
  if (name.startsWith('detect_') || name.startsWith('predict_')) return 'Detection & Prediction';
  if (name.startsWith('ingest_') || name.startsWith('add_') || name.startsWith('update_')) return 'Data & Updates';
  if (name.startsWith('code_')) return 'Code Navigation';
  return 'Other';
}

function parseToolDefinitionsFromSource() {
  // Fallback: read tool definition files and extract metadata
  const toolsDir = join(ROOT, 'packages', 'cli', 'src', 'mcp', 'tools');
  const tools = [];

  if (!existsSync(toolsDir)) return tools;

  for (const file of readdirSync(toolsDir).filter(f => f.endsWith('.ts'))) {
    const content = readFileSync(join(toolsDir, file), 'utf-8');

    // Match exported definition objects
    const defRegex = /export\s+const\s+(\w+Definition)\s*(?::\s*\w+\s*)?=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;
    let match;
    while ((match = defRegex.exec(content)) !== null) {
      const body = match[2];
      const nameMatch = body.match(/name:\s*['"`]([^'"`]+)['"`]/);
      const descMatch = body.match(/description:\s*['"`]([^'"`]+)['"`]/);
      if (nameMatch) {
        tools.push({
          name: nameMatch[1],
          description: descMatch ? descMatch[1] : '',
          inputSchema: { properties: {}, required: [] },
        });
      }
    }
  }

  return tools;
}

// ─── Skills Catalog ──────────────────────────────────────────────────────────

function generateSkillsCatalog() {
  const skillsDir = join(ROOT, 'agents', 'skills', 'claude-code');
  const skills = [];

  for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const yamlPath = join(skillsDir, dir.name, 'skill.yaml');
    if (!existsSync(yamlPath)) continue;

    try {
      const content = readFileSync(yamlPath, 'utf-8');
      const skill = parseYaml(content);
      skills.push({
        name: skill.name || dir.name,
        tier: skill.tier || 3,
        description: skill.description || '',
        triggers: skill.triggers || [],
        platforms: skill.platforms || [],
        type: skill.type || 'flexible',
        cognitiveMode: skill.cognitive_mode || '',
        dependsOn: skill.depends_on || [],
      });
    } catch {
      // Skip unparseable files
    }
  }

  // Group by tier
  const tiers = {
    1: { label: 'Tier 1 — Workflow', skills: [] },
    2: { label: 'Tier 2 — Maintenance', skills: [] },
    3: { label: 'Tier 3 — Domain', skills: [] },
  };

  for (const skill of skills) {
    const tier = tiers[skill.tier] || tiers[3];
    tier.skills.push(skill);
  }

  // Sort within tiers
  for (const tier of Object.values(tiers)) {
    tier.skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  const lines = [
    HEADER,
    '# Skills Catalog\n\n',
    `${skills.length} skills across 3 tiers. `,
    'Tier 1 and 2 skills are registered as slash commands. ',
    'Tier 3 skills are discoverable via the `search_skills` MCP tool.\n\n',
  ];

  for (const [tierNum, tier] of Object.entries(tiers)) {
    lines.push(`## ${tier.label} (${tier.skills.length} skills)\n\n`);

    for (const skill of tier.skills) {
      lines.push(`### ${skill.name}\n\n`);
      lines.push(`${skill.description}\n\n`);
      lines.push(`- **Triggers:** ${skill.triggers.join(', ') || 'manual'}\n`);
      lines.push(`- **Platforms:** ${skill.platforms.join(', ') || 'all'}\n`);
      lines.push(`- **Type:** ${skill.type}\n`);
      if (skill.cognitiveMode) {
        lines.push(`- **Cognitive mode:** ${skill.cognitiveMode}\n`);
      }
      if (skill.dependsOn.length > 0) {
        lines.push(`- **Depends on:** ${skill.dependsOn.join(', ')}\n`);
      }
      lines.push('\n');
    }
  }

  return lines.join('');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const isCheck = process.argv.includes('--check');

  console.log('Generating reference docs...\n');

  // Skills catalog (no build required)
  console.log('  Skills catalog...');
  const skillsContent = generateSkillsCatalog();
  writeFileSync(join(REFERENCE_DIR, 'skills-catalog.md'), skillsContent);
  console.log('    ✓ docs/reference/skills-catalog.md');

  // CLI reference (requires built CLI)
  let cliContent;
  try {
    console.log('  CLI reference...');
    cliContent = await generateCliReference();
    writeFileSync(join(REFERENCE_DIR, 'cli-commands.md'), cliContent);
    console.log('    ✓ docs/reference/cli-commands.md');
  } catch (err) {
    console.log(`    ⚠ CLI reference skipped (build CLI first: pnpm build): ${err.message}`);
  }

  // MCP tools reference (requires built CLI or falls back to source parsing)
  try {
    console.log('  MCP tools reference...');
    const mcpContent = await generateMcpReference();
    writeFileSync(join(REFERENCE_DIR, 'mcp-tools.md'), mcpContent);
    console.log('    ✓ docs/reference/mcp-tools.md');
  } catch (err) {
    console.log(`    ⚠ MCP tools reference skipped: ${err.message}`);
  }

  console.log('\nDone.');

  if (isCheck) {
    try {
      execSync('git diff --exit-code docs/reference/', { cwd: ROOT, stdio: 'pipe' });
      console.log('\n✓ All reference docs are fresh.');
    } catch {
      console.error('\n✗ Reference docs are stale. Run `pnpm run generate-docs` to update.');
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
