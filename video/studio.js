// Recall Radar Studio: pick recalls + a video format in the browser, render a vertical short.
//   npm run video   →  http://localhost:4300

import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchByRecallNumber, fetchEvent, fetchRecentEvents } from './lib/fda.js';
import { FORMATS } from './lib/formats.js';
import { renderVideo } from './lib/video.js';

const PORT = Number(process.env.PORT ?? 4300);
const VIDEOS = 'out/videos';
const jobs = new Map();
let recent = { at: 0, list: [] };

const routes = {
  'GET /': () => file(fileURLToPath(new URL('./studio/index.html', import.meta.url))),
  // ?recall=<FDA recall number>: prefer a video already rendered for that recall as the format's sample.
  'GET /api/formats': async (req) => {
    const recall = new URL(req.url, 'http://x').searchParams.get('recall');
    const eventId = recall ? await eventOf(recall).catch(() => null) : null;
    const videos = await gallery();
    const sample = (id) => {
      const own = eventId && videos.find((v) => v.format === id && v.recalls[0]?.eventId === eventId);
      return own ? { sample: own.video, own: true } : { sample: videos.find((v) => v.format === id)?.video ?? null, own: false };
    };
    return json(Object.entries(FORMATS).map(([id, f]) => ({ id, name: f.name, tagline: f.tagline, inspired: f.inspired, multi: f.multi, ...sample(id) })));
  },
  'GET /api/recalls': async () => json(await recentList()),
  'GET /api/videos': async () => json(await gallery()),
  // events: openFDA event ids. recallNumbers: FDA recall numbers (what the Lovable app stores as "fda:<number>").
  // withLatest: for roundup formats, fill up with the newest other Class I recalls.
  'POST /api/render': async (req) => {
    const { format, events = [], recallNumbers = [], withLatest = 0 } = JSON.parse(await body(req));
    if (!FORMATS[format]) return json({ error: 'Unknown format' }, 400);
    const max = FORMATS[format].multi ? 4 : 1;
    const ids = [...events];
    for (const n of recallNumbers) ids.push(await eventOf(n));
    if (FORMATS[format].multi && withLatest) {
      const latest = (await recentList()).filter((r) => r.classification === 'Class I' && !ids.includes(r.eventId));
      ids.push(...latest.slice(0, withLatest).map((r) => r.eventId));
    }
    ids.splice(max);
    if (!ids.length) return json({ error: 'Pick at least one recall' }, 400);
    const id = `${format}-${ids.join('-')}-${Date.now().toString(36)}`;
    const job = { id, format, events: ids, status: 'running', log: [], started: Date.now() };
    jobs.set(id, job);
    run(job);
    return json({ id });
  },
};

const events = new Map(); // FDA recall number → openFDA event id
async function eventOf(recallNumber) {
  if (!events.has(recallNumber)) events.set(recallNumber, (await fetchByRecallNumber(recallNumber)).eventId);
  return events.get(recallNumber);
}

async function recentList() {
  if (Date.now() - recent.at > 10 * 60_000) recent = { at: Date.now(), list: await fetchRecentEvents() };
  return recent.list;
}

async function run(job) {
  const dir = `${VIDEOS}/${job.id}`;
  const log = (m) => job.log.push({ t: ((Date.now() - job.started) / 1000).toFixed(0), m });
  try {
    log('Fetching FDA records…');
    const recalls = await Promise.all(job.events.map((e) => (recent.list.find((r) => r.eventId === e) ?? fetchEvent(e))));
    await mkdir(dir, { recursive: true });
    const { seconds } = await renderVideo(job.format, structuredClone(recalls), { dir, log });
    await writeFile(`${dir}/meta.json`, JSON.stringify({ id: job.id, format: job.format, seconds, recalls: recalls.map(brief), created: new Date().toISOString() }, null, 2));
    Object.assign(job, { status: 'done', video: `/${dir}/video.mp4` });
  } catch (e) {
    log(`✖ ${e.message}`);
    job.status = 'error';
  }
}

async function gallery() {
  const dirs = await readdir(VIDEOS).catch(() => []);
  const items = await Promise.all(dirs.map(async (d) => {
    try { return { ...JSON.parse(await readFile(`${VIDEOS}/${d}/meta.json`, 'utf8')), video: `/${VIDEOS}/${d}/video.mp4` }; } catch { return null; }
  }));
  return items.filter(Boolean).sort((a, b) => b.created.localeCompare(a.created));
}

const brief = (r) => ({ eventId: r.eventId, recallNumber: r.recallNumber, productName: r.productName, firm: r.firm, hazard: r.hazard.label, classification: r.classification });

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    const url = new URL(req.url, 'http://x');
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
    let out;
    if (jobMatch) out = jobs.has(jobMatch[1]) ? json(jobs.get(jobMatch[1])) : json({ error: 'No such job' }, 404);
    else if (routes[`${req.method} ${url.pathname}`]) out = await routes[`${req.method} ${url.pathname}`](req);
    else if (url.pathname.startsWith(`/${VIDEOS}/`)) out = await file(normalize(decodeURIComponent(url.pathname.slice(1))), req);
    else out = json({ error: 'Not found' }, 404);
    out(res);
  } catch (e) {
    json({ error: e.message }, 500)(res);
  }
}).listen(PORT, () => console.log(`Recall Radar Studio → http://localhost:${PORT}`));

function json(data, code = 200) {
  return (res) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
}

async function file(path, req) {
  if (path.includes('..')) return json({ error: 'Bad path' }, 400);
  const size = (await stat(path).catch(() => null))?.size;
  if (size == null) return json({ error: 'Not found' }, 404);
  const type = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream';
  // Range support so <video> can seek.
  const range = req?.headers.range?.match(/bytes=(\d*)-(\d*)/);
  return (res) => {
    if (range) {
      const start = Number(range[1] || 0), end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      createReadStream(path, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
      createReadStream(join(path)).pipe(res);
    }
  };
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => (s += c)).on('end', () => resolve(s)).on('error', reject);
  });
}
