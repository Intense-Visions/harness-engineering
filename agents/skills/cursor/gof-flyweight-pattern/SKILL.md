# GOF Flyweight Pattern

> Share fine-grained objects to reduce memory usage by separating intrinsic and extrinsic state.

## When to Use

- You need a very large number of similar objects that consume too much memory
- Object state can be split into intrinsic (shared, immutable) and extrinsic (unique per instance, passed from outside)
- You're rendering large numbers of UI elements, particles, map tiles, or text characters
- Profiling shows object creation and GC pressure as a bottleneck

## Instructions

**Identify intrinsic vs. extrinsic state first — this is the critical design step:**

- **Intrinsic state:** Shared, immutable, independent of context (e.g., character glyph shape, sprite texture, font data)
- **Extrinsic state:** Context-dependent, passed by caller (e.g., position, color tint, size)

**Particle system example:**

```typescript
// Flyweight — intrinsic state only (shared, immutable)
class ParticleType {
  constructor(
    public readonly texture: string, // shared texture reference
    public readonly color: string, // base color
    public readonly shape: 'circle' | 'square'
  ) {}

  // Render uses extrinsic state passed from outside
  render(x: number, y: number, opacity: number, scale: number): void {
    console.log(`Draw ${this.texture} at (${x},${y}) opacity=${opacity} scale=${scale}`);
  }
}

// Flyweight factory — ensures sharing
class ParticleTypeFactory {
  private pool = new Map<string, ParticleType>();

  get(texture: string, color: string, shape: 'circle' | 'square'): ParticleType {
    const key = `${texture}:${color}:${shape}`;
    if (!this.pool.has(key)) {
      this.pool.set(key, new ParticleType(texture, color, shape));
      console.log(`Created new ParticleType for key: ${key}`);
    }
    return this.pool.get(key)!;
  }

  poolSize(): number {
    return this.pool.size;
  }
}

// Context — stores extrinsic state + reference to flyweight
interface ParticleContext {
  x: number;
  y: number;
  opacity: number;
  scale: number;
  type: ParticleType; // reference, not copy
}

// Client manages contexts, not individual particle objects
class ParticleSystem {
  private factory = new ParticleTypeFactory();
  private particles: ParticleContext[] = [];

  emit(
    x: number,
    y: number,
    texture: string,
    color: string,
    shape: 'circle' | 'square',
    opacity = 1,
    scale = 1
  ): void {
    const type = this.factory.get(texture, color, shape); // reuse flyweight
    this.particles.push({ x, y, opacity, scale, type });
  }

  render(): void {
    for (const p of this.particles) {
      p.type.render(p.x, p.y, p.opacity, p.scale);
    }
  }

  stats(): void {
    console.log(`Particles: ${this.particles.length}, Types: ${this.factory.poolSize()}`);
  }
}

// 10,000 particles but only 3 ParticleType objects in memory
const system = new ParticleSystem();
for (let i = 0; i < 10_000; i++) {
  system.emit(Math.random() * 800, Math.random() * 600, 'spark.png', 'yellow', 'circle');
}
system.stats(); // Particles: 10000, Types: 1
```

**String interning (built-in flyweight in JS):**

```typescript
// JavaScript already interns small strings — the runtime handles this
// For structured data, use a registry:
class TagRegistry {
  private tags = new Map<string, Readonly<{ name: string; color: string }>>();

  get(name: string, color: string): Readonly<{ name: string; color: string }> {
    const key = `${name}:${color}`;
    if (!this.tags.has(key)) {
      this.tags.set(key, Object.freeze({ name, color }));
    }
    return this.tags.get(key)!;
  }
}
```

## Details

**When NOT to use:** If you don't have a memory problem, don't introduce this complexity. Measure first. The pattern adds code complexity (factory, split state) that hurts readability without a concrete memory/performance benefit.

**Anti-patterns:**

- Storing mutable extrinsic state inside the flyweight — breaks sharing semantics
- Flyweight factory that returns a clone instead of the shared instance — defeats the purpose
- Premature optimization — apply only when profiling shows object proliferation as a bottleneck

**Node.js relevance:** JavaScript's GC handles many small objects well, but the pattern is still valuable in:

- Game loops with thousands of entities per frame
- Large in-memory datasets (e.g., 100k rows with repeated category metadata)
- WebSocket servers with thousands of connections sharing config objects

**Memory savings calculation:**

```typescript
// Without flyweight: 10,000 particles × 500 bytes (texture data) = ~5MB
// With flyweight: 10,000 contexts × 40 bytes + 1 flyweight × 500 bytes = ~400KB
// Savings: ~12× memory reduction
```

## Source

refactoring.guru/design-patterns/flyweight
