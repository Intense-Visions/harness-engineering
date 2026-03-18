declare module 'lokijs' {
  class Loki {
    constructor(filename: string, options?: Record<string, unknown>);
    addCollection<T extends object>(
      name: string,
      options?: {
        unique?: string[];
        indices?: string[];
        clone?: boolean;
        disableMeta?: boolean;
      }
    ): Collection<T>;
    getCollection<T extends object>(name: string): Collection<T> | null;
    serialize(): string;
    loadJSON(serializedDb: string): void;
  }

  interface Collection<T extends object> {
    insert(doc: T): T;
    update(doc: T): T;
    remove(doc: T): void;
    find(query?: Record<string, unknown>): (T & LokiObj)[];
    findOne(query: Record<string, unknown>): (T & LokiObj) | null;
    findAndRemove(query: Record<string, unknown>): void;
    by(field: string, value: string): (T & LokiObj) | null;
    count(): number;
    clear(): void;
  }

  interface LokiObj {
    $loki: number;
    meta: { created: number; revision: number; updated: number; version: number };
  }

  export default Loki;
  export { Collection, LokiObj };
}
