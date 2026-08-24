// Defining module whose symbols are surfaced through the package barrel (index.ts).

// Re-exported by the barrel, but nothing across the workspace calls it.
// -> PUBLIC_API_UNUSED (advisory: wire or deprecate, not delete).
export function deadPublic(): number {
  return 1;
}

// Re-exported by the barrel AND imported (through the barrel) by a real,
// reachable consumer -> live via re-export following.
export function usedPublic(): number {
  return 2;
}

/** @public Intentional adopter-facing API with no internal caller. */
export function annotatedPublic(): number {
  return 3;
}

// NOT re-exported by the barrel and never imported -> deletable NO_IMPORTERS.
export function internalDead(): number {
  return 4;
}

// Re-exported by the barrel but imported only by its spec -> live (#1409).
export function testOnlyPublic(): number {
  return 5;
}
