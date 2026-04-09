import * as fs from 'node:fs';
import * as path from 'node:path';

type Deps = Record<string, unknown>;

/** Derive sub-stacks from a merged dependency map (dependencies + devDependencies). */
function nodeSubStacks(allDeps: Deps): string[] {
  const found: string[] = [];
  if (allDeps.react || allDeps['react-dom']) found.push('react');
  if (allDeps.express) found.push('express');
  if (allDeps.koa) found.push('koa');
  if (allDeps.fastify) found.push('fastify');
  if (allDeps.next) found.push('next');
  if (allDeps.vue) found.push('vue');
  if (allDeps.angular || allDeps['@angular/core']) found.push('angular');
  return found;
}

/** Detect Node.js and any framework sub-stacks present in package.json. */
function detectNodeStacks(projectRoot: string): string[] {
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return [];

  const stacks = ['node'];
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const allDeps: Deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    stacks.push(...nodeSubStacks(allDeps));
  } catch {
    // Malformed package.json — continue with just 'node'
  }
  return stacks;
}

export function detectStack(projectRoot: string): string[] {
  const stacks: string[] = [...detectNodeStacks(projectRoot)];

  // Check for Go
  if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    stacks.push('go');
  }

  // Check for Python
  const hasPython =
    fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
    fs.existsSync(path.join(projectRoot, 'pyproject.toml'));
  if (hasPython) {
    stacks.push('python');
  }

  return stacks;
}
