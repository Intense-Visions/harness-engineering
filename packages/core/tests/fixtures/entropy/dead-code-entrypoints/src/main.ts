// A framework module root (e.g. Vue/Angular/NestJS). Reachable at build/runtime,
// not through a static import, so it is unreachable in the import graph but must
// NOT be classified as a deletable dead file.
export function bootstrap(): void {
  // side-effecting entry point
}
