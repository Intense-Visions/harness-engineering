# Plan: Phase C — JS + Vue Import (38 Knowledge Skills)

**Date:** 2026-04-08
**Spec:** docs/changes/knowledge-skills-schema-enrichment/proposal.md
**Estimated tasks:** 10
**Estimated time:** 45 minutes

---

## Goal

Import 27 JavaScript and 11 Vue knowledge skills with technology-prefixed names (`js-`, `vue-`) into the harness skill catalog across all four platforms (claude-code, gemini-cli, cursor, codex), completing the three-technology-vertical catalog seeded from PatternsDev.

---

## Context: Phases A and B Completed

- Phase A schema & infrastructure is fully in place.
- Phase B delivered 19 React knowledge skills across all 4 platforms.
- Current state: `harness validate` passes, 4290 agents/skills tests passing (1857 from Phase B + existing).
- **Pre-existing parity failure:** 133 non-js/vue skills exist in claude-code, gemini-cli, cursor but NOT in codex (angular, astro, drizzle, nestjs, next, nuxt, prisma, svelte, tanstack, trpc, zod — outside Phase C scope). Phase C validation tests will scope to `js-` and `vue-` skills only to avoid conflating with the pre-existing failures.

---

## Observable Truths (Acceptance Criteria)

1. The system shall have 27 `js-*` skill directories and 11 `vue-*` skill directories under each of `agents/skills/claude-code/`, `agents/skills/gemini-cli/`, `agents/skills/cursor/`, and `agents/skills/codex/`.
2. Each `js-*` `skill.yaml` shall have `type: knowledge`, `paths: ['**/*.js', '**/*.mjs', '**/*.cjs']`, `tier: 3`, `cognitive_mode: advisory-guide`, `metadata.upstream` pointing to `PatternsDev/skills/javascript/<pattern-name>`.
3. Each `vue-*` `skill.yaml` shall have `type: knowledge`, `paths: ['**/*.vue', '**/*.ts']`, `tier: 3`, `cognitive_mode: advisory-guide`, `metadata.upstream` pointing to `PatternsDev/skills/vue/<pattern-name>`.
4. Each `js-*` and `vue-*` `SKILL.md` shall contain `## When to Use`, `## Instructions`, `## Details`, and `## Source` sections, with the `## Instructions` section under 5K tokens.
5. When `cd agents/skills && npx vitest run tests/schema.test.ts tests/structure.test.ts` is run, the system shall pass all schema and structure tests for the newly added js- and vue- skills.
6. When `cd agents/skills && npx vitest run tests/platform-parity.test.ts` is run, the system shall show NO failures attributed to `js-` or `vue-` skills (pre-existing codex failures for other verticals are out of scope).
7. When `suggest()` is called with `recentFiles: ['src/utils.js']` and JS skills are in the index, the system shall include at least one `js-` knowledge skill in either `autoInjectKnowledge` or `suggestions`.
8. When `suggest()` is called with `recentFiles: ['src/App.vue']` and Vue skills are in the index, the system shall include at least one `vue-` knowledge skill in either `autoInjectKnowledge` or `suggestions`.
9. `harness validate` shall pass after all 38 skills are created and replicated.

---

## File Map

```
CREATE agents/skills/claude-code/js-singleton-pattern/skill.yaml
CREATE agents/skills/claude-code/js-singleton-pattern/SKILL.md
CREATE agents/skills/claude-code/js-proxy-pattern/skill.yaml
CREATE agents/skills/claude-code/js-proxy-pattern/SKILL.md
CREATE agents/skills/claude-code/js-provider-pattern/skill.yaml
CREATE agents/skills/claude-code/js-provider-pattern/SKILL.md
CREATE agents/skills/claude-code/js-prototype-pattern/skill.yaml
CREATE agents/skills/claude-code/js-prototype-pattern/SKILL.md
CREATE agents/skills/claude-code/js-observer-pattern/skill.yaml
CREATE agents/skills/claude-code/js-observer-pattern/SKILL.md
CREATE agents/skills/claude-code/js-module-pattern/skill.yaml
CREATE agents/skills/claude-code/js-module-pattern/SKILL.md
CREATE agents/skills/claude-code/js-mixin-pattern/skill.yaml
CREATE agents/skills/claude-code/js-mixin-pattern/SKILL.md
CREATE agents/skills/claude-code/js-mediator-middleware-pattern/skill.yaml
CREATE agents/skills/claude-code/js-mediator-middleware-pattern/SKILL.md
CREATE agents/skills/claude-code/js-command-pattern/skill.yaml
CREATE agents/skills/claude-code/js-command-pattern/SKILL.md
CREATE agents/skills/claude-code/js-flyweight-pattern/skill.yaml
CREATE agents/skills/claude-code/js-flyweight-pattern/SKILL.md
CREATE agents/skills/claude-code/js-factory-pattern/skill.yaml
CREATE agents/skills/claude-code/js-factory-pattern/SKILL.md
CREATE agents/skills/claude-code/js-revealing-module-pattern/skill.yaml
CREATE agents/skills/claude-code/js-revealing-module-pattern/SKILL.md
CREATE agents/skills/claude-code/js-constructor-pattern/skill.yaml
CREATE agents/skills/claude-code/js-constructor-pattern/SKILL.md
CREATE agents/skills/claude-code/js-abstract-factory-pattern/skill.yaml
CREATE agents/skills/claude-code/js-abstract-factory-pattern/SKILL.md
CREATE agents/skills/claude-code/js-decorator-pattern/skill.yaml
CREATE agents/skills/claude-code/js-decorator-pattern/SKILL.md
CREATE agents/skills/claude-code/js-iterator-pattern/skill.yaml
CREATE agents/skills/claude-code/js-iterator-pattern/SKILL.md
CREATE agents/skills/claude-code/js-state-pattern/skill.yaml
CREATE agents/skills/claude-code/js-state-pattern/SKILL.md
CREATE agents/skills/claude-code/js-template-method-pattern/skill.yaml
CREATE agents/skills/claude-code/js-template-method-pattern/SKILL.md
CREATE agents/skills/claude-code/js-strategy-pattern/skill.yaml
CREATE agents/skills/claude-code/js-strategy-pattern/SKILL.md
CREATE agents/skills/claude-code/js-visitor-pattern/skill.yaml
CREATE agents/skills/claude-code/js-visitor-pattern/SKILL.md
CREATE agents/skills/claude-code/js-facade-pattern/skill.yaml
CREATE agents/skills/claude-code/js-facade-pattern/SKILL.md
CREATE agents/skills/claude-code/js-adapter-pattern/skill.yaml
CREATE agents/skills/claude-code/js-adapter-pattern/SKILL.md
CREATE agents/skills/claude-code/js-chain-of-responsibility-pattern/skill.yaml
CREATE agents/skills/claude-code/js-chain-of-responsibility-pattern/SKILL.md
CREATE agents/skills/claude-code/js-bridge-pattern/skill.yaml
CREATE agents/skills/claude-code/js-bridge-pattern/SKILL.md
CREATE agents/skills/claude-code/js-composite-pattern/skill.yaml
CREATE agents/skills/claude-code/js-composite-pattern/SKILL.md
CREATE agents/skills/claude-code/js-static-import/skill.yaml
CREATE agents/skills/claude-code/js-static-import/SKILL.md
CREATE agents/skills/claude-code/js-dynamic-import/skill.yaml
CREATE agents/skills/claude-code/js-dynamic-import/SKILL.md

CREATE agents/skills/claude-code/vue-composables-pattern/skill.yaml
CREATE agents/skills/claude-code/vue-composables-pattern/SKILL.md
CREATE agents/skills/claude-code/vue-provide-inject/skill.yaml
CREATE agents/skills/claude-code/vue-provide-inject/SKILL.md
CREATE agents/skills/claude-code/vue-renderless-components/skill.yaml
CREATE agents/skills/claude-code/vue-renderless-components/SKILL.md
CREATE agents/skills/claude-code/vue-teleport-pattern/skill.yaml
CREATE agents/skills/claude-code/vue-teleport-pattern/SKILL.md
CREATE agents/skills/claude-code/vue-async-components/skill.yaml
CREATE agents/skills/claude-code/vue-async-components/SKILL.md
CREATE agents/skills/claude-code/vue-pinia-pattern/skill.yaml
CREATE agents/skills/claude-code/vue-pinia-pattern/SKILL.md
CREATE agents/skills/claude-code/vue-watchers-pattern/skill.yaml
CREATE agents/skills/claude-code/vue-watchers-pattern/SKILL.md
CREATE agents/skills/claude-code/vue-reactive-refs/skill.yaml
CREATE agents/skills/claude-code/vue-reactive-refs/SKILL.md
CREATE agents/skills/claude-code/vue-component-events/skill.yaml
CREATE agents/skills/claude-code/vue-component-events/SKILL.md
CREATE agents/skills/claude-code/vue-directive-pattern/skill.yaml
CREATE agents/skills/claude-code/vue-directive-pattern/SKILL.md
CREATE agents/skills/claude-code/vue-slots-pattern/skill.yaml
CREATE agents/skills/claude-code/vue-slots-pattern/SKILL.md

[All 38 skill directories replicated identically to gemini-cli/, cursor/, codex/]
```

---

## Skeleton

1. JS skills batch 1 — design patterns group A (singleton, proxy, provider, prototype, observer, module, mixin) (~1 task, ~6 min)
2. JS skills batch 2 — design patterns group B (mediator-middleware, command, flyweight, factory, revealing-module, constructor, abstract-factory) (~1 task, ~6 min)
3. JS skills batch 3 — design patterns group C (decorator, iterator, state, template-method, strategy, visitor, facade) (~1 task, ~6 min)
4. JS skills batch 4 — design patterns group D (adapter, chain-of-responsibility, bridge, composite, static-import, dynamic-import) (~1 task, ~5 min)
5. Vue skills batch — all 11 Vue patterns (~1 task, ~6 min)
6. Platform replication to gemini-cli, cursor, codex (~1 task, ~4 min)
7. E2E dispatch validation for JS and Vue verticals (~1 task, ~5 min)
8. harness validate gate (~1 task, ~3 min)

**Estimated total:** 10 tasks, ~45 minutes

_Skeleton produced (standard mode, estimated 10 tasks >= 8). Approved — proceeding to full task expansion._

---

## Tasks

### Task 1: JS skills batch 1 — design patterns group A (7 skills)

**Depends on:** none
**Files:** 14 files in `agents/skills/claude-code/` (7 skill dirs × 2 files)

Create the following 7 skills in `agents/skills/claude-code/`. For each skill, create `skill.yaml` and `SKILL.md` following the exact template below.

**skill.yaml template for all JS skills:**

```yaml
name: <skill-name>
version: '1.0.0'
description: <one-line description>
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
related_skills: <see per-skill below>
stack_signals:
  - javascript
keywords: <see per-skill below>
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/<pattern-slug>'
state:
  persistent: false
  files: []
depends_on: []
```

**SKILL.md template for all JS skills:**

```markdown
# <Title>

> <one-line tagline>

## When to Use

- <bullet criteria>

## Instructions

<numbered steps + code snippet>

## Details

<educational depth, trade-offs, when NOT to use>

## Source

https://patterns.dev/javascript/<pattern-slug>
```

**Skill 1: `js-singleton-pattern`**

`skill.yaml`:

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
  - js-proxy-pattern
stack_signals:
  - javascript
keywords:
  - singleton
  - single-instance
  - global-state
  - instance-control
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/singleton-pattern'
state:
  persistent: false
  files: []
depends_on: []
```

`SKILL.md`:

````markdown
# JS Singleton Pattern

> Ensure a class has only one instance and provide a global access point

## When to Use

- You need exactly one shared instance across the entire application (e.g., a database connection, logger, or config object)
- Multiple parts of the codebase should access the same object without prop-drilling or passing references
- The instance is expensive to create and should be reused

## Instructions

1. Create a class with a private constructor and a static instance variable.
2. Add a static `getInstance()` method that returns the existing instance or creates one on first call.
3. Export only `getInstance()`, not the class itself.
4. In ESM modules, prefer a module-level variable over a class — a module is already a singleton by the loader.

```javascript
// Preferred ESM approach — module-level singleton
let instance;

class DatabaseConnection {
  constructor(url) {
    if (instance) return instance;
    this.url = url;
    this.connected = false;
    instance = this;
  }

  connect() {
    this.connected = true;
  }
}

export const getInstance = (url) => new DatabaseConnection(url);
```
````

5. Freeze the instance with `Object.freeze(instance)` if it should be immutable after creation.
6. Avoid singletons for anything that varies per request in server-side code.

## Details

The Singleton pattern is one of the most debated patterns in JavaScript. The classic implementation uses a class with a static instance, but ES modules provide a simpler alternative: any module-level variable is effectively a singleton because Node.js and browsers cache module exports after the first `import`.

**Trade-offs:**

- Singletons introduce global state, making code harder to test (you cannot easily create a fresh instance per test)
- Hidden dependencies — callers cannot know from the function signature that they depend on a singleton
- Mutable singletons are a source of subtle bugs in concurrent environments (avoid in server-side code handling multiple requests)

**When NOT to use:**

- When you need multiple instances with different configurations
- In unit tests — inject dependencies instead and pass a fresh instance per test
- When the "singleton" is stateless — a plain object literal or a set of pure functions is simpler

**Related patterns:**

- Module Pattern — a module-scoped variable achieves singleton semantics without a class
- Proxy Pattern — a Proxy can intercept access to a singleton to add logging or validation

## Source

https://patterns.dev/javascript/singleton-pattern

````

**Skill 2: `js-proxy-pattern`**

`skill.yaml`:
```yaml
name: js-proxy-pattern
version: '1.0.0'
description: Intercept and control object property access with ES6 Proxy
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
  - js-observer-pattern
stack_signals:
  - javascript
keywords:
  - proxy
  - intercept
  - reflect
  - validation
  - traps
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/proxy-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Proxy Pattern

> Intercept and control object property access with ES6 Proxy

## When to Use

- You need to validate, log, or transform property reads/writes without changing the target object
- Implementing reactive data systems (watching object mutations)
- Adding access control or lazy initialization to expensive objects
- Building observable models for state management

## Instructions

1. Create a handler object with trap methods (`get`, `set`, `deleteProperty`, etc.).
2. Wrap the target object: `const proxy = new Proxy(target, handler)`.
3. In `set` traps, always call `Reflect.set(target, prop, value)` to apply the change and return its boolean result.
4. In `get` traps, use `Reflect.get(target, prop, receiver)` to preserve prototype chain behavior.
5. Use `Reflect` methods in traps — they mirror the Proxy trap API and ensure correct semantics.

```javascript
const validator = {
  set(target, prop, value) {
    if (prop === 'age') {
      if (typeof value !== 'number' || value < 0) {
        throw new TypeError('Age must be a non-negative number');
      }
    }
    return Reflect.set(target, prop, value);
  },
};

const person = new Proxy({}, validator);
person.age = 30; // OK
person.age = -1; // Throws TypeError
```
````

6. Avoid deeply nested Proxy wrapping — it compounds performance overhead on every property access.

## Details

ES6 `Proxy` gives you a meta-programming hook at the object level. Traps intercept fundamental operations: get, set, has, deleteProperty, apply (for functions), and construct (for classes).

**Trade-offs:**

- Proxy adds overhead per property access — avoid on hot paths (tight loops, rendering cycles)
- Proxied objects are not equal to their targets (`proxy !== target`) — equality checks must use the target
- Proxies are not serializable — `JSON.stringify(proxy)` serializes the underlying target, which may surprise callers
- Debugging is harder — the DevTools shows the proxy wrapper, not the target directly

**When NOT to use:**

- For simple validation — just write a setter method or use a class
- For immutability at scale — `Object.freeze()` is simpler and has no runtime overhead per access
- When you need ES5 compatibility — Proxy cannot be polyfilled

**Related patterns:**

- Observer Pattern — Proxy can power reactive observation of object mutations
- Singleton Pattern — a Proxy can wrap a singleton to control access

## Source

https://patterns.dev/javascript/proxy-pattern

````

**Skill 3: `js-provider-pattern`**

`skill.yaml`:
```yaml
name: js-provider-pattern
version: '1.0.0'
description: Make shared data available to multiple child components without prop-drilling
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
  - js-singleton-pattern
stack_signals:
  - javascript
keywords:
  - provider
  - context
  - dependency-injection
  - shared-data
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/provider-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Provider Pattern

> Make shared data available to multiple consumers without prop-drilling

## When to Use

- Multiple components or modules need the same data (theme, locale, current user, feature flags)
- You want to avoid threading a value through every function parameter or component prop
- You need to swap implementations (e.g., test vs production) by replacing the provider

## Instructions

1. Create a context object or module-level store that holds the shared data.
2. Expose a `provide(value)` function to register the data and a `consume()` / `inject()` function to retrieve it.
3. Scope the provider — a module-level variable is global; a closure-based provider can be scoped to a subtree or request.
4. Document what the provider exposes — callers should not need to inspect internals to use it.

```javascript
// Simple module-level provider
let _theme = 'light';

export function provideTheme(theme) {
  _theme = theme;
}

export function useTheme() {
  return _theme;
}
```
````

5. In framework code (React/Vue), use the framework's native context API — do not re-implement it.
6. Keep providers focused — one provider per concern (theme, auth, i18n), not one mega-provider.

## Details

The Provider pattern is the plain-JavaScript equivalent of what React Context and Vue's provide/inject formalize. The core idea: establish a value at one level and make it available to any consumer below that level without explicit passing.

**Trade-offs:**

- Module-level providers are singletons — hard to reset in tests
- Implicit dependencies — consumers do not declare that they depend on the provider in their signature
- No automatic re-rendering — plain JS providers do not trigger UI updates when the value changes (use a framework's reactive context for that)

**When NOT to use:**

- When only 1–2 levels of nesting exist — passing props directly is clearer
- When the data changes frequently and consumers need to react — use a reactive state management solution

## Source

https://patterns.dev/javascript/provider-pattern

````

**Skill 4: `js-prototype-pattern`**

`skill.yaml`:
```yaml
name: js-prototype-pattern
version: '1.0.0'
description: Share properties and methods across instances via the prototype chain
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
  - inheritance
  - prototype-chain
  - object-create
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/prototype-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Prototype Pattern

> Share properties and methods across instances via the prototype chain

## When to Use

- You have many instances that should share methods without duplicating them in memory
- You need to extend built-in types or add methods to third-party objects
- You want lightweight objects where method storage is shared, not per-instance

## Instructions

1. Define shared methods on the constructor's `.prototype` object — not inside the constructor function.
2. Instance data (unique per instance) goes on `this` inside the constructor.
3. Use `Object.create(proto)` for explicit prototype assignment without a constructor.
4. Avoid modifying built-in prototypes (Array, String, Object) — it causes library conflicts.

```javascript
function Dog(name) {
  this.name = name;
}

Dog.prototype.bark = function () {
  return `${this.name} says woof!`;
};

const d1 = new Dog('Rex');
const d2 = new Dog('Spot');

// Both share the same bark function in memory
console.log(d1.bark === d2.bark); // true
```
````

5. Prefer ES6 `class` syntax — it uses the prototype chain under the hood but is more readable.
6. Use `hasOwnProperty()` or `Object.hasOwn()` to distinguish own vs inherited properties.

## Details

Every JavaScript object has an internal `[[Prototype]]` link. When you access a property, the engine walks the chain: own properties first, then the prototype, then the prototype's prototype, until `null`. This is the prototype chain.

**Trade-offs:**

- Shared mutable properties on the prototype are dangerous — if one instance mutates a shared array/object, all instances see the change
- The prototype chain adds one lookup level per tier — negligible for most code, but avoid very deep chains
- `class` syntax is clearer than manual `.prototype` manipulation

**When NOT to use:**

- When instances need truly private state — use closures or ES2022 private class fields (`#field`) instead
- When you need multiple inheritance — JS has single prototype chain; use mixins instead

## Source

https://patterns.dev/javascript/prototype-pattern

````

**Skill 5: `js-observer-pattern`**

`skill.yaml`:
```yaml
name: js-observer-pattern
version: '1.0.0'
description: Notify subscribers automatically when an observable object's state changes
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
  - js-proxy-pattern
  - js-mediator-middleware-pattern
stack_signals:
  - javascript
keywords:
  - observer
  - pub-sub
  - event-emitter
  - subscribe
  - notify
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/observer-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Observer Pattern

> Notify subscribers automatically when an observable object's state changes

## When to Use

- Multiple parts of the app need to react to the same event without coupling the emitter to its consumers
- Implementing event systems, reactive UI updates, or real-time data feeds
- Decoupling data sources from their consumers

## Instructions

1. Create an observable with an `observers` array and `subscribe` / `unsubscribe` / `notify` methods.
2. Call `notify(data)` whenever the observable's state changes — it invokes all subscribed callbacks.
3. Always provide `unsubscribe` — failing to unsubscribe causes memory leaks in long-lived apps.
4. In browser environments, prefer native `EventTarget` or `EventEmitter` (Node.js) over hand-rolled implementations.

```javascript
class Observable {
  constructor() {
    this.observers = [];
  }

  subscribe(fn) {
    this.observers.push(fn);
    return () => this.unsubscribe(fn); // return cleanup function
  }

  unsubscribe(fn) {
    this.observers = this.observers.filter((obs) => obs !== fn);
  }

  notify(data) {
    this.observers.forEach((fn) => fn(data));
  }
}

const store = new Observable();
const cleanup = store.subscribe((data) => console.log('Received:', data));
store.notify({ type: 'UPDATE', payload: 42 });
cleanup(); // unsubscribe
```
````

5. Return a cleanup/unsubscribe function from `subscribe` — consumers call it to remove the handler.

## Details

The Observer pattern (also called pub/sub) separates the emitter (subject/observable) from its consumers (observers/subscribers). This decoupling is fundamental to event-driven architectures, reactive state systems, and streams.

**Trade-offs:**

- If observers are not unsubscribed, the observable holds references to them — memory leak risk in SPAs
- Cascade updates — one observable notifying many observers can cause complex update chains that are hard to trace
- No guaranteed delivery order unless explicitly enforced
- Debugging is harder than direct calls — add logging in `notify()` during development

**When NOT to use:**

- When only one consumer exists — a direct callback is simpler
- When the update sequence matters and subscribers need to be ordered — use a queue or middleware chain instead
- For synchronous, predictable data flow — use signals or reducers

## Source

https://patterns.dev/javascript/observer-pattern

````

**Skill 6: `js-module-pattern`**

`skill.yaml`:
```yaml
name: js-module-pattern
version: '1.0.0'
description: Encapsulate private state and expose a public API using closures or ES modules
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
  - js-revealing-module-pattern
  - js-singleton-pattern
stack_signals:
  - javascript
keywords:
  - module
  - encapsulation
  - private-state
  - iife
  - esm
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/module-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Module Pattern

> Encapsulate private state and expose a public API using closures or ES modules

## When to Use

- You need private variables that are not accessible from outside a module
- You want a clean public API with implementation details hidden
- You are working in a pre-ESM environment where IIFE-based modules were the norm

## Instructions

1. In modern code (ESM), declare module-level variables as private by not exporting them. Export only the public API.
2. In legacy or bundled code, use an IIFE to create a closure scope.
3. Freeze exported objects if they should be immutable.
4. Keep modules focused — one module per concern.

```javascript
// Modern ESM module pattern
let _count = 0; // private — not exported

export function increment() {
  _count++;
}

export function getCount() {
  return _count;
}

// Legacy IIFE module pattern
const counter = (() => {
  let _count = 0;
  return {
    increment: () => _count++,
    getCount: () => _count,
  };
})();
```
````

5. Prefer ESM named exports over default exports for better tree-shaking.

## Details

The Module pattern predates ES modules. In the browser, there was no built-in module system, so developers used IIFEs (Immediately Invoked Function Expressions) to create private scopes. Today, ES modules (`.mjs`, `type="module"`) provide native module semantics — each file gets its own scope.

**Trade-offs:**

- Module-level state is shared across all importers in the same process — it is a singleton
- IIFE modules are not tree-shakeable by bundlers; prefer named ESM exports
- Circular module dependencies can cause initialization order issues

**When NOT to use:**

- When you need per-instance private state — use classes with private fields (`#field`)
- When the module has no state — just export pure functions directly

## Source

https://patterns.dev/javascript/module-pattern

````

**Skill 7: `js-mixin-pattern`**

`skill.yaml`:
```yaml
name: js-mixin-pattern
version: '1.0.0'
description: Add reusable behaviors to classes without deep inheritance chains
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
  - js-factory-pattern
stack_signals:
  - javascript
keywords:
  - mixin
  - composition
  - multiple-inheritance
  - object-assign
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/mixin-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Mixin Pattern

> Add reusable behaviors to classes without deep inheritance chains

## When to Use

- Multiple unrelated classes need the same capability (e.g., serialization, event handling, logging)
- Single inheritance is not sufficient to compose all required behaviors
- You want to share behavior without creating a shared base class

## Instructions

1. Define a mixin as a function that takes a superclass and returns a new class extending it.
2. Apply mixins by chaining: `class MyClass extends Mixin2(Mixin1(Base)) {}`.
3. Keep mixins focused on a single capability — avoid fat mixins that do too much.
4. Alternatively, use `Object.assign(Target.prototype, mixinMethods)` for simpler method injection.

```javascript
// Functional mixin approach
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

class User extends Serializable(Timestamped(class {})) {
  constructor(name) {
    super();
    this.name = name;
  }
}

const u = new User('Alice');
console.log(u.serialize()); // {"name":"Alice","createdAt":"..."}
```
````

5. Use TypeScript intersection types to type mixed-in methods correctly.

## Details

JavaScript's single-prototype-chain inheritance means a class can only extend one parent. Mixins work around this by composing behaviors through function application rather than inheritance.

**Trade-offs:**

- Method name collisions between mixins are silent — the last applied mixin wins
- Stack traces can be confusing — intermediate mixin classes appear in the trace
- `instanceof` checks do not work for mixins applied via `Object.assign` (only for the class mixin approach)

**When NOT to use:**

- When composition via plain function calls or hooks would work just as well
- When the behaviors are tightly coupled to specific base classes — inheritance is cleaner
- For simple utility methods — just import a utility function

## Source

https://patterns.dev/javascript/mixin-pattern

```

**Verification step after batch 1:**

Run:
```

cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts tests/schema.test.ts 2>&1 | tail -5

````

Expect: all tests pass for the 7 new skills.

Run: `harness validate`

Commit: `feat(skills): add js-singleton, proxy, provider, prototype, observer, module, mixin patterns`

---

### Task 2: JS skills batch 2 — design patterns group B (7 skills)

**Depends on:** Task 1
**Files:** 14 files in `agents/skills/claude-code/` (7 skill dirs × 2 files)

Create the following 7 skills in `agents/skills/claude-code/` using the same yaml/markdown template as Task 1.

**Skill 8: `js-mediator-middleware-pattern`**

`skill.yaml`:
```yaml
name: js-mediator-middleware-pattern
version: '1.0.0'
description: Route component interactions through a central mediator to reduce coupling
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
keywords:
  - mediator
  - middleware
  - pipeline
  - central-hub
  - decoupling
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/mediator-middleware-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Mediator / Middleware Pattern

> Route component interactions through a central mediator to reduce direct coupling

## When to Use

- Multiple components need to communicate without knowing about each other
- You want to add cross-cutting concerns (logging, auth, validation) to a request pipeline
- Implementing middleware chains (Express-style `next()` pipelines)

## Instructions

1. **Mediator:** Create a central object that components register with. Components send messages to the mediator, not to each other.
2. **Middleware:** Define a chain of functions that each receive `(req, res, next)` (or equivalent) and call `next()` to pass control.
3. Keep the mediator/middleware functions pure — no shared mutable state between middleware steps.
4. Provide a way to skip remaining middleware (`next('skip')` or returning early).

```javascript
// Middleware pipeline
class Pipeline {
  constructor() {
    this.middlewares = [];
  }

  use(fn) {
    this.middlewares.push(fn);
    return this;
  }

  execute(context) {
    let index = 0;
    const next = () => {
      const fn = this.middlewares[index++];
      if (fn) fn(context, next);
    };
    next();
  }
}

const pipeline = new Pipeline();
pipeline
  .use((ctx, next) => {
    ctx.log = [];
    next();
  })
  .use((ctx, next) => {
    ctx.log.push('step1');
    next();
  })
  .use((ctx) => {
    ctx.log.push('step2');
  });

const ctx = {};
pipeline.execute(ctx);
console.log(ctx.log); // ['step1', 'step2']
```
````

## Details

The Mediator pattern (GoF) centralizes communication. The Middleware pattern (popularized by Express.js) is a sequential pipeline variant. Both reduce point-to-point coupling by routing interactions through a shared hub or chain.

**Trade-offs:**

- The mediator becomes a bottleneck and a single point of failure if overloaded
- Middleware chains are hard to debug — add logging middleware during development
- Order of middleware registration matters and can cause subtle bugs

**When NOT to use:**

- For simple two-component communication — a direct callback or event is simpler
- When the pipeline steps need full knowledge of each other — mediator will not help

## Source

https://patterns.dev/javascript/mediator-middleware-pattern

````

**Skill 9: `js-command-pattern`**

`skill.yaml`:
```yaml
name: js-command-pattern
version: '1.0.0'
description: Encapsulate operations as objects to support undo, queue, and logging
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
  - js-mediator-middleware-pattern
  - js-iterator-pattern
stack_signals:
  - javascript
keywords:
  - command
  - undo
  - redo
  - action
  - encapsulate-operation
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/command-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Command Pattern

> Encapsulate operations as objects to support undo, queue, and logging

## When to Use

- You need undo/redo functionality
- Operations should be queued, deferred, or logged
- You want to decouple the sender of an operation from its executor

## Instructions

1. Define a command interface with `execute()` and optionally `undo()` methods.
2. Each command class captures the receiver and parameters needed to perform (and reverse) the operation.
3. Store executed commands in a history stack for undo support.
4. The invoker (button, menu, keyboard shortcut) calls `command.execute()` without knowing the implementation.

```javascript
class AddTextCommand {
  constructor(editor, text) {
    this.editor = editor;
    this.text = text;
    this.prevContent = null;
  }

  execute() {
    this.prevContent = this.editor.content;
    this.editor.content += this.text;
  }

  undo() {
    this.editor.content = this.prevContent;
  }
}

const editor = { content: 'Hello' };
const history = [];

const cmd = new AddTextCommand(editor, ' World');
cmd.execute();
history.push(cmd);
console.log(editor.content); // 'Hello World'

history.pop().undo();
console.log(editor.content); // 'Hello'
```
````

## Details

The Command pattern turns function calls into first-class objects. This makes operations serializable, loggable, and reversible. Redux actions are a functional variant of this pattern.

**Trade-offs:**

- More boilerplate than a direct function call
- Memory cost for storing command history
- Undo logic can be complex for operations with side effects

**When NOT to use:**

- When undo/redo is not needed and operations are one-shot
- For simple event handlers — a plain callback is sufficient

## Source

https://patterns.dev/javascript/command-pattern

````

**Skill 10: `js-flyweight-pattern`**

`skill.yaml`:
```yaml
name: js-flyweight-pattern
version: '1.0.0'
description: Share common state across many fine-grained objects to reduce memory usage
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
  - js-singleton-pattern
stack_signals:
  - javascript
keywords:
  - flyweight
  - memory-optimization
  - shared-state
  - intrinsic
  - extrinsic
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/flyweight-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Flyweight Pattern

> Share common state across many fine-grained objects to reduce memory usage

## When to Use

- You have a very large number of similar objects (thousands+) and memory usage is a concern
- Objects share most of their state (intrinsic) and only differ in a small extrinsic portion
- Creating new objects per item is prohibitively expensive

## Instructions

1. Separate **intrinsic state** (shared, immutable) from **extrinsic state** (unique per instance).
2. Store intrinsic state in a factory/cache indexed by a key.
3. Pass extrinsic state as parameters to methods rather than storing it on the flyweight.
4. Use a `FlyweightFactory` with a `Map` to return cached instances.

```javascript
class BookFlyweight {
  constructor(title, author) {
    this.title = title; // intrinsic — shared
    this.author = author; // intrinsic — shared
  }
}

class BookFactory {
  constructor() {
    this._books = new Map();
  }

  getBook(title, author) {
    const key = `${title}-${author}`;
    if (!this._books.has(key)) {
      this._books.set(key, new BookFlyweight(title, author));
    }
    return this._books.get(key);
  }
}

const factory = new BookFactory();
const b1 = factory.getBook('JS Patterns', 'Stoyan');
const b2 = factory.getBook('JS Patterns', 'Stoyan');
console.log(b1 === b2); // true — same instance
```
````

## Details

The Flyweight pattern is a structural memory optimization. It trades CPU time (factory lookup) for memory savings by sharing object instances. JavaScript's garbage collector normally handles short-lived objects efficiently, so Flyweight is only necessary at extreme scale.

**Trade-offs:**

- Increases code complexity — factory and separation of state
- Thread-safety concerns in worker-based environments if the cache is mutated
- Only beneficial when the number of objects is very large (thousands to millions)

**When NOT to use:**

- For typical web UI objects — the browser's memory management handles them fine
- When objects differ significantly from each other — flyweight savings are minimal

## Source

https://patterns.dev/javascript/flyweight-pattern

````

**Skill 11: `js-factory-pattern`**

`skill.yaml`:
```yaml
name: js-factory-pattern
version: '1.0.0'
description: Create objects via a factory function without specifying the exact class
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
  - js-abstract-factory-pattern
  - js-constructor-pattern
stack_signals:
  - javascript
keywords:
  - factory
  - creational
  - object-creation
  - encapsulate-instantiation
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/factory-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Factory Pattern

> Create objects via a factory function without exposing instantiation logic to callers

## When to Use

- Object creation logic is complex and should be encapsulated
- The exact type of object to create is determined at runtime
- You want to return different implementations based on input without exposing `new` to callers

## Instructions

1. Write a factory function (or static class method) that accepts configuration and returns the correct object.
2. The caller never uses `new` directly — they call the factory.
3. Validate inputs inside the factory before creating the object.
4. Return a consistent interface regardless of which concrete type was created.

```javascript
function createUser(type, name) {
  const roles = {
    admin: { permissions: ['read', 'write', 'delete'] },
    editor: { permissions: ['read', 'write'] },
    viewer: { permissions: ['read'] },
  };

  if (!roles[type]) throw new Error(`Unknown user type: ${type}`);

  return {
    name,
    type,
    ...roles[type],
    greet() {
      return `Hi, I'm ${name} (${type})`;
    },
  };
}

const admin = createUser('admin', 'Alice');
console.log(admin.permissions); // ['read', 'write', 'delete']
```
````

## Details

The Factory pattern is one of the most common patterns in JavaScript. Unlike `new ClassName()`, a factory function can return different types, apply caching, run validation, or perform async initialization.

**Trade-offs:**

- Callers cannot use `instanceof` to check the type (unless the factory returns a class instance)
- Can become a large switch/if-else block if not maintained

**When NOT to use:**

- When all instances are always the same type — just use `new` directly
- For very simple objects with no creation logic — plain object literals are sufficient

## Source

https://patterns.dev/javascript/factory-pattern

````

**Skill 12: `js-revealing-module-pattern`**

`skill.yaml`:
```yaml
name: js-revealing-module-pattern
version: '1.0.0'
description: Define all logic privately and selectively expose only the public API
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
  - js-singleton-pattern
stack_signals:
  - javascript
keywords:
  - revealing-module
  - public-api
  - private-scope
  - encapsulation
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/revealing-module-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Revealing Module Pattern

> Define all logic privately and selectively reveal only the public API

## When to Use

- You want clear separation between private implementation and public interface
- You need a consistent API where all functions are defined in the same scope
- You are refactoring legacy IIFE-based modules to improve readability

## Instructions

1. Define all functions and variables in a private closure scope.
2. At the end of the module, return an object that maps public names to private implementations.
3. Internal functions can call each other freely — only the return object is public.

```javascript
const counterModule = (() => {
  let _count = 0;

  function increment() {
    _count++;
  }
  function decrement() {
    _count--;
  }
  function getCount() {
    return _count;
  }
  function reset() {
    _count = 0;
  }

  // Reveal only the public API
  return { increment, decrement, getCount };
  // Note: reset() is private — not revealed
})();

counterModule.increment();
counterModule.increment();
console.log(counterModule.getCount()); // 2
```
````

## Details

The Revealing Module is a refinement of the Module pattern. The key insight: all code (including private functions) is defined in the same flat scope, which makes it easy to see the full implementation. The final `return` statement is the sole arbiter of what is public.

**Trade-offs:**

- References in the returned object point to the original private function — if a public method is overridden externally, internal calls still use the original
- Hard to extend after creation — you cannot add new public methods to an IIFE-based module
- In modern ESM, just not exporting a function achieves the same result with less boilerplate

**When NOT to use:**

- In modern codebases using ESM — prefer named exports directly
- When dynamic extension of the module is needed

## Source

https://patterns.dev/javascript/revealing-module-pattern

````

**Skill 13: `js-constructor-pattern`**

`skill.yaml`:
```yaml
name: js-constructor-pattern
version: '1.0.0'
description: Use constructor functions or classes to create and initialize objects
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
  - js-factory-pattern
stack_signals:
  - javascript
keywords:
  - constructor
  - class
  - new
  - instantiation
  - initialization
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/constructor-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Constructor Pattern

> Use constructor functions or ES6 classes to create and initialize objects

## When to Use

- You need to create multiple instances of the same type with shared methods
- Object initialization has meaningful logic (validation, default values, derived properties)
- You want to use `instanceof` for type checking

## Instructions

1. Use ES6 `class` syntax over function constructors for readability.
2. Put per-instance data in the constructor (`this.x = ...`).
3. Put shared methods on the class body (they go on the prototype automatically).
4. Use private class fields (`#field`) for data that should not be accessible externally.

```javascript
class Rectangle {
  #area = null;

  constructor(width, height) {
    if (width <= 0 || height <= 0) throw new RangeError('Dimensions must be positive');
    this.width = width;
    this.height = height;
  }

  getArea() {
    if (this.#area === null) {
      this.#area = this.width * this.height; // memoize
    }
    return this.#area;
  }

  toString() {
    return `Rectangle(${this.width}x${this.height})`;
  }
}

const r = new Rectangle(4, 5);
console.log(r.getArea()); // 20
console.log(r instanceof Rectangle); // true
```
````

## Details

The Constructor pattern is the foundation of object-oriented JavaScript. ES6 classes are syntactic sugar over prototype-based inheritance — `class` bodies define methods on `ClassName.prototype`, exactly like the older `function Constructor() {}` approach.

**Trade-offs:**

- Classes encourage mutation via `this` — prefer immutable value objects for data
- `this` binding issues arise when class methods are passed as callbacks — use arrow functions or `.bind()`
- Private fields (`#field`) are not accessible in subclasses without getters

**When NOT to use:**

- For simple data bags with no behavior — plain object literals are lighter
- When functional composition (factory functions + closures) better fits the architecture

## Source

https://patterns.dev/javascript/constructor-pattern

```

**Verification step after batch 2:**

Run:
```

cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts tests/schema.test.ts 2>&1 | tail -5

````

Run: `harness validate`

Commit: `feat(skills): add js-mediator-middleware, command, flyweight, factory, revealing-module, constructor, abstract-factory patterns`

Note: `js-abstract-factory-pattern` is part of this batch — create it with the same structure:

**Skill 14: `js-abstract-factory-pattern`**

`skill.yaml`:
```yaml
name: js-abstract-factory-pattern
version: '1.0.0'
description: Create families of related objects without specifying their concrete classes
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
  - js-constructor-pattern
stack_signals:
  - javascript
keywords:
  - abstract-factory
  - creational
  - family-of-objects
  - product-families
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/javascript/abstract-factory-pattern'
state:
  persistent: false
  files: []
depends_on: []
````

`SKILL.md`:

````markdown
# JS Abstract Factory Pattern

> Create families of related objects without specifying their concrete classes

## When to Use

- You need to create sets of related objects that must work together (e.g., a UI theme with buttons, inputs, and modals that all match)
- The exact family of objects is determined at runtime (e.g., based on platform or config)
- You want to enforce consistency across an entire family of products

## Instructions

1. Define an abstract factory interface listing all creation methods.
2. Implement one concrete factory per product family.
3. Clients use only the abstract factory interface — they never instantiate concrete products directly.
4. Switch families by swapping the factory instance, not by changing client code.

```javascript
// Abstract Factory (interface defined by convention)
class LightThemeFactory {
  createButton() {
    return { color: 'white', text: 'dark' };
  }
  createInput() {
    return { background: '#f0f0f0', border: '1px solid #ccc' };
  }
}

class DarkThemeFactory {
  createButton() {
    return { color: '#333', text: 'white' };
  }
  createInput() {
    return { background: '#222', border: '1px solid #555' };
  }
}

function renderUI(factory) {
  const button = factory.createButton();
  const input = factory.createInput();
  return { button, input };
}

const ui = renderUI(new DarkThemeFactory());
```
````

## Details

The Abstract Factory is a creational pattern that sits one level of abstraction above the Factory pattern. Where a Factory creates one type of product, an Abstract Factory creates an entire suite of related products.

**Trade-offs:**

- Significantly more code than a simple factory — only justified when product families truly need to be swapped
- Adding a new product type requires changes to every factory implementation

**When NOT to use:**

- When you only have one product family — a simple factory or `new` is sufficient
- When products do not need to be coordinated or consistent with each other

## Source

https://patterns.dev/javascript/abstract-factory-pattern

````

---

### Task 3: JS skills batch 3 — design patterns group C (7 skills)

**Depends on:** Task 2
**Files:** 14 files in `agents/skills/claude-code/`

Create the following 7 skills in `agents/skills/claude-code/` using the established template.

**Skills to create:**

1. **`js-decorator-pattern`** — description: `Extend object behavior dynamically without modifying its source`, upstream: `PatternsDev/skills/javascript/decorator-pattern`, keywords: `decorator, extend-behavior, wrapping, higher-order`, related_skills: `js-mixin-pattern, js-proxy-pattern`

   `SKILL.md` Instructions section:
   ```markdown
   ## Instructions

   1. Write a decorator function that accepts a target function or object and returns an enhanced version.
   2. For class decorators (TC39 Stage 3): prefix the class or method declaration with `@decorator`.
   3. For functional decorators: wrap the original function — `const enhanced = decorate(original)`.
   4. The decorator should not modify the original — it returns a new function/object.

   ```javascript
   // Functional decorator — adds logging
   function withLogging(fn) {
     return function (...args) {
       console.log(`Calling ${fn.name} with`, args);
       const result = fn.apply(this, args);
       console.log(`${fn.name} returned`, result);
       return result;
     };
   }

   function add(a, b) { return a + b; }
   const loggedAdd = withLogging(add);
   loggedAdd(2, 3); // logs call and return
````

````

2. **`js-iterator-pattern`** — description: `Traverse a collection sequentially without exposing its internal structure`, upstream: `PatternsDev/skills/javascript/iterator-pattern`, keywords: `iterator, iterable, symbol-iterator, for-of, generator`, related_skills: `js-command-pattern, js-composite-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Implement the iterator protocol: an object with a `next()` method returning `{ value, done }`.
2. Make a collection iterable by adding `[Symbol.iterator]()` that returns an iterator.
3. Use generator functions (`function*`) for the cleanest iterator implementation.
4. Use `for...of` to consume iterables.

```javascript
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }

  [Symbol.iterator]() {
    let current = this.start;
    const end = this.end;
    return {
      next() {
        return current <= end
          ? { value: current++, done: false }
          : { value: undefined, done: true };
      },
    };
  }
}

for (const n of new Range(1, 3)) {
  console.log(n); // 1, 2, 3
}
````

````

3. **`js-state-pattern`** — description: `Allow an object to alter its behavior when its internal state changes`, upstream: `PatternsDev/skills/javascript/state-pattern`, keywords: `state-machine, state-transitions, behavior-change, finite-state`, related_skills: `js-observer-pattern, js-command-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Define a state interface with the actions the context can perform.
2. Implement one concrete state class per state.
3. The context delegates behavior to the current state object.
4. States transition the context by calling `context.setState(newState)`.

```javascript
class TrafficLight {
  constructor() {
    this.state = new RedState(this);
  }
  setState(state) { this.state = state; }
  signal() { this.state.signal(); }
}

class RedState {
  constructor(light) { this.light = light; }
  signal() {
    console.log('Red — stop');
    this.light.setState(new GreenState(this.light));
  }
}

class GreenState {
  constructor(light) { this.light = light; }
  signal() {
    console.log('Green — go');
    this.light.setState(new RedState(this.light));
  }
}

const light = new TrafficLight();
light.signal(); // Red — stop
light.signal(); // Green — go
````

````

4. **`js-template-method-pattern`** — description: `Define the skeleton of an algorithm in a base class and let subclasses override specific steps`, upstream: `PatternsDev/skills/javascript/template-method-pattern`, keywords: `template-method, algorithm-skeleton, hook-methods, inheritance`, related_skills: `js-strategy-pattern, js-constructor-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Create a base class with a "template method" that calls a series of step methods in order.
2. Implement default behavior for shared steps; leave varying steps abstract or as no-ops.
3. Subclasses override only the steps they need to customize.
4. Never let subclasses change the template method itself — keep it final via convention or documentation.

```javascript
class DataProcessor {
  process(data) {
    const validated = this.validate(data);
    const transformed = this.transform(validated);
    return this.format(transformed);
  }
  validate(data) { return data; } // default: no-op
  transform(data) { throw new Error('Subclass must implement transform()'); }
  format(data) { return JSON.stringify(data); } // default: JSON
}

class CSVProcessor extends DataProcessor {
  transform(data) { return data.map(row => row.join(',')); }
  format(data) { return data.join('\n'); }
}
````

````

5. **`js-strategy-pattern`** — description: `Define a family of algorithms and make them interchangeable without altering the client`, upstream: `PatternsDev/skills/javascript/strategy-pattern`, keywords: `strategy, algorithm-swap, interchangeable, policy`, related_skills: `js-template-method-pattern, js-factory-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Define a strategy interface — each strategy is a function or object with a common method signature.
2. The context accepts a strategy and delegates the varying behavior to it.
3. Swap strategies at runtime by passing a different function/object.
4. Prefer plain functions as strategies in JavaScript — no need for class hierarchies.

```javascript
// Strategies as plain functions
const strategies = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
};

function calculate(strategy, a, b) {
  if (!strategies[strategy]) throw new Error(`Unknown strategy: ${strategy}`);
  return strategies[strategy](a, b);
}

calculate('add', 5, 3);      // 8
calculate('multiply', 5, 3); // 15
````

````

6. **`js-visitor-pattern`** — description: `Add new operations to object structures without modifying the objects`, upstream: `PatternsDev/skills/javascript/visitor-pattern`, keywords: `visitor, double-dispatch, open-closed, external-operations`, related_skills: `js-iterator-pattern, js-composite-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Define an `accept(visitor)` method on each element class in the object structure.
2. Each `accept` calls the visitor's corresponding method, passing `this` (double dispatch).
3. Create visitor objects with one method per element type (e.g., `visitFile`, `visitFolder`).
4. New operations = new visitor objects, without modifying element classes.

```javascript
class File {
  constructor(name, size) { this.name = name; this.size = size; }
  accept(visitor) { return visitor.visitFile(this); }
}

class Folder {
  constructor(name, children) { this.name = name; this.children = children; }
  accept(visitor) { return visitor.visitFolder(this); }
}

const sizeCalculator = {
  visitFile(file) { return file.size; },
  visitFolder(folder) {
    return folder.children.reduce((sum, child) => sum + child.accept(this), 0);
  },
};
````

````

7. **`js-facade-pattern`** — description: `Provide a simplified interface to a complex subsystem`, upstream: `PatternsDev/skills/javascript/facade-pattern`, keywords: `facade, simplify, abstraction, subsystem-interface`, related_skills: `js-adapter-pattern, js-mediator-middleware-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Identify a group of related subsystem calls that clients frequently combine.
2. Create a facade module that exposes high-level functions composing those subsystem calls.
3. The facade delegates to subsystem objects — it does not replace them.
4. Keep the subsystem accessible for advanced callers who need fine-grained control.

```javascript
// Facade for a complex video conversion subsystem
class VideoConverter {
  convert(filename, format) {
    const file = new VideoFile(filename);
    const codec = CodecFactory.extract(file);
    const compressor = new BitrateCompressor();
    const mixer = new AudioMixer();

    const result = codec.transcode(file, format);
    compressor.compress(result);
    mixer.normalize(result);
    return result;
  }
}

// Client uses one call instead of four subsystem interactions
const converter = new VideoConverter();
converter.convert('video.ogg', 'mp4');
````

```

For all 7 skills in this batch, write complete `## When to Use`, `## Details` (trade-offs + when NOT to use), and `## Source` sections following the established format from Tasks 1–2.

**Verification step after batch 3:**

Run:
```

cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts tests/schema.test.ts 2>&1 | tail -5

````

Run: `harness validate`

Commit: `feat(skills): add js-decorator, iterator, state, template-method, strategy, visitor, facade patterns`

---

### Task 4: JS skills batch 4 — design patterns group D (6 skills)

**Depends on:** Task 3
**Files:** 12 files in `agents/skills/claude-code/`

Create the following 6 skills in `agents/skills/claude-code/`:

1. **`js-adapter-pattern`** — description: `Convert the interface of a class into another interface that clients expect`, upstream: `PatternsDev/skills/javascript/adapter-pattern`, keywords: `adapter, wrapper, interface-compatibility, legacy-integration`, related_skills: `js-facade-pattern, js-decorator-pattern`

   `SKILL.md` Instructions section:
   ```markdown
   ## Instructions

   1. Identify the incompatible interface — e.g., a legacy API returning XML when your code expects JSON.
   2. Create an adapter class or function that wraps the incompatible object.
   3. The adapter translates calls from the expected interface to the wrapped object's interface.
   4. The client code interacts only with the adapter, never with the adapted object directly.

   ```javascript
   // Legacy API returns { firstName, lastName }
   class LegacyUser {
     constructor(data) { this.firstName = data.firstName; this.lastName = data.lastName; }
   }

   // Modern code expects { name, email }
   class UserAdapter {
     constructor(legacyUser) { this.legacyUser = legacyUser; }
     get name() { return `${this.legacyUser.firstName} ${this.legacyUser.lastName}`; }
     get email() { return ''; } // field not available in legacy
   }
````

````

2. **`js-chain-of-responsibility-pattern`** — description: `Pass a request along a chain of handlers until one handles it`, upstream: `PatternsDev/skills/javascript/chain-of-responsibility-pattern`, keywords: `chain-of-responsibility, handler-chain, request-pipeline, middleware`, related_skills: `js-mediator-middleware-pattern, js-command-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Define a handler interface with a `handle(request)` method and a `setNext(handler)` reference.
2. Each handler decides to process the request or pass it to the next handler in the chain.
3. Build the chain by linking handlers: `h1.setNext(h2).setNext(h3)`.
4. The client sends the request to the first handler — it does not know which handler will process it.

```javascript
class Handler {
  setNext(handler) { this.next = handler; return handler; }
  handle(request) {
    if (this.next) return this.next.handle(request);
    return null;
  }
}

class AuthHandler extends Handler {
  handle(req) {
    if (!req.token) return { error: 'Unauthorized' };
    return super.handle(req);
  }
}

class RateLimitHandler extends Handler {
  handle(req) {
    if (req.rateLimited) return { error: 'Too many requests' };
    return super.handle(req);
  }
}
````

````

3. **`js-bridge-pattern`** — description: `Decouple abstraction from implementation so both can vary independently`, upstream: `PatternsDev/skills/javascript/bridge-pattern`, keywords: `bridge, decoupling, abstraction-implementation, structural`, related_skills: `js-adapter-pattern, js-abstract-factory-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Separate the abstraction (high-level logic) from the implementation (low-level detail).
2. The abstraction holds a reference to an implementation object.
3. Both can be subclassed independently — new abstractions do not require new implementations and vice versa.
4. Inject the implementation via the constructor.

```javascript
// Implementation interface
class Renderer {
  renderCircle(radius) { throw new Error('Not implemented'); }
}

class SVGRenderer extends Renderer {
  renderCircle(radius) { return `<circle r="${radius}"/>`; }
}

class CanvasRenderer extends Renderer {
  renderCircle(radius) { return `ctx.arc(0,0,${radius},0,2*PI)`; }
}

// Abstraction
class Shape {
  constructor(renderer) { this.renderer = renderer; }
}

class Circle extends Shape {
  constructor(radius, renderer) { super(renderer); this.radius = radius; }
  draw() { return this.renderer.renderCircle(this.radius); }
}
````

````

4. **`js-composite-pattern`** — description: `Compose objects into tree structures and treat individual objects and composites uniformly`, upstream: `PatternsDev/skills/javascript/composite-pattern`, keywords: `composite, tree-structure, uniform-treatment, recursive-composition`, related_skills: `js-iterator-pattern, js-visitor-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Define a component interface with the operation that both leaves and composites share.
2. Leaf classes implement the operation directly.
3. Composite classes hold a collection of children and delegate the operation to each child.
4. Clients call the operation on any component without checking whether it is a leaf or composite.

```javascript
class File {
  constructor(name, size) { this.name = name; this.size = size; }
  getSize() { return this.size; }
}

class Folder {
  constructor(name) { this.name = name; this.children = []; }
  add(child) { this.children.push(child); return this; }
  getSize() {
    return this.children.reduce((sum, child) => sum + child.getSize(), 0);
  }
}

const root = new Folder('src')
  .add(new File('index.js', 120))
  .add(new Folder('utils').add(new File('helpers.js', 80)));
root.getSize(); // 200
````

````

5. **`js-static-import`** — description: `Use static import declarations to load ES modules at parse time for tree-shaking and static analysis`, upstream: `PatternsDev/skills/javascript/static-import`, keywords: `static-import, esm, tree-shaking, named-exports, bundler-optimization`, related_skills: `js-dynamic-import, js-module-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Use `import { name } from './module.js'` at the top of the file for all compile-time dependencies.
2. Prefer named exports over default exports — they enable tree-shaking and IDE auto-imports.
3. Group imports: external packages first, then internal modules, then relative paths.
4. Never use `require()` in ESM files — static `import` enables bundler dead-code elimination.

```javascript
// Named exports — tree-shakeable
import { useState, useEffect } from 'react';
import { formatDate, parseDate } from '../utils/date.js';

// Default export — avoid when possible
import MyComponent from './MyComponent.js';
````

````

6. **`js-dynamic-import`** — description: `Load ES modules on demand with import() to reduce initial bundle size and enable code splitting`, upstream: `PatternsDev/skills/javascript/dynamic-import`, keywords: `dynamic-import, code-splitting, lazy-loading, import-on-demand, bundle-size`, related_skills: `js-static-import, js-module-pattern`

`SKILL.md` Instructions section:
```markdown
## Instructions

1. Use `import('./module.js')` to load a module at runtime — it returns a Promise.
2. Use dynamic import for routes, heavy libraries, or features behind flags.
3. Combine with `await` in async functions or `.then()` for cleaner syntax.
4. Bundlers (webpack, Vite, Rollup) automatically split dynamic imports into separate chunks.

```javascript
// Route-based code splitting
async function loadPage(route) {
  const module = await import(`./pages/${route}.js`);
  module.render();
}

// Feature-flag gating
if (user.hasFeature('charts')) {
  const { renderChart } = await import('./charts.js');
  renderChart(data);
}
````

```

For all 6 skills, write complete `skill.yaml` (using Task 1 JS template) and `SKILL.md` with `## When to Use`, `## Details` (trade-offs + when NOT to use), and `## Source` sections following the established format from Tasks 1–2.

**Verification step after batch 4:**

Run:
```

cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts tests/schema.test.ts 2>&1 | tail -5

```

Run: `harness validate`

Commit: `feat(skills): add js-adapter, chain-of-responsibility, bridge, composite, static-import, dynamic-import patterns`

At this point all 27 JS skills exist in `agents/skills/claude-code/`. Verify:
```

ls /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/ | grep "^js-" | wc -l

````
Expected: `27`

---

### Task 5: Vue skills — all 11 patterns

**Depends on:** Task 4
**Files:** 22 files in `agents/skills/claude-code/` (11 skill dirs × 2 files)

Create the following 11 skills in `agents/skills/claude-code/`.

**skill.yaml template for all Vue skills:**

```yaml
name: <skill-name>
version: '1.0.0'
description: <one-line description>
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
related_skills: <see per-skill>
stack_signals:
  - vue
  - typescript
keywords: <see per-skill>
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/vue/<pattern-slug>'
state:
  persistent: false
  files: []
depends_on: []
````

**Vue skills to create:**

1. **`vue-composables-pattern`**
   - description: `Extract and reuse stateful logic across components using Vue composables`
   - upstream: `PatternsDev/skills/vue/composables-pattern`
   - keywords: `composables, use-prefix, reusable-logic, composition-api`
   - related_skills: `vue-reactive-refs, vue-watchers-pattern`
   - Source URL: `https://patterns.dev/vue/composables-pattern`

   `SKILL.md` Instructions:

   ````markdown
   ## Instructions

   1. Create a function prefixed with `use` (e.g., `useWindowSize`, `useFetch`).
   2. Inside, use `ref`, `reactive`, `computed`, `watch`, and lifecycle hooks as needed.
   3. Return only what consumers need — keep internal state private.
   4. Co-locate composable files with their primary consumer or place in a `composables/` directory.

   ```typescript
   // composables/useWindowSize.ts
   import { ref, onMounted, onUnmounted } from 'vue';

   export function useWindowSize() {
     const width = ref(window.innerWidth);
     const height = ref(window.innerHeight);

     function update() {
       width.value = window.innerWidth;
       height.value = window.innerHeight;
     }

     onMounted(() => window.addEventListener('resize', update));
     onUnmounted(() => window.removeEventListener('resize', update));

     return { width, height };
   }
   ```
   ````

   ```

   ```

2. **`vue-provide-inject`**
   - description: `Share data across a component tree without prop-drilling using provide/inject`
   - upstream: `PatternsDev/skills/vue/provide-inject`
   - keywords: `provide, inject, dependency-injection, ancestor-descendant, prop-drilling`
   - related_skills: `vue-composables-pattern, vue-pinia-pattern`
   - Source: `https://patterns.dev/vue/provide-inject`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. In the ancestor component, call `provide(key, value)` inside `<script setup>`.
   2. In any descendant, call `const value = inject(key)` to receive the provided value.
   3. Use `InjectionKey<T>` for type-safe provide/inject in TypeScript.
   4. Provide reactive values (`ref` or `reactive`) so descendants receive live updates.
   5. Always provide a default value or document that `inject()` may return `undefined`.

   ```typescript
   // Parent — provides theme
   import { provide, ref } from 'vue';
   const theme = ref('light');
   provide('theme', theme);

   // Deep child — injects theme
   import { inject } from 'vue';
   const theme = inject('theme', ref('light'));
   ```
   ````

   ```

   ```

3. **`vue-renderless-components`**
   - description: `Extract behavior into components that render nothing, delegating all rendering to the consumer via slots`
   - upstream: `PatternsDev/skills/vue/renderless-components`
   - keywords: `renderless, headless, scoped-slots, behavior-extraction, slot-props`
   - related_skills: `vue-slots-pattern, vue-composables-pattern`
   - Source: `https://patterns.dev/vue/renderless-components`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. Create a component that manages state and behavior but renders nothing itself.
   2. Use `<slot v-bind="slotProps">` to pass data and actions to the parent via scoped slots.
   3. The consumer provides all markup via the default slot, receiving behavior via slot props.
   4. Prefer composables for new code — renderless components are the Vue 2 equivalent.

   ```vue
   <!-- RenderlessToggle.vue -->
   <script setup>
   import { ref } from 'vue';
   const isOpen = ref(false);
   const toggle = () => {
     isOpen.value = !isOpen.value;
   };
   </script>

   <template>
     <slot :isOpen="isOpen" :toggle="toggle" />
   </template>
   ```
   ````

   ```

   ```

4. **`vue-teleport-pattern`**
   - description: `Render a component's HTML at a different location in the DOM using Vue's Teleport`
   - upstream: `PatternsDev/skills/vue/teleport-pattern`
   - keywords: `teleport, portal, modal, toast, out-of-flow-rendering`
   - related_skills: `vue-async-components, vue-slots-pattern`
   - Source: `https://patterns.dev/vue/teleport-pattern`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. Wrap the content to be teleported in `<Teleport to="selector">`.
   2. The `to` prop is a CSS selector (e.g., `#modals`, `body`).
   3. The teleported content remains in the component's logical tree for props, events, and provide/inject.
   4. Use `<Teleport disabled>` to conditionally render in-place.

   ```vue
   <template>
     <button @click="showModal = true">Open</button>
     <Teleport to="#modal-container">
       <div v-if="showModal" class="modal">
         <p>Modal content</p>
         <button @click="showModal = false">Close</button>
       </div>
     </Teleport>
   </template>
   ```
   ````

   ```

   ```

5. **`vue-async-components`**
   - description: `Load Vue components lazily to reduce initial bundle size using defineAsyncComponent`
   - upstream: `PatternsDev/skills/vue/async-components`
   - keywords: `async-components, lazy-loading, code-splitting, defineAsyncComponent, suspense`
   - related_skills: `vue-teleport-pattern, vue-composables-pattern`
   - Source: `https://patterns.dev/vue/async-components`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. Use `defineAsyncComponent(() => import('./HeavyComponent.vue'))` to lazy-load.
   2. Provide `loadingComponent` and `errorComponent` options for UX during loading.
   3. Set a `delay` (ms) before showing the loading component to avoid flicker.
   4. Wrap async components in `<Suspense>` for coordinated loading states.

   ```typescript
   import { defineAsyncComponent } from 'vue';

   const AsyncChart = defineAsyncComponent({
     loader: () => import('./Chart.vue'),
     loadingComponent: LoadingSpinner,
     errorComponent: ErrorDisplay,
     delay: 200,
     timeout: 10000,
   });
   ```
   ````

   ```

   ```

6. **`vue-pinia-pattern`**
   - description: `Manage shared application state with Pinia stores in the Options or Setup style`
   - upstream: `PatternsDev/skills/vue/pinia-pattern`
   - keywords: `pinia, state-management, store, actions, getters`
   - related_skills: `vue-provide-inject, vue-composables-pattern`
   - Source: `https://patterns.dev/vue/pinia-pattern`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. Define a store with `defineStore('id', { state, getters, actions })` or the Setup syntax.
   2. Prefer the Setup syntax for composable-style stores: `defineStore('id', () => { ... })`.
   3. Use `storeToRefs()` when destructuring reactive state from a store.
   4. Keep stores focused — one store per domain concept, not one global store.

   ```typescript
   import { defineStore } from 'pinia';
   import { ref, computed } from 'vue';

   export const useCounterStore = defineStore('counter', () => {
     const count = ref(0);
     const doubled = computed(() => count.value * 2);
     function increment() {
       count.value++;
     }
     return { count, doubled, increment };
   });
   ```
   ````

   ```

   ```

7. **`vue-watchers-pattern`**
   - description: `React to data changes with watch and watchEffect for side effects and async operations`
   - upstream: `PatternsDev/skills/vue/watchers-pattern`
   - keywords: `watch, watchEffect, side-effects, reactive-watch, deep-watch`
   - related_skills: `vue-reactive-refs, vue-composables-pattern`
   - Source: `https://patterns.dev/vue/watchers-pattern`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. Use `watch(source, callback)` when you need the old and new values.
   2. Use `watchEffect(callback)` when you want automatic dependency tracking.
   3. Pass `{ deep: true }` to watch nested object mutations.
   4. Always clean up side effects in the `onCleanup` callback to prevent leaks.

   ```typescript
   import { ref, watch, watchEffect } from 'vue';

   const query = ref('');

   // Explicit source — gives old and new
   watch(query, (newVal, oldVal) => {
     console.log(`Query changed: ${oldVal} → ${newVal}`);
   });

   // Auto-tracked dependencies
   watchEffect((onCleanup) => {
     const controller = new AbortController();
     fetch(`/api/search?q=${query.value}`, { signal: controller.signal });
     onCleanup(() => controller.abort());
   });
   ```
   ````

   ```

   ```

8. **`vue-reactive-refs`**
   - description: `Create and manage reactive primitive values and objects using ref and reactive`
   - upstream: `PatternsDev/skills/vue/reactive-refs`
   - keywords: `ref, reactive, computed, reactivity, composition-api`
   - related_skills: `vue-watchers-pattern, vue-composables-pattern`
   - Source: `https://patterns.dev/vue/reactive-refs`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. Use `ref()` for primitives (strings, numbers, booleans) — access via `.value`.
   2. Use `reactive()` for objects — access properties directly (no `.value`).
   3. Use `computed()` for derived values that should auto-update.
   4. Never destructure a `reactive()` object — it breaks reactivity. Use `toRefs()` if needed.

   ```typescript
   import { ref, reactive, computed, toRefs } from 'vue';

   const count = ref(0); // ref for primitive
   const user = reactive({ name: 'Alice', age: 30 }); // reactive for object
   const greeting = computed(() => `Hello, ${user.name}!`);

   count.value++; // ref needs .value
   user.age = 31; // reactive — direct access
   ```
   ````

   ```

   ```

9. **`vue-component-events`**
   - description: `Communicate from child to parent components using emits and defineEmits`
   - upstream: `PatternsDev/skills/vue/component-events`
   - keywords: `emit, defineEmits, v-on, custom-events, parent-child-communication`
   - related_skills: `vue-provide-inject, vue-composables-pattern`
   - Source: `https://patterns.dev/vue/component-events`

   `SKILL.md` Instructions section:

   ````markdown
   ## Instructions

   1. Declare events with `defineEmits<{ eventName: [payload: Type] }>()` in `<script setup>`.
   2. Emit events with `emit('eventName', payload)`.
   3. The parent listens with `@event-name="handler"` (kebab-case in template).
   4. Always type your emit payloads for compile-time safety.

   ```vue
   <!-- ChildButton.vue -->
   <script setup lang="ts">
   const emit = defineEmits<{
     click: [id: number];
     update: [value: string];
   }>();
   </script>

   <template>
     <button @click="emit('click', 42)">Click</button>
   </template>

   <!-- Parent.vue -->
   <ChildButton @click="handleClick" @update="handleUpdate" />
   ```
   ````

   ```

   ```

10. **`vue-directive-pattern`**
    - description: `Create custom Vue directives for low-level DOM manipulation and reusable DOM behavior`
    - upstream: `PatternsDev/skills/vue/directive-pattern`
    - keywords: `custom-directive, v-directive, dom-manipulation, directive-hooks`
    - related_skills: `vue-composables-pattern, vue-renderless-components`
    - Source: `https://patterns.dev/vue/directive-pattern`

    `SKILL.md` Instructions section:

    ````markdown
    ## Instructions

    1. Define a directive as an object with lifecycle hooks (`mounted`, `updated`, `unmounted`).
    2. Register globally via `app.directive('name', directiveObj)` or locally in `<script setup>` with `vName` convention.
    3. Access the element as the first argument and binding value as the second.
    4. Use directives only for DOM manipulation — for logic, prefer composables.

    ```typescript
    // v-focus directive — auto-focuses an input on mount
    const vFocus = {
      mounted(el: HTMLElement) {
        el.focus();
      },
    };

    // Usage in template: <input v-focus />
    ```
    ````

    ```

    ```

11. **`vue-slots-pattern`**
    - description: `Use named, scoped, and dynamic slots to build flexible, composable component APIs`
    - upstream: `PatternsDev/skills/vue/slots-pattern`
    - keywords: `slots, named-slots, scoped-slots, slot-props, component-composition`
    - related_skills: `vue-renderless-components, vue-teleport-pattern`
    - Source: `https://patterns.dev/vue/slots-pattern`

    `SKILL.md` Instructions section:

    ````markdown
    ## Instructions

    1. Use `<slot>` for the default slot, `<slot name="header">` for named slots.
    2. Pass data to the consumer via scoped slots: `<slot :item="item">`.
    3. The consumer accesses scoped data with `<template #slotName="{ item }">`.
    4. Provide fallback content inside `<slot>` tags for when the consumer does not fill the slot.

    ```vue
    <!-- Card.vue -->
    <template>
      <div class="card">
        <div class="header"><slot name="header">Default Header</slot></div>
        <div class="body"><slot /></div>
        <div class="footer"><slot name="footer" /></div>
      </div>
    </template>

    <!-- Consumer -->
    <Card>
      <template #header><h2>Custom Title</h2></template>
      <p>Body content goes in the default slot</p>
    </Card>
    ```
    ````

    ```

    ```

For all 11 Vue skills, write complete `skill.yaml` (using the Vue template above) and `SKILL.md` with `## When to Use`, `## Details` (trade-offs, when NOT to use), and `## Source` sections following the established format from Tasks 1–2.

**Verification step after Vue skills:**

Run:

```
ls /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/ | grep "^vue-" | wc -l
```

Expected: `11`

Run:

```
cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts tests/schema.test.ts 2>&1 | tail -5
```

Run: `harness validate`

Commit: `feat(skills): add 11 vue knowledge skills (composables, provide-inject, renderless, teleport, async, pinia, watchers, reactive-refs, events, directive, slots)`

---

### Task 6: Platform replication — gemini-cli

**Depends on:** Task 5
**Files:** All 38 skill dirs in `agents/skills/gemini-cli/`

Replicate all 38 skills (27 JS + 11 Vue) from claude-code to gemini-cli:

```bash
cd /Users/cwarner/Projects/harness-engineering/agents/skills

for skill in $(ls claude-code/ | grep -E "^(js|vue)-"); do
  cp -r "claude-code/$skill" "gemini-cli/$skill"
done
```

Verify:

```bash
ls /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli/ | grep -E "^(js|vue)-" | wc -l
```

Expected: `38`

Run: `harness validate`

Commit: `feat(skills): replicate js- and vue- skills to gemini-cli platform`

---

### Task 7: Platform replication — cursor

**Depends on:** Task 6
**Files:** All 38 skill dirs in `agents/skills/cursor/`

Replicate all 38 skills from claude-code to cursor:

```bash
cd /Users/cwarner/Projects/harness-engineering/agents/skills

for skill in $(ls claude-code/ | grep -E "^(js|vue)-"); do
  cp -r "claude-code/$skill" "cursor/$skill"
done
```

Verify:

```bash
ls /Users/cwarner/Projects/harness-engineering/agents/skills/cursor/ | grep -E "^(js|vue)-" | wc -l
```

Expected: `38`

Run: `harness validate`

Commit: `feat(skills): replicate js- and vue- skills to cursor platform`

---

### Task 8: Platform replication — codex

**Depends on:** Task 7
**Files:** All 38 skill dirs in `agents/skills/codex/`

Replicate all 38 skills from claude-code to codex:

```bash
cd /Users/cwarner/Projects/harness-engineering/agents/skills

for skill in $(ls claude-code/ | grep -E "^(js|vue)-"); do
  cp -r "claude-code/$skill" "codex/$skill"
done
```

Verify:

```bash
ls /Users/cwarner/Projects/harness-engineering/agents/skills/codex/ | grep -E "^(js|vue)-" | wc -l
```

Expected: `38`

Run: `harness validate`

Commit: `feat(skills): replicate js- and vue- skills to codex platform`

---

### Task 9: E2E dispatch validation — JS and Vue verticals

**Depends on:** Task 8
**Files:** `packages/cli/tests/skill/dispatcher.test.ts` (MODIFY — add 2 new `it` blocks)

This task adds two E2E tests confirming that the dispatch engine surfaces JS and Vue knowledge skills when editing `.js` and `.vue` files respectively. These tests follow the exact pattern used in Phase B for React validation.

Read `packages/cli/tests/skill/dispatcher.test.ts` first to find the existing E2E describe block added in Phase B, then add two new `it` blocks inside it.

**Key learnings from Phase B (applies here):**

- `scoreSkill()` signature: `(entry, queryTerms[], profile, recentFiles[], skillName, healthSnapshot?)`
- `paths` score alone (0.20) does not exceed the 0.40 threshold — include keywords matching the skill in queryTerms
- Use `importActual` pattern when mocking suggest() to preserve real `scoreSkill` export
- `suggest()` returns `SuggestResult` with `suggestions` and `autoInjectKnowledge` arrays

**New test blocks to add:**

```typescript
it('surfaces js-singleton-pattern when editing .js files with relevant query', async () => {
  const result = await suggest(
    ['singleton', 'single-instance'],
    { stack: ['javascript'], recentFiles: ['src/utils/db.js'] },
    [],
    ['src/utils/db.js']
  );

  const allSurfaced = [
    ...result.suggestions.map((s) => s.name ?? s.skillName),
    ...result.autoInjectKnowledge,
  ];
  expect(allSurfaced.some((n) => n === 'js-singleton-pattern')).toBe(true);
});

it('surfaces vue-composables-pattern when editing .vue files with relevant query', async () => {
  const result = await suggest(
    ['composables', 'use-prefix'],
    { stack: ['vue'], recentFiles: ['src/components/App.vue'] },
    [],
    ['src/components/App.vue']
  );

  const allSurfaced = [
    ...result.suggestions.map((s) => s.name ?? s.skillName),
    ...result.autoInjectKnowledge,
  ];
  expect(allSurfaced.some((n) => n === 'vue-composables-pattern')).toBe(true);
});
```

Run:

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/skill/dispatcher.test.ts 2>&1 | tail -10
```

Expect: new tests pass.

Also run the full agents/skills test suite to verify no regressions:

```
cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts tests/schema.test.ts 2>&1 | tail -5
```

**Note on platform-parity pre-existing failures:** The platform-parity test will still show failures for the 133 skills missing from codex (angular, astro, drizzle, etc.). These are pre-existing and out of scope for Phase C. The new js- and vue- skills will pass parity checks because they are added to all 4 platforms in Tasks 6–8.

Run: `harness validate`

Commit: `test(cli): add E2E dispatch validation for js and vue knowledge skill verticals`

---

### Task 10: Final validation gate

**Depends on:** Task 9
**Files:** none (validation only)

[checkpoint:human-verify] — Run the following commands, review output, and confirm all pass before considering Phase C complete.

1. Run harness validate:

   ```
   harness validate
   ```

   Expected: `v validation passed`

2. Count JS skills across all 4 platforms:

   ```
   for p in claude-code gemini-cli cursor codex; do
     echo "$p: $(ls /Users/cwarner/Projects/harness-engineering/agents/skills/$p/ | grep '^js-' | wc -l)"
   done
   ```

   Expected: `27` for each platform

3. Count Vue skills across all 4 platforms:

   ```
   for p in claude-code gemini-cli cursor codex; do
     echo "$p: $(ls /Users/cwarner/Projects/harness-engineering/agents/skills/$p/ | grep '^vue-' | wc -l)"
   done
   ```

   Expected: `11` for each platform

4. Run schema and structure tests:

   ```
   cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts tests/schema.test.ts
   ```

   Expected: all pass (no js- or vue- failures)

5. Run CLI tests:

   ```
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/ 2>&1 | tail -5
   ```

   Expected: all pass (including new E2E dispatch tests)

6. Spot-check skill content — review one JS skill and one Vue skill:

   ```
   cat /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/js-singleton-pattern/skill.yaml
   cat /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/vue-composables-pattern/SKILL.md
   ```

7. Confirm pre-existing parity failures are unchanged (not made worse):
   ```
   cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/platform-parity.test.ts 2>&1 | grep "js-\|vue-" | grep "FAIL" | wc -l
   ```
   Expected: `0` (no js- or vue- parity failures)

If all checks pass, Phase C is complete. Proceed to Phase D (Backfill & Polish) per the spec.

---

## Notes on Pre-Existing Parity Failures

133 skills (angular, astro, drizzle, nestjs, next, nuxt, prisma, svelte, tanstack, trpc, zod) exist in claude-code/gemini-cli/cursor but NOT in codex. This was present before Phase C and is outside Phase C scope. The `platform-parity.test.ts` will continue to show 280 failures for those skills. A dedicated codex backfill task should be planned separately (suggested as part of Phase D or a standalone plan).

---

## Traceability: Observable Truths → Tasks

| Observable Truth                                        | Delivered By                              |
| ------------------------------------------------------- | ----------------------------------------- |
| 1. 27 js-_ + 11 vue-_ dirs in all 4 platforms           | Tasks 1–5 (create), Tasks 6–8 (replicate) |
| 2. js-\* skill.yaml fields correct                      | Tasks 1–4                                 |
| 3. vue-\* skill.yaml fields correct                     | Task 5                                    |
| 4. SKILL.md sections present + Instructions < 5K tokens | Tasks 1–5                                 |
| 5. schema.test.ts + structure.test.ts pass              | Verified in Tasks 1–5                     |
| 6. No js- or vue- parity failures                       | Tasks 6–8 + Task 10                       |
| 7. JS dispatch validation                               | Task 9                                    |
| 8. Vue dispatch validation                              | Task 9                                    |
| 9. harness validate passes                              | Task 10                                   |
