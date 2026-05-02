# Plan: Phase C — JS + Vue Import (38 Knowledge Skills)

**Date:** 2026-04-07
**Spec:** docs/changes/knowledge-skills-schema-enrichment/proposal.md
**Session:** changes--knowledge-skills-schema-enrichment--proposal
**Estimated tasks:** 11
**Estimated time:** ~70 minutes

---

## Goal

Import 27 JavaScript and 11 Vue knowledge skills into the harness skill catalog across all four platforms (claude-code, gemini-cli, cursor, codex), with end-to-end dispatch validation confirming all three technology verticals (React, JS, Vue) surface correctly.

---

## Context: Phases A and B Completed

Phase A schema & infrastructure and Phase B React vertical slice are complete:

- `packages/cli/src/skill/schema.ts` — `type: 'knowledge'`, `paths`, `related_skills`, `metadata` fields with superRefine constraints
- `packages/cli/src/skill/dispatcher.ts` — paths scoring (0.20 weight), hybrid injection (≥0.7 auto-inject, 0.4–0.7 recommend)
- `packages/cli/src/mcp/tools/skill.ts` — progressive disclosure split on `\n## Details`
- `packages/cli/src/skill/recommendation-types.ts` — `knowledgeRecommendations` array
- 19 React skills across all 4 platforms as reference implementations (`agents/skills/claude-code/react-hooks-pattern/` etc.)

Baseline test counts:

- `agents/skills` vitest: 2016 tests passing
- `packages/cli` vitest: 1985 tests passing

---

## Observable Truths (Acceptance Criteria)

1. The system shall have 27 `js-` skill directories under `agents/skills/claude-code/`, each containing `skill.yaml` and `SKILL.md`. (Ubiquitous)
2. The system shall have 11 `vue-` skill directories under `agents/skills/claude-code/`, each containing `skill.yaml` and `SKILL.md`. (Ubiquitous)
3. Each `js-` `skill.yaml` shall have `type: knowledge`, `paths: ['**/*.js', '**/*.mjs', '**/*.cjs']`, `tier: 3`, `cognitive_mode: advisory-guide`, and `metadata.upstream` pointing to `PatternsDev/skills/javascript/<name>`. (Ubiquitous)
4. Each `vue-` `skill.yaml` shall have `type: knowledge`, `paths: ['**/*.vue', '**/*.ts']`, `tier: 3`, `cognitive_mode: advisory-guide`, and `metadata.upstream` pointing to `PatternsDev/skills/vue/<name>`. (Ubiquitous)
5. When `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run` is run, the system shall pass all platform-parity and schema tests, confirming all 38 new skills exist identically across claude-code, gemini-cli, cursor, and codex. (Event-driven)
6. When `suggest()` is called with `recentFiles: ['src/utils.js']` and relevant query terms, the system shall include at least one JS knowledge skill in `autoInjectKnowledge` or `suggestions`. (Event-driven)
7. When `suggest()` is called with `recentFiles: ['src/Component.vue']` and relevant query terms, the system shall include at least one Vue knowledge skill in `autoInjectKnowledge` or `suggestions`. (Event-driven)
8. `harness validate` shall pass with all 38 new skills present. (Ubiquitous)

---

## Skill Inventory

### 27 JavaScript Skills (`js-` prefix, paths: `['**/*.js', '**/*.mjs', '**/*.cjs']`, stack_signals: `['javascript', 'nodejs']`)

| Skill Name                   | Description                                                                       | upstream                                                |
| ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `js-singleton-pattern`       | Ensure a class has only one instance and provide a global access point            | `PatternsDev/skills/javascript/singleton-pattern`       |
| `js-prototype-pattern`       | Share properties and methods among objects via prototype chain                    | `PatternsDev/skills/javascript/prototype-pattern`       |
| `js-observer-pattern`        | Notify dependents automatically when an object's state changes                    | `PatternsDev/skills/javascript/observer-pattern`        |
| `js-factory-pattern`         | Create objects without specifying the exact class to instantiate                  | `PatternsDev/skills/javascript/factory-pattern`         |
| `js-proxy-pattern`           | Intercept and control access to objects via a Proxy wrapper                       | `PatternsDev/skills/javascript/proxy-pattern`           |
| `js-mediator-pattern`        | Reduce direct dependencies by routing communication through a mediator            | `PatternsDev/skills/javascript/mediator-pattern`        |
| `js-command-pattern`         | Encapsulate actions as objects to support undo, queuing, and logging              | `PatternsDev/skills/javascript/command-pattern`         |
| `js-mixin-pattern`           | Add reusable behavior to objects and classes without inheritance                  | `PatternsDev/skills/javascript/mixin-pattern`           |
| `js-flyweight-pattern`       | Share common state across many fine-grained objects to reduce memory              | `PatternsDev/skills/javascript/flyweight-pattern`       |
| `js-chain-of-responsibility` | Pass requests along a handler chain until one handles it                          | `PatternsDev/skills/javascript/chain-of-responsibility` |
| `js-iterator-pattern`        | Traverse collections sequentially without exposing internal structure             | `PatternsDev/skills/javascript/iterator-pattern`        |
| `js-strategy-pattern`        | Define a family of algorithms, encapsulate each, and make them interchangeable    | `PatternsDev/skills/javascript/strategy-pattern`        |
| `js-template-method-pattern` | Define the skeleton of an algorithm, deferring some steps to subclasses           | `PatternsDev/skills/javascript/template-method-pattern` |
| `js-visitor-pattern`         | Add operations to objects without modifying their classes                         | `PatternsDev/skills/javascript/visitor-pattern`         |
| `js-decorator-pattern`       | Attach additional responsibilities to objects dynamically                         | `PatternsDev/skills/javascript/decorator-pattern`       |
| `js-facade-pattern`          | Provide a simplified interface to a complex subsystem                             | `PatternsDev/skills/javascript/facade-pattern`          |
| `js-module-pattern`          | Encapsulate implementation details and expose a clean public API                  | `PatternsDev/skills/javascript/module-pattern`          |
| `js-revealing-module`        | Explicitly map private functions to public names in the return object             | `PatternsDev/skills/javascript/revealing-module`        |
| `js-constructor-pattern`     | Create and initialize objects using the new keyword and constructor functions     | `PatternsDev/skills/javascript/constructor-pattern`     |
| `js-hoisting`                | Understand how variable and function declarations are moved to scope top          | `PatternsDev/skills/javascript/hoisting`                |
| `js-scope-patterns`          | Manage variable visibility using block, function, and module scope                | `PatternsDev/skills/javascript/scope-patterns`          |
| `js-closure-pattern`         | Capture enclosing scope variables to create private state and partial application | `PatternsDev/skills/javascript/closure-pattern`         |
| `js-static-import`           | Bundle all dependencies at build time via ES module static imports                | `PatternsDev/skills/javascript/static-import`           |
| `js-dynamic-import`          | Load modules on demand at runtime to reduce initial bundle size                   | `PatternsDev/skills/javascript/dynamic-import`          |
| `js-compose-and-pipe`        | Build data transformation pipelines by composing small pure functions             | `PatternsDev/skills/javascript/compose-and-pipe`        |
| `js-barrel-pattern`          | Re-export module members from an index file to simplify imports                   | `PatternsDev/skills/javascript/barrel-pattern`          |
| `js-lazy-initialization`     | Defer expensive object creation until the value is first accessed                 | `PatternsDev/skills/javascript/lazy-initialization`     |

### 11 Vue Skills (`vue-` prefix, paths: `['**/*.vue', '**/*.ts']`, stack_signals: `['vue', 'typescript']`)

| Skill Name                    | Description                                                                      | upstream                                         |
| ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `vue-composables`             | Extract and reuse stateful logic across components via Composition API functions | `PatternsDev/skills/vue/composables`             |
| `vue-renderless-components`   | Separate data logic from presentation by rendering only slot content             | `PatternsDev/skills/vue/renderless-components`   |
| `vue-provide-inject`          | Pass data deeply through the component tree without prop drilling                | `PatternsDev/skills/vue/provide-inject`          |
| `vue-slots-pattern`           | Compose flexible component templates using named and scoped slots                | `PatternsDev/skills/vue/slots-pattern`           |
| `vue-teleport`                | Render component output in a different DOM location via Teleport                 | `PatternsDev/skills/vue/teleport`                |
| `vue-suspense`                | Coordinate async component loading with a fallback UI via Suspense               | `PatternsDev/skills/vue/suspense`                |
| `vue-async-components`        | Load components lazily with defineAsyncComponent for code splitting              | `PatternsDev/skills/vue/async-components`        |
| `vue-compound-component`      | Build multi-part components sharing state through provide/inject                 | `PatternsDev/skills/vue/compound-component`      |
| `vue-state-management`        | Manage shared state across components using Pinia or composable stores           | `PatternsDev/skills/vue/state-management`        |
| `vue-transitions`             | Animate component enter/leave with Vue's transition and transition-group         | `PatternsDev/skills/vue/transitions`             |
| `vue-reactivity-fundamentals` | Use ref, reactive, computed, and watch to build reactive data flows              | `PatternsDev/skills/vue/reactivity-fundamentals` |

---

## File Map

```
CREATE agents/skills/claude-code/js-singleton-pattern/skill.yaml
CREATE agents/skills/claude-code/js-singleton-pattern/SKILL.md
CREATE agents/skills/claude-code/js-prototype-pattern/skill.yaml
CREATE agents/skills/claude-code/js-prototype-pattern/SKILL.md
CREATE agents/skills/claude-code/js-observer-pattern/skill.yaml
CREATE agents/skills/claude-code/js-observer-pattern/SKILL.md
CREATE agents/skills/claude-code/js-factory-pattern/skill.yaml
CREATE agents/skills/claude-code/js-factory-pattern/SKILL.md
CREATE agents/skills/claude-code/js-proxy-pattern/skill.yaml
CREATE agents/skills/claude-code/js-proxy-pattern/SKILL.md
CREATE agents/skills/claude-code/js-mediator-pattern/skill.yaml
CREATE agents/skills/claude-code/js-mediator-pattern/SKILL.md
CREATE agents/skills/claude-code/js-command-pattern/skill.yaml
CREATE agents/skills/claude-code/js-command-pattern/SKILL.md
CREATE agents/skills/claude-code/js-mixin-pattern/skill.yaml
CREATE agents/skills/claude-code/js-mixin-pattern/SKILL.md
CREATE agents/skills/claude-code/js-flyweight-pattern/skill.yaml
CREATE agents/skills/claude-code/js-flyweight-pattern/SKILL.md
CREATE agents/skills/claude-code/js-chain-of-responsibility/skill.yaml
CREATE agents/skills/claude-code/js-chain-of-responsibility/SKILL.md
CREATE agents/skills/claude-code/js-iterator-pattern/skill.yaml
CREATE agents/skills/claude-code/js-iterator-pattern/SKILL.md
CREATE agents/skills/claude-code/js-strategy-pattern/skill.yaml
CREATE agents/skills/claude-code/js-strategy-pattern/SKILL.md
CREATE agents/skills/claude-code/js-template-method-pattern/skill.yaml
CREATE agents/skills/claude-code/js-template-method-pattern/SKILL.md
CREATE agents/skills/claude-code/js-visitor-pattern/skill.yaml
CREATE agents/skills/claude-code/js-visitor-pattern/SKILL.md
CREATE agents/skills/claude-code/js-decorator-pattern/skill.yaml
CREATE agents/skills/claude-code/js-decorator-pattern/SKILL.md
CREATE agents/skills/claude-code/js-facade-pattern/skill.yaml
CREATE agents/skills/claude-code/js-facade-pattern/SKILL.md
CREATE agents/skills/claude-code/js-module-pattern/skill.yaml
CREATE agents/skills/claude-code/js-module-pattern/SKILL.md
CREATE agents/skills/claude-code/js-revealing-module/skill.yaml
CREATE agents/skills/claude-code/js-revealing-module/SKILL.md
CREATE agents/skills/claude-code/js-constructor-pattern/skill.yaml
CREATE agents/skills/claude-code/js-constructor-pattern/SKILL.md
CREATE agents/skills/claude-code/js-hoisting/skill.yaml
CREATE agents/skills/claude-code/js-hoisting/SKILL.md
CREATE agents/skills/claude-code/js-scope-patterns/skill.yaml
CREATE agents/skills/claude-code/js-scope-patterns/SKILL.md
CREATE agents/skills/claude-code/js-closure-pattern/skill.yaml
CREATE agents/skills/claude-code/js-closure-pattern/SKILL.md
CREATE agents/skills/claude-code/js-static-import/skill.yaml
CREATE agents/skills/claude-code/js-static-import/SKILL.md
CREATE agents/skills/claude-code/js-dynamic-import/skill.yaml
CREATE agents/skills/claude-code/js-dynamic-import/SKILL.md
CREATE agents/skills/claude-code/js-compose-and-pipe/skill.yaml
CREATE agents/skills/claude-code/js-compose-and-pipe/SKILL.md
CREATE agents/skills/claude-code/js-barrel-pattern/skill.yaml
CREATE agents/skills/claude-code/js-barrel-pattern/SKILL.md
CREATE agents/skills/claude-code/js-lazy-initialization/skill.yaml
CREATE agents/skills/claude-code/js-lazy-initialization/SKILL.md

CREATE agents/skills/claude-code/vue-composables/skill.yaml
CREATE agents/skills/claude-code/vue-composables/SKILL.md
CREATE agents/skills/claude-code/vue-renderless-components/skill.yaml
CREATE agents/skills/claude-code/vue-renderless-components/SKILL.md
CREATE agents/skills/claude-code/vue-provide-inject/skill.yaml
CREATE agents/skills/claude-code/vue-provide-inject/SKILL.md
CREATE agents/skills/claude-code/vue-slots-pattern/skill.yaml
CREATE agents/skills/claude-code/vue-slots-pattern/SKILL.md
CREATE agents/skills/claude-code/vue-teleport/skill.yaml
CREATE agents/skills/claude-code/vue-teleport/SKILL.md
CREATE agents/skills/claude-code/vue-suspense/skill.yaml
CREATE agents/skills/claude-code/vue-suspense/SKILL.md
CREATE agents/skills/claude-code/vue-async-components/skill.yaml
CREATE agents/skills/claude-code/vue-async-components/SKILL.md
CREATE agents/skills/claude-code/vue-compound-component/skill.yaml
CREATE agents/skills/claude-code/vue-compound-component/SKILL.md
CREATE agents/skills/claude-code/vue-state-management/skill.yaml
CREATE agents/skills/claude-code/vue-state-management/SKILL.md
CREATE agents/skills/claude-code/vue-transitions/skill.yaml
CREATE agents/skills/claude-code/vue-transitions/SKILL.md
CREATE agents/skills/claude-code/vue-reactivity-fundamentals/skill.yaml
CREATE agents/skills/claude-code/vue-reactivity-fundamentals/SKILL.md

[All 38 skill directories replicated identically to gemini-cli/, cursor/, codex/]
```

---

## Skeleton

1. JS skills batch 1: singleton, prototype, observer, factory, proxy (~1 task, ~8 min)
2. JS skills batch 2: mediator, command, mixin, flyweight, chain-of-responsibility (~1 task, ~8 min)
3. JS skills batch 3: iterator, strategy, template-method, visitor, decorator (~1 task, ~8 min)
4. JS skills batch 4: facade, module, revealing-module, constructor, hoisting, scope-patterns, closure (~1 task, ~8 min)
5. JS skills batch 5: static-import, dynamic-import, compose-and-pipe, barrel, lazy-initialization (~1 task, ~6 min)
6. Vue skills batch 1: composables, renderless-components, provide-inject, slots-pattern (~1 task, ~6 min)
7. Vue skills batch 2: teleport, suspense, async-components, compound-component (~1 task, ~6 min)
8. Vue skills batch 3: state-management, transitions, reactivity-fundamentals (~1 task, ~5 min)
9. Platform replication — all 38 skills to gemini-cli, cursor, codex (~1 task, ~5 min)
10. E2E dispatch validation — JS + Vue scoring tests (~1 task, ~8 min)
11. harness validate gate (~1 task, ~2 min)

**Estimated total:** 11 tasks, ~70 minutes

_Skeleton approved: yes (planning-phase decision, standard mode, 11 tasks >= 8 threshold)._

---

## Tasks

### Task 1: JS Skills Batch 1 — singleton, prototype, observer, factory, proxy

**Depends on:** none
**Files:** agents/skills/claude-code/js-{singleton,prototype,observer,factory,proxy}-pattern/{skill.yaml,SKILL.md}

For each of the 5 skills below, create both `skill.yaml` and `SKILL.md` under `agents/skills/claude-code/<name>/`.

**IMPORTANT CONVENTIONS (from Phase B learnings):**

- `platforms` must include all 4: claude-code, gemini-cli, cursor, codex
- `paths` for JS skills: `['**/*.js', '**/*.mjs', '**/*.cjs']`
- `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide`
- `tools: []`, `state: { persistent: false, files: [] }`, `depends_on: []`
- SKILL.md must have `## When to Use`, `## Instructions`, `## Details`, `## Source` sections
- `## Instructions` section must be under 5K tokens

---

**1a. `agents/skills/claude-code/js-singleton-pattern/skill.yaml`:**

```yaml
name: js-singleton-pattern
version: '1.0.0'
description: Ensure a class has only one instance and provide a global access point
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-module-pattern
  - js-facade-pattern
stack_signals:
  - javascript
  - nodejs
keywords:
  - singleton
  - single-instance
  - global-state
  - creational-pattern
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/singleton-pattern'
state:
  persistent: false
  files: []
depends_on: []
```

**1b. `agents/skills/claude-code/js-singleton-pattern/SKILL.md`:**

````markdown
# JS Singleton Pattern

> Ensure a class has only one instance and provide a global access point

## When to Use

- You need exactly one instance of a class shared across the application (config, logger, cache)
- Multiple parts of the app must share the same state without prop drilling or context
- The instance is expensive to create and should be reused
- You are coordinating access to a shared resource (database connection pool, event bus)

## Instructions

1. Create a module-scoped variable to hold the single instance.
2. Export a factory function or class with a static `getInstance()` method that checks for an existing instance before creating one.
3. Prefer ES module singleton (module-level `const`) over class-based singleton — module caching ensures one instance per module graph automatically.
4. If the singleton holds mutable state, document all mutation points explicitly.
5. Avoid singletons for dependencies that should be injected — prefer dependency injection for testability.
6. In Node.js, be aware that `require` cache provides singleton semantics for CommonJS; ESM modules are also cached per specifier.

```javascript
// ES module singleton (preferred — module cache ensures one instance)
let instance = null;

class ConfigManager {
  constructor(config) {
    this.config = config;
  }
  get(key) {
    return this.config[key];
  }
}

export function getConfigManager(config = {}) {
  if (!instance) instance = new ConfigManager(config);
  return instance;
}
```
````

## Details

The Singleton pattern is one of the original Gang of Four creational patterns. In JavaScript, ES modules are cached by the runtime, making the module itself a natural singleton — any export from a module is effectively a singleton instance. The explicit `getInstance()` approach is often unnecessary unless you need lazy initialization or parameterized construction.

**Trade-offs:**

- Singletons make unit testing harder — tests share state unless the module cache is cleared between tests
- Global mutable state is a code smell; consider whether a singleton is the right abstraction or whether state should be local
- In environments with multiple module graphs (e.g., monorepos with duplicate dependencies), two "singletons" of the same class can exist

**When NOT to use:**

- When the object has no shared state — instantiate it fresh where needed
- When you need multiple independent instances in tests

## Source

https://patterns.dev/vanilla/singleton-pattern

````

---

**1c. `agents/skills/claude-code/js-prototype-pattern/skill.yaml`:**

```yaml
name: js-prototype-pattern
version: '1.0.0'
description: Share properties and methods among objects via prototype chain
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-constructor-pattern
  - js-mixin-pattern
stack_signals:
  - javascript
keywords:
  - prototype
  - prototype-chain
  - inheritance
  - object-creation
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/prototype-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**1d. `agents/skills/claude-code/js-prototype-pattern/SKILL.md`:**

````markdown
# JS Prototype Pattern

> Share properties and methods among objects via prototype chain

## When to Use

- Multiple objects need to share methods without duplicating them in memory
- You are implementing inheritance without using ES6 classes (legacy code or performance-critical paths)
- You want to add methods to built-in types (extend carefully — avoid modifying built-in prototypes in libraries)
- You need to clone objects using `Object.create()` with a shared prototype

## Instructions

1. Define shared methods on the prototype, not in the constructor — methods on the constructor create new function objects per instance.
2. Use `Object.create(proto)` to create objects with a specific prototype without calling a constructor.
3. Use ES6 `class` syntax as the modern way to work with prototypes — it compiles to prototype assignment.
4. Use `Object.getPrototypeOf(obj)` to inspect the prototype chain; avoid `__proto__` (deprecated).
5. Do not add properties to `Object.prototype` or `Array.prototype` — this pollutes the global prototype chain.

```javascript
// Prototype-based shared methods
function Animal(name) {
  this.name = name;
}
Animal.prototype.speak = function () {
  return `${this.name} makes a sound.`;
};

// ES6 class equivalent (same prototype mechanics)
class Animal {
  constructor(name) {
    this.name = name;
  }
  speak() {
    return `${this.name} makes a sound.`;
  }
}
```
````

## Details

JavaScript is a prototype-based language — inheritance is implemented via the prototype chain, not classes. ES6 `class` syntax is syntactic sugar over prototype assignment. Every object has a hidden `[[Prototype]]` link; when a property is not found on the object, the engine walks up the chain.

**Trade-offs:**

- Prototype methods are shared across all instances (memory-efficient) but mutations to prototype properties affect all instances
- Deep prototype chains can slow property lookups in hot code paths
- TypeScript class syntax hides prototype mechanics but generates the same output

**When NOT to use:**

- Avoid extending built-in prototypes (`Array.prototype`, `String.prototype`) in any code others consume — it causes silent conflicts

## Source

https://patterns.dev/vanilla/prototype-pattern

````

---

**1e. `agents/skills/claude-code/js-observer-pattern/skill.yaml`:**

```yaml
name: js-observer-pattern
version: '1.0.0'
description: Notify dependents automatically when an object's state changes
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-mediator-pattern
  - js-proxy-pattern
stack_signals:
  - javascript
  - nodejs
keywords:
  - observer
  - event-emitter
  - pub-sub
  - reactive
  - subscriptions
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/observer-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**1f. `agents/skills/claude-code/js-observer-pattern/SKILL.md`:**

````markdown
# JS Observer Pattern

> Notify dependents automatically when an object's state changes

## When to Use

- Multiple parts of the application need to react to state changes without tight coupling
- You are building an event system, pub/sub bus, or reactive data store
- You want to decouple the event source from its listeners
- You are implementing a custom EventEmitter or wrapping a DOM event system

## Instructions

1. Define an observable with `subscribe(fn)`, `unsubscribe(fn)`, and `notify(data)` methods.
2. Store subscribers in an array or Set; use Set to prevent duplicate subscriptions.
3. Always provide an `unsubscribe` mechanism — failure to unsubscribe leaks memory.
4. In Node.js, prefer the built-in `EventEmitter` from `'events'` over hand-rolling.
5. In the browser, consider `EventTarget` as a built-in observer substrate.
6. Keep notification synchronous unless you have a specific reason for async dispatch.

```javascript
class Observable {
  #subscribers = new Set();
  subscribe(fn) {
    this.#subscribers.add(fn);
    return () => this.#subscribers.delete(fn);
  }
  notify(data) {
    this.#subscribers.forEach((fn) => fn(data));
  }
}

const store = new Observable();
const unsub = store.subscribe((data) => console.log('received:', data));
store.notify({ type: 'UPDATE', payload: 42 });
unsub(); // clean up
```
````

## Details

The Observer pattern is foundational to JavaScript's event-driven model. The DOM, Node.js EventEmitter, RxJS, Vue's reactivity system, and React's useState all implement variants of it. The key difference from Pub/Sub is that Observer involves direct references between observable and observers; Pub/Sub introduces a message broker.

**Trade-offs:**

- Memory leaks are common — every `subscribe` without a corresponding `unsubscribe` leaks the subscriber
- Synchronous notification can cause re-entrant updates if a subscriber modifies the observable
- Ordering of notifications is not guaranteed unless your implementation sorts subscribers

**When NOT to use:**

- Simple one-to-one callbacks — a direct function reference is simpler
- When you need to order events or replay missed events — use a queue or stream instead

## Source

https://patterns.dev/vanilla/observer-pattern

````

---

**1g. `agents/skills/claude-code/js-factory-pattern/skill.yaml`:**

```yaml
name: js-factory-pattern
version: '1.0.0'
description: Create objects without specifying the exact class to instantiate
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-singleton-pattern
  - js-constructor-pattern
  - js-strategy-pattern
stack_signals:
  - javascript
  - nodejs
keywords:
  - factory
  - creational-pattern
  - object-creation
  - abstraction
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/factory-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**1h. `agents/skills/claude-code/js-factory-pattern/SKILL.md`:**

````markdown
# JS Factory Pattern

> Create objects without specifying the exact class to instantiate

## When to Use

- Object creation logic is complex or varies by configuration
- You want to decouple consumers from concrete classes
- You need to create objects of different types based on runtime input
- You are building a plugin system where the concrete type is determined at runtime

## Instructions

1. Create a factory function that returns objects — avoid using `new` in the consumer.
2. Name the factory after what it produces, not how it creates it (`createUser`, not `userFactory`).
3. Return a plain object or class instance — the consumer should not care which.
4. Validate input inside the factory before creating the object; throw descriptive errors for invalid configurations.
5. For complex factories with multiple variants, use a registry map (object or Map) keyed by type string.

```javascript
function createNotification(type, message) {
  const base = { message, createdAt: new Date() };
  const variants = {
    success: () => ({ ...base, icon: '✓', color: 'green' }),
    error: () => ({ ...base, icon: '✗', color: 'red' }),
    info: () => ({ ...base, icon: 'i', color: 'blue' }),
  };
  if (!variants[type]) throw new Error(`Unknown notification type: ${type}`);
  return variants[type]();
}
```
````

## Details

The Factory pattern is one of the most commonly used creational patterns in JavaScript. It is especially useful in TypeScript-heavy codebases where you want to return a type union based on discriminated input. The Abstract Factory variant produces families of related objects (e.g., a UI component factory for light vs dark themes).

**Trade-offs:**

- Factories hide the concrete type — this can make debugging harder if you rely on `instanceof` checks
- Over-abstracting simple object creation adds indirection with no benefit

**When NOT to use:**

- When object creation is simple and unlikely to vary — a direct `new` call or object literal is clearer

## Source

https://patterns.dev/vanilla/factory-pattern

````

---

**1i. `agents/skills/claude-code/js-proxy-pattern/skill.yaml`:**

```yaml
name: js-proxy-pattern
version: '1.0.0'
description: Intercept and control access to objects via a Proxy wrapper
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-observer-pattern
  - js-decorator-pattern
stack_signals:
  - javascript
keywords:
  - proxy
  - reflect
  - interception
  - validation
  - reactivity
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/proxy-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**1j. `agents/skills/claude-code/js-proxy-pattern/SKILL.md`:**

````markdown
# JS Proxy Pattern

> Intercept and control access to objects via a Proxy wrapper

## When to Use

- You need to add validation, logging, or access control to object property reads/writes
- You are implementing reactive data (e.g., Vue 3's reactivity system uses Proxy)
- You want to lazily load or compute values on property access
- You need to create a virtual object interface over a remote or expensive resource

## Instructions

1. Use `new Proxy(target, handler)` — `target` is the original object, `handler` defines traps.
2. Use `Reflect.*` methods in traps to preserve default behavior alongside your interception logic.
3. Common traps: `get` (read), `set` (write), `has` (in operator), `deleteProperty`, `apply` (function call).
4. Always return `true` from a `set` trap when the assignment succeeds (strict mode throws if you don't).
5. Keep traps lightweight — Proxy traps run on every access and can be a hot path.

```javascript
function createValidated(target, schema) {
  return new Proxy(target, {
    set(obj, prop, value) {
      if (schema[prop] && !schema[prop](value)) {
        throw new TypeError(`Invalid value for ${prop}: ${value}`);
      }
      return Reflect.set(obj, prop, value);
    },
  });
}

const user = createValidated({}, { age: (v) => typeof v === 'number' && v >= 0 });
user.age = 25; // ok
user.age = -1; // throws TypeError
```
````

## Details

JavaScript's `Proxy` (ES2015) enables metaprogramming — intercepting fundamental language operations. Vue 3 replaced its `Object.defineProperty`-based reactivity (Vue 2) with Proxy in Vue 3, gaining array mutation tracking and dynamic property support. The `Reflect` API mirrors the Proxy trap signatures, making it easy to delegate to default behavior.

**Trade-offs:**

- Proxied objects cannot be polyfilled for older browsers — ES5 targets cannot use Proxy
- Proxies add a per-access overhead; avoid on very hot inner loops
- `instanceof` and `typeof` checks on the proxy return the proxy's type, not the target's

**When NOT to use:**

- Simple property validation — TypeScript types or a setter suffice
- When you need to support IE11 or environments without native Proxy

## Source

https://patterns.dev/vanilla/proxy-pattern

````

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests continue to pass (new skill dirs are detected, schema validation runs on each)
4. Run: `harness validate`
5. Commit: `feat(skills): add js-singleton, js-prototype, js-observer, js-factory, js-proxy knowledge skills`

---

### Task 2: JS Skills Batch 2 — mediator, command, mixin, flyweight, chain-of-responsibility

**Depends on:** none (parallel with Task 1)
**Files:** agents/skills/claude-code/js-{mediator,command,mixin,flyweight}-pattern/{skill.yaml,SKILL.md} + agents/skills/claude-code/js-chain-of-responsibility/{skill.yaml,SKILL.md}

**2a. `agents/skills/claude-code/js-mediator-pattern/skill.yaml`:**

```yaml
name: js-mediator-pattern
version: '1.0.0'
description: Reduce direct dependencies by routing communication through a mediator
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-observer-pattern
  - js-command-pattern
stack_signals:
  - javascript
  - nodejs
keywords:
  - mediator
  - event-bus
  - decoupling
  - coordination
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/mediator-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**2b. `agents/skills/claude-code/js-mediator-pattern/SKILL.md`:**

````markdown
# JS Mediator Pattern

> Reduce direct dependencies by routing communication through a mediator

## When to Use

- Multiple components need to communicate but direct coupling would create a tangled dependency graph
- You are building a chat room, event bus, or workflow coordinator
- You want to change how components interact without modifying the components themselves
- You need a single place to add cross-cutting logic like logging, throttling, or permission checks

## Instructions

1. Create a mediator object with a `send(event, data, sender)` method that routes messages to registered participants.
2. Participants register with the mediator, not with each other — they never hold direct references to one another.
3. Keep the mediator focused on routing logic; move business logic into the participants.
4. Name the mediator after the coordination domain (`ChatRoom`, `WorkflowCoordinator`, not `Mediator`).
5. Consider using an EventEmitter as the mediator substrate in Node.js.

```javascript
class EventBus {
  #handlers = new Map();
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event).delete(fn);
  }
  emit(event, data) {
    this.#handlers.get(event)?.forEach((fn) => fn(data));
  }
}

const bus = new EventBus();
bus.on('user:login', ({ userId }) => console.log(`User ${userId} logged in`));
bus.emit('user:login', { userId: 42 });
```
````

## Details

The Mediator pattern reduces "spaghetti" coupling in complex UIs or workflows. The difference from Observer: in Observer the subject broadcasts to all subscribers; in Mediator, the mediator has full control over routing and can implement filtering, transformation, or gating logic.

**Trade-offs:**

- The mediator itself can become a "god object" if it accumulates too much logic
- Hard to trace the flow of a message through a large mediator without good logging

**When NOT to use:**

- Simple parent-child communication — props/callbacks are clearer
- Two components that will always be tightly coupled — abstraction adds cost without benefit

## Source

https://patterns.dev/vanilla/mediator-pattern

````

**2c. `agents/skills/claude-code/js-command-pattern/skill.yaml`:**

```yaml
name: js-command-pattern
version: '1.0.0'
description: Encapsulate actions as objects to support undo, queuing, and logging
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-strategy-pattern
  - js-mediator-pattern
stack_signals:
  - javascript
keywords:
  - command
  - undo-redo
  - action-queue
  - encapsulation
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/command-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**2d. `agents/skills/claude-code/js-command-pattern/SKILL.md`:**

````markdown
# JS Command Pattern

> Encapsulate actions as objects to support undo, queuing, and logging

## When to Use

- You need undo/redo functionality (text editors, drawing apps, form builders)
- Actions must be logged, queued, or scheduled for later execution
- You want to decouple the invoker of an action from its executor
- You are implementing a macro system or transaction log

## Instructions

1. Define each action as an object with `execute()` and optionally `undo()` methods.
2. Maintain an `executedCommands` stack; push after `execute()`, pop and call `undo()` on undo.
3. Add a `redo` stack: move from `executedCommands` to `redoStack` on undo, reverse on redo.
4. Keep commands serializable (plain data + action name) if they need to persist across sessions.
5. Name commands after the action they perform (`AddItemCommand`, `DeleteRowCommand`).

```javascript
class AddItemCommand {
  constructor(list, item) {
    this.list = list;
    this.item = item;
  }
  execute() {
    this.list.push(this.item);
  }
  undo() {
    this.list.splice(this.list.indexOf(this.item), 1);
  }
}

const history = [];
const list = [];
const cmd = new AddItemCommand(list, 'apple');
cmd.execute(); // list = ['apple']
history.push(cmd);
history.pop().undo(); // list = []
```
````

## Details

The Command pattern is the foundation of undo/redo in collaborative editing tools. It also enables command queuing (e.g., defer execution until network is available), batching (group multiple commands into a single undo step), and audit logging (serialize the command queue to reconstruct state).

**Trade-offs:**

- Command objects add overhead for simple one-shot actions
- Undo logic must mirror execute logic perfectly — mismatches cause hard-to-debug state corruption

**When NOT to use:**

- Actions that cannot be undone (irreversible API calls) — skip the `undo()` implementation or mark commands as non-undoable
- One-shot fire-and-forget actions — a plain function call is simpler

## Source

https://patterns.dev/vanilla/command-pattern

````

**2e. `agents/skills/claude-code/js-mixin-pattern/skill.yaml`:**

```yaml
name: js-mixin-pattern
version: '1.0.0'
description: Add reusable behavior to objects and classes without inheritance
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-prototype-pattern
  - js-decorator-pattern
stack_signals:
  - javascript
keywords:
  - mixin
  - composition
  - multiple-inheritance
  - behavior-reuse
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/mixin-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**2f. `agents/skills/claude-code/js-mixin-pattern/SKILL.md`:**

````markdown
# JS Mixin Pattern

> Add reusable behavior to objects and classes without inheritance

## When to Use

- Multiple unrelated classes need the same behavior but a shared base class would create an awkward hierarchy
- You want to compose behavior from multiple sources (JavaScript only supports single inheritance)
- You are adding cross-cutting concerns like serialization, logging, or event emission to classes

## Instructions

1. Define a mixin as a function that takes a superclass and returns an extended class.
2. Apply mixins with `class Foo extends SerializableMixin(LoggableMixin(Base))`.
3. Keep each mixin focused on one concern — mixins that do too much create the same problems as deep inheritance.
4. Prefer object spread for simple property mixing; use class mixins only when you need prototype methods.
5. Avoid mixins that modify shared mutable state — this creates action-at-a-distance bugs.

```javascript
const Serializable = (Base) =>
  class extends Base {
    serialize() {
      return JSON.stringify(this);
    }
    static deserialize(json) {
      return Object.assign(new this(), JSON.parse(json));
    }
  };

const Timestamped = (Base) =>
  class extends Base {
    constructor(...args) {
      super(...args);
      this.createdAt = new Date();
    }
  };

class User extends Serializable(Timestamped(EventTarget)) {
  constructor(name) {
    super();
    this.name = name;
  }
}
```
````

## Details

JavaScript mixins are a composition pattern for class hierarchies. TypeScript supports a similar approach via declaration merging and class expressions. The functional mixin form (function returning a class) is preferred over copying methods with `Object.assign` because it preserves the prototype chain and works with `instanceof`.

**Trade-offs:**

- Multiple mixins can introduce method name conflicts — last-applied wins silently
- Debugging mixin stacks can be difficult — stack traces show generated class names
- TypeScript typings for deeply composed mixins can become complex

**When NOT to use:**

- When a simple utility function achieves the same result
- When composition via explicit method delegation is clearer than implicit inheritance

## Source

https://patterns.dev/vanilla/mixin-pattern

````

**2g. `agents/skills/claude-code/js-flyweight-pattern/skill.yaml`:**

```yaml
name: js-flyweight-pattern
version: '1.0.0'
description: Share common state across many fine-grained objects to reduce memory
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-singleton-pattern
  - js-factory-pattern
stack_signals:
  - javascript
  - nodejs
keywords:
  - flyweight
  - memory-optimization
  - shared-state
  - object-pooling
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/flyweight-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**2h. `agents/skills/claude-code/js-flyweight-pattern/SKILL.md`:**

````markdown
# JS Flyweight Pattern

> Share common state across many fine-grained objects to reduce memory

## When to Use

- You create a large number of similar objects and memory usage is a concern
- Objects have both intrinsic state (shared, immutable) and extrinsic state (unique per instance)
- You are rendering a large dataset where many rows share the same cell templates
- You are building a game or simulation with thousands of similar entities

## Instructions

1. Identify intrinsic state (shared: cell type, format template) vs extrinsic state (unique: cell value, position).
2. Create a flyweight factory that caches and returns shared flyweight objects keyed by intrinsic state.
3. Store extrinsic state outside the flyweight, in the context that uses it.
4. Use a `Map` or `WeakMap` as the flyweight cache for O(1) lookup.

```javascript
class BookFlyweight {
  constructor(title, author) {
    this.title = title;
    this.author = author;
  }
}

const flyweightFactory = (() => {
  const cache = new Map();
  return {
    get(title, author) {
      const key = `${title}:${author}`;
      if (!cache.has(key)) cache.set(key, new BookFlyweight(title, author));
      return cache.get(key);
    },
    count: () => cache.size,
  };
})();

// 1000 copies — only one BookFlyweight per title/author pair
const copies = Array.from({ length: 1000 }, (_, i) => ({
  flyweight: flyweightFactory.get('SICP', 'Abelson'),
  copyId: i,
}));
```
````

## Details

The Flyweight pattern is a memory optimization applicable when you have many objects sharing common data. It trades CPU time (cache lookup) for memory. The pattern is common in rendering engines (shared glyph descriptors in text layout), game engines (shared sprite sheets), and virtual DOM implementations.

**Trade-offs:**

- Adds indirection — code is harder to follow than simple object construction
- Only beneficial when the shared state is truly large; premature flyweight optimization is not worth it

**When NOT to use:**

- When memory is not a concern and object count is small
- When intrinsic/extrinsic separation would make the code significantly more complex

## Source

https://patterns.dev/vanilla/flyweight-pattern

````

**2i. `agents/skills/claude-code/js-chain-of-responsibility/skill.yaml`:**

```yaml
name: js-chain-of-responsibility
version: '1.0.0'
description: Pass requests along a handler chain until one handles it
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-strategy-pattern
  - js-command-pattern
stack_signals:
  - javascript
  - nodejs
keywords:
  - chain-of-responsibility
  - middleware
  - pipeline
  - handler-chain
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/chain-of-responsibility'
state:
  persistent: false
  files: []
depends_on: []
````

**2j. `agents/skills/claude-code/js-chain-of-responsibility/SKILL.md`:**

````markdown
# JS Chain of Responsibility

> Pass requests along a handler chain until one handles it

## When to Use

- Multiple handlers may process a request and the handler is selected at runtime
- You are implementing middleware (Express, Koa, Next.js API routes all use this pattern)
- You need to decouple the sender of a request from its receivers
- You want to add/remove processing steps without changing the core logic

## Instructions

1. Define a handler interface with a `handle(request)` method and a `setNext(handler)` method.
2. Each handler either handles the request or passes it to `this.next.handle(request)`.
3. The simplest form is an array of functions composed with `next()` — this is exactly Express/Koa middleware.
4. Use the functional form (array of handlers with `compose`) for stateless pipelines.
5. Use the class form when handlers need to hold configuration or be dynamically chained.

```javascript
// Functional middleware chain (Express-style)
function createMiddlewareChain(middlewares) {
  return function runChain(req, res) {
    let idx = 0;
    function next(err) {
      if (err) throw err;
      const mw = middlewares[idx++];
      if (mw) mw(req, res, next);
    }
    next();
  };
}
```
````

## Details

Chain of Responsibility is the backbone of Node.js middleware frameworks. Express, Koa, Fastify, and Next.js API routes all implement it. The pattern is also used in event handling (DOM event bubbling), log pipelines (filter → transform → output), and authorization (authenticate → authorize → rate-limit → handle).

**Trade-offs:**

- Requests can fall through the entire chain without being handled — always add a fallback handler at the end
- Debugging a long chain is harder; instrument with logging at each step

**When NOT to use:**

- When exactly one handler should always handle the request — use a strategy or map instead

## Source

https://patterns.dev/vanilla/chain-of-responsibility-pattern

````

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests pass
4. Run: `harness validate`
5. Commit: `feat(skills): add js-mediator, js-command, js-mixin, js-flyweight, js-chain-of-responsibility knowledge skills`

---

### Task 3: JS Skills Batch 3 — iterator, strategy, template-method, visitor, decorator

**Depends on:** none (parallel with Tasks 1–2)
**Files:** agents/skills/claude-code/js-{iterator,strategy,template-method,visitor,decorator}-pattern/{skill.yaml,SKILL.md}

For each skill, create `skill.yaml` (with standard knowledge skill fields) and `SKILL.md` (with `## When to Use`, `## Instructions`, `## Details`, `## Source`). Follow the exact structure from Tasks 1–2.

**3a. `agents/skills/claude-code/js-iterator-pattern/skill.yaml`:**

```yaml
name: js-iterator-pattern
version: '1.0.0'
description: Traverse collections sequentially without exposing internal structure
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-strategy-pattern
  - js-compose-and-pipe
stack_signals:
  - javascript
keywords:
  - iterator
  - iterable
  - generator
  - traversal
  - symbol-iterator
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/iterator-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**3b. `agents/skills/claude-code/js-iterator-pattern/SKILL.md`:**

````markdown
# JS Iterator Pattern

> Traverse collections sequentially without exposing internal structure

## When to Use

- You have a custom data structure (tree, graph, linked list) and want it to work with `for...of`, spread, and destructuring
- You are building a lazy sequence that produces values on demand (infinite sequences, streams)
- You want to abstract traversal logic from the data structure consumer
- You need to produce values asynchronously (`AsyncIterator`, `for await...of`)

## Instructions

1. Implement the iterable protocol: define `[Symbol.iterator]()` returning an object with `next()`.
2. `next()` returns `{ value, done }` — `done: true` signals end of sequence.
3. Use generator functions (`function*`) as the simplest way to create iterators — yield handles state automatically.
4. For async iteration, use `async function*` and `[Symbol.asyncIterator]`.
5. Built-in iterables: Array, String, Map, Set, NodeList — all work with `for...of` out of the box.

```javascript
// Custom range iterator via generator
function* range(start, end, step = 1) {
  for (let i = start; i < end; i += step) yield i;
}

for (const n of range(0, 10, 2)) console.log(n); // 0, 2, 4, 6, 8

// Class implementing iterable protocol
class LinkedList {
  [Symbol.iterator]() {
    let current = this.head;
    return {
      next() {
        if (!current) return { done: true, value: undefined };
        const value = current.value;
        current = current.next;
        return { done: false, value };
      },
    };
  }
}
```
````

## Details

JavaScript has first-class iterator support via `Symbol.iterator` and `Symbol.asyncIterator`. Generators (`function*`) implement the iterable protocol automatically. The pattern is used extensively in Node.js streams, database cursors, and lazy evaluation libraries. Async iterators are ideal for paginated API responses or file line-by-line reading.

**Trade-offs:**

- Generator-based iterators maintain state internally — debugging requires stepping through yields
- Async iterators cannot be used with spread (`[...asyncIterator]`) — must use `for await...of`

**When NOT to use:**

- Simple array traversal — `forEach`, `map`, `filter` are clearer

## Source

https://patterns.dev/vanilla/iterator-pattern

````

**3c. `agents/skills/claude-code/js-strategy-pattern/skill.yaml`:**

```yaml
name: js-strategy-pattern
version: '1.0.0'
description: Define a family of algorithms, encapsulate each, and make them interchangeable
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-factory-pattern
  - js-command-pattern
  - js-template-method-pattern
stack_signals:
  - javascript
keywords:
  - strategy
  - algorithm-selection
  - interchangeable
  - open-closed-principle
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/strategy-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**3d. `agents/skills/claude-code/js-strategy-pattern/SKILL.md`:**

````markdown
# JS Strategy Pattern

> Define a family of algorithms, encapsulate each, and make them interchangeable

## When to Use

- Multiple algorithms accomplish the same task but differ in implementation (sorting, compression, payment processing)
- You need to switch algorithms at runtime based on context or configuration
- You want to eliminate large conditional chains (`if/else` or `switch`) that select between behaviors
- You are building a pluggable system where behaviors are injected (validators, formatters, serializers)

## Instructions

1. Define a common interface (function signature or class method shape) for all strategies.
2. Implement each strategy as a separate function or class — one strategy per file for complex cases.
3. Inject the strategy into the context via constructor or parameter, not via hardcoded selection logic.
4. In JavaScript, strategies are often plain functions — a Map keyed by name is a lightweight strategy registry.

```javascript
// Strategy registry (function map)
const sortStrategies = {
  bubble: (arr) => {
    /* bubble sort */ return arr;
  },
  quick: (arr) => {
    /* quicksort */ return [...arr].sort((a, b) => a - b);
  },
  merge: (arr) => {
    /* merge sort */ return arr;
  },
};

function sortData(data, strategy = 'quick') {
  const fn = sortStrategies[strategy];
  if (!fn) throw new Error(`Unknown sort strategy: ${strategy}`);
  return fn(data);
}
```
````

## Details

In JavaScript, the Strategy pattern is often implemented with first-class functions rather than class hierarchies. A function that accepts a callback or a strategy map keyed by string achieves the same result with less ceremony. The pattern is heavily used in payment processing (Stripe, PayPal, Apple Pay strategies), content negotiation, and data pipeline steps.

**Trade-offs:**

- Clients must be aware of available strategies — increases coupling if strategy selection logic leaks out
- Too many strategies can make a registry hard to navigate; document each with jsdoc

**When NOT to use:**

- When there is only one algorithm — no need for a strategy interface

## Source

https://patterns.dev/vanilla/strategy-pattern

````

**3e. `agents/skills/claude-code/js-template-method-pattern/skill.yaml`:**

```yaml
name: js-template-method-pattern
version: '1.0.0'
description: Define the skeleton of an algorithm, deferring some steps to subclasses
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-strategy-pattern
  - js-mixin-pattern
stack_signals:
  - javascript
keywords:
  - template-method
  - algorithm-skeleton
  - hooks
  - inheritance
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/template-method-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**3f. `agents/skills/claude-code/js-template-method-pattern/SKILL.md`:**

````markdown
# JS Template Method Pattern

> Define the skeleton of an algorithm, deferring some steps to subclasses

## When to Use

- Multiple classes share the same algorithm structure but differ in specific steps
- You want to prevent subclasses from changing the overall algorithm flow while allowing customization of individual steps
- You are building a data processing pipeline with fixed stages (parse → validate → transform → output)
- You have a base class that defines a workflow and subclasses that specialize individual hooks

## Instructions

1. Define the template method as a `final`-intent method in the base class (call it from the template method, don't override it).
2. Extract variable steps into protected hook methods — subclasses override only the hooks.
3. Provide default implementations for optional hooks; require override for mandatory hooks (throw if not implemented).
4. In JavaScript, use abstract-style protection by throwing in the base implementation: `throw new Error('Not implemented')`.

```javascript
class DataProcessor {
  // Template method — do not override
  process(data) {
    const parsed = this.parse(data);
    const validated = this.validate(parsed);
    return this.transform(validated);
  }
  parse(data) {
    throw new Error('parse() must be implemented');
  }
  validate(data) {
    return data;
  } // optional hook with default
  transform(data) {
    throw new Error('transform() must be implemented');
  }
}

class CsvProcessor extends DataProcessor {
  parse(data) {
    return data.split('\n').map((r) => r.split(','));
  }
  transform(rows) {
    return rows.map((r) => ({ id: r[0], name: r[1] }));
  }
}
```
````

## Details

The Template Method pattern is classic in framework design — React's lifecycle methods, Express middleware, and Jest's `beforeEach`/`afterEach` all apply this concept. The key insight is that the base class controls flow while subclasses fill in behavior. Prefer composition (Strategy) over inheritance (Template Method) when the step variation is significant or when multiple algorithms need to be combined at runtime.

**Trade-offs:**

- Inheritance creates tight coupling between base and subclass — changes to the template method affect all subclasses
- Deep hierarchies make the algorithm hard to follow without examining every level

**When NOT to use:**

- When the algorithm variation is better handled by injection (use Strategy instead)

## Source

https://patterns.dev/vanilla/template-pattern

````

**3g. `agents/skills/claude-code/js-visitor-pattern/skill.yaml`:**

```yaml
name: js-visitor-pattern
version: '1.0.0'
description: Add operations to objects without modifying their classes
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-strategy-pattern
  - js-iterator-pattern
stack_signals:
  - javascript
keywords:
  - visitor
  - double-dispatch
  - ast-traversal
  - extensibility
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/visitor-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**3h. `agents/skills/claude-code/js-visitor-pattern/SKILL.md`:**

````markdown
# JS Visitor Pattern

> Add operations to objects without modifying their classes

## When to Use

- You need to add new operations to an object hierarchy without modifying the classes
- You are traversing an AST, DOM tree, or other composite structure and need to perform multiple distinct operations
- You want to keep related operations together in a visitor rather than scattered across many classes
- You are implementing serialization, validation, or rendering passes over an object graph

## Instructions

1. Add an `accept(visitor)` method to each element class — it calls `visitor.visit<ClassName>(this)`.
2. Define a visitor interface with a `visit*()` method for each element type.
3. Implement separate visitor classes for each operation (render, serialize, validate).
4. For JavaScript without strict typing, use a single `visit(node)` method with type discriminators instead of per-type methods.

```javascript
// AST visitor example
class NumberNode {
  constructor(value) {
    this.value = value;
  }
  accept(v) {
    return v.visitNumber(this);
  }
}
class AddNode {
  constructor(l, r) {
    this.left = l;
    this.right = r;
  }
  accept(v) {
    return v.visitAdd(this);
  }
}

class EvalVisitor {
  visitNumber(node) {
    return node.value;
  }
  visitAdd(node) {
    return node.left.accept(this) + node.right.accept(this);
  }
}

const tree = new AddNode(new NumberNode(1), new NumberNode(2));
console.log(tree.accept(new EvalVisitor())); // 3
```
````

## Details

The Visitor pattern solves the "expression problem" — adding new operations to a fixed set of types without modifying those types. It is used extensively in compiler front-ends (AST walkers), static analysis tools (ESLint rules walk ASTs via visitors), and document rendering pipelines.

**Trade-offs:**

- Adding a new element type requires updating all visitor implementations — the inverse of the problem it solves for operations
- Double dispatch is not idiomatic in JavaScript — simpler alternatives exist for small hierarchies

**When NOT to use:**

- Small, stable hierarchies — a simple `switch(node.type)` is clearer

## Source

https://patterns.dev/vanilla/visitor-pattern

````

**3i. `agents/skills/claude-code/js-decorator-pattern/skill.yaml`:**

```yaml
name: js-decorator-pattern
version: '1.0.0'
description: Attach additional responsibilities to objects dynamically
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
related_skills:
  - js-mixin-pattern
  - js-proxy-pattern
  - js-higher-order-functions
stack_signals:
  - javascript
  - typescript
keywords:
  - decorator
  - wrapper
  - higher-order
  - composition
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/decorator-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**3j. `agents/skills/claude-code/js-decorator-pattern/SKILL.md`:**

````markdown
# JS Decorator Pattern

> Attach additional responsibilities to objects dynamically

## When to Use

- You need to add behavior to individual objects without affecting others of the same class
- You want to add cross-cutting concerns (logging, caching, retry, rate-limiting) to functions
- You are using TypeScript/JavaScript decorators (`@decorator` syntax — Stage 3 proposal) for class members
- You want to compose wrappers dynamically at runtime rather than statically at class definition

## Instructions

1. For function decoration: wrap the function in another function that adds behavior before/after the original call.
2. Preserve the function signature — the wrapper should accept and pass through all arguments.
3. For class decorators (TypeScript/Stage 3): use `@decorator` syntax on classes, methods, or properties.
4. Keep decorators single-purpose — one decorator per concern (logging, caching, retry).
5. Name decorators after the concern they add, not the thing they wrap (`withLogging`, `withCache`, `@memoize`).

```javascript
// Function wrapper decorator
function withRetry(fn, maxAttempts = 3) {
  return async function retried(...args) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, attempt * 200));
      }
    }
  };
}

const fetchUser = withRetry(async (id) => {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});
```
````

## Details

The Decorator pattern is one of the most commonly used patterns in JavaScript. Higher-order functions are its functional form. React's Higher-Order Components (HOCs), Redux's `connect()`, and Express/Koa middleware all use the same wrapping concept. TypeScript's `@decorator` syntax formalizes this for class member annotation.

**Trade-offs:**

- Deep stacks of decorators make debugging harder — the call stack shows wrapped names
- Function wrappers can lose `this` binding if not handled carefully

**When NOT to use:**

- When inheritance or composition is a cleaner fit
- When the decorator adds so much behavior that the wrapped function's identity is lost

## Source

https://patterns.dev/vanilla/decorator-pattern

````

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests pass
4. Run: `harness validate`
5. Commit: `feat(skills): add js-iterator, js-strategy, js-template-method, js-visitor, js-decorator knowledge skills`

---

### Task 4: JS Skills Batch 4 — facade, module, revealing-module, constructor, hoisting, scope-patterns, closure

**Depends on:** none (parallel with Tasks 1–3)
**Files:** agents/skills/claude-code/js-{facade,module,revealing-module,constructor,hoisting,scope-patterns,closure-pattern}/{skill.yaml,SKILL.md}

For each skill, create `skill.yaml` and `SKILL.md` following the exact structure from Tasks 1–3. Key fields per skill:

**`js-facade-pattern`:**
- description: `Provide a simplified interface to a complex subsystem`
- keywords: `['facade', 'simplification', 'abstraction', 'api-design']`
- related_skills: `['js-module-pattern', 'js-mediator-pattern']`
- upstream: `PatternsDev/skills/javascript/facade-pattern`
- SKILL.md content: When to Use (hiding complex subsystem APIs, wrapping third-party libraries, providing domain-specific API over generic API), Instructions (create a class/function that delegates to subsystem, don't expose subsystem internals, name after the domain not the subsystem), Details (facade vs adapter: adapter converts interface, facade simplifies it), Source: https://patterns.dev/vanilla/facade-pattern

**`js-module-pattern`:**
- description: `Encapsulate implementation details and expose a clean public API`
- keywords: `['module', 'encapsulation', 'iife', 'private-state']`
- related_skills: `['js-revealing-module', 'js-singleton-pattern']`
- upstream: `PatternsDev/skills/javascript/module-pattern`
- SKILL.md content: When to Use (encapsulating private state in pre-ES module environments, namespace management, self-contained utility modules), Instructions (use IIFE for pre-ES modules, use ES modules (`export`/`import`) as modern equivalent, avoid global pollution), Details (ES modules replaced IIFE module pattern — prefer ESM; IIFE still valid for browser scripts without bundler), Source: https://patterns.dev/vanilla/module-pattern

**`js-revealing-module`:**
- description: `Explicitly map private functions to public names in the return object`
- keywords: `['revealing-module', 'public-api', 'encapsulation', 'iife']`
- related_skills: `['js-module-pattern', 'js-facade-pattern']`
- upstream: `PatternsDev/skills/javascript/revealing-module`
- SKILL.md content: When to Use (all logic defined privately, then selectively revealed; consistent naming between private and public API), Instructions (define all functions privately, return an object mapping public names to private functions, do not expose internal state directly), Source: https://patterns.dev/vanilla/revealing-module-pattern

**`js-constructor-pattern`:**
- description: `Create and initialize objects using the new keyword and constructor functions`
- keywords: `['constructor', 'new', 'instantiation', 'object-creation']`
- related_skills: `['js-prototype-pattern', 'js-factory-pattern']`
- upstream: `PatternsDev/skills/javascript/constructor-pattern`
- SKILL.md content: When to Use (creating multiple instances of the same type, class-based OOP, initializing object state via arguments), Instructions (use class syntax over constructor functions in modern code, validate required parameters in constructor, don't perform async work in constructors — use factory functions instead), Source: https://patterns.dev/vanilla/constructor-pattern

**`js-hoisting`:**
- description: `Understand how variable and function declarations are moved to scope top`
- keywords: `['hoisting', 'var', 'function-declaration', 'temporal-dead-zone']`
- related_skills: `['js-scope-patterns', 'js-closure-pattern']`
- stack_signals: `['javascript']`
- upstream: `PatternsDev/skills/javascript/hoisting`
- SKILL.md content: When to Use (understanding hoisting when debugging unexpected undefined values or call-before-declaration), Instructions (prefer `const`/`let` over `var` — no hoisting surprises; function declarations are hoisted, function expressions are not; `let`/`const` are hoisted but not initialized — temporal dead zone), Source: https://patterns.dev/vanilla/hoisting

**`js-scope-patterns`:**
- description: `Manage variable visibility using block, function, and module scope`
- keywords: `['scope', 'closure', 'block-scope', 'lexical-scope', 'module-scope']`
- related_skills: `['js-closure-pattern', 'js-hoisting', 'js-module-pattern']`
- upstream: `PatternsDev/skills/javascript/scope-patterns`
- SKILL.md content: When to Use (understanding variable lifetime, preventing variable leaks, scoping loop variables), Instructions (use `const` by default, `let` for mutable, never `var`; use IIFE or block `{}` for temporary scope; module scope is private by default — only exported names are public), Source: https://patterns.dev/vanilla/scope

**`js-closure-pattern`:**
- description: `Capture enclosing scope variables to create private state and partial application`
- keywords: `['closure', 'private-state', 'partial-application', 'currying', 'encapsulation']`
- related_skills: `['js-module-pattern', 'js-scope-patterns', 'js-compose-and-pipe']`
- upstream: `PatternsDev/skills/javascript/closure-pattern`
- SKILL.md content: When to Use (factory functions with private state, event handlers capturing outer scope, partial application and currying), Instructions (return a function that references outer variables to create closure, be aware closures keep referenced variables alive — potential memory consideration in tight loops), Source: https://patterns.dev/vanilla/closure

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests pass
4. Run: `harness validate`
5. Commit: `feat(skills): add js-facade, js-module, js-revealing-module, js-constructor, js-hoisting, js-scope-patterns, js-closure knowledge skills`

---

### Task 5: JS Skills Batch 5 — static-import, dynamic-import, compose-and-pipe, barrel, lazy-initialization

**Depends on:** none (parallel with Tasks 1–4)
**Files:** agents/skills/claude-code/js-{static-import,dynamic-import,compose-and-pipe,barrel-pattern,lazy-initialization}/{skill.yaml,SKILL.md}

**`js-static-import`:**
- description: `Bundle all dependencies at build time via ES module static imports`
- keywords: `['static-import', 'es-modules', 'bundling', 'tree-shaking']`
- related_skills: `['js-dynamic-import', 'js-barrel-pattern', 'react-static-import']`
- stack_signals: `['javascript', 'webpack', 'vite']`
- upstream: `PatternsDev/skills/javascript/static-import`
- SKILL.md: When to Use (always-needed dependencies, enabling tree-shaking, top-level imports analyzed by bundlers), Instructions (use top-level `import` statements only; avoid conditional imports for statically analyzable modules; use named exports over default exports for better tree-shaking), Source: https://patterns.dev/vanilla/static-import

**`js-dynamic-import`:**
- description: `Load modules on demand at runtime to reduce initial bundle size`
- keywords: `['dynamic-import', 'code-splitting', 'lazy-loading', 'bundle-size']`
- related_skills: `['js-static-import', 'js-lazy-initialization', 'react-dynamic-import']`
- stack_signals: `['javascript', 'webpack', 'vite']`
- upstream: `PatternsDev/skills/javascript/dynamic-import`
- SKILL.md: When to Use (large modules needed only in specific flows, route-based code splitting, polyfills loaded only when needed), Instructions (`const module = await import('./path')` — returns a Promise; wrap in try/catch for error handling; use webpack `/* webpackChunkName */` magic comments for named chunks; test lazy-loaded modules explicitly), Source: https://patterns.dev/vanilla/dynamic-import

**`js-compose-and-pipe`:**
- description: `Build data transformation pipelines by composing small pure functions`
- keywords: `['compose', 'pipe', 'functional-programming', 'point-free', 'data-transformation']`
- related_skills: `['js-strategy-pattern', 'js-iterator-pattern', 'js-closure-pattern']`
- upstream: `PatternsDev/skills/javascript/compose-and-pipe`
- SKILL.md: When to Use (chaining data transformations, avoiding deeply nested function calls, building reusable data pipelines), Instructions (pipe applies left-to-right, compose applies right-to-left; keep each function pure and single-purpose; use `Array.prototype.reduce` to implement compose/pipe), Source: https://patterns.dev/vanilla/compose-pattern

**`js-barrel-pattern`:**
- description: `Re-export module members from an index file to simplify imports`
- keywords: `['barrel', 'index-file', 're-export', 'module-organization']`
- related_skills: `['js-module-pattern', 'js-static-import', 'js-facade-pattern']`
- upstream: `PatternsDev/skills/javascript/barrel-pattern`
- SKILL.md: When to Use (grouping related exports behind a single entry point, simplifying deep import paths, creating a public API surface for a module directory), Instructions (create `index.ts` that re-exports public members; only export what consumers need; beware: barrel files can break tree-shaking if bundler cannot analyze re-exports), Source: https://patterns.dev/vanilla/barrel-pattern

**`js-lazy-initialization`:**
- description: `Defer expensive object creation until the value is first accessed`
- keywords: `['lazy-initialization', 'on-demand', 'getter', 'memoization']`
- related_skills: `['js-singleton-pattern', 'js-dynamic-import', 'js-proxy-pattern']`
- upstream: `PatternsDev/skills/javascript/lazy-initialization`
- SKILL.md: When to Use (expensive object construction only needed on first access, optional features that many users never trigger, circular dependency avoidance via deferred initialization), Instructions (use `get` accessor or explicit `init()` check; set value on first access to avoid recomputation; prefer lazy property getter over manual null-check pattern), Source: https://patterns.dev/vanilla/lazy-initialization

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests pass
4. Run: `harness validate`
5. Commit: `feat(skills): add js-static-import, js-dynamic-import, js-compose-and-pipe, js-barrel, js-lazy-initialization knowledge skills`

---

### Task 6: Vue Skills Batch 1 — composables, renderless-components, provide-inject, slots-pattern

**Depends on:** none (parallel with Tasks 1–5)
**Files:** agents/skills/claude-code/vue-{composables,renderless-components,provide-inject,slots-pattern}/{skill.yaml,SKILL.md}

For each Vue skill: `paths: ['**/*.vue', '**/*.ts']`, `stack_signals: ['vue', 'typescript']`.

**6a. `agents/skills/claude-code/vue-composables/skill.yaml`:**

```yaml
name: vue-composables
version: '1.0.0'
description: Extract and reuse stateful logic across components via Composition API functions
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.vue'
  - '**/*.ts'
related_skills:
  - vue-reactivity-fundamentals
  - vue-provide-inject
  - vue-renderless-components
stack_signals:
  - vue
  - typescript
keywords:
  - composables
  - composition-api
  - use-prefix
  - reusable-logic
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/vue/composables'
state:
  persistent: false
  files: []
depends_on: []
````

**6b. `agents/skills/claude-code/vue-composables/SKILL.md`:**

````markdown
# Vue Composables

> Extract and reuse stateful logic across components via Composition API functions

## When to Use

- Multiple components share the same stateful logic (data fetching, form handling, device sensors)
- You are migrating from Vue 2 mixins — composables are the Vue 3 replacement
- You want to test logic independently from component rendering
- You need to compose multiple concerns into a single component without a bloated `setup()` function

## Instructions

1. Name composables with a `use` prefix (`useFetch`, `useMousePosition`, `useForm`).
2. Return reactive refs and computed values — not raw values — so consumers get reactivity.
3. Clean up side effects in `onUnmounted` — timers, event listeners, subscriptions.
4. Keep composables focused on one concern; compose multiple composables in `setup()` for complex components.
5. Composables that accept reactive arguments should use `toRef` or `watch` to react to argument changes.

```typescript
// composables/useCounter.ts
import { ref, computed } from 'vue';

export function useCounter(initial = 0) {
  const count = ref(initial);
  const doubled = computed(() => count.value * 2);
  function increment() {
    count.value++;
  }
  function reset() {
    count.value = initial;
  }
  return { count, doubled, increment, reset };
}
```
````

```vue
<!-- Usage in component -->
<script setup>
import { useCounter } from './composables/useCounter';
const { count, doubled, increment } = useCounter(10);
</script>
```

## Details

Vue composables replace Vue 2 mixins. Mixins have three critical problems: unclear source of properties, namespace collisions between mixins, and implicit cross-mixin communication. Composables solve all three: you explicitly import and destructure, name collisions are visible at the call site, and data flows through explicit function arguments.

**Trade-offs:**

- Composables require Vue 3 — no direct equivalent in Vue 2 without @vue/composition-api plugin
- Deep composable stacks can make `setup()` harder to read — keep each composable single-purpose

**When NOT to use:**

- Logic that does not involve reactivity — extract as a plain utility function

## Source

https://patterns.dev/vue/composables-pattern

````

**6c. `agents/skills/claude-code/vue-renderless-components/skill.yaml`:**

```yaml
name: vue-renderless-components
version: '1.0.0'
description: Separate data logic from presentation by rendering only slot content
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.vue'
  - '**/*.ts'
related_skills:
  - vue-slots-pattern
  - vue-composables
stack_signals:
  - vue
  - typescript
keywords:
  - renderless
  - headless
  - scoped-slots
  - separation-of-concerns
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/vue/renderless-components'
state:
  persistent: false
  files: []
depends_on: []
````

**6d. `agents/skills/claude-code/vue-renderless-components/SKILL.md`:**

````markdown
# Vue Renderless Components

> Separate data logic from presentation by rendering only slot content

## When to Use

- You want to reuse data-fetching or stateful logic across components with completely different templates
- You are building a headless UI component (behavior without styling)
- You want to let consumers control all markup while the component manages only behavior
- You need to test data logic independently from visual output

## Instructions

1. In the renderless component's `setup()`, expose all state and methods via the default scoped slot.
2. Return `() => slots.default?.(slotProps)` from the component render function (no template).
3. Name the component to reflect its behavior, not its output (`FetchData`, `ToggleState`).
4. Prefer composables over renderless components in Vue 3 — composables are simpler and testable without mounting.
5. Use renderless components when the consumer needs both reactivity AND a DOM-level slot anchor.

```vue
<!-- RenderlessToggle.vue -->
<script setup>
import { ref } from 'vue';
const isOpen = ref(false);
const toggle = () => (isOpen.value = !isOpen.value);
defineExpose({ isOpen, toggle }); // expose to parent if needed
</script>
<template>
  <slot :isOpen="isOpen" :toggle="toggle" />
</template>
```
````

```vue
<!-- Consumer -->
<RenderlessToggle v-slot="{ isOpen, toggle }">
  <button @click="toggle">{{ isOpen ? 'Close' : 'Open' }}</button>
  <div v-if="isOpen">Content</div>
</RenderlessToggle>
```

## Details

Renderless components were the Vue 2 answer to logic reuse before the Composition API. In Vue 3, composables solve the same problem more elegantly for most cases. The renderless pattern remains useful when the consumer needs a DOM slot anchor (e.g., for animation, portal rendering) alongside the data logic.

**Trade-offs:**

- Adds a wrapper element to the DOM unless using a fragment slot
- Composables are the preferred Vue 3 pattern for pure logic reuse — use renderless components only when the slot anchor is needed

## Source

https://patterns.dev/vue/renderless-components-pattern

````

**6e. `agents/skills/claude-code/vue-provide-inject/skill.yaml`:**

```yaml
name: vue-provide-inject
version: '1.0.0'
description: Pass data deeply through the component tree without prop drilling
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.vue'
  - '**/*.ts'
related_skills:
  - vue-composables
  - vue-compound-component
  - vue-state-management
stack_signals:
  - vue
  - typescript
keywords:
  - provide
  - inject
  - dependency-injection
  - prop-drilling
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/vue/provide-inject'
state:
  persistent: false
  files: []
depends_on: []
````

**6f. `agents/skills/claude-code/vue-provide-inject/SKILL.md`:**

````markdown
# Vue Provide / Inject

> Pass data deeply through the component tree without prop drilling

## When to Use

- A parent component needs to share data with deeply nested descendants without threading props through every intermediate component
- You are building a component library where a root component configures child behavior (tabs, accordion, form)
- You need to inject a shared service (i18n, theme, auth) into any component in the tree

## Instructions

1. Use `provide(key, value)` in the ancestor component and `inject(key, defaultValue)` in descendants.
2. Use Symbol keys for injection tokens in larger apps to avoid naming collisions: `const ThemeKey = Symbol('theme')`.
3. Provide reactive values (`ref`, `reactive`) so descendants receive live updates, not snapshots.
4. Wrap provided values in `readonly()` to prevent descendants from mutating shared state directly.
5. Always provide a default value to `inject()` — it protects against missing providers in testing.

```typescript
// Parent (provides)
import { provide, ref, readonly } from 'vue';
const theme = ref('light');
provide('theme', readonly(theme));
provide('setTheme', (t: string) => {
  theme.value = t;
});

// Deep descendant (injects)
import { inject } from 'vue';
const theme = inject('theme', ref('light'));
const setTheme = inject<(t: string) => void>('setTheme', () => {});
```
````

## Details

`provide`/`inject` is Vue's dependency injection mechanism. It mirrors React's Context API but uses explicit imperative calls rather than JSX wrapper components. One common pattern is providing both a readonly state ref and a mutation function pair — this creates a controlled update flow like Redux's store + dispatch.

**Trade-offs:**

- Implicit dependencies — descendants do not declare their dependencies in props, making static analysis harder
- Large provide/inject trees make it hard to trace where a value comes from

**When NOT to use:**

- Shallow component trees where props are manageable
- Global app state — use Pinia or a composable store instead

## Source

https://patterns.dev/vue/provide-inject-pattern

````

**6g. `agents/skills/claude-code/vue-slots-pattern/skill.yaml`:**

```yaml
name: vue-slots-pattern
version: '1.0.0'
description: Compose flexible component templates using named and scoped slots
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.vue'
  - '**/*.ts'
related_skills:
  - vue-renderless-components
  - vue-compound-component
stack_signals:
  - vue
  - typescript
keywords:
  - slots
  - scoped-slots
  - named-slots
  - template-composition
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/vue/slots-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

**6h. `agents/skills/claude-code/vue-slots-pattern/SKILL.md`:**

````markdown
# Vue Slots Pattern

> Compose flexible component templates using named and scoped slots

## When to Use

- A component needs to accept arbitrary markup from its parent (card body, modal content, table rows)
- You want to let consumers control a specific region of the component's template
- You need to pass component state back to the parent for rendering (scoped slots / `v-slot`)
- You are building layout components (Shell, Sidebar, Grid) that wrap injected content

## Instructions

1. Use `<slot />` for a single default slot and `<slot name="header" />` for named slots.
2. Provide fallback content inside `<slot>` tags — rendered when no content is provided.
3. Use scoped slots to expose component data to the parent: `<slot :item="item" />` in template, `v-slot="{ item }"` in consumer.
4. Prefer named slots over multiple default slots — naming makes intent clear.
5. Use `useSlots()` in `<script setup>` to check if a slot was provided before rendering its container.

```vue
<!-- Card.vue -->
<template>
  <div class="card">
    <header v-if="$slots.header"><slot name="header" /></header>
    <main><slot /></main>
    <footer v-if="$slots.footer"><slot name="footer" /></footer>
  </div>
</template>

<!-- Consumer -->
<Card>
  <template #header>My Title</template>
  Default body content
  <template #footer>Footer actions</template>
</Card>
```
````

## Details

Vue's slot system is the primary tool for component composition. It corresponds to React's `children` prop but with named regions and the ability to pass data back to the consumer (scoped slots). Scoped slots are especially powerful for headless/renderless components where the child owns data and the parent owns rendering.

**Trade-offs:**

- Scoped slots expose component internals — changing the slot data shape is a breaking API change
- Deeply nested slot forwarding can become verbose

**When NOT to use:**

- Simple components where props suffice — slots add template complexity

## Source

https://patterns.dev/vue/slots-pattern

````

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests pass
4. Run: `harness validate`
5. Commit: `feat(skills): add vue-composables, vue-renderless-components, vue-provide-inject, vue-slots-pattern knowledge skills`

---

### Task 7: Vue Skills Batch 2 — teleport, suspense, async-components, compound-component

**Depends on:** none (parallel with Tasks 1–6)
**Files:** agents/skills/claude-code/vue-{teleport,suspense,async-components,compound-component}/{skill.yaml,SKILL.md}

**`vue-teleport`:**
- description: `Render component output in a different DOM location via Teleport`
- keywords: `['teleport', 'portal', 'dom-placement', 'modals', 'tooltips']`
- related_skills: `['vue-slots-pattern', 'vue-suspense']`
- upstream: `PatternsDev/skills/vue/teleport`
- SKILL.md: When to Use (modals/drawers that must render outside the component's DOM hierarchy to avoid z-index or overflow issues, tooltips that position relative to viewport), Instructions (`<Teleport to="body">...</Teleport>` — content is teleported to the target selector; condition teleport with `:disabled` prop; content still has access to parent component's data), Source: https://patterns.dev/vue/teleport-pattern

**`vue-suspense`:**
- description: `Coordinate async component loading with a fallback UI via Suspense`
- keywords: `['suspense', 'async', 'loading-state', 'fallback']`
- related_skills: `['vue-async-components', 'vue-teleport']`
- upstream: `PatternsDev/skills/vue/suspense`
- SKILL.md: When to Use (async setup functions, nested async components where you want a single loading state, streaming SSR with deferred slots), Instructions (`<Suspense>` with `#default` and `#fallback` slots; async component must return a Promise from `setup()`; nest multiple async components under one Suspense to coordinate loading), Source: https://patterns.dev/vue/suspense-pattern

**`vue-async-components`:**
- description: `Load components lazily with defineAsyncComponent for code splitting`
- keywords: `['async-components', 'lazy-loading', 'defineAsyncComponent', 'code-splitting']`
- related_skills: `['vue-suspense', 'js-dynamic-import']`
- upstream: `PatternsDev/skills/vue/async-components`
- SKILL.md: When to Use (large components used only in specific routes or conditions, component-level code splitting without route-level splitting), Instructions (`defineAsyncComponent(() => import('./Heavy.vue'))`; use `loadingComponent` and `errorComponent` options for loading/error states; pair with `<Suspense>` for coordinated loading), Source: https://patterns.dev/vue/async-components-pattern

**`vue-compound-component`:**
- description: `Build multi-part components sharing state through provide/inject`
- keywords: `['compound-component', 'implicit-state', 'sub-components', 'flexible-api']`
- related_skills: `['vue-provide-inject', 'vue-slots-pattern', 'vue-composables']`
- upstream: `PatternsDev/skills/vue/compound-component`
- SKILL.md: When to Use (accordion, tabs, select, menu — where a parent manages selection state and children render based on it without explicit prop passing), Instructions (parent provides state via `provide`, child components `inject` the shared state; name sub-components with dot notation (`Tabs.Tab`)); Source: https://patterns.dev/vue/compound-component-pattern

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests pass
4. Run: `harness validate`
5. Commit: `feat(skills): add vue-teleport, vue-suspense, vue-async-components, vue-compound-component knowledge skills`

---

### Task 8: Vue Skills Batch 3 — state-management, transitions, reactivity-fundamentals

**Depends on:** none (parallel with Tasks 1–7)
**Files:** agents/skills/claude-code/vue-{state-management,transitions,reactivity-fundamentals}/{skill.yaml,SKILL.md}

**`vue-state-management`:**
- description: `Manage shared state across components using Pinia or composable stores`
- keywords: `['state-management', 'pinia', 'vuex', 'store', 'shared-state']`
- related_skills: `['vue-composables', 'vue-provide-inject', 'vue-reactivity-fundamentals']`
- upstream: `PatternsDev/skills/vue/state-management`
- SKILL.md: When to Use (state shared across many components not in a parent-child relationship, state that must persist across route changes, server-synced state with loading/error tracking), Instructions (use Pinia stores with `defineStore`; keep stores focused by domain (authStore, cartStore); prefer composable stores over Vuex for new projects; access store state as refs — `storeToRefs` for destructuring), Source: https://patterns.dev/vue/state-management-pattern

**`vue-transitions`:**
- description: `Animate component enter/leave with Vue's transition and transition-group`
- keywords: `['transitions', 'animations', 'enter-leave', 'transition-group', 'css-animation']`
- related_skills: `['vue-async-components', 'vue-suspense']`
- upstream: `PatternsDev/skills/vue/transitions`
- SKILL.md: When to Use (animating conditional content with `v-if`/`v-show`, animating list additions/removals, route transition animations), Instructions (wrap conditional element in `<Transition name="fade">`; define CSS classes `fade-enter-active`, `fade-leave-active`, `fade-enter-from`, `fade-leave-to`; use `<TransitionGroup>` for list animations — requires `key` on items; use `appear` prop for initial render animation), Source: https://patterns.dev/vue/transitions-pattern

**`vue-reactivity-fundamentals`:**
- description: `Use ref, reactive, computed, and watch to build reactive data flows`
- keywords: `['reactivity', 'ref', 'reactive', 'computed', 'watch', 'watchEffect']`
- related_skills: `['vue-composables', 'vue-state-management']`
- upstream: `PatternsDev/skills/vue/reactivity-fundamentals`
- SKILL.md: When to Use (any Vue 3 component using Composition API), Instructions (`ref()` for primitives and template refs; `reactive()` for objects (note: loses reactivity if destructured — use `toRefs`); `computed()` for derived values (cached until deps change); `watch(source, callback)` for side effects on change; `watchEffect()` for auto-tracked effects; never mutate a `computed` — they are read-only), Source: https://patterns.dev/vue/reactivity-pattern

2. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
3. Observe: tests pass
4. Run: `harness validate`
5. Commit: `feat(skills): add vue-state-management, vue-transitions, vue-reactivity-fundamentals knowledge skills`

---

### Task 9: Platform Replication — all 38 skills to gemini-cli, cursor, codex

**Depends on:** Tasks 1–8 (all skill dirs must exist in claude-code first)
**Files:** All 38 skill directories replicated to agents/skills/gemini-cli/, agents/skills/cursor/, agents/skills/codex/

1. Run the following commands to replicate all JS skills:

```bash
for skill in \
  js-singleton-pattern js-prototype-pattern js-observer-pattern js-factory-pattern js-proxy-pattern \
  js-mediator-pattern js-command-pattern js-mixin-pattern js-flyweight-pattern js-chain-of-responsibility \
  js-iterator-pattern js-strategy-pattern js-template-method-pattern js-visitor-pattern js-decorator-pattern \
  js-facade-pattern js-module-pattern js-revealing-module js-constructor-pattern js-hoisting \
  js-scope-patterns js-closure-pattern js-static-import js-dynamic-import js-compose-and-pipe \
  js-barrel-pattern js-lazy-initialization; do
  for platform in gemini-cli cursor codex; do
    cp -r /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill \
          /Users/cwarner/Projects/harness-engineering/agents/skills/$platform/$skill
  done
done
````

2. Run the following commands to replicate all Vue skills:

```bash
for skill in \
  vue-composables vue-renderless-components vue-provide-inject vue-slots-pattern \
  vue-teleport vue-suspense vue-async-components vue-compound-component \
  vue-state-management vue-transitions vue-reactivity-fundamentals; do
  for platform in gemini-cli cursor codex; do
    cp -r /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill \
          /Users/cwarner/Projects/harness-engineering/agents/skills/$platform/$skill
  done
done
```

3. Verify counts:

```bash
ls /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli | grep "^js-" | wc -l  # expect 27
ls /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli | grep "^vue-" | wc -l # expect 11
ls /Users/cwarner/Projects/harness-engineering/agents/skills/cursor | grep "^js-" | wc -l      # expect 27
ls /Users/cwarner/Projects/harness-engineering/agents/skills/codex | grep "^js-" | wc -l       # expect 27
```

4. Run tests: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run`
5. Observe: platform-parity tests and schema tests all pass. Test count will be approximately 2016 + (38 skills × 4 platforms × 3 tests/skill) = ~2472 tests.
6. Run: `harness validate`
7. Commit: `feat(skills): replicate 38 JS and Vue knowledge skills to gemini-cli, cursor, codex platforms`

---

### Task 10: E2E Dispatch Validation — JS and Vue scoring tests

**Depends on:** Task 9 (skills must be in index before scoring tests run)
**Files:** packages/cli/src/skill/dispatcher.test.ts (MODIFY — add JS and Vue E2E tests)

[checkpoint:human-verify] — Verify Task 9 replication counts before writing tests.

1. Read `packages/cli/src/skill/dispatcher.test.ts` to find the existing React E2E knowledge skill test block (search for `autoInjectKnowledge` or `recentFiles` in that file).

2. Add two new `describe` blocks alongside the existing React E2E test — one for JS, one for Vue. Key gotchas from learnings:
   - `scoreSkill()` signature: `(entry, queryTerms[], profile, recentFiles[], skillName, healthSnapshot?)`
   - Paths score (0.20) alone does not exceed 0.40 threshold — must include matching keywords in queryTerms
   - Use `importActual` pattern if mocking any module-level exports

3. Add these tests to the existing E2E section in `packages/cli/src/skill/dispatcher.test.ts`:

```typescript
describe('JS knowledge skill dispatch (E2E)', () => {
  it('includes a JS knowledge skill when editing .js files with matching keywords', async () => {
    // Use the suggest() function which reads the actual skill index
    // Query terms must include a keyword that matches a js-* skill keyword
    const result = await suggest(
      { keyword: 0.3, name: 0.15, description: 0.1, stack: 0.15, recency: 0.1, paths: 0.2 },
      ['singleton', 'module', 'javascript'],
      {},
      ['src/utils.js'],
      undefined
    );
    const allKnowledge = [
      ...(result.autoInjectKnowledge ?? []),
      ...(result.suggestions ?? []).filter((s) => s.type === 'knowledge'),
    ];
    expect(allKnowledge.some((k) => k.name?.startsWith('js-'))).toBe(true);
  });
});

describe('Vue knowledge skill dispatch (E2E)', () => {
  it('includes a Vue knowledge skill when editing .vue files with matching keywords', async () => {
    const result = await suggest(
      { keyword: 0.3, name: 0.15, description: 0.1, stack: 0.15, recency: 0.1, paths: 0.2 },
      ['composables', 'reactivity', 'vue'],
      {},
      ['src/Component.vue'],
      undefined
    );
    const allKnowledge = [
      ...(result.autoInjectKnowledge ?? []),
      ...(result.suggestions ?? []).filter((s) => s.type === 'knowledge'),
    ];
    expect(allKnowledge.some((k) => k.name?.startsWith('vue-'))).toBe(true);
  });
});
```

**NOTE:** Before writing these tests, read the actual `suggest()` call signature from `packages/cli/src/skill/dispatcher.ts` to verify the parameter order matches. The learnings file documents that the signature was different from the plan in Phase B — always read the source before writing E2E tests.

4. Run tests: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run src/skill/dispatcher.test.ts`
5. Observe: new tests pass (if they fail with wrong signature, read dispatcher.ts and correct the call)
6. Run: `harness validate`
7. Commit: `test(dispatcher): add E2E dispatch validation for JS and Vue knowledge skill verticals`

---

### Task 11: harness validate gate

**Depends on:** Tasks 1–10
**Files:** none (validation only)

1. Run: `harness validate`
2. Observe: validation passes with no errors
3. Run full test suites as final verification:
   ```bash
   cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run
   ```
4. Observe agent/skills tests: approximately 2472 tests passing (2016 baseline + 456 new from 38 skills × 4 platforms × 3 tests)
5. Observe CLI tests: 1985+ tests passing (unchanged or +2 from Task 10 E2E tests)
6. Verify skill counts:
   ```bash
   ls /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code | grep "^js-" | wc -l  # 27
   ls /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code | grep "^vue-" | wc -l # 11
   ```
7. Commit (if any cleanup needed): `chore(skills): phase-c js-vue import complete — 38 skills across 4 platforms`

---

## Observable Truth Trace

| Observable Truth                                                           | Delivered By                              |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| 27 `js-` directories with skill.yaml + SKILL.md                            | Tasks 1–5                                 |
| 11 `vue-` directories with skill.yaml + SKILL.md                           | Tasks 6–8                                 |
| Each `js-` skill has correct `type`, `paths`, `tier`, `metadata.upstream`  | Tasks 1–5 (skill.yaml content)            |
| Each `vue-` skill has correct `type`, `paths`, `tier`, `metadata.upstream` | Tasks 6–8 (skill.yaml content)            |
| Platform-parity and schema tests pass across all 4 platforms               | Task 9 (replication) + Task 11 (validate) |
| JS knowledge skill surfaces for `.js` file context                         | Task 10 (E2E test)                        |
| Vue knowledge skill surfaces for `.vue` file context                       | Task 10 (E2E test)                        |
| `harness validate` passes                                                  | Task 11                                   |

---

## Key Conventions Reference

From Phase B learnings (agents/skills/tests learnings):

- `cp -r` replication creates identical skill directories across platforms — `platform-parity.test.ts` requires all 4 platforms
- `scoreSkill()` signature: `(entry, queryTerms[], profile, recentFiles[], skillName, healthSnapshot?)` — read source before writing tests
- Paths score (0.20) alone cannot clear the 0.40 threshold — include relevant keywords in E2E test query terms
- `vi.mock()` of a module blocks ALL exports — use `importActual` pattern for partial mocking
- Module-size baseline in `.harness/arch/baselines.json` does NOT need updating for content-only changes (skill.yaml + SKILL.md are not measured source files)
