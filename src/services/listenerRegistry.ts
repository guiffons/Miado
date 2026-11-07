export type UnsubscribeFn = () => void;

export class ListenerRegistry {
  private scopes = new Map<string, Set<UnsubscribeFn>>();

  register(scope: string, unsubscribe: UnsubscribeFn): UnsubscribeFn {
    let set = this.scopes.get(scope);
    if (!set) {
      set = new Set();
      this.scopes.set(scope, set);
    }
    set.add(unsubscribe);
    return () => {
      try {
        unsubscribe();
      } finally {
        set?.delete(unsubscribe);
        if (set && set.size === 0) {
          this.scopes.delete(scope);
        }
      }
    };
  }

  disposeScope(scope: string): void {
    const set = this.scopes.get(scope);
    if (!set) return;
    for (const unsub of set) {
      try {
        unsub();
      } catch (err) {
        console.warn("[ListenerRegistry] Error disposing listener in scope", scope, err);
      }
    }
    this.scopes.delete(scope);
  }

  disposeAll(): void {
    for (const scope of Array.from(this.scopes.keys())) {
      this.disposeScope(scope);
    }
  }

  size(): number {
    let total = 0;
    for (const set of this.scopes.values()) {
      total += set.size;
    }
    return total;
  }
}

export const listenerRegistry = new ListenerRegistry();
