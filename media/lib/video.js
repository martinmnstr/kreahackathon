// Recall → vertical short video (1080x1920, 30fps) in a chosen format.
//
//   1. narration: Krea ElevenLabs TTS per scene; scene length = its audio length
//   2. visuals:   Krea images, AI presenter portraits, and lip-synced presenter clips (Seedance + the narration audio)
//   3. overlays:  graphics + word captions rendered as transparent PNGs with Playwright
//   4. ffmpeg:    per-scene base video (Ken Burns / presenter / split) → transitions → overlays → audio

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { FORMATS } from './formats.js';
import { generateImage, talkingVideo, tts } from './krea.js';

const exec = promisify(execFile);
const W = 1080, H = 1920, FPS = 30;
const MAX_CLIP = 14; // seconds of narration per lip-synced presenter clip (Seedance max is 15)
const TAIL = 0.5;

export async function renderVideo(formatId, recalls, { dir, log = console.log } = {}) {
  const format = FORMATS[formatId];
  if (!format) throw new Error(`Unknown format "${formatId}"`);
  const spec = format.build(recalls);
  const { scenes } = spec;
  await mkdir(`${dir}/assets`, { recursive: true });
  await mkdir(`${dir}/frames`, { recursive: true });

  log(`Writing ${scenes.length} lines of narration…`);
  const portraitsP = Promise.all(Object.entries(spec.people ?? {}).map(async ([key, prompt]) => {
    const img = await generateImage(prompt, `${dir}/assets/person-${key}.png`, { aspect: '9:16' });
    log(`AI presenter "${key}" ready`);
    return [key, img];
  })).then(Object.fromEntries);
  const imagesP = makeImages(spec.images ?? {}, dir, log);

  await pool(scenes, 4, async (sc, i) => {
    sc.audio = (await tts(sc.say, `${dir}/assets/say-${pad(i)}.mp3`, format.voice)).file;
    sc.dur = await duration(sc.audio);
  });
  scenes.at(-1).dur += TAIL;
  let t = 0;
  for (const sc of scenes) { sc.start = t; t += sc.dur; }
  log(`Narration ready (${t.toFixed(1)}s)`);

  const [portraits, images] = await Promise.all([portraitsP, imagesP]);
  await presenterClips(scenes, portraits, spec.people ?? {}, dir, log);

  log('Rendering graphics and captions…');
  const overlayList = await renderOverlays(format, spec, images, dir);

  log('Compositing video…');
  const T = format.transition ?? 0;
  const segs = await Promise.all(scenes.map((sc, i) => baseSegment(sc, i, images, dir, i < scenes.length - 1 ? T : 0)));
  const out = `${dir}/video.mp4`;
  await compose(segs, scenes, overlayList, T, out);
  await writeFile(`${dir}/script.json`, JSON.stringify({ format: formatId, recalls: spec.recalls, scenes: scenes.map(({ say, start, dur, layout, image, person }) => ({ say, start, dur, layout, image, person })) }, null, 2));
  log(`Done: ${t.toFixed(1)}s video`);
  return { file: out, seconds: t };
}

// ── Krea assets ────────────────────────────────────────────────────────────────────────────

async function makeImages(defs, dir, log) {
  const out = {};
  const make = async ([key, d]) => {
    const refs = (d.refs ?? []).map((k) => out[k]?.url).filter(Boolean);
    try {
      out[key] = await generateImage(d.prompt, `${dir}/assets/img-${key}.png`, { aspect: d.aspect ?? '1:1', model: d.model, refs });
      log(`Image "${key}" ready`);
    } catch (e) {
      log(`⚠ image "${key}" failed (${e.message}) — using a fallback`);
    }
  };
  const entries = Object.entries(defs);
  await Promise.all(entries.filter(([, d]) => !d.refs?.length).map(make));
  await Promise.all(entries.filter(([, d]) => d.refs?.length).map(make));
  return out;
}

// Consecutive scenes with the same presenter become one lip-synced clip (≤ MAX_CLIP s of audio).
async function presenterClips(scenes, portraits, people, dir, log) {
  const chunks = [];
  scenes.forEach((sc, i) => {
    if (!sc.person) return;
    const last = chunks.at(-1);
    const prev = scenes[i - 1];
    if (last && prev?.person === sc.person && last.end === i - 1 && last.seconds + sc.dur <= MAX_CLIP) {
      last.scenes.push(sc); last.end = i; last.seconds += sc.dur;
    } else chunks.push({ person: sc.person, scenes: [sc], end: i, seconds: sc.dur });
  });
  if (!chunks.length) return;
  log(`Animating presenter: ${chunks.length} lip-synced clip${chunks.length > 1 ? 's' : ''} (~2 min)…`);
  let done = 0;
  await Promise.all(chunks.map(async (c, k) => {
    const audio = `${dir}/assets/clip-${pad(k)}.mp3`;
    await concatAudio(c.scenes.map((s) => s.audio), audio);
    let off = 0;
    for (const s of c.scenes) { s.clipOffset = off; off += s.dur; }
    try {
      const v = await talkingVideo({ image: portraits[c.person].url, audioFile: audio, seconds: c.seconds, prompt: people[c.person], outFile: `${dir}/assets/clip-${pad(k)}.mp4` });
      for (const s of c.scenes) s.clip = v.file;
      log(`Presenter clip ${++done}/${chunks.length} ready`);
    } catch (e) {
      log(`⚠ presenter clip ${k + 1} failed (${e.message}) — using the still portrait`);
      for (const s of c.scenes) s.still = portraits[c.person].file;
    }
  }));
}

// ── ffmpeg ─────────────────────────────────────────────────────────────────────────────────

async function baseSegment(sc, i, images, dir, extra) {
  const d = sc.dur + extra;
  const frames = Math.ceil(d * FPS);
  const out = `${dir}/frames/seg-${pad(i)}.mp4`;
  const img = images[sc.image]?.file ?? Object.values(images)[0]?.file;
  const inputs = [];
  let filter;

  const person = (label, w, h, y) => {
    if (sc.clip) {
      inputs.push('-ss', String(sc.clipOffset), '-i', sc.clip);
      return `[${inputs.filter((x) => x === '-i').length - 1}:v]setpts=PTS-STARTPTS,fps=${FPS},scale=${w}:-2,crop=${w}:${h}:0:${y},tpad=stop_mode=clone:stop_duration=${d.toFixed(2)},trim=duration=${d.toFixed(3)}[${label}]`;
    }
    inputs.push('-loop', '1', '-i', sc.still ?? img);
    return `[${inputs.filter((x) => x === '-i').length - 1}:v]scale=${w}:-2,crop=${w}:${h}:0:${y},fps=${FPS},trim=duration=${d.toFixed(3)}[${label}]`;
  };
  const still = (label, w, h, extraFilter = '') => {
    if (!img) { inputs.push('-f', 'lavfi', '-i', `color=c=0x101418:s=${w}x${h}:r=${FPS}`); }
    else inputs.push('-i', img);
    const n = inputs.filter((x) => x === '-i').length - 1;
    if (!img) return `[${n}:v]trim=duration=${d.toFixed(3)}[${label}]`;
    const zin = i % 2 === 0;
    const z = zin ? `1+0.10*on/${frames}` : `1.10-0.10*on/${frames}`;
    return `[${n}:v]scale=${Math.round(w * 1.6)}:${Math.round(h * 1.6)}:force_original_aspect_ratio=increase,crop=${Math.round(w * 1.6)}:${Math.round(h * 1.6)},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}${extraFilter},trim=duration=${d.toFixed(3)}[${label}]`;
  };

  if (sc.layout === 'person') filter = person('v', W, H, 0);
  else if (sc.layout === 'split') filter = `${still('top', W, 1060)};${person('bot', W, 860, 230)};[top][bot]vstack[v]`;
  else if (sc.layout === 'panel') filter = still('v', W, H, ',boxblur=24:2,eq=brightness=-0.12');
  else filter = still('v', W, H);

  await ffmpeg([...inputs, '-filter_complex', `${filter};[v]format=yuv420p,setsar=1[o]`, '-map', '[o]', '-t', d.toFixed(3), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-an', out]);
  return out;
}

async function compose(segs, scenes, overlayList, T, out) {
  const args = [];
  segs.forEach((s) => args.push('-i', s));
  args.push('-f', 'concat', '-safe', '0', '-i', overlayList);
  scenes.forEach((sc) => args.push('-i', sc.audio));
  const n = segs.length;
  const f = [];
  if (T > 0 && n > 1) {
    const kinds = ['zoomin', 'hblur', 'smoothleft', 'zoomin', 'hblur', 'smoothright'];
    let prev = '0:v';
    for (let i = 1; i < n; i++) {
      f.push(`[${prev}][${i}:v]xfade=transition=${kinds[(i - 1) % kinds.length]}:duration=${T}:offset=${scenes[i].start.toFixed(3)}[x${i}]`);
      prev = `x${i}`;
    }
    f.push(`[${prev}]null[base]`);
  } else {
    f.push(`${segs.map((_, i) => `[${i}:v]`).join('')}concat=n=${n}:v=1:a=0[base]`);
  }
  f.push(`[${n}:v]fps=${FPS},format=rgba[ov]`, `[base][ov]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]`);
  f.push(`${scenes.map((_, i) => `[${n + 1 + i}:a]`).join('')}concat=n=${n}:v=0:a=1,apad=pad_dur=${TAIL}[a]`);
  const total = scenes.at(-1).start + scenes.at(-1).dur;
  await ffmpeg([...args, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
}

async function concatAudio(files, out) {
  const inputs = files.flatMap((f) => ['-i', f]);
  await ffmpeg([...inputs, '-filter_complex', `${files.map((_, i) => `[${i}:a]`).join('')}concat=n=${files.length}:v=0:a=1[a]`, '-map', '[a]', '-c:a', 'libmp3lame', '-b:a', '160k', out]);
}

async function duration(file) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(stdout);
}

async function ffmpeg(args) {
  try {
    await exec('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 64 << 20 });
  } catch (e) {
    throw new Error(`ffmpeg: ${(e.stderr || e.message).slice(-600)}`);
  }
}

// ── Overlays: graphics + captions as transparent full-frame PNGs ─────────────────────────────

async function renderOverlays(format, spec, images, dir) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const lines = ['ffconcat version 1.0'];
  const uri = async (key) => (images[key] ? `data:image/png;base64,${(await readFile(images[key].file)).toString('base64')}` : null);
  const productUri = await uri('product');
  let k = 0;
  try {
    for (const sc of spec.scenes) {
      const graphic = await graphicHtml(sc, spec, productUri);
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
        <body class="${format.captions}">${graphic}<div id="cap"></div><div class="ai-label">AI-generated video · Source: openFDA</div></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      for (const u of captionUnits(sc, format.captions)) {
        await page.evaluate((html) => { document.getElementById('cap').innerHTML = html; }, captionHtml(u, spec));
        const file = `${dir}/frames/ov-${pad(k++, 4)}.png`;
        await page.screenshot({ path: file, omitBackground: true });
        lines.push(`file '${file.split('/').pop()}'`, `duration ${u.dur.toFixed(3)}`);
      }
    }
  } finally {
    await browser.close();
  }
  lines.push(lines.at(-2)); // concat demuxer needs the last file repeated for its duration to apply
  const list = `${dir}/frames/overlays.txt`;
  await writeFile(list, lines.join('\n'));
  return list;
}

// Spread a line's audio across its words (weighted by length + punctuation pauses).
function captionUnits(sc, style) {
  const ws = sc.say.split(/\s+/).filter(Boolean);
  const weight = (w) => w.replace(/[^\w]/g, '').length + 2 + (/[.!?:]$/.test(w) ? 5 : /,$/.test(w) ? 3 : 0);
  const total = ws.reduce((a, w) => a + weight(w), 0);
  let t = 0;
  const timed = ws.map((w) => { const d = (weight(w) / total) * sc.dur; t += d; return { words: [w], dur: d }; });
  timed.at(-1).dur += sc.dur - t;
  if (style !== 'phrase') return timed;
  const units = [];
  for (const u of timed) {
    const cur = units.at(-1);
    if (cur && cur.words.length < 5 && !/[.,:!?]$/.test(cur.words.at(-1))) { cur.words.push(u.words[0]); cur.dur += u.dur; }
    else units.push({ words: [...u.words], dur: u.dur });
  }
  return units;
}

function captionHtml(u, spec) {
  const hi = new Set((spec.highlight ?? []).map((w) => w.toLowerCase()));
  const act = new Set((spec.action ?? []).map((w) => w.toLowerCase()));
  return `<span>${u.words.map((w) => {
    const bare = w.replace(/[^\w']/g, '').toLowerCase();
    const cls = hi.has(bare) ? 'hi' : act.has(bare) ? 'act' : '';
    return cls ? `<b class="${cls}">${esc(w)}</b>` : esc(w);
  }).join(' ')}</span>`;
}

async function graphicHtml(sc, spec, productUri) {
  const o = sc.overlay;
  if (!o) return '';
  const r = spec.recalls[o.recall ?? sc.recall ?? 0];
  const lots = r.lots ? `<div class="lots">${esc(truncate(r.lots, 110))}</div>` : '';
  switch (o.kind) {
    case 'sticker':
      return `<div class="sticker"><div class="warn">⚠</div><div class="red">${esc(o.text)}</div></div>`;
    case 'title':
      return `<div class="title">${esc(o.text)}</div>`;
    case 'brand':
      return `<div class="brand" style="font-size:${o.text.length > 26 ? 44 : o.text.length > 16 ? 56 : 72}px">${esc(o.text)}</div>${o.lots ? `<div class="brand-lots">${lots}</div>` : ''}`;
    case 'lots':
      return `<div class="mascot-lots"><div class="k">Check for these codes</div>${lots}</div>`;
    case 'panel': {
      const bullets = [
        r.hazard.label,
        r.distribution.nationwide ? 'Sold nationwide' : `Sold in ${r.distribution.label}`,
        `FDA ${r.classification} · ${r.quantity}`,
      ].slice(0, o.bullets);
      return `<div class="panel">
        <div class="bar">${esc(r.productName)} RECALL</div>
        <div class="row"><ul>${bullets.map((b) => `<li>${esc(truncate(b, 46))}</li>`).join('')}</ul>
        ${productUri ? `<div class="shot"><img src="${productUri}"><span>AI image</span></div>` : ''}</div>
        ${o.lots ? lots : ''}
        <div class="src">Source: FDA Enforcement Report · ${esc(r.recallNumber ?? r.eventId)}</div>
      </div>`;
    }
    case 'source':
      return `<div class="source">
        <div class="head"><span>FDA Enforcement Report</span><span>via openFDA</span></div>
        <div class="kicker">${esc(r.classification)} · ${esc(r.status)} · Reported ${esc(r.reportDate)}</div>
        <h1>${esc(r.firm)} recalls ${esc(r.productName)}</h1>
        <blockquote>“${esc(truncate(r.reason, 170))}”</blockquote>
        <div class="meta">Recall ${esc(r.recallNumber ?? r.eventId)} · ${esc(r.distribution.label)} · ${esc(truncate(r.quantity, 40))}</div>
      </div>`;
    default:
      return '';
  }
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#111}
#cap{position:absolute;left:60px;right:60px;display:flex;justify-content:center;text-align:center}
.ai-label{position:absolute;left:28px;top:28px;font-size:22px;font-weight:600;color:rgba(255,255,255,.85);background:rgba(0,0,0,.35);padding:6px 12px;border-radius:8px}

/* phrase captions (news) */
.phrase #cap{top:1330px}
.phrase #cap span{background:#fff;padding:10px 18px;border-radius:10px;font-size:54px;font-weight:800;line-height:1.25;box-shadow:0 4px 18px rgba(0,0,0,.25)}
.phrase .hi{color:#e10600}.phrase .act{color:#0a6cff}

/* single word in a black pill (countdown) */
.pill #cap{top:1010px}
.pill #cap span{background:#111;color:#fff;padding:8px 26px;border-radius:18px;font-size:60px;font-weight:700}

/* small white word (receipts) */
.small #cap{top:1420px}
.small #cap span{color:#fff;font-size:52px;font-weight:600;text-shadow:0 2px 10px rgba(0,0,0,.9)}

/* yellow italic word with heavy outline (mascot) */
.yellow #cap{top:1180px}
.yellow #cap span{color:#ffe500;font-family:'Arial Black','Helvetica Neue',sans-serif;font-style:italic;font-weight:900;font-size:110px;-webkit-text-stroke:14px #000;paint-order:stroke fill;text-shadow:0 6px 0 #000}

.sticker{position:absolute;top:1000px;left:0;right:0;display:flex;flex-direction:column;align-items:center}
.sticker .warn{font-size:120px;line-height:1;color:#ffcc00;text-shadow:0 4px 12px rgba(0,0,0,.5)}
.sticker .red{background:#e10600;color:#fff;font-family:Georgia,serif;font-size:62px;padding:14px 30px;text-align:center;max-width:820px;line-height:1.15}

.panel{position:absolute;left:40px;right:40px;top:560px;background:rgba(245,248,255,.97);border-radius:6px;padding:30px 34px 22px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.panel .bar{display:inline-block;background:#0b2a6b;color:#fff;font-weight:800;font-size:30px;padding:8px 16px;text-transform:uppercase;letter-spacing:.03em;max-width:100%}
.panel .row{display:flex;gap:26px;margin-top:22px;align-items:flex-start}
.panel ul{flex:1;list-style:none;display:flex;flex-direction:column;gap:16px}
.panel li{font-size:40px;font-weight:700;text-transform:uppercase;line-height:1.1;color:#0b2a6b}
.panel li::before{content:'•';color:#e10600;margin-right:12px}
.panel .shot{position:relative;width:300px;height:300px;flex:none;border-radius:6px;overflow:hidden}
.panel .shot img{width:100%;height:100%;object-fit:cover}
.panel .shot span{position:absolute;right:0;bottom:0;background:#111;color:#fff;font-size:16px;font-weight:700;padding:4px 8px;text-transform:uppercase}
.panel .src{font-size:20px;color:#55607a;margin-top:18px}
.lots{font-family:Menlo,monospace;font-weight:700;background:#ffe500;color:#111;padding:12px 16px;font-size:30px;line-height:1.3;margin-top:18px;word-break:break-word}

.title{position:absolute;top:80px;left:60px;right:60px;text-align:center;background:rgba(0,0,0,.72);color:#fff;font-size:50px;font-weight:800;padding:18px 20px;border-radius:14px;line-height:1.2}
.brand{position:absolute;top:400px;left:50%;transform:translateX(-50%);background:#fff;border-radius:28px;padding:26px 44px;font-size:72px;font-weight:900;letter-spacing:-.01em;color:#111;box-shadow:0 10px 40px rgba(0,0,0,.35);white-space:nowrap;max-width:960px;overflow:hidden;text-overflow:ellipsis}
.brand-lots{position:absolute;top:620px;left:80px;right:80px}
.mascot-lots{position:absolute;top:220px;left:70px;right:70px;background:rgba(0,0,0,.78);border-radius:20px;padding:26px}
.mascot-lots .k{color:#fff;font-size:34px;font-weight:800;text-transform:uppercase}

.source{position:absolute;top:330px;left:70px;right:70px;background:#fff;border-radius:10px;padding:34px 38px;box-shadow:0 20px 60px rgba(0,0,0,.55);font-family:Georgia,serif}
.source .head{display:flex;justify-content:space-between;font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;color:#fff;background:#163a70;margin:-34px -38px 24px;padding:16px 38px;border-radius:10px 10px 0 0}
.source .kicker{font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;color:#b00020;text-transform:uppercase;letter-spacing:.06em}
.source h1{font-size:46px;line-height:1.15;margin:12px 0 18px}
.source blockquote{font-size:30px;font-style:italic;line-height:1.35;color:#333;border-left:6px solid #b00020;padding-left:18px}
.source .meta{font-family:'Helvetica Neue',sans-serif;font-size:22px;color:#666;margin-top:20px}
`;

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
