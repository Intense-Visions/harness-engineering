# Getting Started with Harness Engineering

This guide will help you get up and running with Harness Engineering in about 15-30 minutes.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **pnpm 8+** - Install with: `npm install -g pnpm`
- **Git** - Required for version control
- **A text editor** - VS Code, WebStorm, or your preferred editor

Verify your installations:
```bash
node --version
pnpm --version
git --version
```

## Installation

### Step 1: Clone or Create Your Project

```bash
# Option A: Clone an existing Harness Engineering project
git clone <repository-url>
cd <project-name>

# Option B: Initialize a new project
mkdir my-harness-project
cd my-harness-project
git init
```

### Step 2: Install Dependencies

```bash
pnpm install
```

This installs the Harness Engineering library and all required dependencies.

### Step 3: Set Up Documentation Structure

Create the initial documentation directory structure:

```bash
mkdir -p docs/{standard,guides,reference}
```

### Step 4: Create AGENTS.md

Create a knowledge map at the root of your repository:

```bash
cat > AGENTS.md << 'EOF'
# Agent Knowledge Map

This file helps AI agents navigate your codebase and understand key decisions.

## Core Resources

- **Documentation**: [/docs](/docs) - All architectural decisions and guides
- **Standard**: [/docs/standard](/docs/standard) - Harness Engineering principles
- **Guides**: [/docs/guides](/docs/guides) - Getting started and best practices
- **Reference**: [/docs/reference](/docs/reference) - CLI and configuration

## Project Structure

- **/packages** - Core application packages
- **/docs** - Documentation and guides
- **package.json** - Project metadata and scripts
- **tsconfig.json** - TypeScript configuration

## Key Decisions

All architectural decisions are documented in `/docs/standard/`. Agents should review:
1. Architectural constraints
2. Dependency flows
3. Testing requirements
4. Documentation standards

## Getting Help

- Review [Implementation Guide](/docs/standard/implementation.md)
- Check [Best Practices](/docs/guides/best-practices.md)
- Consult [Configuration Reference](/docs/reference/configuration.md)
EOF
```

## Quick Start Example

### 1. Create Your First Feature

Create a simple module following Harness Engineering principles:

```typescript
// packages/core/src/example.ts
export interface Message {
  text: string;
  timestamp: Date;
}

export function createMessage(text: string): Message {
  return {
    text,
    timestamp: new Date()
  };
}
```

### 2. Add Tests

Create tests for your feature:

```typescript
// packages/core/src/__tests__/example.test.ts
import { createMessage } from '../example';

describe('createMessage', () => {
  it('should create a message with text and timestamp', () => {
    const msg = createMessage('Hello');
    expect(msg.text).toBe('Hello');
    expect(msg.timestamp).toBeInstanceOf(Date);
  });
});
```

### 3. Document Your Decision

Create a design document:

```markdown
# Message System Design

## Overview
Simple message creation system for demonstrations.

## Implementation
Messages are created via `createMessage()` function.

## Status
Complete and tested.
```

### 4. Validate Your Setup

Run tests to ensure everything works:

```bash
pnpm test
```

## Next Steps

Congratulations! You have a basic Harness Engineering setup. Here's what to do next:

1. **Review the Principles**
   - Read [Context Engineering](/docs/standard/principles.md#1-context-engineering)
   - Understand [Architectural Constraints](/docs/standard/principles.md#2-architectural-rigidity--mechanical-constraints)

2. **Read Best Practices**
   - Check [Code Organization](/docs/guides/best-practices.md#code-organization)
   - Learn [Testing Strategies](/docs/guides/best-practices.md#testing-strategies)

3. **Set Up Configuration**
   - Create your [harness.config.yml](/docs/reference/configuration.md)
   - Define architectural constraints for your project

4. **Implement Agent Skills**
   - Set up initial validation
   - Create custom linter rules
   - Enable agent feedback loops

## Common Tasks

### Starting the Documentation Server

```bash
pnpm docs:dev
```

Visit `http://localhost:5173` to view documentation.

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for a specific package
pnpm test --filter=@harness/core
```

### Building for Production

```bash
pnpm build
```

## Troubleshooting

### "pnpm: command not found"
Install pnpm globally:
```bash
npm install -g pnpm
```

### "Node version not compatible"
Install Node.js 18 or higher:
```bash
# Using nvm (recommended)
nvm install 18
nvm use 18
```

### "Port 5173 already in use"
Use a different port:
```bash
pnpm docs:dev --port 3000
```

## Getting Help

- Check the [Best Practices Guide](./best-practices.md)
- Review [Implementation Guide](/docs/standard/implementation.md)
- See [Configuration Reference](/docs/reference/configuration.md)
- Visit the main [Documentation](/docs)

---

*Last Updated: 2026-03-11*
