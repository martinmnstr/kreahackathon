// openFDA food enforcement → one normalized object per recall event.
// One recall event is split into many rows (one per product / state), so we group by event_id.

const FDA = 'https://api.fda.gov/food/enforcement.json';

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

const ALLERGENS = ['peanut', 'tree nut', 'walnut', 'almond', 'cashew', 'hazelnut', 'pecan', 'pistachio',
  'egg', 'milk', 'wheat', 'soy', 'sesame', 'shellfish', 'fish', 'mustard', 'sulfite'];

// Order matters: first match wins.
const HAZARDS = [
  { key: 'listeria', re: /listeria/i, label: 'Listeria contamination' },
  { key: 'ecoli', re: /e\.?\s?coli|stec/i, label: 'E. coli contamination' },
  { key: 'salmonella', re: /salmonella/i, label: 'Salmonella contamination' },
  { key: 'glass', re: /glass/i, label: 'May contain glass pieces' },
  { key: 'metal', re: /metal/i, label: 'May contain metal fragments' },
  { key: 'foreign', re: /foreign|stones|hard object/i, label: 'May contain foreign material' },
  { key: 'dye', re: /dye|fd&c|yellow\s?#|red no/i, label: 'Undeclared color additive' },
  { key: 'allergen', re: /undeclared|allerg|not declared|not declare|does not declare/i, label: null },
];

export async function fetchRecentEvents(limit = 100) {
  const res = await fetch(`${FDA}?limit=${limit}&sort=report_date:desc`);
  if (!res.ok) throw new Error(`openFDA ${res.status}`);
  const { results } = await res.json();
  const groups = new Map();
  for (const r of results) {
    if (!groups.has(r.event_id)) groups.set(r.event_id, []);
    groups.get(r.event_id).push(r);
  }
  return [...groups.values()].map(normalize);
}

export async function fetchEvent(eventId) {
  const res = await fetch(`${FDA}?search=event_id:${encodeURIComponent(eventId)}&limit=100`);
  if (!res.ok) throw new Error(`openFDA: event ${eventId} not found (${res.status})`);
  const { results } = await res.json();
  return normalize(results);
}

function normalize(rows) {
  const r = rows[0];
  const quantities = [...new Set(rows.map((x) => x.product_quantity.trim()))];
  const lots = r.code_info.trim();
  return {
    eventId: r.event_id,
    recallNumber: r.recall_number,
    firm: r.recalling_firm.trim(),
    city: titleCase(r.city),
    state: r.state,
    classification: r.classification,
    risk: { 'Class I': 'Critical', 'Class II': 'High', 'Class III': 'Moderate' }[r.classification] ?? 'Pending',
    status: r.status,
    voluntary: /voluntary/i.test(r.voluntary_mandated),
    reason: r.reason_for_recall.trim(),
    hazard: hazardOf(r.reason_for_recall),
    productName: productName(r.product_description),
    productDescription: r.product_description.trim(),
    productCount: rows.length,
    quantity: quantities.length === 1 ? quantities[0] : `${rows.length} products`,
    distribution: distributionOf(r.distribution_pattern),
    lots: /^no codes?/i.test(lots) || !lots ? null : lots,
    reportDate: fmtDate(r.report_date),
    initiationDate: fmtDate(r.recall_initiation_date),
  };
}

function hazardOf(reason) {
  const h = HAZARDS.find((x) => x.re.test(reason));
  const mentioned = ALLERGENS.find((a) => new RegExp(`\\b${a}`, 'i').test(reason));
  if (!h && mentioned) return { key: 'allergen', allergen: mentioned, label: `Undeclared ${mentioned} allergen` };
  if (!h) return { key: 'other', label: truncate(reason.replace(/\.$/, ''), 48) };
  if (h.key !== 'allergen') return { key: h.key, label: h.label };
  const allergen = ALLERGENS.find((a) => new RegExp(`\\b${a}`, 'i').test(reason));
  return { key: 'allergen', allergen: allergen ?? null, label: allergen ? `Undeclared ${allergen} allergen` : 'Undeclared allergen' };
}

// The FDA field is raw label text ("Lemon Alfredo Fettuccine packed in a yellow bag; UPC ...").
// Cut at the first packaging/weight/code marker to get something a consumer recognizes.
function productName(desc) {
  const cut = desc.split(/;|\. |,|\(| - |\s(?:packed|packaged|packaging|shelf life|net\.? w|upc|item|ingredients|product of|keep)\b/i)[0];
  let name = cut.replace(/^item\s*#\S+\s*/i, '').trim();
  if (name === name.toUpperCase()) name = titleCase(name);
  return truncate(name, 52);
}

function distributionOf(text) {
  if (/nationwide|throughout the (united states|u\.?s)|all (50 )?states/i.test(text)) {
    return { nationwide: true, states: [], label: 'Nationwide' };
  }
  const codes = new Set((text.match(/\b[A-Z]{2}\b/g) ?? []).filter((c) => STATES[c]));
  for (const [code, name] of Object.entries(STATES)) if (new RegExp(`\\b${name}\\b`, 'i').test(text)) codes.add(code);
  const states = [...codes];
  const label = states.length === 0 ? truncate(text, 40) : states.length === 1 ? STATES[states[0]] : `${states.length} states`;
  return { nationwide: false, states, label };
}

const fmtDate = (d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const truncate = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n) > 0 ? s.lastIndexOf(' ', n) : n) + '…');
