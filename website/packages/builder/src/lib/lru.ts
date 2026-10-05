/**
 * Small LRU map with a dispose callback and pinned keys (builder.md 5.5: 4 textures, dispose on eviction).
 * A pinned entry (a texture the panel material still samples) is never evicted, even when over capacity.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly pinned = new Set<K>();

  constructor(
    readonly capacity: number,
    private readonly dispose?: (value: V, key: K) => void,
  ) {}

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  keys(): K[] {
    return [...this.map.keys()];
  }

  /** Returns the value and marks it most recently used. */
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): void {
    const old = this.map.get(key);
    if (old !== undefined && old !== value) this.dispose?.(old, key);
    this.map.delete(key);
    this.map.set(key, value);
    this.evict(key);
  }

  /** Replace the set of pinned keys and evict whatever became evictable. */
  setPinned(keys: Iterable<K>): void {
    this.pinned.clear();
    for (const k of keys) this.pinned.add(k);
    this.evict();
  }

  delete(key: K): void {
    const v = this.map.get(key);
    if (v === undefined) return;
    this.map.delete(key);
    this.dispose?.(v, key);
  }

  clear(): void {
    for (const [k, v] of this.map) this.dispose?.(v, k);
    this.map.clear();
    this.pinned.clear();
  }

  /** Evict oldest unpinned entries until within capacity; the entry just written is never evicted. */
  private evict(protect?: K): void {
    if (this.map.size <= this.capacity) return;
    for (const key of [...this.map.keys()]) {
      if (this.map.size <= this.capacity) break;
      if (this.pinned.has(key) || key === protect) continue;
      const v = this.map.get(key) as V;
      this.map.delete(key);
      this.dispose?.(v, key);
    }
  }
}
