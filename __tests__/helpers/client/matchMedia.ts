// jsdom has no matchMedia. This installs one whose answer the test controls,
// and lets the test fire the change event a real browser would send.
type Listener = (event: MediaQueryListEvent) => void;

export type MediaControl = {
  queries: string[];
  set: (query: string, matches: boolean) => void;
};

export function installMatchMedia(initial: Record<string, boolean> = {}): MediaControl {
  const state = new Map<string, boolean>(Object.entries(initial));
  const listeners = new Map<string, Set<Listener>>();
  const queries: string[] = [];

  const matchMedia = (query: string) => {
    queries.push(query);
    const forQuery = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, forQuery);
    return {
      media: query,
      get matches() { return state.get(query) ?? false; },
      onchange: null,
      addEventListener: (_type: string, fn: Listener) => { forQuery.add(fn); },
      removeEventListener: (_type: string, fn: Listener) => { forQuery.delete(fn); },
      addListener: (fn: Listener) => { forQuery.add(fn); },
      removeListener: (fn: Listener) => { forQuery.delete(fn); },
      dispatchEvent: () => true,
    };
  };

  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });

  return {
    queries,
    set(query, matches) {
      state.set(query, matches);
      const event = { matches, media: query } as MediaQueryListEvent;
      listeners.get(query)?.forEach(fn => fn(event));
    },
  };
}
