// Recall Radar: FDA recall → Cala context → Krea visuals → 4 social cards (PNG).
//
//   npm run cards:list                   recent recall events
//   npm run cards                        newest recall
//   npm run cards -- --event 99853       a specific recall event
//   flags: --name "Short Product Name"  --no-images  --no-cala  --news (Cala news search, slow ~80s, cached)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fetchEvent, fetchRecentEvents } from './lib/fda.js';
import { companyContext } from './lib/cala.js';
import { generateImage } from './lib/krea.js';
import { cardPrompts } from './lib/prompts.js';
import { CARD_KEYS, cardCopy, cardHtml } from './lib/cards.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);

// Which generated image goes under which card.
const CARD_IMAGE = { alert: 'alert', kitchen: 'product', steps: 'steps', statement: 'statement' };

if (flag('--list')) {
  for (const r of (await fetchRecentEvents()).slice(0, 25)) {
    console.log(`${r.eventId}  ${r.classification.padEnd(9)}  ${r.hazard.label.padEnd(32)}  ${r.productName}  —  ${r.firm}`);
  }
  process.exit(0);
}

const eventId = opt('--event');
const recall = eventId ? await fetchEvent(eventId) : (await fetchRecentEvents())[0];
if (opt('--name')) recall.productName = opt('--name');
const dir = `out/${recall.eventId}`;
await mkdir(`${dir}/assets`, { recursive: true });
console.log(`▶ ${recall.eventId} · ${recall.productName} · ${recall.hazard.label} · ${recall.firm}`);

const [context, images] = await Promise.all([
  flag('--no-cala') ? null : companyContext(recall.firm, { news: flag('--news') }).catch((e) => warn('Cala', e)),
  flag('--no-images') ? {} : cardImages(recall),
]);
if (context) console.log(`  Cala: ${context.entity ? context.entity.name : 'no company match'}`);

const copy = cardCopy(recall, context);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
for (const [i, key] of CARD_KEYS.entries()) {
  const img = images[CARD_IMAGE[key]];
  const dataUri = img ? `data:${img.mime};base64,${(await readFile(img.file)).toString('base64')}` : null;
  await page.setContent(cardHtml(key, copy, recall, dataUri), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/card${i + 1}-${key}.png` });
}
await browser.close();

const result = {
  recall,
  cala: context,
  images: Object.fromEntries(Object.entries(images).map(([k, v]) => [k, { provider: v.provider, prompt: v.prompt, url: v.url, file: v.file }])),
  copy,
  cards: CARD_KEYS.map((key, i) => `${dir}/card${i + 1}-${key}.png`),
};
await writeFile(`${dir}/recall.json`, JSON.stringify(result, null, 2));
await writeFile(`${dir}/index.html`, preview(recall, CARD_KEYS.map((k, i) => `card${i + 1}-${k}.png`)));
console.log(`✔ ${dir}/  (4 cards, recall.json, index.html)`);

async function cardImages(recall) {
  const prompts = cardPrompts(recall);
  const entries = await Promise.all(Object.entries(prompts).map(async ([name, prompt]) => {
    try {
      const img = await generateImage(prompt, `${dir}/assets/${name}.png`);
      console.log(`  Krea: ${name} ✓`);
      return [name, { ...img, provider: 'krea', prompt }];
    } catch (e) {
      warn(`Krea ${name}`, e);
      return null;
    }
  }));
  return Object.fromEntries(entries.filter(Boolean));
}

function warn(what, e) {
  console.warn(`  ⚠ ${what}: ${e.message} — continuing without it`);
  return null;
}

function preview(r, files) {
  return `<!doctype html><meta charset="utf-8"><title>Recall Radar · ${r.eventId}</title>
<style>body{margin:0;background:#0a0a0a;color:#fff;font:16px Inter,system-ui,sans-serif;padding:32px}
h1{font-size:22px;margin:0 0 4px}p{color:#999;margin:0 0 24px}.g{display:grid;grid-template-columns:repeat(2,minmax(0,540px));gap:16px}
img{width:100%;display:block}</style>
<h1>${r.productName}</h1><p>${r.hazard.label} · ${r.firm} · ${r.classification}</p>
<div class="g">${files.map((f) => `<a href="${f}" download><img src="${f}"></a>`).join('')}</div>`;
}
