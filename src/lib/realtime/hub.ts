// In-process fan-out. The LISTEN client (db/listen.ts) calls broadcast(); each
// open SSE connection registers a subscriber. Single instance → a Set is enough.
type Sub = (data: string) => void;

const subs = new Set<Sub>();

export const hub = {
  subscribe(cb: Sub): () => void {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
  broadcast(data: string): void {
    for (const cb of subs) {
      try {
        cb(data);
      } catch {
        // drop a dead subscriber silently; its stream will be cleaned up on abort
      }
    }
  },
  size(): number {
    return subs.size;
  },
};
