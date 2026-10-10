// Card copy + 1080x1080 HTML templates. Krea images sit underneath; all text is real HTML text.

export const CARD_KEYS = ['alert', 'kitchen', 'steps', 'statement'];

const REASON_PHRASE = {
  listeria: 'potential Listeria contamination',
  salmonella: 'potential Salmonella contamination',
  ecoli: 'potential E. coli contamination',
  glass: 'the possible presence of glass pieces',
  metal: 'the possible presence of metal fragments',
  foreign: 'the possible presence of foreign material',
  dye: 'an undeclared color additive',
};

export function cardCopy(recall, context) {
  const firm = displayFirm(recall.firm);
  const { hazard } = recall;
  const reasonPhrase = REASON_PHRASE[hazard.key]
    ?? (hazard.key === 'allergen' ? (hazard.allergen ? `an undeclared ${hazard.allergen} allergen` : 'an undeclared allergen') : lowerFirst(recall.reason.replace(/\.$/, '')));
  const firstStep = hazard.key === 'allergen' && hazard.allergen
    ? `Allergic to ${hazard.allergen}? Do not eat this product.`
    : 'Stop using or eating this product now.';

  return {
    alert: {
      title: 'RECALL ALERT',
      product: recall.productName,
      hazard: hazard.label,
      stats: [recall.distribution.nationwide ? 'Nationwide' : recall.distribution.label, recall.quantity, `FDA ${recall.classification}`],
    },
    kitchen: {
      title: 'CHECK YOUR KITCHEN',
      brand: firm,
      product: recall.productName,
      lots: recall.lots ? truncate(recall.lots, 150) : 'All codes / lots of this product',
      cta: 'Look for this in your fridge or pantry.',
    },
    steps: {
      title: 'WHAT TO DO',
      steps: [firstStep, 'Check the lot code printed on the package.', 'Return it to the store for a full refund.', `Questions? Contact ${firm.replace(/\.$/, '')}.`],
      note: ['listeria', 'salmonella', 'ecoli'].includes(hazard.key) ? 'Feeling unwell after eating it? Call your doctor.' : null,
    },
    statement: {
      title: 'OFFICIAL STATEMENT',
      firm,
      body: `${firm} is ${recall.voluntary ? 'voluntarily ' : ''}recalling ${recall.productName} due to ${reasonPhrase}. Consumer safety is our top priority. If you purchased this product, please stop using it and return it to the place of purchase for a full refund. We sincerely apologize for any concern this may cause.`,
      signature: `${firm} · ${recall.city}, ${recall.state}`,
      about: context?.entity?.description ?? null,
      draft: 'AI-drafted · review before posting',
    },
  };
}

export function cardHtml(key, copy, recall, image) {
  const c = copy[key];
  const bg = image ? `<img class="bg" src="${image}">` : '';
  const footer = `<div class="src">Source: U.S. FDA Enforcement Report · ${esc(recall.recallNumber ?? recall.eventId)} · ${esc(recall.reportDate)}</div>`;
  const body = {
    alert: () => `
      <div class="card alert">${bg}
        <div class="top"><div class="flag">⚠ ${c.title}</div><div class="cls">${esc(recall.classification)} · ${esc(recall.risk)}</div></div>
        <div class="panel">
          <div class="hazard">${esc(c.hazard)}</div>
          <div class="product" style="font-size:${fit(c.product, [[18, 104], [30, 84], [42, 70]], 58)}px">${esc(c.product)}</div>
          <div class="stats">${c.stats.map((s) => `<span>${esc(truncate(s, 26))}</span>`).join('')}</div>
          ${footer}
        </div>
      </div>`,
    kitchen: () => `
      <div class="card kitchen">
        <div class="head">${c.title}</div>
        <div class="grid">
          <div class="info">
            <div class="label">Brand</div><div class="brand">${esc(c.brand)}</div>
            <div class="label">Product</div><div class="product" style="font-size:${fit(c.product, [[22, 54], [36, 46]], 38)}px">${esc(c.product)}</div>
          </div>
          <div class="shot">${image ? `<img src="${image}">` : '<div class="noimg">product image</div>'}</div>
        </div>
        <div class="label">Look for these codes</div>
        <div class="lots" style="font-size:${fit(c.lots, [[40, 40], [90, 30]], 24)}px">${esc(c.lots)}</div>
        <div class="cta">${esc(c.cta)}</div>
        ${footer}
      </div>`,
    steps: () => `
      <div class="card steps">${bg}
        <div class="inner">
          <div class="head">${c.title}</div>
          <ol>${c.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>
          ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
          ${footer}
        </div>
      </div>`,
    statement: () => `
      <div class="card statement">${bg}
        <div class="inner">
          <div class="kicker">${c.title}</div>
          <div class="firm">${esc(c.firm)}</div>
          <div class="quote">“</div>
          <p class="body">${esc(c.body)}</p>
          <div class="sig">${esc(c.signature)}</div>
          <div class="row"><span class="draft">${esc(c.draft)}</span></div>
          ${footer}
        </div>
      </div>`,
  }[key]();

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${body}</body></html>`;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1080px;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1080px;height:1080px;overflow:hidden}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.src{font-size:20px;letter-spacing:.02em;opacity:.6;margin-top:28px}

.alert{background:#0a0a0a;color:#fff}
.alert .bg{opacity:.85}
.alert .top{position:absolute;top:56px;left:56px;right:56px;display:flex;justify-content:space-between;align-items:center}
.alert .flag{background:#e10600;padding:18px 28px;font-size:44px;font-weight:900;letter-spacing:.04em}
.alert .cls{border:3px solid #fff;padding:12px 20px;font-size:26px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:rgba(0,0,0,.5)}
.alert .panel{position:absolute;left:0;right:0;bottom:0;padding:56px;background:rgba(10,10,10,.88);border-top:8px solid #e10600}
.alert .hazard{color:#ff3b30;font-size:34px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:14px}
.alert .product{font-weight:900;line-height:1.02;letter-spacing:-.02em}
.alert .stats{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.alert .stats span{background:#fff;color:#0a0a0a;padding:10px 18px;font-size:28px;font-weight:800}

.kitchen{background:#fff;color:#0a0a0a;padding:56px}
.kitchen .head{display:inline-block;background:#0a0a0a;color:#fff;padding:14px 24px;font-size:46px;font-weight:900;letter-spacing:.03em;margin-bottom:36px}
.kitchen .grid{display:flex;gap:36px;align-items:flex-start}
.kitchen .info{flex:1;min-width:0}
.kitchen .label{font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#e10600;margin:18px 0 8px}
.kitchen .brand{font-size:34px;font-weight:700}
.kitchen .product{font-weight:900;line-height:1.05;letter-spacing:-.01em}
.kitchen .shot{width:420px;height:420px;flex:none;border:3px solid #0a0a0a;overflow:hidden;background:#f3f3f3}
.kitchen .shot img{width:100%;height:100%;object-fit:cover}
.kitchen .noimg{height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;color:#999;text-transform:uppercase;letter-spacing:.1em}
.kitchen .lots{font-family:'JetBrains Mono',monospace;font-weight:700;background:#ffe500;padding:16px 20px;line-height:1.3;word-break:break-word}
.kitchen .cta{font-size:36px;font-weight:800;margin-top:28px}
.kitchen .src{position:absolute;left:56px;bottom:40px;margin:0}

.steps{background:#0b2a4a;color:#fff}
.steps .bg{opacity:.22}
.steps .inner{position:relative;padding:64px;height:100%;display:flex;flex-direction:column}
.steps .src{margin-top:auto}
.steps .head{font-size:84px;font-weight:900;letter-spacing:-.01em;margin-bottom:40px}
.steps ol{list-style:none;display:flex;flex-direction:column;gap:28px}
.steps li{display:flex;align-items:center;gap:28px;font-size:42px;font-weight:700;line-height:1.15;background:rgba(11,42,74,.78);padding:18px 24px 18px 18px}
.steps .n{flex:none;width:84px;height:84px;background:#fff;color:#0b2a4a;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:900}
.steps .note{margin-top:36px;font-size:30px;font-weight:600;color:#9cc7ff}

.statement{background:#0a0f1e;color:#fff}
.statement .bg{opacity:.55}
.statement .inner{position:relative;padding:72px;height:100%;display:flex;flex-direction:column}
.statement .kicker{font-size:24px;font-weight:700;letter-spacing:.2em;color:#9aa4bf}
.statement .firm{font-size:56px;font-weight:900;margin-top:10px;line-height:1.05}
.statement .quote{font-size:150px;line-height:.8;height:70px;margin-top:36px;color:#e10600;font-weight:900}
.statement .body{font-size:33px;line-height:1.42;font-weight:500}
.statement .sig{font-size:26px;font-weight:700;margin-top:30px}
.statement .about{font-size:21px;color:#9aa4bf;margin-top:12px;line-height:1.4}
.statement .row{margin-top:auto}
.statement .draft{display:inline-block;border:2px solid #ffb020;color:#ffb020;padding:8px 14px;font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:.1em}
`;

const fit = (s, steps, min) => (steps.find(([len]) => s.length <= len)?.[1] ?? min);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
const displayFirm = (f) => (f === f.toUpperCase() ? f.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : f);
