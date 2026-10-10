// File-backed cache with stale-while-revalidate. data/cache/ doubles as the snapshot:
// after a restart the last result is served instantly while a fresh one is fetched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "cache");
const inflight = new Map();

const file = (key) => join(CACHE_DIR, `${key.replace(/[^a-z0-9._-]+/gi, "_")}.json`);

export function readCache(key) {
  const path = file(key);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function writeCache(key, value) {
  const path = file(key);
  mkdirSync(dirname(path), { recursive: true });
  const entry = { savedAt: new Date().toISOString(), value };
  writeFileSync(path, JSON.stringify(entry, null, 2));
  return entry;
}

// Run fn once per key at a time (concurrent callers share the same promise)
function refresh(key, fn) {
  if (!inflight.has(key)) {
    inflight.set(key, fn().then((v) => writeCache(key, v)).finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}

// Fresh → cached value. Stale → cached value now, refresh in background. Missing → wait for fn.
export async function cached(key, ttlMs, fn, { force = false } = {}) {
  const entry = readCache(key);
  if (entry && !force) {
    const stale = Date.now() - Date.parse(entry.savedAt) > ttlMs;
    if (stale) refresh(key, fn).catch((e) => console.error(`refresh ${key} failed:`, e.message));
    return { ...entry, stale };
  }
  return { ...(await refresh(key, fn)), stale: false };
}
