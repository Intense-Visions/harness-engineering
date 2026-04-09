# GraphQL Code Generator Pattern

> Generate type-safe TypeScript code from GraphQL schemas and operations to eliminate manual type maintenance

## When to Use

- Starting a new GraphQL project with TypeScript
- Adding type safety to existing GraphQL queries and mutations
- Generating typed React hooks for Apollo Client or urql
- Generating resolver type signatures for the server
- Keeping TypeScript types in sync with schema changes

## Instructions

1. **Install the codegen CLI and core plugins.**

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations @graphql-codegen/typescript-resolvers
```

2. **Create a `codegen.ts` configuration file** at the project root. Use the TypeScript config format for type-safe configuration.

```typescript
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'src/schema/**/*.graphql',
  documents: 'src/**/*.{ts,tsx}',
  generates: {
    'src/__generated__/types.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        strictScalars: true,
        scalars: {
          DateTime: 'string',
          JSON: 'Record<string, unknown>',
        },
      },
    },
    'src/__generated__/resolvers.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        useIndexSignature: true,
        contextType: '../context#Context',
      },
    },
  },
};

export default config;
```

3. **Use `TypedDocumentNode` for end-to-end type safety.** This plugin generates typed document nodes that carry their variables and result types — Apollo Client and urql pick them up automatically.

```typescript
// codegen generates:
// export const GetUserDocument: TypedDocumentNode<GetUserQuery, GetUserQueryVariables>

// Usage — variables and data are fully typed with no extra annotations:
const { data } = useQuery(GetUserDocument, { variables: { id: '1' } });
// data.user.name is typed as string
```

4. **Generate typed React hooks for client-side usage.** Add the `typescript-react-apollo` or `typescript-urql` plugin to generate `useGetUserQuery()` hooks directly.

```typescript
// codegen.ts addition
'src/__generated__/hooks.ts': {
  plugins: ['typescript', 'typescript-operations', 'typescript-react-apollo'],
  config: {
    withHooks: true,
    withComponent: false,
  },
},
```

5. **Use `near-operation-file` preset to co-locate generated types** next to the files that define the operations, instead of one giant generated file.

```typescript
generates: {
  'src/': {
    preset: 'near-operation-file',
    presetConfig: { extension: '.generated.ts', baseTypesPath: '__generated__/types.ts' },
    plugins: ['typescript-operations', 'typescript-react-apollo'],
  },
},
```

6. **Run codegen in watch mode during development** and as a CI check to ensure types are up to date.

```json
{
  "scripts": {
    "codegen": "graphql-codegen",
    "codegen:watch": "graphql-codegen --watch"
  }
}
```

7. **Enable `strictScalars`** to force explicit scalar mappings. Without this, custom scalars default to `any`, defeating the purpose of code generation.

8. **Type your resolvers with the generated `Resolvers` type.** This catches mismatches between your schema and resolver implementations at compile time.

```typescript
import { Resolvers } from './__generated__/resolvers';

export const resolvers: Resolvers = {
  Query: {
    user: async (_parent, { id }, context) => {
      // args.id is typed as string, return type is enforced
      return context.dataSources.users.findById(id);
    },
  },
};
```

9. **Add generated files to `.gitignore` or commit them** — pick one strategy and enforce it. Committing ensures CI does not need the schema endpoint; ignoring ensures no stale generated code.

## Details

**Plugin ecosystem:** `typescript` (base types from schema), `typescript-operations` (types from queries/mutations), `typescript-resolvers` (resolver signatures), `typescript-react-apollo` / `typescript-urql` (framework hooks), `typed-document-node` (framework-agnostic typed documents).

**Schema sources:** Codegen can read schemas from `.graphql` files, a running endpoint, a JSON introspection result, or code-first builders. Prefer `.graphql` files for CI stability.

**Fragment handling:** Codegen generates types for fragments and composes them into operation types. Use fragments for shared fields to keep generated types DRY.

**Enum handling:** By default, codegen generates TypeScript `enum`. Set `enumsAsTypes: true` to generate union string literals instead, which work better with tree-shaking and are simpler to use.

**Common mistakes:**

- Forgetting to re-run codegen after schema changes (use watch mode or CI check)
- Not mapping custom scalars, resulting in `any` types leaking through
- Generating into `node_modules` or build output (generate into `src/`)
- Mixing hand-written and generated types for the same schema entity

## Source

https://the-guild.dev/graphql/codegen

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
