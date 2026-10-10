// Copy generated cards into the Lovable app's public folder so its recall pages can show them.
//
//   node export-pack.js <lovable-app-dir> [eventId ...]     (default: every event in out/)
//
// Writes <app>/public/recall-radar/<eventId>/card*.png and <app>/public/recall-radar/index.json,
// keyed by FDA recall number (the app's recall id is "fda:<recall_number>").

import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const [appDir, ...ids] = process.argv.slice(2);
if (!appDir) throw new Error('usage: node export-pack.js <lovable-app-dir> [eventId ...]');

const events = ids.length ? ids : (await readdir('out')).filter((d) => existsSync(`out/${d}/recall.json`));
const index = {};

for (const eventId of events) {
  const { recall, copy, cards } = JSON.parse(await readFile(`out/${eventId}/recall.json`, 'utf8'));
  const dest = `${appDir}/public/recall-radar/${eventId}`;
  await mkdir(dest, { recursive: true });
  const files = [];
  for (const card of cards) {
    const name = card.split('/').pop();
    await copyFile(card, `${dest}/${name}`);
    files.push(`${eventId}/${name}`);
  }
  // One recall event covers several recall numbers (one per product), so map them all.
  const res = await fetch(`https://api.fda.gov/food/enforcement.json?search=event_id:${eventId}&limit=100`);
  const numbers = res.ok ? (await res.json()).results.map((r) => r.recall_number).filter(Boolean) : [recall.recallNumber];
  const entry = {
    eventId, product: recall.productName, firm: copy.statement.firm, hazard: recall.hazard.label,
    classification: recall.classification, cards: files,
  };
  for (const n of new Set(numbers)) index[n] = entry;
  console.log(`✔ ${eventId} → ${numbers.length} recall number(s)`);
}

await writeFile(`${appDir}/public/recall-radar/index.json`, JSON.stringify(index, null, 2));
console.log(`✔ ${appDir}/public/recall-radar/index.json (${Object.keys(index).length} recall numbers)`);
