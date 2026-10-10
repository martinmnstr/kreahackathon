// Krea: submit a generation job, poll until done, download the result.
// Results are cached on disk by request body, so re-rendering the same recall is instant and free.

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const API = 'https://api.krea.ai';
const MODEL = process.env.KREA_MODEL ?? 'krea/krea-2/medium-turbo';
const CACHE = 'out/.cache/krea';

export const VOICES = {
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  liam: 'TX3LPaxmHKxFdv7VOQHJ',
  charlie: 'IKne3meq5aSn9XLyUdCD',
  roger: 'CwhRBWXzGAHq8TQ4Fs17',
};

const headers = () => ({ Authorization: `Bearer ${process.env.KREA_API_KEY}`, 'Content-Type': 'application/json' });

export async function generateImage(prompt, outFile, { aspect = '1:1', model = MODEL, refs = [], timeoutMs = 180_000 } = {}) {
  const body = model.startsWith('google/nano-banana')
    ? { prompt, aspect_ratio: aspect, ...(refs.length && { image_urls: refs }) }
    : { prompt, aspect_ratio: aspect, resolution: '1K' };
  return run(`/generate/image/${model}`, body, outFile, timeoutMs);
}

export async function tts(text, outFile, voice = VOICES.sarah) {
  return run('/generate/audio/elevenlabs/tts', { prompt: text, voice_id: voice }, outFile, 120_000);
}

// A person speaking `audioFile` (lip-synced), starting from a portrait image. Seedance clips are 4–15s.
export async function talkingVideo({ image, audioFile, seconds, prompt, outFile }) {
  const audio = await uploadAsset(audioFile);
  return run('/generate/video/bytedance/seedance-2-fast', {
    prompt: `${prompt} The person talks directly to the camera, lip-syncing exactly to the reference audio, natural small head movements and hand gestures, static framing, no text on screen.`,
    start_image: image,
    reference_audios: [audio],
    aspect_ratio: '9:16',
    resolution: '720p',
    duration: Math.min(15, Math.max(4, Math.ceil(seconds))),
  }, outFile, 600_000);
}

async function uploadAsset(file) {
  const buf = await readFile(file);
  const key = createHash('sha1').update(buf).digest('hex');
  return cached(`asset-${key}`, '.txt', async (cacheFile) => {
    const form = new FormData();
    form.append('file', new Blob([buf], { type: extname(file) === '.mp3' ? 'audio/mpeg' : 'application/octet-stream' }), basename(file));
    const res = await fetch(`${API}/assets`, { method: 'POST', headers: { Authorization: headers().Authorization }, body: form });
    const j = await res.json();
    const url = j.url ?? j.asset?.url ?? j.uri ?? j.image_url;
    if (!res.ok || !url) throw new Error(`Krea upload: ${JSON.stringify(j).slice(0, 200)}`);
    await writeFile(cacheFile, url);
  }).then((f) => readFile(f, 'utf8'));
}

async function run(path, body, outFile, timeoutMs) {
  const key = createHash('sha1').update(path + JSON.stringify(body)).digest('hex');
  const ext = extname(outFile);
  let url;
  const file = await cached(key, ext, async (cacheFile) => {
    // Jobs occasionally fail under parallel load ("Failed to generate audio"); a retry usually succeeds.
    for (let attempt = 1; ; attempt++) {
      try { url = await submit(path, body, timeoutMs); break; } catch (e) {
        if (attempt >= 3 || /timed out/.test(e.message)) throw e;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    const res = await fetch(url);
    await writeFile(cacheFile, Buffer.from(await res.arrayBuffer()));
    await writeFile(`${CACHE}/${key}.url`, url);
  });
  url ??= await readFile(`${CACHE}/${key}.url`, 'utf8').catch(() => null);
  await copyFile(file, outFile);
  return { file: outFile, url, mime: MIME[ext] ?? 'application/octet-stream' };
}

async function submit(path, body, timeoutMs) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const job = await res.json();
  if (!res.ok || !job.job_id) throw new Error(`Krea: ${job.message ?? job.error ?? res.status}`);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const j = await (await fetch(`${API}/jobs/${job.job_id}`, { headers: headers() })).json();
    if (j.status === 'completed') {
      const urls = j.result?.urls;
      return Array.isArray(urls) ? (typeof urls[0] === 'string' ? urls[0] : urls[0]?.url) : Object.values(urls ?? {})[0];
    }
    if (j.status === 'failed' || j.status === 'cancelled') throw new Error(`Krea job ${j.status}: ${j.error?.message ?? ''}`);
  }
  throw new Error('Krea: timed out');
}

async function cached(key, ext, fill) {
  const file = `${CACHE}/${key}${ext}`;
  try { await readFile(file); return file; } catch {}
  await mkdir(CACHE, { recursive: true });
  await fill(file);
  return file;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };
