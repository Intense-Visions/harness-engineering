import { defineConfig } from 'tsup';
import path from 'path';

const workspaceRoot = path.resolve(__dirname, '../..');

export default defineConfig([
  // Main CLI — bundles workspace packages, generates type declarations
  {
    entry: ['src/index.ts', 'src/bin/harness.ts', 'src/bin/harness-mcp.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist',
    external: ['@modelcontextprotocol/sdk'],
    // Bundle workspace packages into the CLI dist so the CLI works
    // when installed globally without needing sibling packages.
    noExternal: [
      '@harness-engineering/core',
      '@harness-engineering/graph',
      '@harness-engineering/linter-gen',
      '@harness-engineering/types',
    ],
    esbuildOptions(options) {
      // Resolve workspace packages to their built dist to avoid pulling
      // in devDependencies and transitive build tooling.
      options.alias = {
        '@harness-engineering/core': path.join(workspaceRoot, 'packages/core/dist/index.mjs'),
        '@harness-engineering/graph': path.join(workspaceRoot, 'packages/graph/dist/index.mjs'),
        '@harness-engineering/linter-gen': path.join(
          workspaceRoot,
          'packages/linter-gen/dist/index.js'
        ),
        '@harness-engineering/types': path.join(workspaceRoot, 'packages/types/dist/index.mjs'),
      };
    },
  },
]);
