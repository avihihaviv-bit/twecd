import fs from 'node:fs';
import path from 'node:path';

/** Tiny JSON store in the app's userData folder with atomic writes. */
export class JsonStore<T> {
  private file: string;
  constructor(dir: string, name: string, private fallback: T) { this.file = path.join(dir, name); }
  read(): T {
    try { return { ...(this.fallback as object), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) } as T; }
    catch { return structuredClone(this.fallback); }
  }
  readRaw(): T | null { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) as T; } catch { return null; } }
  write(v: T) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
    fs.renameSync(tmp, this.file);
  }
  exists() { return fs.existsSync(this.file); }
  remove() { try { fs.unlinkSync(this.file); } catch { /* absent */ } }
}
