import * as fs from 'node:fs';
import * as path from 'node:path';

export function detectStack(projectRoot: string): string[] {
  const stacks: string[] = [];

  // Check for Node.js / JavaScript ecosystem
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    stacks.push('node');
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const allDeps = {
        ...pkgJson.dependencies,
        ...pkgJson.devDependencies,
      };

      if (allDeps.react || allDeps['react-dom']) stacks.push('react');
      if (allDeps.express) stacks.push('express');
      if (allDeps.koa) stacks.push('koa');
      if (allDeps.fastify) stacks.push('fastify');
      if (allDeps.next) stacks.push('next');
      if (allDeps.vue) stacks.push('vue');
      if (allDeps.angular || allDeps['@angular/core']) stacks.push('angular');
    } catch {
      // Malformed package.json — continue with just 'node'
    }
  }

  // Check for Go
  const goModPath = path.join(projectRoot, 'go.mod');
  if (fs.existsSync(goModPath)) {
    stacks.push('go');
  }

  // Check for Python
  const requirementsPath = path.join(projectRoot, 'requirements.txt');
  const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
  if (fs.existsSync(requirementsPath) || fs.existsSync(pyprojectPath)) {
    stacks.push('python');
  }

  return stacks;
}
