# Contributing to Harness Engineering

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/harness-engineering/harness-engineering.git
   cd harness-engineering
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Build all packages:**

   ```bash
   pnpm build
   ```

4. **Run tests:**

   ```bash
   pnpm test
   ```

5. **Start documentation site:**
   ```bash
   pnpm docs:dev
   ```

---

## Project Structure

This is a pnpm monorepo using Turborepo for build orchestration:

```
harness-engineering/
├── packages/          # Runtime libraries
│   ├── types/        # Shared types
│   └── core/         # Core library
├── docs/             # VitePress documentation
├── AGENTS.md         # Knowledge map
└── ROADMAP.md        # Project roadmap
```

---

## Development Workflow

### Making Changes

1. **Create a branch:**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

3. **Write tests:**
   - All new features must have tests
   - Maintain >80% code coverage

4. **Run tests locally:**

   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   ```

5. **Commit your changes:**

   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

   **Commit format:** Use conventional commits
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test changes
   - `chore:` - Tooling/config changes

6. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Style

- **TypeScript strict mode** enabled
- **ESLint + Prettier** for formatting
- **No `any` types** in public APIs
- **Zod** for runtime validation

Run formatters:

```bash
pnpm format      # Format all files
pnpm lint        # Check linting
```

### Testing

- **Vitest** for unit tests
- **Target:** >80% coverage
- **Location:** `packages/*/tests/`

```bash
pnpm test                # Run all tests
pnpm test:coverage       # Run with coverage
pnpm test:watch          # Watch mode
```

---

## Documentation

### Writing Documentation

Documentation lives in `docs/` and uses VitePress.

**Structure:**

- `docs/standard/` - The 6 principles (manifesto)
- `docs/guides/` - Implementation guides
- `docs/reference/` - API reference

**Preview locally:**

```bash
pnpm docs:dev
```

### Documentation Standards

- Use GitHub-flavored Markdown
- Include code examples for all APIs
- Add type signatures for TypeScript
- Link to related docs
- Keep examples concise and focused

---

## Pull Request Process

### Before Submitting

- [ ] Tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type-checking passes (`pnpm typecheck`)
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventional commits

### PR Guidelines

1. **One feature per PR** - Keep PRs focused
2. **Clear description** - Explain what and why
3. **Link issues** - Reference related issues
4. **Request review** - Tag maintainers

### Review Process

1. **Automated checks** - CI must pass
2. **Code review** - Maintainer reviews code
3. **Approval** - At least one maintainer approval required
4. **Merge** - Squash and merge to main

---

## Reporting Bugs

Use [GitHub Issues](https://github.com/harness-engineering/harness-engineering/issues) to report bugs.

**Include:**

- Clear description
- Steps to reproduce
- Expected vs. actual behavior
- Environment (Node version, OS, etc.)
- Code sample (if applicable)

---

## Feature Requests

We welcome feature requests! Use [GitHub Discussions](https://github.com/harness-engineering/harness-engineering/discussions) for ideas and questions.

**Include:**

- Use case / problem to solve
- Proposed solution (if you have one)
- Alternatives considered

---

## Questions?

- **GitHub Discussions:** General questions, ideas
- **GitHub Issues:** Bug reports, feature requests
- **AGENTS.md:** Navigate the codebase

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
