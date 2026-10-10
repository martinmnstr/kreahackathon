import { createServerFn } from "@tanstack/react-start";

export type RecallRow = Record<string, string | number | boolean | null | string[]>;

export const fetchWalmartRecalls = createServerFn({ method: "POST" })
  .inputValidator((d: { apiKey: string; query?: string }) => {
    if (!d?.apiKey || typeof d.apiKey !== "string") throw new Error("Cala API key is required");
    return d;
  })
  .handler(async ({ data }) => {
    const input =
      data.query?.trim() ||
      "food_recalls.retailer=Walmart.limit=50";
    const res = await fetch("https://api.cala.ai/v1/knowledge/query", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": data.apiKey },
      body: JSON.stringify({ input }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Cala request failed [${res.status}]: ${text.slice(0, 300)}`);
    const json = JSON.parse(text) as { results?: RecallRow[] };
    return { results: Array.isArray(json.results) ? json.results : [] };
  });

export const generateKreaImage = createServerFn({ method: "POST" })
  .inputValidator((d: { apiKey: string; prompt: string }) => {
    if (!d?.apiKey) throw new Error("Krea API key is required");
    if (!d?.prompt || d.prompt.length > 500) throw new Error("Invalid prompt");
    return d;
  })
  .handler(async ({ data }) => {
    const headers = { Authorization: `Bearer ${data.apiKey}`, "Content-Type": "application/json" };
    const create = await fetch("https://api.krea.ai/generate/image/bfl/flux-1-dev", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: data.prompt, width: 768, height: 768, steps: 28 }),
    });
    const ct = await create.text();
    if (!create.ok) throw new Error(`Krea request failed [${create.status}]: ${ct.slice(0, 300)}`);
    const { job_id } = JSON.parse(ct) as { job_id: string };
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`https://api.krea.ai/jobs/${job_id}`, { headers });
      const jt = await r.text();
      if (!r.ok) throw new Error(`Krea job check failed [${r.status}]: ${jt.slice(0, 300)}`);
      const job = JSON.parse(jt) as { status: string; result?: { urls?: string[] } };
      if (job.status === "completed") return { url: job.result?.urls?.[0] ?? null };
      if (job.status === "failed" || job.status === "cancelled") throw new Error(`Krea job ${job.status}`);
    }
    throw new Error("Krea image is taking too long — try again shortly");
  });
