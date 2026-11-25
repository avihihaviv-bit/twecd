/** Fixed-size ring buffer of numbers: O(1) push, no per-frame allocation or shifting. */
export class Ring {
  private buf: Float64Array;
  private idx = 0;
  size = 0;
  constructor(readonly capacity: number) { this.buf = new Float64Array(capacity); }
  push(v: number) { this.buf[this.idx] = v; this.idx = (this.idx + 1) % this.capacity; if (this.size < this.capacity) this.size++; }
  clear() { this.idx = 0; this.size = 0; }
  /** Oldest -> newest. Allocates once per call (call at most once per tick, never per frame). */
  toArray(): number[] {
    const out = new Array<number>(this.size);
    const start = (this.idx - this.size + this.capacity) % this.capacity;
    for (let i = 0; i < this.size; i++) out[i] = this.buf[(start + i) % this.capacity];
    return out;
  }
  /** Last n values, oldest -> newest. */
  tail(n: number): number[] {
    const k = Math.min(n, this.size);
    const out = new Array<number>(k);
    for (let i = 0; i < k; i++) out[i] = this.buf[(this.idx - k + i + this.capacity) % this.capacity];
    return out;
  }
  mean(): number | null {
    if (!this.size) return null;
    let s = 0; for (let i = 0; i < this.size; i++) s += this.buf[i];
    return s / this.size;
  }
}
