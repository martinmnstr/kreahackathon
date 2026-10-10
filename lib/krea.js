// Krea: submit a generation job, poll until done, download the image.

import { writeFile } from 'node:fs/promises';

const API = 'https://api.krea.ai';
const MODEL = process.env.KREA_MODEL ?? 'krea/krea-2/medium-turbo';

const headers = () => ({ Authorization: `Bearer ${process.env.KREA_API_KEY}`, 'Content-Type': 'application/json' });

export async function generateImage(prompt, outFile, { timeoutMs = 180_000 } = {}) {
  const res = await fetch(`${API}/generate/image/${MODEL}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ prompt, aspect_ratio: '1:1', resolution: '1K' }),
  });
  const job = await res.json();
  if (!res.ok || !job.job_id) throw new Error(`Krea: ${job.message ?? job.error ?? res.status}`);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await (await fetch(`${API}/jobs/${job.job_id}`, { headers: headers() })).json();
    if (j.status === 'completed') {
      const urls = j.result?.urls;
      const url = Array.isArray(urls) ? (typeof urls[0] === 'string' ? urls[0] : urls[0]?.url) : Object.values(urls ?? {})[0];
      const img = await fetch(url);
      await writeFile(outFile, Buffer.from(await img.arrayBuffer()));
      return { file: outFile, url, mime: img.headers.get('content-type') ?? 'image/png' };
    }
    if (j.status === 'failed' || j.status === 'cancelled') throw new Error(`Krea job ${j.status}: ${j.error?.message ?? ''}`);
  }
  throw new Error('Krea: timed out');
}
