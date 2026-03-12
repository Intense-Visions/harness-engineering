// VIOLATES pattern: services must export default class
// This exports a function, not a class
export function BadService() {
  return { getUser: () => null };
}
