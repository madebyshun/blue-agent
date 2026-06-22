// Lightweight pub/sub — no external deps, works in both client and server contexts.
type Listener = (data: unknown) => void;

class StateEventEmitter {
  private listeners = new Map<string, Set<Listener>>();

  emit(event: string, data: unknown) {
    this.listeners.get(event)?.forEach(fn => fn(data));
  }

  on(event: string, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }
}

export const stateEvents = new StateEventEmitter();
