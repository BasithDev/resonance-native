/** Tiny pub/sub: emit after any library write so other screens can refresh. */
const subs = new Set<() => void>();

export const libraryEvents: { emit(): void; subscribe(cb: () => void): () => void } = {
  emit() {
    subs.forEach((cb) => cb());
  },
  subscribe(cb) {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
};
