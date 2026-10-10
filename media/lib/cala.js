// Cala: company context for Card 4. Entity search is fast; knowledge search (news) takes ~60-90s,
// so its answers are cached on disk and only fetched when asked for.

import { mkdir, readFile, writeFile } from 'node:fs/promises';

const API = 'https://api.cala.ai/v1';
const CACHE = 'out/.cache/cala';

const headers = () => ({ 'X-API-KEY': process.env.CALA_API_KEY, 'Content-Type': 'application/json' });

export async function companyContext(firm, { news = false } = {}) {
  if (!process.env.CALA_API_KEY) return null;
  const name = norm(firm);
  return cached(`${slug(name)}${news ? '-news' : ''}`, async () => {
    const res = await fetch(`${API}/entities?name=${encodeURIComponent(name)}`, { headers: headers() });
    if (!res.ok) throw new Error(`Cala entities ${res.status}`);
    // Fuzzy search happily returns a different company ("GIAS FOOD" → "GIAS", Luxembourg), so require a close name match.
    const entity = (await res.json()).entities?.find((e) => e.entity_type === 'Company' && sameCompany(name, norm(e.name))) ?? null;
    const ctx = { query: name, entity, news: null };
    if (news && entity) ctx.news = await search(`${entity.name} recent news and product recalls`);
    return ctx;
  });
}

async function search(input) {
  const res = await fetch(`${API}/knowledge/search`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ input }), signal: AbortSignal.timeout(150_000),
  });
  if (!res.ok) throw new Error(`Cala search ${res.status}`);
  return (await res.json()).content ?? null;
}

async function cached(key, fn) {
  const file = `${CACHE}/${key}.json`;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch {}
  const value = await fn();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2));
  return value;
}

const norm = (s) => s.toLowerCase().replace(/[.,]/g, ' ').replace(/\b(inc|llc|lp|ltd|corp|corporation|co|company|d\/?b\/?a)\b/g, ' ').replace(/\s+/g, ' ').trim();

function sameCompany(a, b) {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.split(' ').length >= 2 && long.startsWith(short);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
