# Harness Engineering Library

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

**Comprehensive toolkit for agent-first development.**

Harness Engineering is a systematic approach where human engineers design constraints and feedback loops that enable AI agents to work reliably and autonomously.

---

## 🚀 Quick Start

```bash
# Install the core library
npm install @harness-engineering/core
# or
pnpm add @harness-engineering/core
```

```typescript
import { validateAgentsMap } from '@harness-engineering/core';

const result = validateAgentsMap('./AGENTS.md');

if (!result.ok) {
  console.error('Validation failed:', result.error.message);
  process.exit(1);
}

console.log('✓ AGENTS.md is valid!');
```

---

## 📚 Documentation

**Full documentation:** https://harness-engineering.dev (coming soon)

- **[The Standard](https://github.com/harness-engineering/harness-engineering/tree/main/docs/standard)** - Six core principles
- **[Getting Started](https://github.com/harness-engineering/harness-engineering/tree/main/docs/guides)** - Implementation guides
- **[API Reference](https://github.com/harness-engineering/harness-engineering/tree/main/docs/reference)** - Complete API docs
- **[Adoption Levels](https://github.com/harness-engineering/harness-engineering/blob/main/docs/guides/adoption-levels.md)** - Phased rollout plan

---

## 🎯 What is Harness Engineering?

AI Harness Engineering represents a fundamental shift from manual implementation to systemic leverage:

- **Human Role**: Architect, intent-specifier, and validator
- **AI Role**: Executor, implementer, and primary maintainer

### The Six Principles

1. **Context Engineering** - Repository-as-documentation, everything in git
2. **Architectural Constraints** - Mechanical enforcement of dependencies and boundaries
3. **Agent Feedback Loop** - Self-correcting agents with peer review
4. **Entropy Management** - Automated cleanup and drift detection
5. **Implementation Strategy** - Depth-first, one feature to 100% completion
6. **Key Performance Indicators** - Agent autonomy, harness coverage, context density

---

## 📦 Packages

| Package                                          | Version | Description                      |
| ------------------------------------------------ | ------- | -------------------------------- |
| [`@harness-engineering/core`](./packages/core)   | `0.0.0` | Core runtime library (5 modules) |
| [`@harness-engineering/types`](./packages/types) | `0.0.0` | Shared TypeScript types          |

**Coming soon:**

- `harness-cli` - CLI tool for scaffolding and validation
- `@harness-engineering/eslint-plugin` - ESLint rules
- `@harness-engineering/linter-gen` - Custom linter generator

---

## 🏗️ Project Structure

```
harness-engineering/
├── packages/          # Runtime libraries
│   ├── types/        # Shared types
│   └── core/         # Core library
├── docs/             # Documentation (VitePress)
│   ├── standard/     # The standard
│   ├── guides/       # Implementation guides
│   └── reference/    # API reference
└── AGENTS.md         # Knowledge map for AI agents
```

---

## 🚧 Current Status

**Phase 1: Foundation** (In Progress)

- ✅ Monorepo setup (pnpm + Turborepo)
- ✅ Documentation infrastructure (VitePress)
- ✅ Standard documentation (6 principles)
- ✅ AGENTS.md knowledge map
- 🚧 Core library modules (in development)

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Ways to contribute:**

- Report bugs or request features via [GitHub Issues](https://github.com/harness-engineering/harness-engineering/issues)
- Submit pull requests
- Improve documentation
- Share your experience using harness engineering

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

## 🔗 Links

- **Documentation**: https://harness-engineering.dev (coming soon)
- **GitHub**: https://github.com/harness-engineering/harness-engineering
- **npm**: https://www.npmjs.com/org/harness-engineering
- **Discussions**: https://github.com/harness-engineering/harness-engineering/discussions

---

## 🎓 Learn More

- Read [The Standard](./docs/standard/index.md) to understand the principles
- Follow [Getting Started Guide](./docs/guides/index.md) to adopt harness engineering
- Explore [Adoption Levels](./docs/guides/adoption-levels.md) for phased rollout
- Check [API Reference](./docs/reference/index.md) for detailed documentation
