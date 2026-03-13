export const CONFIG_TEMPLATE = (name: string) => ({
  version: 1 as const,
  name,
  layers: [
    { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
    { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
    { name: 'services', pattern: 'src/services/**', allowedDependencies: ['types', 'domain'] },
    { name: 'api', pattern: 'src/api/**', allowedDependencies: ['types', 'domain', 'services'] },
  ],
  agentsMapPath: './AGENTS.md',
  docsDir: './docs',
});

export const AGENTS_MD_TEMPLATE = (name: string) => `# ${name} Knowledge Map

## About This Project

${name} - A project using Harness Engineering practices.

## Documentation

- Main docs: \`docs/\`

## Source Code

- Entry point: \`src/index.ts\`

## Architecture

See \`docs/architecture.md\` for architectural decisions.
`;

export const DOCS_INDEX_TEMPLATE = (name: string) => `# ${name} Documentation

Welcome to the ${name} documentation.

## Getting Started

TODO: Add getting started guide.

## Architecture

TODO: Add architecture documentation.
`;
