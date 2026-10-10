// Video formats: each turns recall data into a narrated scene list.
// A scene = one line of narration + what's on screen while it plays (layout, Krea image / AI presenter, overlay).
// Only facts from the FDA record are spoken or shown; the people and illustrations are AI-generated and labeled.

import { cardPrompts } from './prompts.js';
import { displayFirm, reasonPhrase } from './cards.js';
import { VOICES } from './krea.js';

const PHOTO = 'photorealistic, vertical 9:16 frame, no text, no logos, no watermark';
const NUMBERS = ['one', 'two', 'three', 'four'];

export const FORMATS = {
  news: {
    name: 'Newsroom',
    tagline: 'AI anchor + broadcast graphic panel, phrase captions with red highlights',
    inspired: 'Evening-news recall segment',
    multi: false,
    voice: VOICES.sarah,
    captions: 'phrase',
    build([r]) {
      const s = speak(r);
      return {
        people: { anchor: `professional female TV news anchor in her 40s wearing a blue blazer, seated at a modern news desk, generic newsroom with blue LED screens behind her, broadcast studio lighting, medium shot, ${PHOTO}` },
        images: { product: { prompt: cardPrompts(r).product }, hazard: { prompt: cardPrompts(r).alert } },
        highlight: [...words(s.hazardWord), ...words(s.where), ...words(s.brand), 'Class', 'One', 'Two', 'Three'],
        action: ['kitchen', 'lot', 'codes', 'refund', 'return', 'throw', 'out', 'store'],
        scenes: [
          { say: 'An important recall to tell you about.', layout: 'person', person: 'anchor', overlay: { kind: 'sticker', text: `${shortName(s.product)} recall` } },
          { say: `${s.firm} is recalling ${s.product}, because of ${s.reason}.`, layout: 'panel', image: 'product', overlay: { kind: 'panel', bullets: 1 } },
          { say: `It was sold ${s.where}, and the FDA rates it ${s.severity}.`, layout: 'panel', image: 'product', overlay: { kind: 'panel', bullets: 3 } },
          { say: r.lots ? 'Check your kitchen for the lot codes on screen.' : 'Every lot is included, so check your kitchen.', layout: 'panel', image: 'hazard', overlay: { kind: 'panel', bullets: 3, lots: true } },
          { say: "If you have it, don't eat it. Throw it out, or return it to the store for a full refund.", layout: 'person', person: 'anchor' },
        ],
        recalls: [r],
      };
    },
  },

  countdown: {
    name: 'Countdown',
    tagline: 'Creator on the bottom, product shots on top, "Number one…" list of recalls',
    inspired: 'Green-screen creator recall roundup',
    multi: true,
    voice: VOICES.charlie,
    captions: 'pill',
    build(recalls) {
      const rs = recalls.slice(0, 4);
      const n = rs.length;
      const scenes = [
        { say: n === 1 ? 'A food recall you need to know about right now.' : `${cap(NUMBERS[n - 1])} food recalls you need to know about right now.`, layout: 'split', image: 'p0', overlay: { kind: 'title', text: `‼️ ${n} FOOD RECALL${n > 1 ? 'S' : ''} YOU NEED TO KNOW ⚠️` } },
        { say: 'If any of these are in your kitchen, listen up.', layout: 'split', image: 'h0' },
      ];
      rs.forEach((r, i) => {
        const s = speak(r);
        const tag = { kind: 'brand', text: s.brand, recall: i };
        scenes.push(
          { say: `Number ${NUMBERS[i]}: ${s.product}, from ${s.brand}.`, layout: 'split', image: `p${i}`, overlay: tag, recall: i },
          { say: `The problem is ${s.reason}. It was sold ${s.where}.`, layout: 'split', image: `h${i}`, overlay: tag, recall: i },
          { say: r.lots ? 'Check the package for the codes on screen.' : 'Every lot is included.', layout: 'split', image: `p${i}`, overlay: { ...tag, lots: true }, recall: i },
        );
      });
      scenes.push({ say: "Follow, and I'll keep you posted on new recalls.", layout: 'split', image: `p${n - 1}` });
      return {
        people: { host: `man in his 30s with a short beard, black-framed glasses and a plain black t-shirt filming a selfie video in his home kitchen, natural daylight, medium close-up with his face in the upper part of the frame, ${PHOTO}` },
        images: Object.fromEntries(rs.flatMap((r, i) => [[`p${i}`, { prompt: cardPrompts(r).product }], [`h${i}`, { prompt: cardPrompts(r).alert }]])),
        scenes: scenes.map((sc) => ({ ...sc, person: 'host' })),
        recalls: rs,
      };
    },
  },

  receipts: {
    name: 'Receipts',
    tagline: 'Talking-head commentary with the FDA record popping up as proof',
    inspired: 'Podcaster commentary with source screenshots',
    multi: true,
    voice: VOICES.roger,
    captions: 'small',
    build(recalls) {
      // Save the most serious recall for last, like a punchline.
      const rank = { 'Class I': 0, 'Class II': 1, 'Class III': 2 };
      const rs = recalls.slice(0, 4).sort((a, b) => (rank[b.classification] ?? 3) - (rank[a.classification] ?? 3));
      const scenes = [{ say: rs.length > 1 ? 'The list of food recalls this week is getting out of hand.' : 'Here is a food recall you should know about.' }];
      rs.forEach((r, i) => {
        const s = speak(r);
        const card = { kind: 'source', recall: i };
        if (i === rs.length - 1 && rs.length > 1) scenes.push({ say: 'And this last one is the most serious.' });
        scenes.push(
          { say: `${s.firm} just recalled ${s.product}, over ${s.reason}.`, overlay: card },
          { say: `It went out ${s.where}, and the FDA rates it ${s.severity}.`, overlay: card },
        );
      });
      scenes.push({ say: "I'll keep tracking these. Follow so you catch the next one." });
      return {
        people: { host: `man in his late 20s with shoulder-length dark hair and round wire glasses, sitting in a dim warm-lit room, a podcast microphone on a boom arm in the lower foreground, cinematic shallow depth of field, medium close-up, ${PHOTO}` },
        images: {},
        scenes: scenes.map((sc) => ({ ...sc, layout: 'person', person: 'host' })),
        recalls: rs,
      };
    },
  },

  mascot: {
    name: 'Mascot Explainer',
    tagline: 'One illustrated character per line, zoom-blur cuts, yellow word captions',
    inspired: 'AI-illustrated mascot explainer',
    multi: false,
    voice: VOICES.liam,
    captions: 'yellow',
    transition: 0.3,
    build([r]) {
      const s = speak(r);
      const pkg = (r.productDescription.match(/(?:packed|packaged|sold) in ([^;.:]{6,60})/i)?.[1] ?? 'a retail package').trim();
      const scene = (key, action) => [key, { prompt: `${MASCOT} ${action}. ${ILLUSTRATION}`, model: 'google/nano-banana-2', aspect: '9:16', refs: ['mascot'] }];
      const allergen = r.hazard.key === 'allergen' && r.hazard.allergen;
      return {
        images: Object.fromEntries([
          ['mascot', { prompt: `${MASCOT} standing in a neutral pose facing the viewer, full body, plain light grey background. ${ILLUSTRATION}`, model: 'google/nano-banana-2', aspect: '9:16' }],
          scene('fridge', 'opening a refrigerator at night in a cozy kitchen, the fridge light glowing on its shocked face'),
          scene('product', `holding up ${s.product} (${pkg}) with a big red RECALL sticker on it, in a grocery store aisle`),
          scene('hazard', `staring worried at a giant glowing ${HAZARD_PICTURE[r.hazard.key] ?? 'red warning sign'} in a high-tech lab`),
          scene('map', 'pointing at a huge glowing map of the United States covered in red warning markers, in a control room'),
          scene('check', `inspecting the label on ${s.product} (${pkg}) with a giant magnifying glass at a kitchen counter`),
          scene('stop', 'holding up one hand in a firm stop gesture while pushing a plate of food away, at a dining table'),
          scene('refund', `handing ${s.product} (${pkg}) to a smiling cashier at a store customer-service counter, receiving cash back`),
          scene('share', 'pointing straight at the viewer while holding a smartphone, a bright city skyline behind'),
        ]),
        scenes: [
          { say: 'Check your kitchen right now.', image: 'fridge' },
          { say: `${s.brand} just recalled ${s.product}.`, image: 'product' },
          { say: `The reason: ${s.reason}.`, image: 'hazard' },
          { say: `It was sold ${s.where}, and the FDA rates it ${s.severity}.`, image: 'map' },
          { say: r.lots ? 'Step one: check the package for the codes on screen.' : 'Step one: every lot is included, so check every package.', image: 'check', overlay: r.lots ? { kind: 'lots' } : null },
          { say: allergen ? `Step two: if you're allergic to ${allergen}, don't eat it.` : "Step two: don't eat it, even if it looks and smells fine.", image: 'stop' },
          { say: 'Step three: take it back to the store for a full refund.', image: 'refund' },
          { say: 'Share this with someone who buys groceries.', image: 'share' },
        ].map((sc) => ({ ...sc, layout: 'image' })),
        recalls: [r],
      };
    },
  },
};

const MASCOT = 'A simple cartoon mascot character with a perfectly round plain white ball head, small black dot eyes and short black eyebrows, no nose, wearing a bright red t-shirt with a white shield icon on the chest, white pants and white sneakers,';
const ILLUSTRATION = 'Clean bold outline cartoon illustration, cel shading, vibrant saturated colors, detailed background, vertical 9:16 composition with the character in the center, no text, no letters, no captions.';
const HAZARD_PICTURE = {
  listeria: 'red rod-shaped bacteria under a microscope', salmonella: 'red bacteria with tails under a microscope',
  ecoli: 'red bacteria under a microscope', glass: 'pile of sharp broken glass shards', metal: 'pile of sharp metal fragments',
  foreign: 'pile of small stones and debris', dye: 'splash of bright red dye', allergen: 'allergy warning symbol',
};

// Everything the narration says about a recall, phrased to be read aloud.
function speak(r) {
  const firm = displayFirm(r.firm).replace(/,?\s+(inc|llc|ltd|corp|co)\.?$/i, '').trim();
  const retailer = r.productDescription.match(/distributed by:?\s*([A-Z][\w&'.\- ]+?)(?:,|\s+inc\b|\s+llc\b)/i)?.[1]?.trim();
  const states = r.distribution.states.length;
  return {
    firm,
    brand: retailer ? displayFirm(retailer) : firm,
    product: r.productName.replace(/…$/, ''),
    reason: reasonPhrase(r),
    hazardWord: r.hazard.label,
    where: r.distribution.nationwide ? 'nationwide' : states > 1 ? `in ${states} states` : states === 1 ? `in ${r.distribution.label}` : 'in select stores',
    severity: {
      'Class I': "Class One, its most serious level",
      'Class II': 'Class Two, meaning it may cause temporary health problems',
      'Class III': 'Class Three, its lowest risk level',
    }[r.classification] ?? 'as a pending classification',
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s) => String(s).split(/\s+/).filter((w) => w.length > 2);
const shortName = (s) => (s.length <= 28 ? s : s.split(' ').slice(-2).join(' '));
